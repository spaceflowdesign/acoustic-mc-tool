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
const allSuites=makeAction('RUN ALL LANDSCAPE TESTS',async()=>{
  allSuites.disabled=true;
  try{if(!matchMedia('(orientation: landscape)').matches)throw Error('Landscape viewport required');
    for(const button of [testButton,mp4Button,recoveryButton,workspaceButton,gainTests,bandsTests]){await button.onclick();if(/(^|\n)FAIL /.test(out.textContent))throw Error('Stop: suite failed');}
    log('ALL LANDSCAPE TESTS COMPLETE: '+out.textContent.split('\n').filter(line=>line.startsWith('PASS ')).length+' checks');
  }catch(error){log('FAIL '+error.message);}finally{allSuites.disabled=false;}
});testBox.append(allSuites);
