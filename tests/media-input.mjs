import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const c=vm.createContext({Blob});
vm.runInContext(readFileSync(new URL('../media-input.js',import.meta.url),'utf8'),c);
const atom=(type,...parts)=>c.atomBytes(type,parts),u32=(...values)=>{const b=new Uint8Array(values.length*4),v=new DataView(b.buffer);values.forEach((n,i)=>v.setUint32(i*4,n));return b;};
const descriptor=(tag,...parts)=>{const data=Buffer.concat(parts);return Uint8Array.from([tag,data.length,...data]);};
const esds=atom('esds',u32(0),descriptor(3,Uint8Array.from([0,2,0]),descriptor(4,Uint8Array.from([0x40,0x15,...new Uint8Array(11)]),descriptor(5,Uint8Array.from([0x11,0x90]))),descriptor(6,Uint8Array.from([2]))));
const soundHeader=new Uint8Array(28),sv=new DataView(soundHeader.buffer);sv.setUint16(6,1);sv.setUint16(16,2);sv.setUint16(18,16);sv.setUint32(24,48000*65536);
const trackHeader=new Uint8Array(84),tv=new DataView(trackHeader.buffer);trackHeader[3]=1;tv.setUint32(12,2);tv.setUint32(20,2048);
const track=(kind,offset=8)=>atom('trak',atom('tkhd',trackHeader),atom('mdia',atom('mdhd',u32(0,0,0,48000,2048,0)),atom('hdlr',u32(0,0),Uint8Array.from(kind,x=>x.charCodeAt(0))),atom('minf',atom('stbl',atom('stsd',u32(0,1),atom('mp4a',soundHeader,esds)),atom('stts',u32(0,1,2,1024)),atom('stsz',u32(0,4,2)),atom('stsc',u32(0,1,1,2,1)),atom('stco',u32(0,1,offset))))));
const make=(tracks=[track('vide'),track('soun')],extra=[])=>new Blob([atom('mdat',u32(123,456)),atom('moov',atom('mvhd',u32(0,0,0,48000,2048)),...tracks,...extra)],{type:'video/quicktime'});
let count=0;const check=async(name,fn)=>{await fn();console.log('PASS '+name);count++;};
await check('empty picker payload fails explicitly',()=>assert.rejects(c.inspectMediaInput(new Blob([]),'IMG.MOV'),/空/));
await check('audio WebM AIR REC never gets video UI',async()=>assert.equal((await c.inspectMediaInput(new Blob(['audio'],{type:'audio/webm;codecs=opus'}),'AIR_REC.webm')).isVideo,false));
await check('empty MIME MOV detected by track bytes and remuxed',async()=>{const b=new Blob([make()]),r=await c.inspectMediaInput(b,'IMG_0001.MOV');assert.equal(r.path,'audio-track-remux');assert.equal(r.isVideo,true);const a=await c.inspectMediaInput(r.audioBlob,'audio.m4a');assert.equal(a.isVideo,false);assert.equal(b.size,make().size);});
await check('audio-only MP4 does not show video even with video MIME',async()=>assert.equal((await c.inspectMediaInput(make([track('soun')]),'audio.mp4')).isVideo,false));
await check('no audio track preserves prior slot through rejection',()=>assert.rejects(c.inspectMediaInput(make([track('vide')]),'silent.mov'),/音声トラックがありません/));
await check('multiple audio tracks never silently select one',()=>assert.rejects(c.inspectMediaInput(make([track('vide'),track('soun'),track('soun')]),'multi.mov'),/複数/));
await check('fragmented input explicitly uses native decoder',async()=>assert.equal((await c.inspectMediaInput(make(undefined,[atom('mvex',u32(0))]),'fragment.mp4')).path,'native-container'));
await check('out-of-bounds chunk references rejected',()=>assert.rejects(c.inspectMediaInput(make([track('vide'),track('soun',999999)])),/参照先/));
await check('truncated container rejected',()=>assert.rejects(c.inspectMediaInput(make().slice(0,25),'broken.mov'),/サイズ情報/));
await check('unmodified WAV uses native path',async()=>{const b=new Blob(['RIFF1234WAVE'],{type:'audio/wav'});assert.equal((await c.inspectMediaInput(b,'test.wav')).audioBlob,b);});
function alternate(id,group,enabled,{version=0,codec='mp4a',ref=false}={}){
  const header=new Uint8Array(version?96:84),v=new DataView(header.buffer);header[0]=version;header[3]=enabled?1:0;v.setUint32(version?20:12,id);v.setUint16(version?46:34,group);if(version)v.setBigUint64(28,2048n);else v.setUint32(20,2048);
  const data=track('soun'),index=Array.from(data).findIndex((_,i)=>String.fromCharCode(...data.slice(i,i+4))==='mp4a');data.set(Uint8Array.from(codec,x=>x.charCodeAt(0)),index);
  return atom('trak',atom('tkhd',header),...(ref?[atom('tref',atom('fall',u32(99)))]:[]),data.slice(8+8+trackHeader.length));
}
await check('TN3177 enabled AAC chosen regardless of serialized order',async()=>{for(const tracks of [[alternate(7,3,true,{ref:true}),alternate(9,3,false,{codec:'apac'})],[alternate(9,3,false,{codec:'apac'}),alternate(7,3,true,{ref:true})]]){const r=await c.inspectMediaInput(make([track('vide'),...tracks]));assert.equal(r.selectedTrackId,7);assert.equal(r.selection,'enabled-alternate');assert.ok(r.notice.includes('7'));const bytes=new Uint8Array(await r.audioBlob.arrayBuffer());assert.ok(!new TextDecoder().decode(bytes).includes('tref'));assert.equal((await c.inspectMediaInput(r.audioBlob)).isVideo,false);}});
await check('version 1 track header default selection',async()=>{const r=await c.inspectMediaInput(make([track('vide'),alternate(9,3,false,{version:1,codec:'apac'}),alternate(7,3,true,{version:1})]));assert.equal(r.selectedTrackId,7);});
await check('ambiguous defaults/groups/ids are not guessed',async()=>{for(const tracks of [[alternate(1,0,true),alternate(2,0,false)],[alternate(1,1,true),alternate(2,2,false)],[alternate(1,1,true),alternate(2,1,true)],[alternate(1,1,false),alternate(2,1,false)],[alternate(1,1,true),alternate(1,1,false)]])await assert.rejects(c.inspectMediaInput(make([track('vide'),...tracks])),/既定選択/);});
await check('unsupported enabled codec never silently chooses disabled AAC',()=>assert.rejects(c.inspectMediaInput(make([track('vide'),alternate(1,1,true,{codec:'apac'}),alternate(2,1,false)])),/単独抽出/));
await check('fragmented multitrack does not use ambiguous native-container fallback',()=>assert.rejects(c.inspectMediaInput(make([track('vide'),alternate(1,1,true),alternate(2,1,false)],[atom('mvex',u32(0))])),/単独抽出/));
function rewrite(bytes,changes){return Buffer.concat(c.atomList(bytes).map(b=>{const data=bytes.slice(b.start,b.end);if(changes[b.type])return changes[b.type](data);if(['moov','trak','mdia','minf','stbl','edts'].includes(b.type))return atom(b.type,rewrite(data.slice(b.header),changes));return data;}));}
function boxes(bytes,type){const found=[];for(const b of c.atomList(bytes)){const data=bytes.slice(b.start,b.end);if(b.type===type)found.push(data);if(['moov','trak','mdia','minf','stbl','edts','dinf'].includes(b.type))found.push(...boxes(data.slice(b.header),type));}return found;}
const dv=b=>new DataView(b.buffer,b.byteOffset,b.byteLength);
await check('QuickTime v1/v2 wave esds becomes ISO v0 direct esds without changing AAC',async()=>{
  for(const version of [0,1,2])for(const wide of [false,true]){
    const header=new Uint8Array(version===2?64:version===1?44:28);header.set(soundHeader);const hv=dv(header);hv.setUint16(8,version);
    if(version===1){hv.setInt16(20,-2);hv.setUint32(28,1024);hv.setUint32(40,2);}
    if(version===2){hv.setUint32(28,72);hv.setFloat64(32,48000);hv.setUint32(40,2);}
    const source=rewrite(new Uint8Array(await make().arrayBuffer()),{stsd:()=>atom('stsd',u32(0,1),atom('mp4a',header,version?atom('wave',atom('frma',Uint8Array.from([109,112,52,97])),esds,atom('\0\0\0\0')):esds)),...(wide?{stco:()=>atom('co64',u32(0,1,0,8))}:{})});
    const output=new Uint8Array(await (await c.inspectMediaInput(new Blob([source],{type:'video/quicktime'}),'IMG_0001.MOV')).audioBlob.arrayBuffer());
    assert.deepEqual(Array.from(c.atomList(output),b=>b.type),['ftyp','moov','mdat']);assert.equal(boxes(output,'trak').length,1);
    const description=boxes(output,'stsd')[0],entry=c.atomList(description,16)[0];assert.equal(dv(description).getUint16(entry.start+16),0);
    const extensions=c.atomList(description,entry.start+36,entry.end);assert.deepEqual(Array.from(extensions,b=>b.type),['esds']);assert.deepEqual(Buffer.from(description.slice(extensions[0].start,extensions[0].end)),Buffer.from(esds));
    const table=boxes(output,wide?'co64':'stco')[0],offset=wide?Number(dv(table).getBigUint64(16)):dv(table).getUint32(16),mdat=c.atomList(output).find(b=>b.type==='mdat');assert.equal(offset,mdat.start+mdat.header);assert.deepEqual(Buffer.from(output.slice(offset)),Buffer.from(u32(123,456)));
    assert.deepEqual(Buffer.from(boxes(output,'stts')[0]),Buffer.from(boxes(source,'stts')[0]));assert.deepEqual(Buffer.from(boxes(output,'stsz')[0]),Buffer.from(boxes(source,'stsz')[0]));
    assert.equal(dv(boxes(output,'dref')[0]).getUint32(12),1);assert.equal(dv(boxes(output,'hdlr')[0]).getUint32(12),0);
  }
});
await check('audio edit list and priming retained; movie duration follows extracted audio not video',async()=>{
  const edited=atom('trak',atom('tkhd',trackHeader),atom('edts',atom('elst',u32(0,2,100,0xffffffff,0x10000,1948,100,0x10000))),track('soun').slice(100));
  const source=rewrite(new Uint8Array(await make([track('vide'),edited]).arrayBuffer()),{mvhd:()=>atom('mvhd',u32(0,0,0,48000,999999))});
  const out=new Uint8Array(await (await c.inspectMediaInput(new Blob([source]))).audioBlob.arrayBuffer());assert.equal(dv(boxes(out,'mvhd')[0]).getUint32(24),2048);assert.deepEqual(Buffer.from(boxes(out,'elst')[0]),Buffer.from(boxes(source,'elst')[0]));
});
await check('truncated/missing AAC configuration never passed to native decode',async()=>{
  for(const broken of [atom('esds',u32(0),Uint8Array.from([3,127,0])),atom('esds',u32(0)),atom('free')]){const source=rewrite(new Uint8Array(await make().arrayBuffer()),{stsd:()=>atom('stsd',u32(0,1),atom('mp4a',soundHeader,broken))});await assert.rejects(c.inspectMediaInput(new Blob([source])),/AAC/);}
});
await check('sample counts, durations and timescales audited before decode',async()=>{
  for(const changes of [{stts:()=>atom('stts',u32(0,1,1,1024))},{stts:()=>atom('stts',u32(0,1,2,1000))},{mdhd:()=>atom('mdhd',u32(0,0,0,0,2048,0))}]){const source=rewrite(new Uint8Array(await make().arrayBuffer()),changes);await assert.rejects(c.inspectMediaInput(new Blob([source])),/stts|timescale/);}
});
console.log(`${count} media-input tests passed`);
