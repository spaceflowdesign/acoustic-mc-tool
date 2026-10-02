let bandSettings=parseBandSettings(null),smoothingOct=0,showInlineDiff=true;
try{bandSettings=parseBandSettings(localStorage.getItem('amct_bands_v1'));}catch{}
function currentEdges(){return bandSettings.custom?bandSettings.edges:defaultEdges;}
const diffSmoothCache=new WeakMap();
const displayPowerCache=new WeakMap();
function displayPowerAt(s,f,width){
  const sr=s.buffer.sampleRate,n=s.fftSize;if(f>sr/2)return null;
  if(!width)return Math.max(1e-12,s.power[Math.round(f*n/sr)]||0);
  let sum=displayPowerCache.get(s.power);if(!sum){sum=new Float64Array(s.power.length+1);for(let i=0;i<s.power.length;i++)sum[i+1]=sum[i]+s.power[i];displayPowerCache.set(s.power,sum);}
  const factor=2**(width/2),low=Math.max(20,f/factor),high=Math.min(sr/2,f*factor),lo=Math.max(1,Math.ceil(low*n/sr)),hi=Math.min(s.power.length-1,Math.ceil(high*n/sr)-1);
  return low>=high||hi<lo?null:Math.max(1e-12,(sum[hi+1]-sum[lo])/(hi-lo+1));
}
function smoothedDisplaySource(s){
  if(!s||!smoothingOct)return s;
  const cached=diffSmoothCache.get(s.power);if(cached?.width===smoothingOct&&cached.sr===s.buffer.sampleRate&&cached.n===s.fftSize)return {...s,power:cached.power};
  // Prefix sums keep display smoothing linear-time even on large fullscreen
  // plots. Never mutate the raw FFT, source PCM, or Web Audio nodes.
  const sr=s.buffer.sampleRate,n=s.fftSize;
  const power=Float64Array.from(s.power,(_,i)=>displayPowerAt(s,i*sr/n,smoothingOct)??1e-12);
  diffSmoothCache.set(s.power,{width:smoothingOct,sr,n,power});return {...s,power};
}
function displayMatchOffset(side){return typeof playbackMatchGain==='function'?20*Math.log10(playbackMatchGain(side)):0;}
function displayLevelScope(){return displayMatchOffset('A')||displayMatchOffset('B')?'GAIN MATCH後':'原音';}
function diffDisplayData(a=slots.A,b=slots.B){
  const mode=$('freqMode').value,width=mode==='standard'?1/3:smoothingOct,matchA=displayMatchOffset('A'),matchB=displayMatchOffset('B');
  const points=[],rows=[],meta={mode,width,matchA,matchB,offset,at:a?.at===b?.at?a?.at:null};
  if(!a||!b)return {points,rows,meta};
  if(mode==='standard'){
    // STANDARD retains its fixed 1/3 octave centers and existing sound floor.
    for(const row of spectralDifferences(a,b,standard,band))points.push({...row,delta:row.delta+matchB-matchA});
    return {points,rows:points,meta};
  }
  const step=Math.max(a.buffer.sampleRate/a.fftSize,b.buffer.sampleRate/b.fftSize),end=Math.min(20000,a.buffer.sampleRate/2,b.buffer.sampleRate/2);
  const gainA=10**(matchA/10),gainB=10**(matchB/10);
  for(let i=Math.ceil(20/step);i*step<=end;i++){
    const f=i*step,pa=displayPowerAt(a,f,width),pb=displayPowerAt(b,f,width);
    if(pa===null||pb===null||!Number.isFinite(pa)||!Number.isFinite(pb)||pa<=1e-10||pb<=1e-10)continue;
    // A constant per-side gain commutes exactly with linear power averaging:
    // scale(mean(power)) == mean(scale(power)). Never alter original arrays.
    const levelA=10*Math.log10(pa*gainA),levelB=10*Math.log10(pb*gainB);
    points.push({f,low:Math.max(20,f-step/2),high:Math.min(end,f+step/2),delta:levelB-levelA});
  }
  // Preserve the existing six-bar/Custom design. Bars, cards and rankings are
  // summaries of these SAME frequency-resolved differences, not a separate
  // difference between two broad-band power averages (which erases detail).
  const edges=currentEdges();
  for(let i=0;i<edges.length-1;i++){
    const low=edges[i],high=edges[i+1];if(high>end)continue;let sum=0,weight=0;
    for(const p of points){const overlap=Math.max(0,Math.min(high,p.high)-Math.max(low,p.low));sum+=p.delta*overlap;weight+=overlap;}
    if(weight)rows.push({f:Math.sqrt(low*high),low,high,delta:sum/weight});
  }
  return {points,rows,meta};
}
function currentDifferences(a=slots.A,b=slots.B){return diffDisplayData(a,b).rows;}
function diffSources(){
  const a=visibleSource('A'),b=visibleSource('B');
  const live=!!playing&&a!==slots.A&&b!==slots.B&&a?.at===b?.at;
  return {a:live?a:slots.A,b:live?b:slots.B,live};
}
const visualState={frames:{},busy:false,last:0,serial:0,worker:null,pending:null,failed:false,smoothed:{}};
function visualFFT(channels){
  if(!visualState.worker){const url=URL.createObjectURL(new Blob(['('+spectrumWorker.toString()+')()'],{type:'text/javascript'}));visualState.worker=new Worker(url);URL.revokeObjectURL(url);
    visualState.worker.onmessage=e=>{const p=visualState.pending;if(p&&p.id===e.data.id){clearTimeout(p.timer);visualState.pending=null;p.resolve(e.data.power);}};
    visualState.worker.onerror=()=>{visualState.failed=true;visualState.pending?.reject(Error('追従解析Workerが停止しました'));visualState.pending=null;visualState.worker.terminate();};
  }
  return new Promise((resolve,reject)=>{const id=++visualState.serial,timer=setTimeout(()=>{visualState.failed=true;visualState.pending=null;visualState.worker.terminate();reject(Error('追従解析がタイムアウトしました'));},5000);visualState.pending={id,resolve,reject,timer};visualState.worker.postMessage({id,channels},channels.map(c=>c.buffer));});
}
async function readVisualWindow(slot,seconds,context){
  const a=slot.asset,n=8192,start=Math.min(Math.max(0,Math.round(seconds*a.sampleRate)-n/2),Math.max(0,a.length-n));
  const channels=Array.from({length:a.numberOfChannels},()=>new Float32Array(n));
  for(let at=start;at<Math.min(a.length,start+n);){const index=Math.floor(at/a.chunkFrames),buffer=await pcmStore.read(a,index,context),local=at-index*a.chunkFrames,count=Math.min(buffer.length-local,start+n-at);if(count<=0)throw Error('追従解析の範囲が不正です');for(let c=0;c<channels.length;c++)channels[c].set(buffer.getChannelData(c).subarray(local,local+count),at-start);at+=count;}
  return channels;
}
async function sampleVisual(){
  if(visualState.busy||visualState.failed||!playing||document.hidden||busy.A||busy.B||decodePending||!ctx)return;
  visualState.busy=true;const p=position(),shift=offset,context=ctx,token=playToken,pair={A:slots.A,B:slots.B},frames={};
  try{for(const k of ['A','B']){const slot=pair[k],sec=p+(k==='B'?shift:0);if(!slot||sec<0||sec>=slot.asset.duration)continue;const channels=await readVisualWindow(slot,sec,context);frames[k]={asset:slot.asset,buffer:slot.buffer,power:await visualFFT(channels),fftSize:8192,at:p};}
    if(playing&&playToken===token&&offset===shift&&slots.A===pair.A&&slots.B===pair.B&&ctx===context)visualState.frames=frames;
  }catch(error){$('visualStatus').textContent='平均解析表示 · '+error.message;}
  finally{visualState.busy=false;}
}
function visibleSource(k){const frame=visualState.frames[k];return playing&&frame?.asset===slots[k]?.asset&&Math.abs(frame.at-position())<.6?frame:slots[k];}
function rawPlotLevel(s,f){if(!s||f>s.buffer.sampleRate/2)return null;if($('freqMode').value==='standard')return band(s.power,s.buffer.sampleRate,s.fftSize,f);const power=displayPowerAt(s,f,smoothingOct);return power===null?null:10*Math.log10(power);}
function plotLevel(s,f,side){const value=rawPlotLevel(s,f);return value===null?null:value+(side?displayMatchOffset(side):0);}
function drawReactiveGraph(){
  if(!$('visualStatus')||$('spectrum').getBoundingClientRect().width===0)return;
  const {g,w,h,l,r}=base('spectrum',''),t=45,b=h-65,x=f=>l+Math.log(f/20)/Math.log(1000)*(r-l),y=v=>b-(Math.max(-120,Math.min(0,v))+120)/120*(b-t);
  const edges=currentEdges(),palette=['#dc58ff','#00cfff','#00eadb','#e5e7ff','#ffe244','#ff4cd8'];
  for(let i=0;i<6;i++){const left=x(edges[i]),right=x(edges[i+1]);g.fillStyle=palette[i]+'18';g.fillRect(left,7,right-left,b-7);g.strokeStyle=palette[i];g.globalAlpha=.6;g.beginPath();g.moveTo(left,30);g.lineTo(right,30);g.stroke();g.globalAlpha=1;g.fillStyle=palette[i];g.font=(w<450?'8':'11')+'px sans-serif';g.textAlign='center';g.fillText(musicNames[i],(left+right)/2,20,Math.max(10,right-left-2));}
  g.textAlign='left';g.font='9px sans-serif';for(let db=-120;db<=0;db+=20){g.strokeStyle='#173647';g.beginPath();g.moveTo(l,y(db));g.lineTo(r,y(db));g.stroke();g.fillStyle='#94aebe';g.fillText(db,3,y(db)+3);}g.fillText('dBFS',3,37);
  for(const f of [20,50,100,200,500,1000,2000,5000,10000,20000]){g.strokeStyle='#173647';g.beginPath();g.moveTo(x(f),30);g.lineTo(x(f),h-20);g.stroke();g.fillStyle='#93b9cd';g.textAlign='center';g.fillText(f>=1000?f/1000+'k':f,x(f),h-6);}g.textAlign='left';
  const fs=$('freqMode').value==='standard'?standard:Array.from({length:180},(_,i)=>20*1000**(i/179));
  const pair=diffSources();
  for(const k of ['A','B']){const s=k==='A'?pair.a:pair.b;if(!s)continue;const values=fs.map(f=>plotLevel(s,f,k)),prev=visualState.smoothed[k];
    const key=s.asset.id+':'+offset+':'+$('freqMode').value+':'+smoothingOct+':'+displayMatchOffset(k);
    const smooth=values.map((v,i)=>v===null?null:playing&&prev?.key===key&&Number.isFinite(prev.values[i])?prev.values[i]+.22*(v-prev.values[i]):v);visualState.smoothed[k]={key,values:smooth};
    g.strokeStyle=colors[k];g.globalAlpha=playing&&playing!==k?.38:1;g.lineWidth=playing===k?2.5:1.5;g.shadowColor=colors[k];g.shadowBlur=9;g.beginPath();let move=true;fs.forEach((f,i)=>{const v=smooth[i];if(v===null||!Number.isFinite(v)){move=true;return;}if(move)g.moveTo(x(f),y(v));else g.lineTo(x(f),y(v));move=false;});g.stroke();g.shadowBlur=0;g.globalAlpha=1;
  }
  const rows=currentDifferences(pair.a,pair.b),zero=h-37;
  if(showInlineDiff){const scale=24/Math.max(12,...rows.map(row=>Math.abs(row.delta)));g.strokeStyle='#7293a3';g.beginPath();g.moveTo(l,zero);g.lineTo(r,zero);g.stroke();for(const row of rows){g.fillStyle=row.delta>=0?colors.B:colors.A;g.fillRect(x(row.low),zero-Math.max(0,row.delta)*scale,Math.max(1,x(row.high)-x(row.low)-1),Math.abs(row.delta)*scale);}
    const peak=[...rows].sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta))[0];if(peak){g.fillStyle='#ddf7ff';g.font='10px sans-serif';g.fillText(bandLabel(peak)+'  '+(peak.delta>=0?'B':'A')+' +'+Math.abs(peak.delta).toFixed(1)+' dB',l+5,43);g.strokeStyle='#a9ef54';g.strokeRect(Math.max(l,x(peak.low)),47,Math.min(r,x(peak.high))-Math.max(l,x(peak.low)),Math.max(1,b-47));}}
  for(const [side,at]of [['A',r-70],['B',r-50]]){g.fillStyle=colors[side];g.globalAlpha=playing&&playing!==side?.4:1;g.font=(playing===side?'bold 13':'11')+'px sans-serif';g.shadowColor=colors[side];g.shadowBlur=playing===side?12:0;g.fillText(side,at,42);}g.globalAlpha=1;g.shadowBlur=0;g.fillStyle='#acee4b';g.fillText('Δ',r-25,42);
  $('visualStatus').textContent=displayLevelScope()+' · '+(pair.live?'再生位置の解析':visualState.failed?'追従解析停止 · 平均解析':'平均解析')+' · '+($('freqMode').value==='standard'?'1/3 OCT':'MUSIC '+(bandSettings.custom?'CUSTOM':'DEFAULT'));
}
function drawMiniWave(){
  // LISTEN fullscreen uses the large waveform, but retains the same clock/seek.
  if($('miniTime')){const [start,end]=limits();$('miniTime').textContent=time(Math.max(0,position()-start))+' / '+time(Math.max(0,end-start));}
  const c=$('miniWave');if(!c||!c.getBoundingClientRect().width)return;const rect=c.getBoundingClientRect(),w=rect.width,h=rect.height,dpr=devicePixelRatio||1;
  if(c.width!==Math.round(w*dpr)||c.height!==Math.round(h*dpr)){c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);}const g=c.getContext('2d');g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,w,h);const [lo,hi]=limits(),span=Math.max(.001,hi-lo);
  for(const k of ['A','B']){const s=slots[k];if(!s)continue;g.strokeStyle=colors[k];g.globalAlpha=playing&&playing!==k?.35:.85;g.beginPath();for(let px=0;px<w;px++){const sec=lo+px/w*span+(k==='B'?offset:0),j=Math.max(0,Math.min(1599,Math.floor(sec/s.buffer.duration*1600)));let min=1,max=-1;for(const ch of s.wave){min=Math.min(min,ch.min[j]);max=Math.max(max,ch.max[j]);}g.moveTo(px,h/2-max*h*.44);g.lineTo(px,h/2-min*h*.44);}g.stroke();}g.globalAlpha=1;const px=Math.max(0,Math.min(w,(position()-lo)/span*w));g.strokeStyle='#fff';g.shadowColor='#00dcff';g.shadowBlur=7;g.beginPath();g.moveTo(px,0);g.lineTo(px,h);g.stroke();g.shadowBlur=0;$('miniTime').textContent=time(Math.max(0,position()-lo))+' / '+time(Math.max(0,hi-lo));
}
function visualTick(now){requestAnimationFrame(visualTick);if(document.hidden||!$('miniWave')||now-visualState.last<100)return;visualState.last=now;
  if(playing){if(['compare','diff'].includes(activePage)||['spectrum','diffChart'].includes(fullGraph?.id))void sampleVisual();if(activePage==='compare'||fullGraph?.id==='spectrum')drawReactiveGraph();if(activePage==='diff'||fullGraph?.id==='diffChart')drawDiff();if(fullGraph?.id==='wave')waveGraph();drawMiniWave();}
}
