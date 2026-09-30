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
// QuickTime SoundDescription v1/v2 is NOT an ISO AudioSampleEntry. In
// particular, QT stores esds inside wave; changing ftyp alone is not a remux.
function isoAACDescription(bytes,stsd){
  const entries=atomList(bytes,stsd.start+stsd.header+8,stsd.end);
  if(entries.length!==1||entries[0].type!=='mp4a')throw Error('AAC sample entry が不正です');
  const entry=entries[0],p=entry.start+entry.header,v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  if(p+28>entry.end)throw Error('AAC sample entry が不完全です');
  const version=v.getUint16(p+8),extension=version===0?28:version===1?44:version===2?64:0;
  if(!extension||p+extension>entry.end)throw Error('未対応または不完全なQuickTime音声定義です');
  const extras=atomList(bytes,p+extension,entry.end),wave=extras.find(b=>b.type==='wave');
  const configs=extras.filter(b=>b.type==='esds').concat(wave?atomList(bytes,wave.start+wave.header,wave.end).filter(b=>b.type==='esds'):[]);
  if(configs.length!==1)throw Error('AAC esds が一意に存在しません');
  const esds=configs[0];
  // MPEG-4 descriptor lengths are variable length (including the common
  // four-byte padded encoding). Never search for a literal 0x05 byte.
  const descriptor=(at,end)=>{if(at>=end)throw Error('AAC descriptor が不完全です');const tag=bytes[at++];let length=0,done=false;for(let i=0;i<4&&at<end;i++){const n=bytes[at++];length=length*128+(n&127);if(!(n&128)){done=true;break;}}if(!done||at+length>end)throw Error('AAC descriptor 長が不正です');return {tag,start:at,end:at+length};};
  const list=(at,end)=>{const out=[];while(at<end){const d=descriptor(at,end);out.push(d);at=d.end;}return out;};
  if(esds.start+esds.header+4>=esds.end||v.getUint32(esds.start+esds.header)!==0)throw Error('AAC esds version が不正です');
  const es=list(esds.start+esds.header+4,esds.end).find(d=>d.tag===3);
  if(!es||es.start+3>es.end)throw Error('AAC ES descriptor がありません');
  let at=es.start+3;const flags=bytes[es.start+2];if(flags&128)at+=2;if(flags&64){if(at>=es.end)throw Error('AAC ES URL が不完全です');at+=1+bytes[at];}if(flags&32)at+=2;
  if(at>es.end)throw Error('AAC ES descriptor が不完全です');
  const decoder=list(at,es.end).find(d=>d.tag===4);
  if(!decoder||decoder.start+13>decoder.end||bytes[decoder.start]!==0x40||(bytes[decoder.start+1]>>2)!==5)throw Error('AAC DecoderConfig が不正または未対応です');
  const asc=list(decoder.start+13,decoder.end).find(d=>d.tag===5);
  if(!asc||asc.end-asc.start<2)throw Error('AAC AudioSpecificConfig がありません');
  let bit=asc.start*8;const bits=n=>{let value=0;for(let i=0;i<n;i++){if(bit>=asc.end*8)throw Error('AAC AudioSpecificConfig が不完全です');value=value*2+((bytes[bit>>3]>>(7-(bit++&7)))&1);}return value;};
  let objectType=bits(5);if(objectType===31)objectType=32+bits(6);const frequencyIndex=bits(4),rate=frequencyIndex===15?bits(24):[96000,88200,64000,48000,44100,32000,24000,22050,16000,12000,11025,8000,7350][frequencyIndex],channelConfig=bits(4);
  if(!objectType||!rate||channelConfig>7)throw Error('AAC AudioSpecificConfig の基本設定が不正です');
  const channels=version===2?v.getUint32(p+40):v.getUint16(p+16),sampleRate=version===2?v.getFloat64(p+32):v.getUint32(p+24)/65536;
  if(!channels||channels>32||!Number.isFinite(sampleRate)||sampleRate<=0||sampleRate>384000)throw Error('AAC sample entry のレート／ch数が不正です');
  // Keep ASC verbatim: HE-AAC extensions, priming and channel configuration
  // must not be guessed/re-encoded. ISO's legacy 16.16 field cannot hold 96k.
  const base=new Uint8Array(28),bv=new DataView(base.buffer);bv.setUint16(6,1);bv.setUint16(16,channels);bv.setUint16(18,16);bv.setUint32(24,sampleRate<=65535?Math.round(sampleRate*65536):0);
  const normalized=atomBytes('stsd',[bytes.subarray(stsd.start+stsd.header,stsd.start+stsd.header+8),atomBytes('mp4a',[base,bytes.subarray(esds.start,esds.end)])]);
  const ascHex=Array.from(bytes.subarray(asc.start,Math.min(asc.end,asc.start+4096)),b=>b.toString(16).padStart(2,'0')).join('');
  return {bytes:normalized,info:{sourceVersion:version,esdsLocation:wave?'wave':'direct',objectType,ascRate:rate,channelConfig,channels,sampleRate,ascBytes:asc.end-asc.start,ascHex,ascTruncated:asc.end-asc.start>4096}};
}
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
  const aac=codec==='mp4a'?isoAACDescription(moov,stsd):null;
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
  const mvhd=children.find(b=>b.type==='mvhd'),mdhd=child(mdia,'mdhd'),tkhd=child(trak,'tkhd'),stts=table('stts');
  const timing=box=>{if(!box)throw Error('動画の音声時刻ヘッダーがありません');const p=box.start+box.header,version=moov[p];if(version>1||p+(version?32:20)>box.end)throw Error('動画の音声時刻ヘッダーが不正です');const scale=view.getUint32(p+(version?20:12)),at=p+(version?24:16),duration=version?Number(view.getBigUint64(at)):view.getUint32(at);if(!scale||!Number.isSafeInteger(duration))throw Error('動画のtimescale / duration が不正です');return {scale,duration,at,version};};
  const movie=timing(mvhd),media=timing(mdhd);
  if(!tkhd||!headers[selected]?.id||!stts)throw Error('動画のtkhd / stts がありません');
  const timeCount=read32(stts,4);if(!timeCount||stts.start+stts.header+8+timeCount*8!==stts.end)throw Error('動画のstts長が不正です');
  let timedSamples=0,ticks=0;for(let i=0;i<timeCount;i++){const n=read32(stts,8+i*8),delta=read32(stts,12+i*8);if(!n||!delta)throw Error('動画のstts項目が不正です');timedSamples+=n;ticks+=n*delta;}
  if(timedSamples!==sampleCount||!Number.isSafeInteger(ticks)||ticks!==media.duration)throw Error('動画のstts / stsz / mdhd duration が不一致です');
  const tp=tkhd.start+tkhd.header,tv=moov[tp],td=tp+(tv?28:20);if(td+(tv?8:4)>tkhd.end)throw Error('動画のtkhd duration が不完全です');
  const trackDuration=tv?Number(view.getBigUint64(td)):view.getUint32(td),edts=child(trak,'edts'),elst=edts&&child(edts,'elst');
  if(!Number.isSafeInteger(trackDuration)||!trackDuration)throw Error('動画のtrack duration が不正です');
  if(elst){const p=elst.start+elst.header,version=moov[p],stride=version===1?20:12,n=read32(elst,4);if(version>1||p+8+n*stride!==elst.end)throw Error('動画のedit list長が不正です');let duration=0;
    for(let i=0;i<n;i++){const at=p+8+i*stride,d=version?Number(view.getBigUint64(at)):view.getUint32(at),start=version?Number(view.getBigInt64(at+8)):view.getInt32(at+4),rateAt=at+(version?16:8);if(!Number.isSafeInteger(d)||!Number.isSafeInteger(start)||start< -1||view.getInt16(rateAt)!==1||view.getUint16(rateAt+2)!==0||start>=0&&start+d*media.scale/movie.scale>ticks+Math.ceil(media.scale/movie.scale))throw Error('動画のedit listの時刻／速度が未対応または不正です');duration+=d;}
    if(Math.abs(duration-trackDuration)>1)throw Error('動画のedit list / track duration が不一致です');
  }else if(Math.abs(trackDuration-media.duration*movie.scale/media.scale)>1)throw Error('動画のtrack / media duration が不一致です');
  // Preserve audio edit lists (AAC priming / empty leading edit) and timescales.
  // The movie now has one track, so its duration must be the AUDIO duration.
  if(movie.version)view.setBigUint64(movie.at,BigInt(trackDuration));else{if(trackDuration>0xffffffff)throw Error('音声durationが32bit範囲を超えています');view.setUint32(movie.at,trackDuration);}
  view.setUint16(headers[selected].groupAt,0);
  const ftyp=atomBytes('ftyp',[Uint8Array.from([77,52,65,32,0,0,0,0,77,52,65,32,105,115,111,109,109,112,52,50])]);
  const replacements=new Map();if(aac)replacements.set(stsd.start,aac.bytes);
  // QT hdlr uses component flags / Pascal names; emit ISO handler and a
  // self-contained data reference instead of leaving QuickTime-only fields.
  const handler=child(mdia,'hdlr'),hd=new Uint8Array(24);hd.set([115,111,117,110],8);replacements.set(handler.start,atomBytes('hdlr',[hd,Uint8Array.from([83,111,117,110,100,72,97,110,100,108,101,114,0])]));
  const dataRef=child(minf,'dinf'),dref=atomBytes('dinf',[atomBytes('dref',[Uint8Array.from([0,0,0,0,0,0,0,1]),atomBytes('url ',[Uint8Array.from([0,0,0,1])])])]);
  if(dataRef)replacements.set(dataRef.start,dref);
  const rebuild=node=>{if(replacements.has(node.start))return replacements.get(node.start);if(!['trak','mdia','minf','stbl'].includes(node.type))return moov.subarray(node.start,node.end);const parts=atomList(moov,node.start+node.header,node.end).filter(b=>!(node.start===trak.start&&b.type==='tref')&&!(node.start===minf.start&&b.type==='hdlr')).map(rebuild);if(node.start===minf.start&&!dataRef)parts.unshift(dref);return atomBytes(node.type,parts);};
  const buildMoov=()=>atomBytes('moov',[moov.subarray(mvhd.start,mvhd.end),rebuild(trak)]);
  const moovSize=buildMoov().length;let next=ftyp.length+moovSize+8;
  if(entrySize===4&&next+total>0xffffffff)return nativeFallback();
  for(const c of chunks){if(entrySize===8)view.setBigUint64(c.at,BigInt(next));else view.setUint32(c.at,next);next+=c.size;}
  const audioMoov=buildMoov(),mdat=new Uint8Array(8);new DataView(mdat.buffer).setUint32(0,total+8);mdat.set([109,100,97,116],4);
  if(typeof recordInput==='function')recordInput('MEDIA','remux検証',{format:'ISO M4A',codec,aac:aac?.info,chunkCount,sampleCount,audioBytes:total,movieTimescale:movie.scale,mediaTimescale:media.scale,mediaDuration:ticks,trackDuration,editList:!!elst,moovBytes:audioMoov.length,firstOffset:ftyp.length+audioMoov.length+8,endOffset:next});
  const audioBlob=new Blob([ftyp,audioMoov,mdat,...chunks.map(c=>blob.slice(c.start,c.start+c.size))],{type:'audio/mp4'});
  const audit=await auditRemuxBlob(audioBlob,{source:blob,chunks});
  if(typeof recordInput==='function')recordInput('MEDIA','remux Blob読戻し監査',audit);
  return {isVideo:true,audioBlob,audit,path:'audio-track-remux',codec,selection,selectedTrackId,notice};
}

// Read the SERIALIZED Blob, not just the remux builder's calculated offsets.
// Only moov and tiny packet probes enter JS memory; never the whole movie.
async function auditRemuxBlob(blob,expected=null){
  const read=async(start,end)=>new Uint8Array(await (typeof readMediaBytes==='function'?readMediaBytes(blob.slice(start,end)):blob.slice(start,end).arrayBuffer()));
  const top=[];let moov=null,brands=null;
  for(let at=0;at<blob.size;){const head=await read(at,at+16);if(head.length<8)throw Error('remux: truncated top-level header');const v=new DataView(head.buffer);let size=v.getUint32(0),header=8;if(size===1){if(head.length<16)throw Error('remux: truncated large header');size=Number(v.getBigUint64(8));header=16;}if(size===0)size=blob.size-at;if(!Number.isSafeInteger(size)||size<header||at+size>blob.size)throw Error('remux: invalid atom boundary');const type=atomType(head,4);top.push({type,start:at,end:at+size,header});if(top.length>16)throw Error('remux: unexpected top-level atoms');
    if(type==='moov'){if(size>32*1024*1024)throw Error('remux: oversized moov');moov=await read(at,at+size);}
    if(type==='ftyp'){if(size>256||size<header+8||(size-header-8)%4)throw Error('remux: invalid ftyp');const b=await read(at,at+size);brands={major:atomType(b,header),minorVersion:new DataView(b.buffer).getUint32(header+4),compatible:[]};for(let p=header+8;p<b.length;p+=4)brands.compatible.push(atomType(b,p));}at+=size;
  }
  if(!moov||!brands||top.map(b=>b.type).join(',')!=='ftyp,moov,mdat')throw Error('remux: expected ftyp/moov/mdat');
  const view=new DataView(moov.buffer),root=atomList(moov)[0],kids=n=>atomList(moov,n.start+n.header,n.end),one=(n,type)=>{const list=kids(n).filter(b=>b.type===type);if(list.length!==1)throw Error('remux: expected one '+type);return list[0];};
  const mvhd=one(root,'mvhd'),trak=one(root,'trak'),tkhd=one(trak,'tkhd'),mdia=one(trak,'mdia'),mdhd=one(mdia,'mdhd'),hdlr=one(mdia,'hdlr'),minf=one(mdia,'minf'),dinf=one(minf,'dinf'),dref=one(dinf,'dref'),stbl=one(minf,'stbl'),stsd=one(stbl,'stsd'),stts=one(stbl,'stts'),stsc=one(stbl,'stsc'),stsz=one(stbl,'stsz');
  const warnings=[],smhd=kids(minf).find(b=>b.type==='smhd');if(!smhd)warnings.push('smhd missing');else if(smhd.end-smhd.start!==smhd.header+8)warnings.push('smhd size unexpected');
  const u32=(box,offset)=>{const at=box.start+box.header+offset;if(at+4>box.end)throw Error('remux: truncated '+box.type);return view.getUint32(at);};
  const times=box=>{const p=box.start+box.header,version=moov[p];if(version>1||p+(version?32:20)>box.end)throw Error('remux: invalid timing header');const timescale=u32(box,version?20:12),duration=version?Number(view.getBigUint64(p+24)):u32(box,16);if(!timescale||!Number.isSafeInteger(duration))throw Error('remux: invalid timing');return {version,timescale,duration,seconds:duration/timescale};};
  const movie=times(mvhd),media=times(mdhd),tp=tkhd.start+tkhd.header,tv=moov[tp];if(tv>1||tp+(tv?48:36)>tkhd.end)throw Error('remux: truncated tkhd');const trackId=u32(tkhd,tv?20:12),trackDuration=tv?Number(view.getBigUint64(tp+28)):u32(tkhd,20),alternateGroup=view.getUint16(tp+(tv?46:34));
  const entries=atomList(moov,stsd.start+stsd.header+8,stsd.end);if(u32(stsd,4)!==1||entries.length!==1)throw Error('remux: sample description count');const entry=entries[0],ep=entry.start+entry.header;if(ep+28>entry.end)throw Error('remux: truncated audio entry');const dataReferenceIndex=view.getUint16(ep+6);
  const refs=atomList(moov,dref.start+dref.header+8,dref.end);if(u32(dref,4)!==1||refs.length!==1||refs[0].type!=='url '||u32(refs[0],0)!==1||dataReferenceIndex!==1)throw Error('remux: broken self-contained data reference');
  if(atomType(moov,hdlr.start+hdlr.header+8)!=='soun'||alternateGroup!==0||!trackId)throw Error('remux: invalid audio track references');
  const aac=entry.type==='mp4a'?isoAACDescription(moov,stsd).info:null;
  const offsetBoxes=kids(stbl).filter(b=>b.type==='stco'||b.type==='co64');if(offsetBoxes.length!==1)throw Error('remux: ambiguous chunk offsets');const offsets=offsetBoxes[0],width=offsets.type==='co64'?8:4,chunkCount=u32(offsets,4),sampleCount=u32(stsz,8),fixed=u32(stsz,4),mapCount=u32(stsc,4),timeCount=u32(stts,4);
  if(!chunkCount||chunkCount>1000000||!sampleCount||sampleCount>4000000||!mapCount||mapCount>chunkCount||offsets.end-offsets.start!==offsets.header+8+chunkCount*width||stsc.end-stsc.start!==stsc.header+8+mapCount*12||stsz.end-stsz.start!==stsz.header+12+(fixed?0:sampleCount*4)||stts.end-stts.start!==stts.header+8+timeCount*8)throw Error('remux: inconsistent sample-table length');
  const map=[];for(let i=0;i<mapCount;i++){const first=u32(stsc,8+i*12),count=u32(stsc,12+i*12),description=u32(stsc,16+i*12);if(!count||description!==1||first>chunkCount||(i?first<=map[i-1].first:first!==1))throw Error('remux: invalid stsc');map.push({first,count});}
  const mdat=top[2],mdatStart=mdat.start+mdat.header,values=[],sourceOffsets=[],probes=[];let sample=0,mi=0,next=mdatStart,lastSampleOffset=null,lastSampleSize=0;
  for(let i=0;i<chunkCount;i++){while(mi+1<map.length&&map[mi+1].first<=i+1)mi++;const count=map[mi].count;if(sample+count>sampleCount)throw Error('remux: stsc exceeds stsz');let bytes=0;for(let j=0;j<count;j++){lastSampleSize=fixed||u32(stsz,12+(sample+j)*4);if(!lastSampleSize)throw Error('remux: empty AAC sample');bytes+=lastSampleSize;}sample+=count;
    const p=offsets.start+offsets.header+8+i*width,value=width===8?Number(view.getBigUint64(p)):view.getUint32(p);if(value!==next||!Number.isSafeInteger(value)||value+bytes>mdat.end)throw Error('remux: chunk offset / mdat / sample size mismatch');lastSampleOffset=value+bytes-lastSampleSize;next=value+bytes;
    const source=expected?.chunks[i];if(expected&&(!source||source.size!==bytes))throw Error('remux: original sample table mismatch');
    if(chunkCount<=128||i<64||i>=chunkCount-64){values.push({chunk:i+1,offset:value});if(source)sourceOffsets.push({chunk:i+1,offset:source.start});}
    if(source&&(i===0||i===Math.floor(chunkCount/2)||i===chunkCount-1)){const n=Math.min(bytes,64),a=await read(value,value+n),part=expected.source.slice(source.start,source.start+n),b=new Uint8Array(await (typeof readMediaBytes==='function'?readMediaBytes(part):part.arrayBuffer()));if(a.length!==b.length||a.some((v,j)=>v!==b[j]))throw Error('remux: source packet bytes differ');probes.push({chunk:i+1,bytes:n,equal:true});}
  }
  if(sample!==sampleCount||next!==mdat.end||expected&&expected.chunks.length!==chunkCount)throw Error('remux: sample count / mdat end mismatch');
  let ticks=0,timed=0;const sampleDurations=[];for(let i=0;i<timeCount;i++){const count=u32(stts,8+i*8),delta=u32(stts,12+i*8);if(!count||!delta)throw Error('remux: invalid sample duration');ticks+=count*delta;timed+=count;if(i<32)sampleDurations.push({count,delta});}if(timed!==sampleCount||ticks!==media.duration)throw Error('remux: stts / mdhd mismatch');
  const edts=kids(trak).find(b=>b.type==='edts'),edits=[];let editCount=0;if(edts){const elst=one(edts,'elst'),p=elst.start+elst.header,v=moov[p],stride=v?20:12;editCount=u32(elst,4);if(v>1||elst.end-p!==8+stride*editCount)throw Error('remux: invalid elst');for(let i=0;i<Math.min(editCount,32);i++){const q=p+8+i*stride;edits.push({segmentDuration:v?Number(view.getBigUint64(q)):view.getUint32(q),mediaTime:v?Number(view.getBigInt64(q+8)):view.getInt32(q+4),rateInteger:view.getInt16(q+(v?16:8)),rateFraction:view.getUint16(q+(v?18:10))});}}
  const atoms=[];const walk=n=>{atoms.push({type:n.type,start:n.start,end:n.end});if(['moov','trak','mdia','minf','dinf','stbl','edts'].includes(n.type))for(const b of kids(n))walk(b);};walk(root);
  return {blobSize:blob.size,mimeType:blob.type,ftyp:brands,codec:entry.type,channelCount:aac?.channels||view.getUint16(ep+16),sampleRate:aac?.sampleRate||view.getUint32(ep+24)/65536,duration:trackDuration/movie.timescale,movie,media,track:{id:trackId,enabled:!!(moov[tp+3]&1),alternateGroup,dataReferenceIndex,duration:trackDuration},sampleCount,firstSampleOffset:mdatStart,lastSampleOffset,lastSampleSize,mdat:{atomStart:mdat.start,payloadStart:mdatStart,endExclusive:mdat.end},offsetTable:{type:offsets.type,count:chunkCount,values,omitted:Math.max(0,chunkCount-128)},sourceOffsets,sourcePacketProbes:probes,aac,sampleDurations,sampleDurationEntryCount:timeCount,editCount,edits,topLevel:top,moovAtoms:atoms,warnings};
}
