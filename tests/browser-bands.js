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
      expandGraph('spectrum','COMPARE');assertTest(fullGraph?.id==='spectrum'&&$('miniStrip').hidden&&$('miniWave').getBoundingClientRect().height===0,'COMPARE landscape shows graph without waveform');
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
    for(const button of [testButton,mp4Button,recoveryButton,workspaceButton,gainTests,bandsTests,pageFullscreenTests,videoTests,remuxProbeTests,extrasTests,presentationTests,continuationTests,diffPolishTests]){await button.onclick();if(/(^|\n)FAIL /.test(out.textContent))throw Error('Stop: suite failed');}
    log('ALL LANDSCAPE TESTS COMPLETE: '+out.textContent.split('\n').filter(line=>line.startsWith('PASS ')).length+' checks');
  }catch(error){log('FAIL '+error.message);}finally{allSuites.disabled=false;}
});testBox.append(allSuites);

const presentationTests=makeAction('RUN DISPLAY / FULLSCREEN 13-20 TESTS',async()=>{
  presentationTests.disabled=true;const close=()=>new Promise(r=>{$('graphDialog').addEventListener('close',r,{once:true});$('graphDialog').close();});
  try{
    pause(true);const a=wav(16),bytes=await a.arrayBuffer(),v=new DataView(bytes);for(let i=44;i<bytes.byteLength;i+=2)v.setInt16(i,v.getInt16(i,true)*2,true);const b=new Blob([bytes],{type:'audio/wav'});
    for(const kind of ['file','air']){
      await loadBlob('A',a,'gain-view-A.wav',kind);await loadBlob('B',b,'gain-view-B.wav',kind);pause();if(gainEnabled)toggleGainMatch();changePage('diff');$('freqMode').value='music';
      const rawA=slots.A.power.slice(),rawB=slots.B.power.slice(),originals=[gainResult.levelA,gainResult.levelB],saved=slots.B.blob;
      for(const width of [0,1/6,1/3]){
        $('smoothing').value=String(width);$('smoothing').dispatchEvent(new Event('change'));const raw=currentDifferences(),level=plotLevel(slots.B,1000,'B');toggleGainMatch();const rows=currentDifferences(),db=gainResult.db.B-gainResult.db.A;
        assertTest(rows.every((r,i)=>Math.abs(r.delta-raw[i].delta-db)<1e-9)&&Math.abs(plotLevel(slots.B,1000,'B')-level-gainResult.db.B)<1e-9,kind+' display gain matches playback dB with smoothing '+width);
        const graph=$('diffChart'),g=graph.getContext('2d'),rects=[],nativeFill=g.fillRect;g.fillRect=function(...args){rects.push(args);return nativeFill.apply(this,args);};try{drawDiff();}finally{g.fillRect=nativeFill;}
        const ranked=[...rows].sort((x,y)=>Math.abs(y.delta)-Math.abs(x.delta)).slice(0,3),buttons=[...$('diffFocus').children],range=Math.max(6,Math.ceil(Math.max(0,...rows.map(r=>Math.abs(r.delta)))/6)*6),height=Math.max(160,graph.getBoundingClientRect().height||260);
        assertTest(buttons.every((el,i)=>Number(el.dataset.band)===ranked[i].f&&el.lastElementChild.textContent===(Math.abs(ranked[i].delta)<.05?'差 0.0 dB':(ranked[i].delta>0?'B':'A')+' +'+Math.abs(ranked[i].delta).toFixed(1)+' dB'))&&focusedBand===ranked[0].f&&rects.slice(-rows.length).every((r,i)=>Math.abs(r[3]-Math.max(1,Math.abs(rows[i].delta)/range*(height-62)/2))<1e-7),kind+' graph bars, meter, numeric ranks and highlight share smoothing '+width);
        toggleGainMatch();assertTest(JSON.stringify(currentDifferences())===JSON.stringify(raw)&&plotLevel(slots.B,1000,'B')===level,kind+' OFF exactly restores display '+width);
      }
      assertTest(slots.A.power.every((p,i)=>p===rawA[i])&&slots.B.power.every((p,i)=>p===rawB[i])&&gainResult.levelA===originals[0]&&gainResult.levelB===originals[1]&&slots.B.blob===saved,kind+' original analysis/levels and SAVE source remain unchanged');
    }
    for(const [id,label,icon]of [['playA','A PLAY','A ▶'],['playB','B PLAY','B ▶'],['pause','PAUSE','‖'],['stop','STOP','■']])assertTest($(id).textContent===icon&&$(id).getAttribute('aria-label')===label,'transport symbol and accessible meaning '+id);
    assertTest($('repeatToggle').innerHTML===$('fullRepeat').innerHTML&&!!$('repeatToggle').querySelector('svg')&&$('repeatToggle').getAttribute('aria-label').startsWith('REPEAT'),'Repeat uses same accessible icon in both layouts');
    assertTest(!$('expandDiff')&&!!document.querySelector('.inline-expand'),'DIFF title duplicate fullscreen entry removed, shared entry remains');
    setOffset(125);if(!gainEnabled)toggleGainMatch();await play('B');await delay(100);const state={ctx,transport,origin,offset,gain:gainResult,A:slots.A,B:slots.B,smoothing:smoothingOct};changePage('compare');expandCurrentPage();const tall=$('spectrum').getBoundingClientRect().height;
    assertTest($('miniStrip').hidden&&$('miniWave').getBoundingClientRect().height===0&&tall>innerHeight*.65,'COMPARE fullscreen maximizes graph without waveform');
    let automation=0;const param=transport.matchGain.gain,nativeRamp=param.linearRampToValueAtTime;param.linearRampToValueAtTime=function(...args){automation++;return nativeRamp.apply(this,args);};
    try{for(const page of [0,1,2]){pageControls(page);const p=position();for(const [id,target]of [['fullDiff','diffChart'],['fullCompare','spectrum']]){$(id).click();const r=$(id).getBoundingClientRect(),other=$(id==='fullDiff'?'fullCompare':'fullDiff').getBoundingClientRect();assertTest($('graphDialog').open&&fullGraph.id===target&&controlPage===page&&r.width>0&&other.width>0&&r.top===other.top&&$('fullGraphTabs').parentElement===$('controlRow')&&$('controlRow').scrollWidth<=$('controlRow').clientWidth&&$(target).getBoundingClientRect().height>=tall-1,'fixed graph switch on control page '+page+' to '+target);}assertTest(position()>=p&&transport===state.transport&&origin===state.origin&&ctx===state.ctx&&offset===state.offset&&gainResult===state.gain&&gainEnabled&&smoothingOct===state.smoothing,'switch preserves audio/position/gain/sync/smoothing page '+page);}}finally{param.linearRampToValueAtTime=nativeRamp;}
    assertTest(automation===0&&slots.A===state.A&&slots.B===state.B,'fullscreen switches schedule no gain automation and retain assets');await close();assertTest(activePage==='compare'&&$('miniWave').getBoundingClientRect().height>0&&playing==='B','return restores normal waveform and current page while playing');
    changePage('listen');expandCurrentPage();assertTest(fullGraph.id==='wave'&&!$('miniStrip').hidden&&$('wave').getBoundingClientRect().height>innerHeight*.4,'LISTEN alone retains large waveform and seek');await close();
    log('DISPLAY / FULLSCREEN 13-20 TESTS COMPLETE');
  }catch(e){log('FAIL '+e.stack);}finally{if($('graphDialog').open)await close();pause();presentationTests.disabled=false;}
});testBox.append(presentationTests);

const continuationTests=makeAction('RUN 21-30 REGRESSIONS',async()=>{
  continuationTests.disabled=true;
  const close=async id=>{if(!$(id).open)return;const p=new Promise(r=>$(id).addEventListener('close',r,{once:true}));$(id).querySelector('[data-close]').click();await p;};
  const waitFor=async(fn,label)=>{for(let i=0;i<100;i++){if(fn())return;await delay(50);}throw Error('Timeout '+label);};
  try{
    pause(true);if(repeatEnabled)toggleRepeat();
    const ids=[...document.querySelectorAll('[id]')].map(el=>el.id);assertTest(ids.length===new Set(ids).size,'unique DOM IDs before help enumeration');
    for(const button of document.querySelectorAll('.help-button')){button.click();assertTest($('helpDialog').open&&!!$('helpDialog').querySelector('.dialog-body p')?.textContent,'wired help entry: '+button.getAttribute('aria-label'));await close('helpDialog');}
    openDialog('aboutDialog');
    for(const button of $('aboutDialog').querySelectorAll('[data-help-target]')){const target=$(button.dataset.helpTarget);assertTest(!!target&&target.closest('dialog')===$('aboutDialog'),'help index target exists: '+button.textContent);button.click();}
    const topics=[...$('aboutDialog').querySelectorAll('[data-help-topic]')].map(b=>b.dataset.helpTopic);
    for(const topic of topics){
      const button=[...$('aboutDialog').querySelectorAll('[data-help-topic]')].find(b=>b.dataset.helpTopic===topic);button.click();
      assertTest($('helpDialog').open&&!$('aboutDialog').open&&helpTrail.at(-1).topic===topic,'ABOUT opens visible help: '+topic);
      const detail=[...$('helpDialog').querySelectorAll('button')].find(b=>b.textContent==='仕様・使い方・注意点を見る');detail.click();
      assertTest(helpTrail.at(-1).details&&$('helpDialog').querySelector('.dialog-body p')?.textContent.length>0,'help details connected: '+topic);
      const terms=[...$('helpDialog').querySelectorAll('.term-link')].map(b=>b.textContent);
      for(const term of new Set(terms)){[...$('helpDialog').querySelectorAll('.term-link')].find(b=>b.textContent===term).click();assertTest(helpTrail.at(-1).term===term&&!!beginnerTerms[term],'term destination: '+topic+' / '+term);$('helpDialog').querySelector('[data-help-back]').click();}
      const related=[...$('helpDialog').querySelectorAll('button')].filter(b=>b.textContent.endsWith('とは？')).map(b=>b.textContent);
      for(const name of related){[...$('helpDialog').querySelectorAll('button')].find(b=>b.textContent===name).click();assertTest(!!helpRoutes[helpTrail.at(-1).topic]||!!helpText[helpTrail.at(-1).topic],'related help destination: '+name);$('helpDialog').querySelector('[data-help-back]').click();}
      $('helpDialog').querySelector('[data-help-back]').click();$('helpDialog').querySelector('[data-help-back]').click();
      assertTest($('aboutDialog').open&&!$('helpDialog').open,'two Back taps return to ABOUT: '+topic);
    }
    for(const term of Object.keys(beginnerTerms)){const link=[...$('aboutDialog').querySelectorAll('.term-link')].find(b=>b.textContent===term);assertTest(!!link,'glossary entry reachable: '+term);link.click();assertTest($('helpDialog').open&&!$('aboutDialog').open&&helpTrail.at(-1).term===term,'ABOUT term is not behind modal: '+term);$('helpDialog').querySelector('[data-help-back]').click();}
    await close('aboutDialog');showHelp('COMPARE');$('helpDialog').querySelector('.about-link').click();assertTest($('aboutDialog').open&&!$('helpDialog').open,'help to ABOUT does not leave inert help underneath');await close('aboutDialog');assertTest($('helpDialog').open&&helpTrail.at(-1).topic==='COMPARE','closing ABOUT restores calling help');await close('helpDialog');
    const movie=await (await fetch('/camera.mov')).blob();await loadBlob('A',movie,'stable-A.MOV');await loadBlob('B',movie,'stable-B.MOV');changePage('listen');setOffset(125);if(!gainEnabled)toggleGainMatch();
    for(const side of ['A','B']){
      await play(side);await waitFor(()=>videoPreview.records[side].video.readyState>=2&&!videoPreview.records[side].video.paused,'video '+side);await delay(300);
      const r=videoPreview.records[side],v=r.video,url=r.url,stamp=v.currentTime;let seeks=0,srcChanges=0;const seek=()=>seeks++;v.addEventListener('seeking',seek);const observer=new MutationObserver(ms=>srcChanges+=ms.filter(m=>m.attributeName==='src').length);observer.observe(v,{attributes:true});
      await delay(1100);observer.disconnect();v.removeEventListener('seeking',seek);
      assertTest(v===videoPreview.records[side].video&&url===r.url&&srcChanges===0&&v.currentTime>stamp+.5&&seeks<=2&&v.style.visibility==='visible','stable continuous '+side+' video: no src/DOM churn, bounded seeks, no blanking');
      assertTest(document.body.dataset.audible===side&&document.querySelector('[data-source='+side+']').classList.contains('is-playing'),'audible side text highlight: '+side);
      const other=side==='A'?'B':'A';assertTest(getComputedStyle(document.querySelector('[data-source='+side+']')).textShadow!=='none'&&Number(getComputedStyle(document.querySelector('[data-source='+other+']')).opacity)<1,'audible label glows and inactive label dims: '+side);
    }
    const saved=Object.fromEntries(Object.entries(videoPreview.records).map(([k,r])=>[k,{video:r.video,url:r.url}]));await play('A');await waitFor(()=>!videoPreview.records.A.video.paused,'return A');
    assertTest(Object.entries(saved).every(([k,r])=>r.video===videoPreview.records[k].video&&r.url===videoPreview.records[k].url)&&videoPreview.records.B.video.paused,'A/B/A reuses each source and pauses inactive video');
    const state={ctx,transport,origin,offset,gain:gainResult,smoothing:smoothingOct};expandCurrentPage();
    for(const page of [0,1,2]){pageControls(page);for(const [button,id]of [['fullCompare','spectrum'],['fullDiff','diffChart'],['fullWave','wave']]){$(button).click();const tabs=$('fullGraphTabs').getBoundingClientRect(),next=$('controlNext').getBoundingClientRect();assertTest(fullGraph.id===id&&$('graphDialog').open&&tabs.left>=next.right&&['fullWave','fullCompare','fullDiff'].every(k=>$(k).getBoundingClientRect().width>0)&&$('controlRow').scrollWidth<=$('controlRow').clientWidth,'right fixed WAVE/COMPARE/DIFF page '+page+' target '+id);assertTest(($('miniStrip').hidden)===(id!=='wave')&&$(id).getBoundingClientRect().height>innerHeight*(id==='wave'?.55:.8),'header-free graph area and waveform policy: '+id);}}
    assertTest(ctx===state.ctx&&transport===state.transport&&origin===state.origin&&offset===state.offset&&gainResult===state.gain&&gainEnabled&&smoothingOct===state.smoothing,'three-way fullscreen switch preserves complete transport state');
    await close('graphDialog');await waitFor(()=>!videoPreview.records.A.video.paused,'fullscreen return');assertTest(Object.entries(saved).every(([k,r])=>r.video===videoPreview.records[k].video&&r.url===videoPreview.records[k].url),'fullscreen return preserves both video elements and URLs');
    pause(true);await waitFor(()=>!$('listenVideo').seeking&&$('listenVideo').currentTime<.03,'STOP video');assertTest($('listenVideo').paused,'STOP remains aligned after new switching path');
    log('21-30 REGRESSIONS COMPLETE');
  }catch(e){log('FAIL '+e.stack);}finally{await close('helpDialog');await close('aboutDialog');await close('graphDialog');pause();continuationTests.disabled=false;}
});testBox.append(continuationTests);

const diffPolishTests=makeAction('RUN DIFF / HEADER / GLOSSARY TESTS',async()=>{
  diffPolishTests.disabled=true;const oldBands=JSON.stringify(bandSettings);
  try{
    pause(true);if(repeatEnabled)toggleRepeat();if(gainEnabled)toggleGainMatch();changePage('diff');bandSettings={edges:[...defaultEdges],custom:false};$('freqMode').value='music';
    const head=document.querySelector('[data-panel=diff] .graph-heading'),title=head.querySelector('h2'),help=head.querySelector('.help-button');
    assertTest(head.getBoundingClientRect().height===28&&help.getBoundingClientRect().height===28&&help.getBoundingClientRect().width===28,'normal DIFF heading and help match compact 28px page header');
    assertTest(getComputedStyle(title).fontSize===getComputedStyle($('pageTitle')).fontSize&&getComputedStyle(title).marginTop==='0px','normal DIFF title matches page-title typography and spacing');
    for(const [side,freq]of [['A',240],['B',260]]){
      const bytes=await wav(4).arrayBuffer(),view=new DataView(bytes);let seed=123;
      for(let i=0;i<(bytes.byteLength-44)/4;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const sample=((seed/4294967296-.5)*.04+.2*Math.sin(i*2*Math.PI*freq/48000))*32767;view.setInt16(44+i*4,sample,true);view.setInt16(46+i*4,sample,true);}
      await loadBlob(side,new Blob([bytes],{type:'audio/wav'}),'boundary-'+side+'.wav');
    }
    const rawA=slots.A.power.slice(),rawB=slots.B.power.slice(),snapshots=[],numbers=[];
    for(const width of [0,1/6,1/3]){
      const canvas=$('diffChart'),g=canvas.getContext('2d'),native=g.fillRect,rects=[];g.fillRect=function(...args){rects.push(args);return native.apply(this,args);};
      try{$('smoothing').value=String(width);$('smoothing').dispatchEvent(new Event('change'));}finally{g.fillRect=native;}
      const rows=currentDifferences(),ranked=[...rows].sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta)).slice(0,3),range=Math.max(6,Math.ceil(Math.max(...rows.map(r=>Math.abs(r.delta)))/6)*6),height=Math.max(160,canvas.getBoundingClientRect().height),buttons=[...$('diffFocus').children];
      assertTest(rects.slice(-rows.length).every((r,i)=>Math.abs(r[3]-Math.max(1,Math.abs(rows[i].delta)/range*(height-62)/2))<1e-7)&&buttons.every((b,i)=>Number(b.dataset.band)===ranked[i].f&&b.lastElementChild.textContent.includes(Math.abs(ranked[i].delta).toFixed(1)))&&focusedBand===ranked[0].f,'immediate actual DIFF bars/numbers/rank/highlight share smoothing '+width);
      snapshots.push(canvas.toDataURL());numbers.push(JSON.stringify(rows));
    }
    assertTest(new Set(snapshots).size===3&&new Set(numbers).size===3,'OFF / 1/6 / 1/3 produce three distinct rendered graphs and band values for boundary fixture');
    $('smoothing').value='0';$('smoothing').dispatchEvent(new Event('change'));assertTest($('diffChart').toDataURL()===snapshots[0]&&JSON.stringify(currentDifferences())===numbers[0],'OFF restores exact graph pixels and numeric values');
    await play('A');await delay(150);const state={ctx,transport,origin,offset,gain:gainResult};for(const width of [1/6,1/3,0]){$('smoothing').value=String(width);$('smoothing').dispatchEvent(new Event('change'));}
    assertTest(ctx===state.ctx&&transport===state.transport&&origin===state.origin&&offset===state.offset&&gainResult===state.gain&&slots.A.power.every((v,i)=>v===rawA[i])&&slots.B.power.every((v,i)=>v===rawB[i]),'smoothing preserves live audio route, sync, gain and original analysis');pause();
    openDialog('aboutDialog');const glossary=$('help-glossary');glossary.scrollIntoView({block:'start'});
    const chips=[...glossary.querySelectorAll('[data-help-term]')],first=chips[0].getBoundingClientRect(),second=chips[1].getBoundingClientRect();
    assertTest(chips.length===9&&first.top===second.top&&second.left-first.right>=9&&chips[2].getBoundingClientRect().top>first.bottom,'glossary is a separated two-column wrapping grid');
    for(const term of Object.keys(beginnerTerms)){const chip=chips.find(b=>b.dataset.helpTerm===term),r=chip.getBoundingClientRect();assertTest(r.height>=44&&r.width>=44,'44px glossary tap target: '+term);chip.click();assertTest($('helpDialog').open&&!$('aboutDialog').open&&$('helpDialog').querySelector('h2').textContent===term&&helpTrail.at(-1).term===term,'glossary chip opens correct explanation: '+term);$('helpDialog').querySelector('[data-help-back]').click();}
    $('aboutDialog').close();log('DIFF / HEADER / GLOSSARY TESTS COMPLETE');
  }catch(e){log('FAIL '+e.stack);}finally{for(const id of ['helpDialog','aboutDialog'])if($(id).open)$(id).close();pause();bandSettings=parseBandSettings(oldBands);renderBandControls();diffPolishTests.disabled=false;}
});testBox.append(diffPolishTests);
