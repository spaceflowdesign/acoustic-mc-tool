let focusedBand=null;
function bandLabel(row){const label=f=>f>=1000?(f/1000).toFixed(f>=10000?0:1).replace(/\.0$/,'')+'k':Math.round(f);return label(row.low)+'–'+label(row.high)+' Hz'}
function drawDiff(){
  if(!$('diffChart'))return;
  const {a,b:sourceB,live}=diffSources();renderDiffFrame(diffDisplayData(a,sourceB),{a,live});
}
function renderDiffFrame(data,{a,live}){
  const {points,rows,meta}=data;
  const ranked=[...rows].sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta)).slice(0,3);
  if(!rows.some(r=>r.f===focusedBand))focusedBand=ranked[0]?.f??null;
  const trace=points.filter(p=>Number.isFinite(p.f)&&Number.isFinite(p.delta)&&p.f>=20&&p.f<=20000);
  const peak=Math.max(0,...trace.map(p=>Math.abs(p.delta)),...rows.map(p=>Math.abs(p.delta)));
  const range=Math.max(6,Math.ceil(peak/6)*6);
  const gainState=(Math.abs(meta.matchA)>1e-9||Math.abs(meta.matchB)>1e-9)?`GAIN MATCH ON · A ${meta.matchA>=0?'+':''}${meta.matchA.toFixed(1)} / B ${meta.matchB>=0?'+':''}${meta.matchB.toFixed(1)} dB`:'GAIN MATCH OFF · 原音差';
  const {g,w,h,l,r,t,b}=base('diffChart','B − A · dB');
  g.font='bold 10px sans-serif';g.fillStyle=(Math.abs(meta.matchA)>1e-9||Math.abs(meta.matchB)>1e-9)?'#8ff7ff':'#98aebb';g.fillText(gainState,l,28);
  const x=f=>l+Math.log(f/20)/Math.log(1000)*(r-l),y=d=>(t+b)/2-d/range*(b-t)/2,zero=y(0);
  g.font='10px sans-serif';g.lineWidth=1;
  for(const d of [-range,-range/2,0,range/2,range]){g.strokeStyle=d===0?'#b8d7e6':'#193544';g.lineWidth=d===0?1.5:1;g.beginPath();g.moveTo(l,y(d));g.lineTo(r,y(d));g.stroke();g.fillStyle=d===0?'#d9f5ff':'#9bb4c3';g.fillText((d>0?'+':'')+d,4,y(d)+4)}
  for(const f of [20,50,100,200,500,1000,2000,5000,10000,20000]){g.strokeStyle='#122f3e';g.lineWidth=1;g.beginPath();g.moveTo(x(f),t);g.lineTo(x(f),b);g.stroke();g.fillStyle='#9bb4c3';g.textAlign=f===20?'left':f===20000?'right':'center';g.fillText(f>=1000?f/1000+'k':f,x(f),h-12)}g.textAlign='left';
  const selected=rows.find(row=>row.f===focusedBand);
  if(selected){const left=Math.max(l,x(selected.low)),right=Math.min(r,x(selected.high));g.fillStyle='#eafaff';g.globalAlpha=.055;g.fillRect(left,t,Math.max(1,right-left),b-t);g.globalAlpha=.65;g.strokeStyle='#eafaff';g.strokeRect(left,t,Math.max(1,right-left),b-t);g.globalAlpha=1;}
  if(trace.length){
    const fillSign=(positive,color)=>{
      g.fillStyle=color;g.globalAlpha=.16;let open=false,lastX=0;
      for(const p of trace){const same=positive?p.delta>=0:p.delta<0,px=x(p.f),py=y(p.delta);
        if(same){if(!open){g.beginPath();g.moveTo(px,zero);open=true;}g.lineTo(px,py);lastX=px;}
        else if(open){g.lineTo(lastX,zero);g.closePath();g.fill();open=false;}
      }
      if(open){g.lineTo(lastX,zero);g.closePath();g.fill();}g.globalAlpha=1;
    };
    fillSign(true,colors.B);fillSign(false,colors.A);
    g.beginPath();trace.forEach((p,i)=>{const px=x(p.f),py=y(p.delta);if(i)g.lineTo(px,py);else g.moveTo(px,py);});
    g.strokeStyle='#e8fbff';g.lineWidth=1.35;g.shadowColor='#00dfff';g.shadowBlur=4;g.stroke();g.shadowBlur=0;
  }
  const host=$('diffFocus');while(host.children.length>ranked.length)host.lastElementChild.remove();
  ranked.forEach((row,i)=>{let btn=host.children[i];if(!btn){btn=document.createElement('button');btn.append(document.createElement('span'),document.createElement('b'));btn.onclick=()=>{focusedBand=Number(btn.dataset.band);drawDiff();};host.append(btn);}btn.dataset.band=row.f;btn.setAttribute('aria-pressed',String(row.f===focusedBand));btn.firstElementChild.textContent=bandLabel(row);const value=btn.lastElementChild;value.textContent=Math.abs(row.delta)<.05?'差 0.0 dB':(row.delta>0?'B':'A')+' +'+Math.abs(row.delta).toFixed(1)+' dB';value.style.color=row.delta>=0?colors.B:colors.A;});
  const scope=live?'現在位置 '+time(a.at)+' · 同期後 A/B':'全体平均 · '+(playing?'現在位置の解析待ち':'停止中');
  const smoothing=$('freqMode').value==='standard'?'1/3 Oct 固定':smoothingOct?'1/'+Math.round(1/smoothingOct)+' Oct':'OFF';
  $('diffMessage').textContent=!slots.A||!slots.B?'A/Bを読み込むと差分を表示します。':!rows.length?'比較可能な有音帯域がありません。':`${scope} · ${gainState} · Smoothing ${smoothing} · 差の大きい${ranked.length}帯域`;
  if(!trace.length){g.fillStyle='#7995a8';g.fillText('NO COMPARABLE BANDS',l+12,(t+b)/2-14)}
}
