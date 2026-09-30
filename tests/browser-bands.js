const bandsTests=makeAction('RUN BANDS / LISTEN TESTS',async()=>{
  bandsTests.disabled=true;const oldSettings=JSON.stringify(bandSettings),memo=$('memo').value;
  try{
    pause(true);changePage('compare');const blob=wav(8);await loadBlob('A',blob,'bands-a.wav');await loadBlob('B',blob,'bands-b.wav');
    $('freqMode').value='music';draw();
    assertTest(JSON.stringify(defaultEdges)==='[20,60,250,500,2000,8000,20000]','official six Music Default ranges');
    const state={A:slots.A,B:slots.B,power:slots.A.power,offset,history:history.length};
    changePage('listen');assertTest(document.querySelector('[data-panel=compare]').hidden&&!$('miniStrip').hidden&&!$('transportDock').hidden,'LISTEN hides spectrum and retains waveform and transport');
    await play('A');await delay(180);const p=position();await play('B');assertTest(playing==='B'&&position()>=p-.1,'LISTEN immediate synchronized A/B switch');
    shiftSeek(1);await delay(160);assertTest(position()>p+.8,'LISTEN seek uses retained transport');pause();const held=position();await delay(100);assertTest(position()===held,'LISTEN PAUSE holds position');
    $('openSync').click();assertTest($('syncDialog').open&&!$('offset').disabled,'LISTEN manual sync accessible');$('syncDialog').close();await delay(30);
    changePage('compare');assertTest(slots.A===state.A&&slots.B===state.B&&slots.A.power===state.power&&offset===state.offset&&history.length===state.history,'four pages preserve sources, analysis, sync and browser history');
    openDialog('bandsDialog');const inputs=$('customValues').querySelectorAll('input');inputs[1].value='10';$('saveBands').click();assertTest($('bandsDialog').open&&$('bandError').textContent.length>0,'invalid custom edge rejected');
    inputs[1].value='80';$('saveBands').click();await delay(30);assertTest(bandSettings.custom&&bandSettings.edges[1]===80,'custom edges apply');
    assertTest(parseBandSettings(localStorage.getItem('amct_bands_v1')).edges[1]===80,'custom edges persisted');
    $('resetBands').click();assertTest(!bandSettings.custom&&bandSettings.edges[1]===60,'reset restores official default');
    $('freqMode').value='standard';draw();assertTest(standard.length===31&&$('visualStatus').textContent.includes('1/3 OCT'),'standard 31 centers distinct from music groups');
    $('freqMode').value='music';$('smoothing').value='0';$('smoothing').dispatchEvent(new Event('change'));assertTest(smoothingOct===0,'smoothing OFF');$('smoothing').value=String(1/6);$('smoothing').dispatchEvent(new Event('change'));assertTest(smoothingOct===1/6,'smoothing 1/6');
    const before=showInlineDiff;$('inlineDiff').click();assertTest(showInlineDiff!==before,'integrated DIFF toggle');$('inlineDiff').click();
    await play('A');await delay(450);await sampleVisual();
    assertTest(visualState.frames.A?.asset===slots.A.asset&&visualState.frames.B?.asset===slots.B.asset,'reactive FFT samples both retained assets');
    assertTest(visualState.frames.A.power.length===4097&&pcmStore.cache.size<=8,'reactive FFT bounded; existing eight-chunk cache unchanged');
    assertTest($('miniTime').textContent.includes('/')&&position()>0,'small waveform time follows playback');pause();draw();assertTest($('visualStatus').textContent.includes('平均'),'paused graph clearly returns to average');
    if(matchMedia('(orientation: landscape)').matches){
      expandGraph('spectrum','COMPARE');assertTest(fullGraph?.id==='spectrum'&&$('miniStrip').parentElement===$('graphDialog'),'landscape includes graph and waveform');
      $('controlNext').click();assertTest(controlPage===1&&!document.querySelector('[data-control-page="1"]').hidden,'next one-row controls');$('controlNext').click();assertTest(controlPage===2&&$('controlNext').disabled,'last row page bounded');$('controlPrev').click();assertTest(controlPage===1,'previous one-row controls');
      $('fullPlay').click();await delay(180);assertTest(!!playing,'fullscreen PLAY');$('fullAB').click();await delay(180);assertTest(playing==='B','fullscreen A/B');
      const gainCopy=document.querySelector('[data-control-page="1"] [data-gain-copy]'),wasMatched=gainEnabled;gainCopy.click();assertTest(gainEnabled!==wasMatched&&gainCopy.textContent.includes(gainEnabled?'ON':'OFF'),'fullscreen GAIN MATCH updates its state immediately');gainCopy.click();
      $('graphDialog').close();await new Promise(r=>$('graphDialog').addEventListener('close',r,{once:true}));assertTest(!fullGraph&&$('miniStrip').parentElement!==$('graphDialog')&&playing==='B','close restores same waveform without stopping playback');pause();
    }else{expandGraph('spectrum','COMPARE');assertTest(!fullGraph&&$('rotateDialog').open&&!$('graphDialog').open,'portrait opens rotation guidance, not portrait fullscreen');$('rotateDialog').close();await delay(30);assertTest(!pendingGraph,'cancel rotation request');}
    showHelp('GAIN MATCH');assertTest($('gainLevels').textContent.includes('ORIGINAL'),'Original Level and Match Offset retained');$('helpDialog').close();await delay(30);openDialog('aboutDialog');assertTest($('aboutDialog').textContent.includes('Custom帯域')&&$('aboutDialog').textContent.includes('規格モード'),'independent detailed band explanations');$('aboutDialog').close();await delay(30);
    log('BANDS / LISTEN TESTS COMPLETE');
  }catch(error){log('FAIL '+error.stack);}finally{pause();bandSettings=parseBandSettings(oldSettings);saveBands();renderBandControls();$('memo').value=memo;bandsTests.disabled=false;}
});testBox.append(bandsTests);
const pageFullscreenTests=makeAction('RUN PAGE FULLSCREEN TESTS',async()=>{
  pageFullscreenTests.disabled=true;
  const closeGraph=()=>new Promise(resolve=>{$('graphDialog').addEventListener('close',resolve,{once:true});$('graphDialog').querySelector('[data-close]').click();});
  try{
    if(!matchMedia('(orientation: landscape)').matches){
      for(const [page,id]of [['listen','wave'],['compare','spectrum'],['diff','diffChart']]){changePage(page);document.querySelector('.inline-expand').click();assertTest(pendingGraph?.id===id&&!fullGraph&&$('rotateDialog').open,'portrait rotation request retains '+page+' target');const closed=new Promise(r=>$('rotateDialog').addEventListener('close',r,{once:true}));$('rotateDialog').close();await closed;}
      log('PAGE FULLSCREEN PORTRAIT TESTS COMPLETE');return;
    }
    pause(true);const a=wav(24),bytes=await a.arrayBuffer(),v=new DataView(bytes);for(let i=44;i<bytes.byteLength;i+=2)v.setInt16(i,v.getInt16(i,true)*2,true);
    await loadBlob('A',a,'fullscreen-A.wav');await loadBlob('B',new Blob([bytes],{type:'audio/wav'}),'fullscreen-B.wav');setOffset(125);if(!gainEnabled)toggleGainMatch();
    await play('B');await delay(120);assertTest(gainEnabled&&gainResult.valid&&transport.matchGain.gain.value<1,'fullscreen fixture has active gain compensation and nonzero sync');
    const state={A:slots.A,B:slots.B,ctx,offset,gain:gainResult,transport,origin};
    for(const [page,id]of [['listen','wave'],['compare','spectrum'],['diff','diffChart']]){
      changePage(page);const parent=$(id).parentElement.parentElement,p=position();document.querySelector('.inline-expand').click();
      assertTest(fullGraph?.id===id&&$(id).parentElement.parentElement===$('graphHost')&&activePage===page,'actual '+page+' button enlarges its own main content');
      assertTest(transport===state.transport&&origin===state.origin&&playing==='B'&&ctx===state.ctx&&offset===state.offset&&gainEnabled&&gainResult===state.gain&&slots.A===state.A&&slots.B===state.B,'opening '+page+' preserves transport, gain, sync and source identities');
      assertTest(position()>=p-.01&&position()<p+.5,'opening '+page+' never resets or seeks playback');
      if(page==='listen'){
        assertTest($('spectrum').parentElement.parentElement!==$('graphHost')&&$('wave').getBoundingClientRect().height>150,'LISTEN displays large A/B waveform, never COMPARE spectrum');
        assertTest(parseFloat(getComputedStyle($('miniTime')).fontSize)>=16&&$('seek').getBoundingClientRect().height>=32,'LISTEN fullscreen enlarges current/total time and seek');
        const stamp=$('miniTime').textContent;await delay(180);assertTest($('miniTime').textContent!==stamp&&$('miniTime').textContent.includes('/'),'LISTEN time continues with large waveform playhead');
      }
      await closeGraph();assertTest(!fullGraph&&$(id).parentElement.parentElement===parent&&activePage===page&&transport===state.transport&&playing==='B'&&offset===state.offset&&gainEnabled&&gainResult===state.gain,'closing '+page+' restores layout without changing playback/gain/sync');
    }
    changePage('listen');document.querySelector('.inline-expand').click();const p=position();$('seek').value=p+1;$('seek').dispatchEvent(new Event('input'));await delay(180);
    assertTest(playing==='B'&&position()>p+.8&&gainEnabled&&offset===.125,'LISTEN fullscreen seek works without dropping gain or sync');
    await closeGraph();assertTest(activePage==='listen'&&playing==='B'&&position()>p+.8,'LISTEN seek position survives return');
    log('PAGE FULLSCREEN TESTS COMPLETE');
  }catch(error){log('FAIL '+error.stack);}finally{pause();pageFullscreenTests.disabled=false;}
});testBox.append(pageFullscreenTests);
const allSuites=makeAction('RUN ALL LANDSCAPE TESTS',async()=>{
  allSuites.disabled=true;
  try{if(!matchMedia('(orientation: landscape)').matches)throw Error('Landscape viewport required');
    for(const button of [testButton,mp4Button,recoveryButton,workspaceButton,gainTests,bandsTests,pageFullscreenTests]){await button.onclick();if(/(^|\n)FAIL /.test(out.textContent))throw Error('Stop: suite failed');}
    log('ALL LANDSCAPE TESTS COMPLETE: '+out.textContent.split('\n').filter(line=>line.startsWith('PASS ')).length+' checks');
  }catch(error){log('FAIL '+error.message);}finally{allSuites.disabled=false;}
});testBox.append(allSuites);
