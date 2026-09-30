// Local-only UI integration: actual retained controls and native modal lifecycle.
const workspaceButton=document.createElement('button');workspaceButton.textContent='RUN WORKSPACE TESTS';testBox.append(workspaceButton);
const hideTests=document.createElement('button');hideTests.textContent='HIDE TEST RESULTS';testBox.append(hideTests);hideTests.onclick=()=>{testBox.hidden=true;window.scrollTo(0,0)};
const backTest=document.createElement('button');backTest.textContent='TEST NATIVE BACK';testBox.append(backTest);backTest.onclick=()=>{const count=history.length;changePage('diff');changePage('history');changePage('compare');assertTest(history.length===count,'page controls create no entries before native Back');history.back()};
workspaceButton.onclick=async()=>{
  workspaceButton.disabled=true;
  const confirmBefore=window.confirm,memoBefore=$('memo').value;
  try{
    pause(true);changePage('compare');$('freqMode').value='standard';window.confirm=()=>true;const original=wav();
    for(const k of ['A','B']){
      const data=new DataTransfer();data.items.add(new File([original],k+'.wav',{type:'audio/wav'}));$('file'+k).files=data.files;
      await $('file'+k).onchange({target:$('file'+k)});
      assertTest(slots[k]?.name===k+'.wav','workspace original file input loads '+k);
    }
    assertTest(slots.A.asset===slots.B.asset,'workspace identical A/B still shares PCM');
    $('openSync').click();assertTest($('syncDialog').open,'SYNC opens original controls');
    await $('sync').onclick();assertTest(offset===0&&$('syncStatus').textContent.includes('推定'),'AUTO SYNC original button');
    $('offset').value='125';$('offset').dispatchEvent(new Event('change'));assertTest(offset===.125,'MANUAL SYNC original input');
    $('syncDialog').close();await delay(30);
    const saved={A:slots.A,B:slots.B,env:slots.A.env,power:slots.B.power,offset,memo:'workspace memo',href:location.href,history:history.length};
    $('memo').value=saved.memo;$('memo').dispatchEvent(new Event('input'));
    await play('A');await delay(150);$('nextPage').click();
    assertTest(activePage==='diff'&&playing==='A','COMPARE → DIFF keeps A playing');
    assertTest($('diffFocus').children.length===3,'DIFF FOCUS ranks three valid bands');
    $('diffFocus').children[1].click();assertTest($('diffFocus').children[1].getAttribute('aria-pressed')==='true','DIFF FOCUS selection highlighted');
    $('nextPage').click();assertTest(activePage==='history'&&$('transportDock').hidden,'DIFF → MEMO isolates memo screen');
    $('prevPage').click();$('prevPage').click();await play('B');
    assertTest(playing==='B'&&offset===saved.offset&&slots.A===saved.A&&slots.B===saved.B&&slots.A.env===saved.env&&slots.B.power===saved.power&&$('memo').value===saved.memo,'page switching preserves A/B playback, analysis, offset and memo');
    pause();assertTest(location.href===saved.href&&history.length===saved.history,'internal switching does not navigate or add browser history');
    assertTest(matchMedia('(orientation: landscape)').matches,'run fullscreen regression with landscape viewport');
    for(const id of ['spectrum','wave','diffChart','referenceChart','liveChart']){
      const box=$(id).parentElement,parent=box.parentElement;expandGraph(id,id);await delay(30);
      assertTest($('graphDialog').open&&box.parentElement===$('graphHost')&&$(id).getBoundingClientRect().height>100,'fullscreen graph visible: '+id);
      const closed=new Promise(resolve=>$('graphDialog').addEventListener('close',resolve,{once:true}));
      $('graphDialog').querySelector('[data-close]').click();await closed;
      assertTest(!fullGraph&&box.parentElement===parent&&!document.body.classList.contains('modal-open'),'fullscreen close restores same canvas: '+id);
    }
    assertTest($('wave').parentElement.hidden&&!$('spectrum').parentElement.hidden&&$('miniWave').getBoundingClientRect().height<60,'approved main graph plus small waveform; original large waveform retained in menu');
    showHelp('解析');assertTest($('helpDialog').open&&$('helpDialog').textContent.length>100,'original analysis explanation retained in help');$('helpDialog').close();await delay(30);
    $('openLive').click();assertTest(activePage==='live','AIR REC auxiliary page retained');$('leaveLive').click();assertTest(activePage==='compare','AIR REC return restores page');
    log('WORKSPACE TESTS COMPLETE');
  }catch(error){log('FAIL '+error.stack)}finally{window.confirm=confirmBefore;$('memo').value=memoBefore;$('memo').oninput();workspaceButton.disabled=false;pause();}
};
