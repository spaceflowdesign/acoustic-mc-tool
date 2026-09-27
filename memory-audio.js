// Embedded into the standalone HTML by tools/build.mjs. No network dependencies.
// Decoding is serialized. Only one complete decoded source is transiently held;
// committed slots contain metadata and a temporary IndexedDB asset, never PCM.
class PCMStore {
  constructor() { this.db = null; this.cache = new Map(); this.serial = 0; }
  async open() {
    if (this.db) return;
    if (!window.indexedDB) throw Error('端末内の一時保存が使用できません。');
    this.name = 'amct-pcm-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    // Locks distinguish live tabs from abandoned temporary databases, including
    // duplicated tabs. Never delete another tab's active assets.
    if (navigator.locks) {
      await new Promise(resolve => {
        navigator.locks.request(this.name, () => new Promise(release => {
          this.releaseLock = release; resolve();
        }));
      });
      if (indexedDB.databases) {
        for (const {name} of await indexedDB.databases()) {
          if (name?.startsWith('amct-pcm-') && name !== this.name) {
            await navigator.locks.request(name, {ifAvailable:true}, lock => {
              if (lock) indexedDB.deleteDatabase(name);
            });
          }
        }
      }
    }
    this.db = await new Promise((resolve,reject) => {
      const request = indexedDB.open(this.name, 1);
      request.onupgradeneeded = () => request.result.createObjectStore('pcm');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    this.db.onversionchange = () => this.db.close();
  }
  transaction(mode, action) {
    return new Promise((resolve,reject) => {
      const tx = this.db.transaction('pcm', mode);
      const request = action(tx.objectStore('pcm'));
      tx.oncomplete = () => resolve(request?.result);
      tx.onabort = tx.onerror = () => reject(tx.error || Error('一時保存に失敗しました。空き容量を確認してください。'));
    });
  }
  put(id, index, channels) { return this.transaction('readwrite', s => s.put(channels, [id,index])); }
  async remove(id) {
    for (const key of this.cache.keys()) if (key.startsWith(id+':')) this.cache.delete(key);
    if (this.db) await this.transaction('readwrite', s => s.delete(IDBKeyRange.bound([id,0],[id,Number.MAX_SAFE_INTEGER])));
  }
  async read(asset, index, context) {
    const key = asset.id+':'+index;
    if (this.cache.has(key)) { const b=this.cache.get(key); this.cache.delete(key); this.cache.set(key,b); return b; }
    const channels = await this.transaction('readonly', s => s.get([asset.id,index]));
    if (!channels?.length) throw Error('一時音声データを読み出せません。ファイルを再読み込みしてください。');
    const b = context.createBuffer(channels.length, channels[0].length, asset.sampleRate);
    channels.forEach((data,c) => b.copyToChannel(data,c));
    this.cache.set(key,b);
    // At most eight two-second chunks, independent of recording duration.
    while (this.cache.size > 8) this.cache.delete(this.cache.keys().next().value);
    return b;
  }
  close() {
    this.cache.clear(); this.db?.close(); this.db=null;
    if (this.name) indexedDB.deleteDatabase(this.name);
    this.releaseLock?.();
  }
}
const pcmStore = new PCMStore();
let loadQueue = Promise.resolve(), decodePending = false;
async function equalBlobs(a,b) {
  if (a === b) return true;
  if (a.size !== b.size) return false;
  // Names, modification dates and a partial fingerprint are NOT identity.
  for (let at=0;at<a.size;at+=1024*1024) {
    const [x,y] = await Promise.all([a.slice(at,at+1024*1024).arrayBuffer(),b.slice(at,at+1024*1024).arrayBuffer()]);
    const u=new Uint8Array(x),v=new Uint8Array(y);
    for(let i=0;i<u.length;i++) if(u[i]!==v[i]) return false;
  }
  return true;
}
async function releaseSlot(s) {
  if (s?.url) URL.revokeObjectURL(s.url);
  if (s && !Object.values(slots).some(other => other?.asset === s.asset)) await pcmStore.remove(s.asset.id);
}
async function prepareAsset(blob) {
  await pcmStore.open();
  pcmStore.cache.clear();
  const id=++pcmStore.serial;
  let buffer=null,bytes=null;
  try {
    bytes=await blob.arrayBuffer();
    // A timeout cannot cancel decodeAudioData. Keep the serialization lock until
    // the native decoder actually settles; otherwise a retry overlaps decoders.
    decodePending=true;
    const decodeNotice=setTimeout(()=>say('音声のデコードに時間がかかっています。重複処理を防ぐため完了を待っています。'),45000);
    try { buffer=await new (window.OfflineAudioContext||window.webkitOfflineAudioContext)(1,1,ctx.sampleRate).decodeAudioData(bytes); }
    finally { clearTimeout(decodeNotice); decodePending=false; bytes=null; }
    if(!buffer.length || buffer.duration<=0) throw Error('音声が空です。');
    const asset={id,length:buffer.length,duration:buffer.duration,sampleRate:buffer.sampleRate,numberOfChannels:buffer.numberOfChannels,chunkFrames:Math.round(buffer.sampleRate*2)};
    await job('begin',{length:asset.length,sr:asset.sampleRate,channels:asset.numberOfChannels});
    for(let at=0,index=0;at<asset.length;at+=asset.chunkFrames,index++) {
      const size=Math.min(asset.chunkFrames,asset.length-at);
      const channels=Array.from({length:asset.numberOfChannels},(_,c)=>{
        const data=new Float32Array(size); buffer.copyFromChannel(data,c,at); return data;
      });
      // Wait for IDB to commit before transferring ownership to the worker.
      await pcmStore.put(id,index,channels);
      await job('chunk',{at,channels},channels.map(c=>c.buffer));
      say('音声を解析・一時保存しています… '+Math.round((at+size)/asset.length*100)+'%');
    }
    buffer=null;
    const analysis=await job('finish',{});
    return {asset,buffer:{length:asset.length,duration:asset.duration,sampleRate:asset.sampleRate,numberOfChannels:asset.numberOfChannels},...analysis};
  } catch(error) {
    await job('discard',{}).catch(()=>{});
    await pcmStore.remove(id).catch(()=>{});
    throw error;
  } finally { bytes=null; buffer=null; }
}

// Web Audio's clock, not HTMLMediaElement.currentTime, remains the common time
// base. Chunk boundaries are scheduled at exact sample positions on that clock.
let transport=null, pumping=false;
function stopTransport() { transport=null; }
function scheduleChunk(t,buffer,index,from) {
  const sr=t.asset.sampleRate,chunkStart=index*t.asset.chunkFrames/sr;
  const begin=Math.max(from,chunkStart),end=Math.min(chunkStart+buffer.duration,t.end);
  if(end<=begin) return;
  const when=t.origin+begin-t.shift;
  const node=ctx.createBufferSource();node.buffer=buffer;node.connect(t.gain);
  const entry={node,gain:t.gain};sources.push(entry);
  node.onended=()=>{node.disconnect();node.buffer=null;sources=sources.filter(s=>s!==entry)};
  node.start(when,begin-chunkStart,end-begin);
}
async function pumpTransport() {
  const t=transport;if(!t||pumping)return;pumping=true;
  try {
    const step=t.asset.chunkFrames/t.asset.sampleRate;
    while(transport===t && t.next*step<t.end && t.origin+t.next*step-t.shift<ctx.currentTime+4) {
      const index=t.next,b=await pcmStore.read(t.asset,index,ctx);
      if(transport!==t)return;
      if(t.origin+index*step-t.shift<ctx.currentTime+.005) throw Error('音声の読出しが再生に追いつきませんでした。再生ボタンで再開してください。');
      scheduleChunk(t,b,index,index*step);t.next++;
    }
  } catch(error) { if(transport===t){pause();say(error.message)} }
  finally { pumping=false; }
}
setInterval(pumpTransport,100);
async function playStored(which) {
  const token=++playToken;
  try {
    if(rec||pendingMic||busy.A||busy.B||analysisBusy||!slots[which])return;
    await audio();if(token!==playToken)return;
    const asset=slots[which].asset,shift=which==='B'?offset:0,step=asset.chunkFrames/asset.sampleRate;
    const [lo,hi]=limits();if(hi<=lo)throw Error('同期後の共通区間がありません。位置を調整してください。');
    let p=position();if(p<lo||p>=hi-.002)p=lo;
    // Prime first/next chunks while the current side keeps playing. Re-evaluate
    // after the asynchronous read so a switch never rewinds by the IO latency.
    for (;;) {
      const index=Math.floor((p+shift)/step);
      const first=await pcmStore.read(asset,index,ctx);
      if(token!==playToken)return;
      const next=(index+1)*step<Math.min(asset.duration,hi+shift)?await pcmStore.read(asset,index+1,ctx):null;
      if(token!==playToken)return;
      let target=playing?position()+.06:p;if(target>=hi-.002)target=lo;
      if(Math.floor((target+shift)/step)!==index){p=target;continue;}
      const start=ctx.currentTime+.06,gain=ctx.createGain();gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0,start);gain.gain.linearRampToValueAtTime(1,start+.008);
      const old=sources,oldGain=transport?.gain; sources=[];stopTransport();
      for(const s of old){s.gain.gain.cancelScheduledValues(ctx.currentTime);s.gain.gain.setValueAtTime(s.gain.gain.value,ctx.currentTime);s.gain.gain.linearRampToValueAtTime(0,start);try{s.node.stop(start)}catch{}}
      setTimeout(()=>{for(const s of old){s.node.disconnect();s.node.buffer=null;s.gain.disconnect()}oldGain?.disconnect()},150);
      origin=start-target;cursor=target;playing=which;
      transport={asset,shift,origin,gain,end:hi+shift,next:index+1};
      scheduleChunk(transport,first,index,target+shift);
      if(next){scheduleChunk(transport,next,index+1,(index+1)*step);transport.next++;}
      update();draw();void pumpTransport();return;
    }
  } catch(error) {if(token===playToken){say('再生できません：'+error.message);pause()}}
}
