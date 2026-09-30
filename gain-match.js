// Analysis-only arithmetic: does not alter PCM, raw graphs, or export blobs.
function gainMode(a,b){return a?.inputKind==='air'||b?.inputKind==='air'?'air':'file'}
function energyIntegral(values,rate,duration,square=false){
  const prefix=new Float64Array(values.length+1);
  for(let i=0;i<values.length;i++)prefix[i+1]=prefix[i]+(square?values[i]**2:values[i])*Math.max(0,Math.min(1/rate,duration-i/rate));
  return time=>{const t=Math.max(0,Math.min(duration,time)),i=Math.min(values.length,Math.floor(t*rate));return prefix[i]+(i<values.length?(square?values[i]**2:values[i])*(t-i/rate):0)};
}
function gatedLoudness(blocks){
  const absolute=10**((-70+.691)/10),first=blocks.filter(v=>v>absolute&&Number.isFinite(v));
  if(!first.length)return null;
  const gate=Math.max(absolute,first.reduce((a,b)=>a+b,0)/first.length*.1),kept=first.filter(v=>v>gate);
  return kept.length?-.691+10*Math.log10(kept.reduce((a,b)=>a+b,0)/kept.length):null;
}
function calculateGainMatch(a,b,shift){
  const mode=gainMode(a,b),fail=reason=>({valid:false,mode,reason,gains:{A:1,B:1}});
  if(!a||!b)return fail('A/Bを読み込んでください');
  const lo=Math.max(0,-shift),hi=Math.min(a.buffer.duration,b.buffer.duration-shift);
  if(hi-lo<.4-1e-9)return fail('共通比較区間が400 ms未満です');
  if(mode==='file'&&(!a.kEnergy||!b.kEnergy))return fail('このチャンネル構成のFILE補正には対応していません');
  const ia=energyIntegral(mode==='file'?a.kEnergy:a.env,a.envRate,a.buffer.duration,mode==='air');
  const ib=energyIntegral(mode==='file'?b.kEnergy:b.env,b.envRate,b.buffer.duration,mode==='air');
  const A=[],B=[];
  for(let i=0;i<=Math.floor((hi-lo-.4+1e-9)/.1);i++){
    const t=lo+i*.1;A.push(Math.max(0,(ia(t+.4)-ia(t))/.4));B.push(Math.max(0,(ib(t+shift+.4)-ib(t+shift))/.4));
  }
  let levelA,levelB,kept=A.length;
  if(mode==='file'){levelA=gatedLoudness(A);levelB=gatedLoudness(B)}
  else{
    // 400 ms / 100 ms hop; joint mask avoids comparing different moments.
    // -60 dBFS absolute and 30 dB below each side's 90th percentile energy.
    const gate=values=>Math.max(1e-6,[...values].sort((a,b)=>a-b)[Math.floor((values.length-1)*.9)]*.001);
    const ga=gate(A),gb=gate(B);let ea=0,eb=0;kept=0;
    for(let i=0;i<A.length;i++)if(A[i]>ga&&B[i]>gb){ea+=A[i];eb+=B[i];kept++}
    if(kept){levelA=10*Math.log10(ea/kept);levelB=10*Math.log10(eb/kept)}
  }
  if(!Number.isFinite(levelA)||!Number.isFinite(levelB)||levelA===null||levelB===null)return fail('比較できる有効音がありません');
  const delta=levelB-levelA,db={A:Math.min(0,delta),B:Math.min(0,-delta)};
  return {valid:true,mode,levelA,levelB,db,gains:{A:10**(db.A/20),B:10**(db.B/20)},lo,hi,kept,blocks:A.length};
}

let gainEnabled=false,gainResult=null,gainInputs=[];
function refreshGainMatch(){
  if(gainInputs[0]!==slots.A||gainInputs[1]!==slots.B||gainInputs[2]!==offset){
    gainInputs=[slots.A,slots.B,offset];gainResult=calculateGainMatch(slots.A,slots.B,offset);
    if(!gainResult.valid)gainEnabled=false;
    applyMatchGain();
  }
  renderGainMatch();
}
function playbackMatchGain(which){return gainEnabled&&gainResult?.valid?gainResult.gains[which]:1}
function applyMatchGain(){
  if(!ctx)return;
  const nodes=new Map();if(transport?.matchGain)nodes.set(transport.matchGain,transport.which);
  for(const source of fadingSources)if(source.matchGain)nodes.set(source.matchGain,source.which);
  for(const [node,which]of nodes){
    const parameter=node.gain,now=ctx.currentTime;
    if(parameter.cancelAndHoldAtTime)parameter.cancelAndHoldAtTime(now);
    else{const value=parameter.value;parameter.cancelScheduledValues(now);parameter.setValueAtTime(value,now)}
    parameter.linearRampToValueAtTime(playbackMatchGain(which),now+.02);
  }
}
function toggleGainMatch(){
  refreshGainMatch();if(!gainResult?.valid)return;
  gainEnabled=!gainEnabled;applyMatchGain();renderGainMatch();
}
function renderGainMatch(){
  if(!$('gainToggle'))return;
  $('gainToggle').disabled=!gainResult?.valid||busy.A||busy.B||analysisBusy||!!rec||pendingMic;
  $('gainToggle').textContent='GAIN MATCH '+(gainEnabled?'ON':'OFF');$('gainToggle').setAttribute('aria-pressed',String(gainEnabled));
  document.querySelectorAll('[data-gain-copy]').forEach(button=>{button.disabled=$('gainToggle').disabled;button.textContent=$('gainToggle').textContent;button.setAttribute('aria-pressed',String(gainEnabled));});
  const r=gainResult,mixed=slots.A&&slots.B&&slots.A.inputKind!==slots.B.inputKind,mode=r?.mode==='air'?'AIR REC'+(mixed?' / 混在':''):'FILE';
  $('gainCaption').textContent=r?.valid?`${mode} · ${gainEnabled?'MATCH OFFSET':'補正候補'} A ${r.db.A.toFixed(1)} / B ${r.db.B.toFixed(1)} dB`:'GAIN MATCH · '+(r?.reason||'A/Bを読み込んでください');
  if($('gainLevels')){
    $('gainLevels').textContent=r?.valid?`A ORIGINAL ${r.levelA.toFixed(1)} ${r.mode==='air'?'dBFS RMS':'LUFS相当'}\nB ORIGINAL ${r.levelB.toFixed(1)} ${r.mode==='air'?'dBFS RMS':'LUFS相当'}\nMATCH OFFSET ${gainEnabled?'適用中':'OFF（現在の補正は0 dB）'}\nA ${(gainEnabled?r.db.A:0).toFixed(1)} dB / B ${(gainEnabled?r.db.B:0).toFixed(1)} dB\n共通区間 ${r.lo.toFixed(2)}–${r.hi.toFixed(2)} s · ${mode}`:r?.reason||'';
  }
}
