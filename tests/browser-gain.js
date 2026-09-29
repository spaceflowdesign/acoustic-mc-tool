// Native integration of automatic mode, audible gain nodes and explanation UI.
const gainTests=document.createElement('button');gainTests.textContent='RUN GAIN MATCH TESTS';testBox.append(gainTests);
gainTests.onclick=async()=>{
  gainTests.disabled=true;
  try{
    pause(true);gainEnabled=false;
    // Aperiodic envelope: the generic wav() fixture repeats, so the existing
    // AUTO SYNC correctly refuses to claim a unique offset for scaled copies.
    const raw=await wav().arrayBuffer(),q=new DataView(raw);let seed=123,amp=1;
    for(let i=44;i<raw.byteLength;i+=4){if((i-44)%9600===0){seed=seed*16807%2147483647;amp=.3+.7*seed/2147483647}for(const j of [i,i+2])q.setInt16(j,Math.round(q.getInt16(j,true)*amp),true)}
    const quiet=new Blob([raw],{type:'audio/wav'}),bytes=raw.slice(0),v=new DataView(bytes);
    for(let i=44;i<bytes.byteLength;i+=2)v.setInt16(i,v.getInt16(i,true)*2,true);
    const loud=new Blob([bytes],{type:'audio/wav'});
    await loadBlob('A',quiet,'AIR_REC_name_is_not_provenance.wav');await loadBlob('B',loud,'master.wav');
    assertTest(slots.A.inputKind==='file'&&slots.B.inputKind==='file'&&gainResult.mode==='file','file input defaults to FILE independently of filename');
    assertTest(gainResult.valid&&Math.abs(gainResult.db.B+6.0206)<.002&&gainResult.gains.A===1,'FILE K-weighted gating yields expected 6.02 dB attenuation');
    const saved={A:slots.A,B:slots.B,power:slots.B.power,env:slots.A.env,k:slots.B.kEnergy,blob:slots.B.blob,memo:$('memo').value};
    const before=cursor;await play('B');const initial=transport;
    assertTest(transport.matchGain.gain.value===1,'OFF starts native output at unity');
    $('gainToggle').click();await delay(120);
    assertTest(gainEnabled&&transport===initial&&Math.abs(transport.matchGain.gain.value-.5)<1e-5&&position()>=before,`ON attenuates playing side without source or cursor restart (enabled=${gainEnabled}, same=${transport===initial}, gain=${transport?.matchGain.gain.value}, position=${position()}, before=${before})`);
    await play('A');assertTest(transport.matchGain.gain.value===1,'quiet side never amplified after A/B switch');
    await play('B');assertTest(Math.abs(transport.matchGain.gain.value-.5)<1e-5,'new B output inherits enabled match');
    $('gainToggle').click();await delay(60);assertTest(!gainEnabled&&transport.matchGain.gain.value===1,'OFF returns native gain to exact unity');
    $('gainToggle').click();await play('A');const offTime=ctx.currentTime;$('gainToggle').click();
    for(let wait=0;wait<100&&ctx.currentTime<offTime+.04;wait++)await delay(5);
    // Ended sources disconnect their input. Browsers may stop evaluating that
    // silent subgraph's AudioParam and retain its last rendered value. Inspect
    // outputs that can still be audible, not retired/disconnected parameters.
    const audibleFading=[...fadingSources].filter(s=>s.node.buffer!==null);
    log('INFO OFF fade check: '+[...fadingSources].map(s=>s.which+':'+s.matchGain.gain.value+':'+(s.node.buffer?'active':'ended')).join(','));
    assertTest(!gainEnabled&&transport.matchGain.gain.value===1&&audibleFading.every(s=>s.matchGain.gain.value===1),`OFF restores unity on current and still-audible fading outputs (audio elapsed=${ctx.currentTime-offTime}, checked fading=${audibleFading.length})`);
    $('gainToggle').click();setOffset(137.5);assertTest(gainEnabled&&gainResult.lo===0&&gainResult.hi===slots.B.buffer.duration-.1375,'MANUAL SYNC recalculates enabled common interval');
    await $('sync').onclick();assertTest(gainEnabled&&offset===0&&gainResult.hi===Math.min(slots.A.buffer.duration,slots.B.buffer.duration),'AUTO SYNC recalculates enabled common interval using decoded duration');
    assertTest(slots.A===saved.A&&slots.B===saved.B&&slots.B.power===saved.power&&slots.A.env===saved.env&&slots.B.kEnergy===saved.k&&slots.B.blob===saved.blob&&$('memo').value===saved.memo,'matching preserves PCM/analysis/source blob/memo');
    const anchorClick=HTMLAnchorElement.prototype.click;let download;
    try{HTMLAnchorElement.prototype.click=function(){download={name:this.download,url:this.href}};$('downloadB').onclick()}finally{HTMLAnchorElement.prototype.click=anchorClick}
    assertTest(gainEnabled&&download.name===slots.B.name&&download.url===slots.B.url&&slots.B.blob===saved.blob,'SAVE AUDIO while ON still downloads the original source');
    await testOutputRecovery();assertTest(gainEnabled&&gainResult.mode==='file','GAIN MATCH remains enabled through background/replacement recovery');
    await play('B');assertTest(transport.matchGain.context===ctx&&Math.abs(transport.matchGain.gain.value-.5)<1e-5,'replacement context reconnects matched output');pause();
    // Same bytes, different acquisition route: asset dedup must not copy provenance.
    await loadBlob('A',quiet,'recording-A.wav','air');await loadBlob('B',loud,'recording-B.wav','air');
    assertTest(gainResult.mode==='air'&&Math.abs(gainResult.db.B+6.0206)<.002,'AIR REC uses jointly gated RMS energy');
    showHelp('GAIN MATCH');
    assertTest($('gainLevels').textContent.includes('A ORIGINAL')&&$('gainLevels').textContent.includes('B ORIGINAL')&&$('gainLevels').textContent.includes('dBFS RMS')&&$('gainLevels').textContent.includes('MATCH OFFSET'),'AIR original levels and match offsets are visible');
    const originals=[gainResult.levelA,gainResult.levelB];toggleGainMatch();
    assertTest(!gainEnabled&&gainResult.levelA===originals[0]&&gainResult.levelB===originals[1]&&$('gainLevels').textContent.includes('OFF'),'OFF preserves original levels in explanation UI');
    $('helpDialog').querySelector('.about-link').click();
    assertTest($('aboutDialog').open&&['GAIN MATCH','AUTO SYNC','MANUAL SYNC','DIFF FOCUS','FILE比較','AIR REC'].every(t=>$('aboutDialog').textContent.includes(t)),'independent ABOUT explains all six topics');
    assertTest(workspacePages.join(',')==='compare,diff,history','ABOUT is not mixed into main page sequence');
    const closed=new Promise(r=>$('aboutDialog').addEventListener('close',r,{once:true}));$('aboutDialog').close();await closed;
    assertTest($('helpDialog').open,'ABOUT close returns to short help');$('helpDialog').close();
    await loadBlob('B',quiet,'export-reopened.wav');assertTest(gainResult.mode==='air'&&slots.A.asset===slots.B.asset&&slots.A.inputKind==='air'&&slots.B.inputKind==='file','mixed input uses AIR; identical data shares asset without sharing provenance');
    assertTest($('gainCaption').textContent.includes('混在'),'mixed automatic mode is disclosed');
    await loadBlob('A',quiet,'file.wav');assertTest(gainResult.mode==='file','replacing AIR with FILE automatically returns to FILE mode');
    const tooShort=wav(.2);await loadBlob('B',tooShort,'short.wav');assertTest(!gainResult.valid&&!gainEnabled&&$('gainToggle').disabled,'insufficient common interval disables matching safely');
    await loadBlob('A',quiet,'file.wav');await loadBlob('B',loud,'master.wav');
    log('GAIN MATCH TESTS COMPLETE');
  }catch(error){log('FAIL '+error.stack)}finally{gainEnabled=false;applyMatchGain();renderGainMatch();pause();gainTests.disabled=false}
};
