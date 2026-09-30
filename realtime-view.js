let bandSettings=parseBandSettings(null),smoothingOct=1/6,showInlineDiff=true;
try{bandSettings=parseBandSettings(localStorage.getItem('amct_bands_v1'));}catch{}
function currentEdges(){return bandSettings.custom?bandSettings.edges:defaultEdges;}
function currentDifferences(a=slots.A,b=slots.B){return $('freqMode').value==='standard'?spectralDifferences(a,b,standard,band):displayDifferences(a,b,currentEdges());}
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
function plotLevel(s,f){if(!s||f>s.buffer.sampleRate/2)return null;if($('freqMode').value==='standard')return band(s.power,s.buffer.sampleRate,s.fftSize,f);const factor=2**(smoothingOct/2);if(smoothingOct)return rangeLevel(s.power,s.buffer.sampleRate,s.fftSize,Math.max(20,f/factor),Math.min(s.buffer.sampleRate/2,f*factor));const i=Math.round(f*s.fftSize/s.buffer.sampleRate);return 10*Math.log10(Math.max(1e-12,s.power[i]||0));}
function drawReactiveGraph(){
  if(!$('visualStatus')||$('spectrum').getBoundingClientRect().width===0)return;
  const {g,w,h,l,r}=base('spectrum',''),t=45,b=h-65,x=f=>l+Math.log(f/20)/Math.log(1000)*(r-l),y=v=>b-(Math.max(-120,Math.min(0,v))+120)/120*(b-t);
  const edges=currentEdges(),palette=['#dc58ff','#00cfff','#00eadb','#e5e7ff','#ffe244','#ff4cd8'];
  for(let i=0;i<6;i++){const left=x(edges[i]),right=x(edges[i+1]);g.fillStyle=palette[i]+'18';g.fillRect(left,7,right-left,b-7);g.strokeStyle=palette[i];g.globalAlpha=.6;g.beginPath();g.moveTo(left,30);g.lineTo(right,30);g.stroke();g.globalAlpha=1;g.fillStyle=palette[i];g.font=(w<450?'8':'11')+'px sans-serif';g.textAlign='center';g.fillText(musicNames[i],(left+right)/2,20,Math.max(10,right-left-2));}
  g.textAlign='left';g.font='9px sans-serif';for(let db=-120;db<=0;db+=20){g.strokeStyle='#173647';g.beginPath();g.moveTo(l,y(db));g.lineTo(r,y(db));g.stroke();g.fillStyle='#94aebe';g.fillText(db,3,y(db)+3);}g.fillText('dBFS',3,37);
  for(const f of [20,50,100,200,500,1000,2000,5000,10000,20000]){g.strokeStyle='#173647';g.beginPath();g.moveTo(x(f),30);g.lineTo(x(f),h-20);g.stroke();g.fillStyle='#93b9cd';g.textAlign='center';g.fillText(f>=1000?f/1000+'k':f,x(f),h-6);}g.textAlign='left';
  const fs=$('freqMode').value==='standard'?standard:Array.from({length:180},(_,i)=>20*1000**(i/179));
  for(const k of ['A','B']){const s=visibleSource(k);if(!s)continue;const values=fs.map(f=>plotLevel(s,f)),prev=visualState.smoothed[k];
    const key=s.asset.id+':'+offset+':'+$('freqMode').value+':'+smoothingOct;
    const smooth=values.map((v,i)=>v===null?null:playing&&prev?.key===key&&Number.isFinite(prev.values[i])?prev.values[i]+.22*(v-prev.values[i]):v);visualState.smoothed[k]={key,values:smooth};
    g.strokeStyle=colors[k];g.globalAlpha=playing&&playing!==k?.38:1;g.lineWidth=playing===k?2.5:1.5;g.shadowColor=colors[k];g.shadowBlur=9;g.beginPath();let move=true;fs.forEach((f,i)=>{const v=smooth[i];if(v===null||!Number.isFinite(v)){move=true;return;}if(move)g.moveTo(x(f),y(v));else g.lineTo(x(f),y(v));move=false;});g.stroke();g.shadowBlur=0;g.globalAlpha=1;
  }
  const a=visibleSource('A'),bb=visibleSource('B'),rows=currentDifferences(a,bb),zero=h-37;
  if(showInlineDiff){const scale=24/Math.max(12,...rows.map(row=>Math.abs(row.delta)));g.strokeStyle='#7293a3';g.beginPath();g.moveTo(l,zero);g.lineTo(r,zero);g.stroke();for(const row of rows){g.fillStyle=row.delta>=0?colors.B:colors.A;g.fillRect(x(row.low),zero-Math.max(0,row.delta)*scale,Math.max(1,x(row.high)-x(row.low)-1),Math.abs(row.delta)*scale);}
    const peak=[...rows].sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta))[0];if(peak){g.fillStyle='#ddf7ff';g.font='10px sans-serif';g.fillText(bandLabel(peak)+'  '+(peak.delta>=0?'B':'A')+' +'+Math.abs(peak.delta).toFixed(1)+' dB',l+5,43);g.strokeStyle='#a9ef54';g.strokeRect(Math.max(l,x(peak.low)),47,Math.min(r,x(peak.high))-Math.max(l,x(peak.low)),Math.max(1,b-47));}}
  g.fillStyle=colors.A;g.fillText('A',r-70,42);g.fillStyle=colors.B;g.fillText('B',r-50,42);g.fillStyle='#acee4b';g.fillText('Δ',r-25,42);
  const live=playing&&['A','B'].some(k=>visibleSource(k)!==slots[k]);$('visualStatus').textContent=(live?'再生位置の解析':visualState.failed?'追従解析停止 · 原音の平均解析':'原音の平均解析')+' · '+($('freqMode').value==='standard'?'1/3 OCT':'MUSIC '+(bandSettings.custom?'CUSTOM':'DEFAULT'));
}
function drawMiniWave(){
  const c=$('miniWave');if(!c||!c.getBoundingClientRect().width)return;const rect=c.getBoundingClientRect(),w=rect.width,h=rect.height,dpr=devicePixelRatio||1;
  if(c.width!==Math.round(w*dpr)||c.height!==Math.round(h*dpr)){c.width=Math.round(w*dpr);c.height=Math.round(h*dpr);}const g=c.getContext('2d');g.setTransform(dpr,0,0,dpr,0,0);g.clearRect(0,0,w,h);const [lo,hi]=limits(),span=Math.max(.001,hi-lo);
  for(const k of ['A','B']){const s=slots[k];if(!s)continue;g.strokeStyle=colors[k];g.globalAlpha=playing&&playing!==k?.35:.85;g.beginPath();for(let px=0;px<w;px++){const sec=lo+px/w*span+(k==='B'?offset:0),j=Math.max(0,Math.min(1599,Math.floor(sec/s.buffer.duration*1600)));let min=1,max=-1;for(const ch of s.wave){min=Math.min(min,ch.min[j]);max=Math.max(max,ch.max[j]);}g.moveTo(px,h/2-max*h*.44);g.lineTo(px,h/2-min*h*.44);}g.stroke();}g.globalAlpha=1;const px=Math.max(0,Math.min(w,(position()-lo)/span*w));g.strokeStyle='#fff';g.shadowColor='#00dcff';g.shadowBlur=7;g.beginPath();g.moveTo(px,0);g.lineTo(px,h);g.stroke();g.shadowBlur=0;$('miniTime').textContent=time(Math.max(0,position()-lo))+' / '+time(Math.max(0,hi-lo));
}
function visualTick(now){requestAnimationFrame(visualTick);if(document.hidden||!$('miniWave'))return;if(now-visualState.last>=100){visualState.last=now;if((activePage==='compare'||fullGraph?.id==='spectrum')&&playing)void sampleVisual();}
  if(playing){if(activePage==='compare'||fullGraph?.id==='spectrum')drawReactiveGraph();if(fullGraph?.id==='wave')waveGraph();drawMiniWave();}
}
