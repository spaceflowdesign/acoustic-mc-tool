// Synthetic lifecycle/state tests use real native contexts, PCM storage and UI.
// The fake 'interrupted' property is scoped to one retired context, not an iOS claim.
async function testOutputRecovery(){
  if(!slots.A||!slots.B){await loadBlob('A',wav(),'recovery-A.wav');await loadBlob('B',wav(8,48000,1),'recovery-B.wav');}
  const saved={A:slots.A,B:slots.B,offset,memo:$('memo').value,reference,db:pcmStore.db};
  const hiddenDescriptor=Object.getOwnPropertyDescriptor(document,'hidden');
  function hidden(value){
    Object.defineProperty(document,'hidden',{configurable:true,value});
    document.dispatchEvent(new Event('visibilitychange'));
  }
  try{
    setOffset(125);cursor=Math.min(390,limits()[1]/2);
    await play('A');await delay(100);await play('B');hidden(true);const stopped=cursor;
    assertTest(!playing&&sources.length===0&&fadingSources.size===0,'background stops current and fading sources and preserves the position');
    await ctx.suspend();hidden(false);await delay(100);
    assertTest(ctx.state==='suspended'&&!playing&&cursor===stopped,'foreground alone never resumes playback');
    const suspended=ctx;await play('B');
    assertTest(ctx===suspended&&playing==='B'&&Math.abs(position()-stopped)<.2,'explicit PLAY resumes native suspended context at same position');
    hidden(true);await ctx.suspend();hidden(false);
    const old=ctx,oldCursor=cursor;
    Object.defineProperty(old,'state',{configurable:true,get:()=> 'interrupted'});
    Object.defineProperty(old,'resume',{configurable:true,value:()=>Promise.reject(Error('simulated Safari resume failure'))});
    try{await play('A')}finally{delete old.state;delete old.resume}
    assertTest(ctx!==old&&ctx.state==='running'&&playing==='A','interrupted resume failure rebuilds native context and plays');
    assertTest(Math.abs(position()-oldCursor)<.2&&offset===.125,'new zero-based clock preserves cursor and sync offset');
    assertTest(sources.every(s=>s.node.context===ctx&&s.gain.context===ctx),'playback uses nodes from the replacement context only');
    assertTest(slots.A===saved.A&&slots.B===saved.B&&pcmStore.db===saved.db,'A/B PCM database and analysis objects survive context replacement');
    assertTest($('memo').value===saved.memo&&reference===saved.reference,'memo and reference survive context replacement');
    hidden(true);hidden(false);await ctx.close();const closed=ctx;
    await play('B');assertTest(ctx!==closed&&playing==='B','closed context rebuilds on explicit PLAY');
    assertTest(pcmStore.cache.size<=8,'recovery retains bounded PCM cache');
    pause();const at=cursor;
    window.dispatchEvent(new PageTransitionEvent('pagehide',{persisted:true}));
    window.dispatchEvent(new PageTransitionEvent('pageshow',{persisted:true}));
    assertTest(!playing&&cursor===at&&pcmStore.db===saved.db,'BFCache page round-trip preserves assets and stays paused');
    await play('A');assertTest(playing==='A','explicit PLAY works after simulated BFCache return');
    pause();log('OUTPUT RECOVERY TESTS COMPLETE');
  }finally{
    if(hiddenDescriptor)Object.defineProperty(document,'hidden',hiddenDescriptor);else delete document.hidden;
    pause();setOffset(saved.offset*1000);
  }
}
const recoveryButton=document.createElement('button');recoveryButton.textContent='RUN OUTPUT RECOVERY TESTS';testBox.append(recoveryButton);
recoveryButton.onclick=async()=>{recoveryButton.disabled=true;try{await audio();await testOutputRecovery()}catch(error){log('FAIL '+error.stack)}finally{recoveryButton.disabled=false}};
