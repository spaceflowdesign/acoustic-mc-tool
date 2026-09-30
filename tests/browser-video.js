const videoTests=makeAction('RUN VIDEO INPUT TESTS',async()=>{
  videoTests.disabled=true;const confirmOriginal=window.confirm;
  const waitFor=async(predicate,label)=>{for(let i=0;i<150;i++){if(predicate())return;await delay(40);}throw Error('Timeout: '+label);};
  const aligned=()=>!$('listenVideo').seeking&&$('listenVideo').style.visibility==='visible'&&Math.abs($('listenVideo').currentTime-videoTimeFor(playing||selectedSide,position(),offset,$('listenVideo').duration))<.15;
  try{
    pause(true);changePage('listen');selectedSide='A';window.confirm=()=>true;
    const response=await fetch('/camera.mov');if(!response.ok)throw Error('Generate camera.mov fixture first');const blob=await response.blob();
    const inspected=await inspectMediaInput(blob,'IMG_0001.MOV');assertTest(inspected.path==='audio-track-remux'&&inspected.audioBlob.size<blob.size,'MOV extracts only compressed audio without copying video into decoder');
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
