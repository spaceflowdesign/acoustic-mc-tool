// Native integration harness. Served only by tests/server.mjs, not shipped.
const testBox=document.createElement('div');testBox.style='background:#123;padding:16px;white-space:pre-wrap';document.body.prepend(testBox);
const testButton=document.createElement('button');testButton.textContent='RUN NATIVE TESTS';testBox.append(testButton);
const out=document.createElement('pre');testBox.append(out);
function log(s){out.textContent+=s+'\n'}
function assertTest(v,s){if(!v)throw Error(s);log('PASS '+s)}
function delay(ms){return new Promise(r=>setTimeout(r,ms))}
function wav(seconds=8,sr=48000,phase=0){
  const n=seconds*sr,bytes=new ArrayBuffer(44+n*4),v=new DataView(bytes);
  for(const [at,s]of [[0,'RIFF'],[8,'WAVE'],[12,'fmt '],[36,'data']])for(let i=0;i<s.length;i++)v.setUint8(at+i,s.charCodeAt(i));
  v.setUint32(4,bytes.byteLength-8,true);v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,2,true);v.setUint32(24,sr,true);v.setUint32(28,sr*4,true);v.setUint16(32,4,true);v.setUint16(34,16,true);v.setUint32(40,n*4,true);
  for(let i=0;i<n;i++){const amp=.15+.12*Math.sin(i*.000071+phase);v.setInt16(44+i*4,Math.sin(i*2*Math.PI*440/sr)*amp*32767,true);v.setInt16(46+i*4,Math.sin(i*2*Math.PI*880/sr)*amp*32767,true);}
  return new Blob([bytes],{type:'audio/wav'});
}
testButton.onclick=async()=>{
  testButton.disabled=true;out.textContent='';
  try{
    await audio();
    const a=wav(),b=wav(8,48000,1);
    await loadBlob('A',a,'first.wav');assertTest(!!slots.A,'native WAV decode + incremental analysis + IDB commit');
    const asset=slots.A.asset;
    await loadBlob('B',new Blob([a]),'same-content-different-name.wav');
    assertTest(slots.B.asset===asset,'same source accepted in A/B; shared asset');
    assertTest(!(slots.A.buffer instanceof AudioBuffer),'slot retains metadata, not full AudioBuffer');
    const syncResult=await job('sync',{a:slots.A.env,b:slots.B.env,rateA:slots.A.envRate,rateB:slots.B.envRate});
    assertTest(syncResult.offset===0,'same-source AUTO SYNC zero');
    await loadBlob('B',b,'different.wav');assertTest(slots.B.asset!==asset,'distinct A/B assets simultaneously retained');
    const block=await pcmStore.read(asset,0,ctx);assertTest(block.length===asset.chunkFrames,'bounded playback block');
    // Compare native decode with data round-tripped through IDB; no resampling,
    // quantization, channel folding or level normalization in the new path.
    const decoded=await new OfflineAudioContext(1,1,ctx.sampleRate).decodeAudioData(await a.arrayBuffer());
    const expected=decoded.getChannelData(1),actual=block.getChannelData(1);
    assertTest(actual.every((v,i)=>v===expected[i]),'PCM samples preserved exactly through storage');
    const second=await pcmStore.read(asset,1,ctx),liveContext=ctx;
    const offline=new OfflineAudioContext(2,asset.chunkFrames*2,asset.sampleRate),joinedGain=offline.createGain();joinedGain.connect(offline.destination);
    ctx=offline;const joined={asset,origin:0,shift:0,end:4,gain:joinedGain};scheduleChunk(joined,block,0,0);scheduleChunk(joined,second,1,2);
    const rendered=await offline.startRendering();ctx=liveContext;sources=[];
    assertTest(rendered.getChannelData(1).every((v,i)=>v===expected[i]),'scheduled chunks render sample-exactly across boundary');
    await play('A');await delay(2300);assertTest(playing==='A'&&position()>2,'play across first chunk boundary');
    const before=position();await play('B');assertTest(playing==='B'&&Math.abs(position()-before)<.3,'A/B switch keeps shared timeline');
    pause();const p=cursor;await delay(100);assertTest(cursor===p&&!playing,'PAUSE holds cursor');
    setOffset(500);assertTest(offset===.5,'manual +500 ms');
    cursor=3.975;await play('B');await delay(300);assertTest(playing==='B','seek near chunk boundary with offset');
    pause(true);assertTest(cursor===limits()[0],'STOP resets to common interval');
    setOffset(-500);assertTest(limits()[0]===.5,'negative offset common interval');setOffset(0);
    const oldB=slots.B;await loadBlob('B',new Blob(['invalid']), 'bad.mp4');
    assertTest(slots.B===oldB&&!busy.B,'decode failure retains previous slot and unlocks UI');
    const put=pcmStore.put;pcmStore.put=async()=>{throw Error('test quota failure')};
    await loadBlob('B',wav(1),'quota.wav');pcmStore.put=put;
    assertTest(slots.B===oldB,'storage quota failure retains previous slot');
    const memoBefore=$('memo').value;$('memo').value='regression memo';$('memo').oninput();
    assertTest(sessionStorage.getItem('amct_memo_v1')==='regression memo','HISTORY / MEMO session storage');$('memo').value=memoBefore;$('memo').oninput();
    $('freqMode').value='music';draw();$('freqMode').value='standard';draw();log('PASS both frequency displays render');
    const oldA=slots.A;slots.A=null;await releaseSlot(oldA);assertTest(!!slots.B,'CLEAR A preserves B');
    await loadBlob('A',oldB.blob,'shared-again.wav');const shared=slots.A.asset;slots.B=null;await releaseSlot(oldB);
    assertTest((await pcmStore.read(shared,0,ctx)).length>0,'CLEAR shared B preserves A data');
    const getUserMedia=navigator.mediaDevices.getUserMedia;
    const destination=ctx.createMediaStreamDestination(),oscillator=ctx.createOscillator();oscillator.connect(destination);oscillator.start();
    navigator.mediaDevices.getUserMedia=async()=>destination.stream;
    $('recSlot').value='B';await $('record').onclick();await delay(700);
    assertTest(!!rec,'AIR REC starts real MediaRecorder with synthetic input');
    assertTest(!!lastLive,'LIVE analyser produces reference values');
    const savedReference=localStorage.getItem('amct_reference_v1');$('saveReference').onclick();
    assertTest(!!reference?.values?.length,'SAVE REFERENCE stores analyser values');
    if(savedReference===null)localStorage.removeItem('amct_reference_v1');else localStorage.setItem('amct_reference_v1',savedReference);
    stopRecord();for(let attempt=0;attempt<100&&(rec||busy.B||!slots.B);attempt++)await delay(100);
    oscillator.stop();navigator.mediaDevices.getUserMedia=getUserMedia;
    assertTest(slots.B?.name.startsWith('AIR_REC_'),'AIR REC STOP loads recording through same safe path');
    assertTest(slots.B.inputKind==='air','actual MediaRecorder stop marks AIR REC provenance');
    let download=null;const anchorClick=HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click=function(){download={name:this.download,url:this.href}};
    $('downloadB').onclick();HTMLAnchorElement.prototype.click=anchorClick;
    assertTest(download?.name===slots.B.name&&download?.url===slots.B.url,'SAVE AUDIO uses original recording blob and filename');
    log('NATIVE TESTS COMPLETE');
  }catch(error){log('FAIL '+error.stack)}finally{testButton.disabled=false}
};
const mp4Button=document.createElement('button');mp4Button.textContent='RUN 13 MIN MP4 TEST';testBox.append(mp4Button);
mp4Button.onclick=async()=>{
  mp4Button.disabled=true;
  try{
    await audio();log('Loading synthetic 780s / 48kHz / stereo video fixture…');
    // Tests only: fixture is injected by the local harness; production CSP and
    // production code remain completely offline.
    const blob=await(await fetch('/fixture.mp4')).blob();
    const startLongLoad=performance.now();await loadBlob('A',blob,'13min.mp4');assertTest(slots.A?.name==='13min.mp4'&&slots.A.buffer.duration>779,'13 min MP4 native decode, analysis and storage');
    log('INFO long MP4 decode + all analysis + IDB: '+((performance.now()-startLongLoad)/1000).toFixed(2)+' s');
    const id=slots.A.asset.id;await loadBlob('B',new Blob([blob]),'13min.mp4');
    assertTest(slots.B.asset.id===id,'13 min MP4 same-file A/B without second decode');
    cursor=390;await play('A');await delay(300);await play('B');assertTest(playing==='B'&&position()>390,'13 min MP4 seek and A/B playback');pause(true);
    const distinct=await(await fetch('/fixture-distinct.mp4')).blob();
    await loadBlob('B',distinct,'13min-distinct.mp4');
    assertTest(slots.B?.name==='13min-distinct.mp4'&&slots.B.asset.id!==id&&slots.A.asset.id===id,'two independently decoded 13 min MP4 assets coexist');
    assertTest(!(slots.A.buffer instanceof AudioBuffer)&&!(slots.B.buffer instanceof AudioBuffer),'neither long slot holds complete PCM in JS');
    cursor=779;await play('B');await delay(200);assertTest(playing==='B','long distinct MP4 near-end seek');pause(true);
    assertTest(pcmStore.cache.size<=8,'long-file cache stays bounded');
    assertTest(slots.A.kEnergy.byteLength<700000&&slots.B.kEnergy.byteLength<700000,'K-energy retained data below 0.7 MB per 13-minute source');
    assertTest(gainResult.valid&&gainResult.mode==='file','long MP4 common-interval FILE GAIN MATCH available');
    $('gainToggle').click();assertTest(gainEnabled&&gainResult.gains.A<=1&&gainResult.gains.B<=1,'long MP4 GAIN MATCH never amplifies');$('gainToggle').click();
    log('13 MIN MP4 TEST COMPLETE');
  }catch(error){log('FAIL '+error.stack)}finally{mp4Button.disabled=false}
};
