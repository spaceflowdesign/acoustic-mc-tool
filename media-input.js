// Bounded ISO BMFF/QuickTime inspection. Blob slices reference encoded data;
// no second full video ArrayBuffer, transcoder, network service or PCM copy.
function atomType(bytes,at){return String.fromCharCode(...bytes.subarray(at,at+4));}
function atomList(bytes,start=0,end=bytes.length){
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),result=[];
  for(let at=start;at<end;){if(at+8>end)throw Error('動画のatomヘッダーが不完全です');let size=view.getUint32(at),header=8;
    if(size===1){if(at+16>end)throw Error('動画の拡張atomが不完全です');size=Number(view.getBigUint64(at+8));header=16;}
    if(!size)size=end-at;if(!Number.isSafeInteger(size)||size<header||at+size>end)throw Error('動画のatom範囲が不正です');
    result.push({type:atomType(bytes,at+4),start:at,end:at+size,header});at+=size;
  }return result;
}
function atomBytes(type,parts){const n=8+parts.reduce((s,b)=>s+b.length,0);if(n>0xffffffff)throw Error('動画ヘッダーが大きすぎます');const out=new Uint8Array(n),v=new DataView(out.buffer);v.setUint32(0,n);for(let i=0;i<4;i++)out[4+i]=type.charCodeAt(i);let at=8;for(const p of parts){out.set(p,at);at+=p.length;}return out;}
async function inspectMediaInput(blob,name=''){
  const mediaRead=part=>typeof readMediaBytes==='function'?readMediaBytes(part):part.arrayBuffer();
  if(!blob.size)throw Error('選択されたファイルが空です。写真ライブラリでダウンロードが完了してから選び直してください。');
  const first=new Uint8Array(await mediaRead(blob.slice(0,16)));
  const hint=/^video\//i.test(blob.type)||(!/^audio\//i.test(blob.type)&&/\.(mov|mp4|m4v|webm|mkv|avi|3gp)$/i.test(name));
  if(!['ftyp','moov','mdat','wide','free'].includes(atomType(first,4)))return {isVideo:hint,audioBlob:blob,path:'native'};
  let moov=null,fragmented=false;const dataRanges=[];
  for(let at=0,count=0;at<blob.size;count++){
    if(count>10000)throw Error('動画のatom数が上限を超えています');
    const head=new Uint8Array(await mediaRead(blob.slice(at,at+16)));if(head.length<8)throw Error('動画ファイルの末尾が不完全です');const v=new DataView(head.buffer);let size=v.getUint32(0),header=8;
    if(size===1){if(head.length<16)throw Error('動画の拡張ヘッダーが不完全です');size=Number(v.getBigUint64(8));header=16;}if(!size)size=blob.size-at;
    if(!Number.isSafeInteger(size)||size<header||at+size>blob.size)throw Error('動画ファイルのサイズ情報が不正です');const type=atomType(head,4);
    if(type==='moov'){if(size>32*1024*1024)throw Error('動画の索引が大きすぎます（上限32 MiB）。元のA/Bは保持しています。');moov=new Uint8Array(await mediaRead(blob.slice(at,at+size)));}
    if(type==='moof')fragmented=true;if(type==='mdat')dataRanges.push([at+header,at+size]);at+=size;
  }
  if(!moov)throw Error('動画の索引がありません。撮影・書き出しの完了後に選び直してください。');
  const root=atomList(moov)[0],children=atomList(moov,root.header),tracks=[];
  const child=(node,type)=>atomList(moov,node.start+node.header,node.end).find(x=>x.type===type);
  for(const trak of children.filter(x=>x.type==='trak')){const mdia=child(trak,'mdia'),hdlr=mdia&&child(mdia,'hdlr');if(hdlr&&hdlr.start+hdlr.header+12<=hdlr.end)tracks.push({trak,mdia,kind:atomType(moov,hdlr.start+hdlr.header+8)});}
  const isVideo=tracks.some(t=>t.kind==='vide'),audio=tracks.filter(t=>t.kind==='soun');
  if(typeof recordInput==='function')recordInput('MEDIA','コンテナのトラック',{tracks:tracks.map(t=>{const minf=child(t.mdia,'minf'),stbl=minf&&child(minf,'stbl'),stsd=stbl&&child(stbl,'stsd');return {kind:t.kind,codec:stsd?atomType(moov,stsd.start+stsd.header+12):''};}),fragmented});
  if(!isVideo)return {isVideo:false,audioBlob:blob,path:'native'};
  if(!audio.length)throw Error('この動画には音声トラックがありません。A/B音声比較には音声付き動画が必要です。');
  // TN3177: modern iPhone movies can carry enabled stereo + disabled spatial
  // alternatives. File order/codec preference must not override the default.
  const headers=audio.map(t=>{const box=child(t.trak,'tkhd');if(!box)return null;const p=box.start+box.header,version=moov[p],idAt=p+(version===1?20:12),groupAt=p+(version===1?46:34);if(version>1||groupAt+2>box.end)return null;const v=new DataView(moov.buffer);return {id:v.getUint32(idAt),group:v.getUint16(groupAt),groupAt,enabled:!!(moov[p+3]&1)};});
  let selected=0,selection='single';
  if(audio.length>1){const enabled=headers.map((h,i)=>h?.enabled?i:-1).filter(i=>i>=0),group=headers[0]?.group;
    if(!group||headers.some(h=>!h||h.group!==group||!h.id)||new Set(headers.map(h=>h?.id)).size!==audio.length||enabled.length!==1)throw Error('複数の音声トラックの既定選択を確定できません。同じ代替グループに有効な音声が1つ必要です。');
    selected=enabled[0];selection='enabled-alternate';
  }
  const selectedTrackId=headers[selected]?.id||null,notice=audio.length>1?'動画が指定する既定音声トラック '+selectedTrackId+' を比較します（空間音声・Audio Mixの再現ではありません）。':'';
  const nativeFallback=()=>{if(audio.length>1)throw Error('既定音声トラックを特定しましたが、この形式では単独抽出できません。別トラックへ勝手に切り替えず読み込みを停止しました。');return {isVideo:true,audioBlob:blob,path:'native-container'};};
  if(typeof recordInput==='function')recordInput('MEDIA','音声選択',{selection,selectedTrackId,tracks:headers,notice});
  if(fragmented||children.some(x=>x.type==='mvex'))return nativeFallback();
  const {trak,mdia}=audio[selected],minf=child(mdia,'minf'),stbl=minf&&child(minf,'stbl');if(!stbl)return nativeFallback();
  const tables=atomList(moov,stbl.start+stbl.header,stbl.end),table=type=>tables.find(x=>x.type===type),stsd=table('stsd'),stsz=table('stsz'),stsc=table('stsc'),offsets=table('stco')||table('co64'),view=new DataView(moov.buffer);
  if(!stsd||!stsz||!stsc||!offsets)return nativeFallback();
  const read32=(box,offset)=>{const p=box.start+box.header+offset;if(p+4>box.end)throw Error('動画の音声テーブルが不完全です');return view.getUint32(p);};
  const codec=atomType(moov,stsd.start+stsd.header+12);
  // AAC/ALAC packet tables are byte-sized. Legacy QuickTime PCM tables have
  // additional packet-size conventions: leave those to the native decoder.
  if(!['mp4a','alac'].includes(codec)||read32(stsd,4)!==1)return nativeFallback();
  const chunkCount=read32(offsets,4),sampleCount=read32(stsz,8),fixedSize=read32(stsz,4),mapCount=read32(stsc,4),entrySize=offsets.type==='co64'?8:4;
  if(!chunkCount||!sampleCount||!mapCount||chunkCount>1000000||sampleCount>4000000||mapCount>chunkCount)throw Error('動画の音声テーブル数が不正または上限超過です');
  if(offsets.start+offsets.header+8+chunkCount*entrySize>offsets.end||stsc.start+stsc.header+8+mapCount*12>stsc.end||(!fixedSize&&stsz.start+stsz.header+12+sampleCount*4>stsz.end))throw Error('動画の音声テーブル長が不正です');
  const map=Array.from({length:mapCount},(_,i)=>({first:read32(stsc,8+i*12),count:read32(stsc,12+i*12),desc:read32(stsc,16+i*12)}));
  if(map[0].first!==1||map.some((r,i)=>!r.count||r.desc!==1||r.first>chunkCount||(i&&r.first<=map[i-1].first)))throw Error('動画の音声チャンク対応表が不正です');
  const chunks=[];let sample=0,mi=0,total=0;
  for(let i=0;i<chunkCount;i++){while(mi+1<map.length&&map[mi+1].first<=i+1)mi++;const count=map[mi].count;if(sample+count>sampleCount)throw Error('動画の音声サンプル数が不一致です');let size=fixedSize*count;
    if(!fixedSize)for(let j=0;j<count;j++)size+=read32(stsz,12+(sample+j)*4);sample+=count;
    const at=offsets.start+offsets.header+8+i*entrySize,start=entrySize===8?Number(view.getBigUint64(at)):view.getUint32(at);
    if(!Number.isSafeInteger(start)||!size||!dataRanges.some(([lo,hi])=>start>=lo&&start+size<=hi))throw Error('動画内音声の参照先が不正です');chunks.push({start,size,at});total+=size;
  }
  if(sample!==sampleCount||total+8>0xffffffff)return nativeFallback();
  // Keep movie timing and audio edits unchanged; remove only video tracks/data.
  const keep=children.filter(x=>x.type==='mvhd'||x===trak),ftyp=atomBytes('ftyp',[Uint8Array.from([77,52,65,32,0,0,0,0,105,115,111,109,109,112,52,50])]);
  const trackParts=atomList(moov,trak.start+trak.header,trak.end).filter(b=>audio.length===1||b.type!=='tref');
  const trackSize=audio.length===1?trak.end-trak.start:8+trackParts.reduce((n,b)=>n+b.end-b.start,0);
  const moovSize=8+keep.reduce((n,b)=>n+(b===trak?trackSize:b.end-b.start),0);let next=ftyp.length+moovSize+8;
  if(entrySize===4&&next+total>0xffffffff)return nativeFallback();
  for(const c of chunks){if(entrySize===8)view.setBigUint64(c.at,BigInt(next));else view.setUint32(c.at,next);next+=c.size;}
  if(audio.length>1)view.setUint16(headers[selected].groupAt,0);
  const audioTrak=audio.length===1?moov.subarray(trak.start,trak.end):atomBytes('trak',trackParts.map(b=>moov.subarray(b.start,b.end)));
  const audioMoov=atomBytes('moov',keep.map(b=>b===trak?audioTrak:moov.subarray(b.start,b.end))),mdat=new Uint8Array(8);new DataView(mdat.buffer).setUint32(0,total+8);mdat.set([109,100,97,116],4);
  return {isVideo:true,audioBlob:new Blob([ftyp,audioMoov,mdat,...chunks.map(c=>blob.slice(c.start,c.start+c.size))],{type:'audio/mp4'}),path:'audio-track-remux',codec,selection,selectedTrackId,notice};
}
