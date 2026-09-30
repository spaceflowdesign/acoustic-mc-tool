// Synthetic TN3177 track-header topology, NOT a genuine APAC encoder or iPhone
// recording. Only the enabled AAC track is decoded; the disabled clone is a
// deliberately unsupported codec to prove we never decode a default by order.
async function alternateMovieFixture(blob){
  const bytes=new Uint8Array(await blob.arrayBuffer()),top=atomList(bytes),moov=top.find(b=>b.type==='moov'),children=atomList(bytes,moov.start+moov.header,moov.end);
  const audio=children.find(b=>b.type==='trak'&&new TextDecoder().decode(bytes.slice(b.start,b.end)).includes('soun'));
  const original=bytes.slice(audio.start,audio.end),clone=original.slice();
  for(const [data,id,enabled]of [[original,77,true],[clone,88,false]]){
    const tkhd=atomList(data,8).find(b=>b.type==='tkhd'),p=tkhd.start+tkhd.header,v=new DataView(data.buffer),version=data[p];data[p+3]=enabled?data[p+3]|1:data[p+3]&~1;v.setUint32(p+(version?20:12),id);v.setUint16(p+(version?46:34),5);
    if(!enabled){const at=Array.from(data).findIndex((_,i)=>atomType(data,i)==='mp4a');if(at<0)throw Error('AAC fixture required');data.set([97,112,97,99],at);}
  }
  const replacement=atomBytes('moov',children.flatMap(b=>b===audio?[clone,original]:[bytes.slice(b.start,b.end)]));
  // Preserve every original mdat offset; append the revised moov at the tail.
  return new Blob([blob.slice(0,moov.start),atomBytes('free',[new Uint8Array(moov.end-moov.start-8)]),blob.slice(moov.end),replacement],{type:'video/quicktime'});
}
