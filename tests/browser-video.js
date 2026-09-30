const videoTests=makeAction('RUN VIDEO INPUT TESTS',async()=>{
  videoTests.disabled=true;const confirmOriginal=window.confirm;
  const waitFor=async(predicate,label)=>{for(let i=0;i<150;i++){if(predicate())return;await delay(40);}throw Error('Timeout: '+label);};
  const aligned=()=>!$('listenVideo').seeking&&$('listenVideo').style.visibility==='visible'&&Math.abs($('listenVideo').currentTime-videoTimeFor(playing||selectedSide,position(),offset,$('listenVideo').duration))<.15;
  try{
    pause(true);changePage('listen');selectedSide='A';window.confirm=()=>true;
    const response=await fetch('/camera.mov');if(!response.ok)throw Error('Generate camera.mov fixture first');const blob=await response.blob();
    const alternate=await alternateMovieFixture(blob),selected=await inspectMediaInput(alternate,'IMG_SPATIAL.MOV');
    assertTest(selected.selection==='enabled-alternate'&&selected.selectedTrackId===77&&selected.codec==='mp4a','TN3177 disabled spatial first selects enabled AAC default, not file order');
    const refAudio=await inspectMediaInput(blob,'camera.mov'),checkDecoder=new OfflineAudioContext(2,1,48000),refPCM=await checkDecoder.decodeAudioData(await refAudio.audioBlob.arrayBuffer()),selectedPCM=await checkDecoder.decodeAudioData(await selected.audioBlob.arrayBuffer());
    assertTest(refPCM.length===selectedPCM.length&&refPCM.getChannelData(0).every((v,i)=>v===selectedPCM.getChannelData(0)[i]),'alternate selection preserves default AAC samples and timeline exactly');
    for(const side of ['A','B']){await loadBlob(side,alternate,'spatial-'+side+'.MOV');assertTest(slots[side]?.media.selectedTrackId===77&&slots[side].media.notice.includes('既定音声'),'alternate movie commits '+side+' and discloses selected default audio');}
    assertTest(slots.A.asset===slots.B.asset,'alternate iPhone-layout same-file A/B still shares PCM');
    await waitFor(aligned,'alternate preview');await play('B');await waitFor(()=>aligned()&&!$('listenVideo').paused,'alternate playback');assertTest(playing==='B'&&videoPreview.slot===slots.B,'alternate movie displays LISTEN video synchronized to selected audio');pause(true);
    const inspected=await inspectMediaInput(blob,'IMG_0001.MOV');assertTest(inspected.path==='audio-track-remux'&&inspected.audioBlob.size<blob.size,'MOV extracts only compressed audio without copying video into decoder');
    const findBoxes=(bytes,type)=>{const result=[];for(const box of atomList(bytes)){const data=bytes.slice(box.start,box.end);if(box.type===type)result.push(data);if(['moov','trak','mdia','minf','stbl','edts'].includes(box.type))result.push(...findBoxes(data.slice(box.header),type));}return result;};
    const sourceBytes=new Uint8Array(await blob.arrayBuffer()),outputBytes=new Uint8Array(await inspected.audioBlob.arrayBuffer()),sourceDescriptions=findBoxes(sourceBytes,'stsd'),description=findBoxes(outputBytes,'stsd')[0];
    assertTest(inspected.selection==='single'&&inspected.selectedTrackId===2&&sourceDescriptions.some(d=>atomType(d,20)==='avc1')&&sourceDescriptions.some(d=>atomType(d,20)==='mp4a'&&new DataView(d.buffer).getUint16(32)===1),'reported MOV profile: avc1 + single enabled mp4a ID 2, QuickTime v1 entry');
    assertTest(new DataView(description.buffer).getUint16(32)===0&&atomList(description,52).map(b=>b.type).join(',')==='esds','M4A has ISO v0 mp4a with direct esds, not copied QuickTime wave');
    const audioDescription=sourceDescriptions.find(d=>atomType(d,20)==='mp4a'),wave=atomList(audioDescription,68).find(b=>b.type==='wave'),originalESDS=atomList(audioDescription,wave.start+wave.header,wave.end).find(b=>b.type==='esds'),newESDS=atomList(description,52)[0];
    assertTest(audioDescription.slice(originalESDS.start,originalESDS.end).every((b,i)=>b===description[newESDS.start+i])&&originalESDS.end-originalESDS.start===newESDS.end-newESDS.start,'AAC AudioSpecificConfig and descriptors remain byte exact');
    const outputMdat=atomList(outputBytes).find(b=>b.type==='mdat'),offsetTable=findBoxes(outputBytes,'stco')[0],offsetView=new DataView(offsetTable.buffer),offsetCount=offsetView.getUint32(12);
    assertTest(offsetView.getUint32(16)===outputMdat.start+8&&Array.from({length:offsetCount},(_,i)=>offsetView.getUint32(16+4*i)).every(n=>n>=outputMdat.start+8&&n<outputMdat.end),'all chunk offsets reference rebuilt mdat after header size changes');
    const decoder=new OfflineAudioContext(2,1,48000),native=await decoder.decodeAudioData(await blob.arrayBuffer()),extracted=await decoder.decodeAudioData(await inspected.audioBlob.arrayBuffer());
    assertTest(native.length===extracted.length&&native.getChannelData(0).every((v,i)=>v===extracted.getChannelData(0)[i]),'MOV audio extraction preserves decoded samples and timeline exactly');
    for(const [side,type,name]of [['A','video/quicktime','IMG_0001.MOV'],['B','','captured.MOV']]){
      const input=$('file'+side),transfer=new DataTransfer();transfer.items.add(new File([blob],name,{type}));input.files=transfer.files;
      const loading=input.onchange({target:input});assertTest(input.files.length===1,'picker '+side+' retains selected File while asynchronous import runs');await loading;
      assertTest(slots[side]?.name===name&&slots[side].media.isVideo&&slots[side].power.length>0&&input.files.length===0,'picker '+side+' commits video/audio/analysis then clears selection');
    }
    assertTest(slots.A.asset===slots.B.asset&&slots.A.blob.size===blob.size,'same video allowed in A/B; PCM asset shared and original SAVE blob preserved');
    const v=$('listenVideo');await waitFor(aligned,'initial preview');assertTest(!$('listenVideoPanel').hidden&&v.muted&&v.volume===0&&v.playsInline&&document.querySelectorAll('video').length===1,'LISTEN uses one muted inline video decoder');
    await play('A');await waitFor(()=>aligned()&&!v.paused,'PLAY');assertTest(playing==='A'&&position()>0,'video PLAY follows existing audio transport');
    pause();await waitFor(()=>aligned()&&v.paused,'PAUSE');const paused=position();await delay(120);assertTest(position()===paused&&Math.abs(v.currentTime-paused)<.03,'video PAUSE holds audio position');
    $('seek').value=3;$('seek').dispatchEvent(new Event('input'));await waitFor(aligned,'SEEK');assertTest(Math.abs(v.currentTime-3)<.03,'paused SEEK synchronizes video');
    setOffset(350);await play('B');await waitFor(()=>aligned()&&!v.paused,'B switch');assertTest(videoPreview.slot===slots.B&&Math.abs(v.currentTime-position()-.35)<.15,'B switch includes positive MANUAL SYNC offset');
    pause();setOffset(-250);await play('B');await waitFor(aligned,'negative offset');assertTest(Math.abs(v.currentTime-position()+.25)<.15,'negative MANUAL SYNC aligns video to audio');
    const before=transport;if(!gainEnabled)toggleGainMatch();await delay(80);assertTest(gainResult.valid&&transport===before&&aligned(),'FILE GAIN MATCH leaves video clock and transport unchanged');
    pause();const sync=await job('sync',{a:slots.A.env,b:slots.B.env,rateA:slots.A.envRate,rateB:slots.B.envRate});setOffset(sync.offset*1000);await waitFor(aligned,'AUTO SYNC');assertTest(offset===0,'AUTO SYNC result preserves video alignment');
    await play('A');await waitFor(aligned,'A again');assertTest(videoPreview.slot===slots.A,'A/B switch changes active video source');
    for(const page of ['compare','diff','history']){changePage(page);assertTest($('listenVideoPanel').hidden&&!v.getAttribute('src')&&!videoPreview.url,'no video or retained visual decoder in '+page);}
    changePage('listen');await waitFor(aligned,'return LISTEN');assertTest(playing==='A'&&videoPreview.slot===slots.A,'return LISTEN restores video without resetting audio');
    const hiddenDescriptor=Object.getOwnPropertyDescriptor(document,'hidden');
    try{
      Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));
      assertTest(!playing&&!videoPreview.url&&v.paused,'background stops video and audio and releases visual decoder');
      await ctx.suspend();Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));
      await waitFor(aligned,'foreground paused');assertTest(!playing&&v.paused,'foreground alone does not autoplay either stream');
      await play('B');await waitFor(()=>aligned()&&!v.paused,'recovered PLAY');assertTest(playing==='B'&&videoPreview.slot===slots.B,'explicit PLAY after background restores synchronized video');
    }finally{if(hiddenDescriptor)Object.defineProperty(document,'hidden',hiddenDescriptor);else delete document.hidden;}
    await play('A');await waitFor(aligned,'A before fullscreen');
    if(matchMedia('(orientation: landscape)').matches){const retainedURL=videoPreview.url;document.querySelector('.inline-expand').click();await delay(80);assertTest(fullGraph?.id==='wave'&&videoPreview.url===retainedURL,'LISTEN fullscreen remains waveform and retains hidden preview without media reload');const closed=new Promise(r=>$('graphDialog').addEventListener('close',r,{once:true}));$('graphDialog').close();await closed;await waitFor(aligned,'fullscreen return');assertTest(playing==='A','fullscreen return restores video and retains playback');}
    pause(true);await waitFor(aligned,'STOP');assertTest(position()===0&&v.paused&&v.currentTime<.03,'STOP resets both audio and video');
    const old=slots.A;await loadBlob('A',new Blob([]),'empty.MOV');assertTest(slots.A===old,'failed camera payload preserves existing A slot');
    await loadBlob('A',wav(),'ordinary.wav');assertTest(!slots.A.media.isVideo&&$('listenVideoPanel').hidden&&!videoPreview.url,'audio-only input restores unchanged waveform LISTEN');
    assertTest(!(await inspectMediaInput(new Blob(['x'],{type:'audio/webm'}),'AIR_REC.webm')).isVideo,'AIR REC WebM is not mistaken for video');
    assertTest(pcmStore.cache.size<=8&&!(slots.B.buffer instanceof AudioBuffer),'video import retains bounded PCM cache and metadata-only slots');
    log('VIDEO INPUT TESTS COMPLETE');
  }catch(error){log('FAIL '+error.stack);}finally{window.confirm=confirmOriginal;pause();videoTests.disabled=false;}
});testBox.append(videoTests);

const remuxProbeTests=makeAction('RUN REMUX DIAGNOSTIC TESTS',async()=>{
  remuxProbeTests.disabled=true;const NativeOffline=window.OfflineAudioContext;
  const waitFor=async(fn,label)=>{for(let i=0;i<200;i++){if(fn())return;await delay(40);}throw Error('Timeout '+label);};
  try{
    pause(true);await loadBlob('A',wav(1),'prior-A.wav');await loadBlob('B',wav(2),'prior-B.wav');
    setOffset(125);const a=slots.A,b=slots.B,context=ctx,match=gainResult,memo=$('memo').value;
    const movie=await (await fetch('/camera.mov')).blob();
    window.OfflineAudioContext=class extends NativeOffline{decodeAudioData(bytes){return Promise.reject(new DOMException('injected Safari failure','EncodingError'));}};
    try{await loadBlob('A',new File([movie],'IMG_FAILURE.MOV',{type:'video/quicktime'}),'IMG_FAILURE.MOV');}finally{window.OfflineAudioContext=NativeOffline;}
    assertTest(slots.A===a&&slots.B===b&&ctx===context&&gainResult===match&&offset===.125&&$('memo').value===memo,'injected remux EncodingError preserves prior A/B, context, gain, sync and memo');
    assertTest(inputEvents.some(e=>e.event==='失敗'&&e.stage==='動画内音声のデコード'&&e.error.startsWith('EncodingError')),'regression reaches actual remux/decode stage, not picker or alternate track');
    const audit=inputEvents.findLast(e=>e.event==='remux Blob読戻し監査'),decode=inputEvents.findLast(e=>e.event==='decodeAudioData直前');
    assertTest(audit?.codec==='mp4a'&&audit.track.id===2&&audit.track.enabled&&audit.aac.ascHex&&audit.moovAtoms.some(b=>b.type==='smhd'),'serialized single-track MOV audit includes AAC ASC and required sound header');
    assertTest(decode.path==='audio-track-remux'&&decode.arrayBufferByteLength===audit.blobSize&&decode.mimeType==='audio/mp4','actual pre-decode buffer byteLength equals audited remux Blob size');
    assertTest(remuxDiagnostic.blob?.size===audit.blobSize&&!remuxDiagnostic.url&&!$('remuxProbeAudio').getAttribute('src'),'failed import retains only one compressed audio Blob; no automatic native playback');
    const packetEnd=audit.lastSampleOffset+audit.lastSampleSize;
    assertTest(audit.firstSampleOffset===audit.mdat.payloadStart&&packetEnd===audit.mdat.endExclusive&&audit.offsetTable.values[0].offset===audit.firstSampleOffset,'serialized first/last SAMPLE offsets and complete mdat end agree');
    openDialog('sourceDialog');$('inputLog').closest('details').open=true;await delay(30);$('remuxProbe').click();
    await waitFor(()=>inputEvents.some(e=>e.event==='remux audio診断結果'),'native audio probe');
    assertTest(inputEvents.findLast(e=>e.event==='remux audio診断結果').result==='playback-progress','same remux Blob makes real HTMLAudioElement playback progress independently of Web Audio');
    assertTest(!remuxDiagnostic.url&&!$('remuxProbeAudio').getAttribute('src')&&ctx===context&&slots.A===a&&offset===.125,'probe releases decoder/URL without replacing A/B or AudioContext');
    const nativePlay=HTMLMediaElement.prototype.play;
    try{HTMLMediaElement.prototype.play=function(){return Promise.reject(new DOMException('test policy','NotAllowedError'));};$('remuxProbe').click();await waitFor(()=>inputEvents.at(-1)?.result==='gesture-blocked-inconclusive','gesture denial');}finally{HTMLMediaElement.prototype.play=nativePlay;}
    assertTest(inputEvents.at(-1).result==='gesture-blocked-inconclusive'&&!remuxDiagnostic.url,'autoplay/gesture rejection is inconclusive, never labelled broken container');
    $('remuxProbe').click();const closed=new Promise(r=>$('sourceDialog').addEventListener('close',r,{once:true}));$('sourceDialog').close();await closed;
    assertTest(!remuxDiagnostic.url&&!$('remuxProbeAudio').getAttribute('src'),'closing diagnostic dialog cancels and releases native probe');
    await loadBlob('A',wav(3),'next.wav');assertTest(!remuxDiagnostic.blob&&$('remuxProbe').disabled,'next import releases failed compressed Blob and disables diagnostics');
    assertTest(typeof window.AudioDecoder==='undefined'||!String(startRemuxAudioProbe).includes('AudioDecoder'),'probe has no WebCodecs AudioDecoder requirement');
    log('REMUX DIAGNOSTIC TESTS COMPLETE');
  }catch(e){log('FAIL '+e.stack);}finally{window.OfflineAudioContext=NativeOffline;clearRemuxDiagnostic();if($('sourceDialog').open)$('sourceDialog').close();pause();remuxProbeTests.disabled=false;}
});testBox.append(remuxProbeTests);
