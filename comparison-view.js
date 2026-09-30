let focusedBand=null;
function bandLabel(row){const label=f=>f>=1000?(f/1000).toFixed(f>=10000?0:1).replace(/\.0$/,'')+'k':Math.round(f);return label(row.low)+'–'+label(row.high)+' Hz'}
function drawDiff(){
  if(!$('diffChart'))return;
  const {a,b:sourceB,live}=diffSources(),rows=currentDifferences(a,sourceB);
  const ranked=[...rows].sort((a,b)=>Math.abs(b.delta)-Math.abs(a.delta)).slice(0,3);
  if(!rows.some(r=>r.f===focusedBand))focusedBand=ranked[0]?.f??null;
  const {g,w,h,l,r,t,b}=base('diffChart','B − A · dB / 原音'),range=Math.max(6,Math.ceil(Math.max(0,...rows.map(x=>Math.abs(x.delta)))/6)*6);
  const x=f=>l+Math.log(f/20)/Math.log(1000)*(r-l),y=d=>(t+b)/2-d/range*(b-t)/2;
  g.font='10px sans-serif';g.lineWidth=1;
  for(const d of [-range,-range/2,0,range/2,range]){g.strokeStyle=d===0?'#7594a5':'#193544';g.beginPath();g.moveTo(l,y(d));g.lineTo(r,y(d));g.stroke();g.fillStyle='#9bb4c3';g.fillText((d>0?'+':'')+d,4,y(d)+4)}
  for(const f of [20,100,1000,10000,20000]){g.fillStyle='#9bb4c3';g.textAlign=f===20?'left':f===20000?'right':'center';g.fillText(f>=1000?f/1000+'k':f,x(f),h-12)}g.textAlign='left';
  for(const row of rows){const left=Math.max(l,x(row.low)),right=Math.min(r,x(row.high)),yy=y(row.delta),zero=y(0);g.fillStyle=row.delta>=0?colors.B:colors.A;g.globalAlpha=row.f===focusedBand?1:.5;g.fillRect(left,Math.min(zero,yy),Math.max(1,right-left-2),Math.max(1,Math.abs(yy-zero)));if(row.f===focusedBand){g.globalAlpha=1;g.strokeStyle='#effaff';g.strokeRect(left,t,right-left-1,b-t)}}g.globalAlpha=1;
  const host=$('diffFocus');while(host.children.length>ranked.length)host.lastElementChild.remove();
  ranked.forEach((row,i)=>{let btn=host.children[i];if(!btn){btn=document.createElement('button');btn.append(document.createElement('span'),document.createElement('b'));btn.onclick=()=>{focusedBand=Number(btn.dataset.band);drawDiff();};host.append(btn);}btn.dataset.band=row.f;btn.setAttribute('aria-pressed',String(row.f===focusedBand));btn.firstElementChild.textContent=bandLabel(row);const value=btn.lastElementChild;value.textContent=Math.abs(row.delta)<.05?'差 0.0 dB':(row.delta>0?'B':'A')+' +'+Math.abs(row.delta).toFixed(1)+' dB';value.style.color=row.delta>=0?colors.B:colors.A;});
  const scope=live?'現在位置 '+time(a.at)+' · 同期後 A/B':'全体平均 · '+(playing?'現在位置の解析待ち':'停止中');
  const smoothing=$('freqMode').value==='standard'?'1/3 Oct 固定':smoothingOct?'1/'+Math.round(1/smoothingOct)+' Oct':'OFF';
  document.querySelector('[data-panel=diff] .graph-scope').textContent=scope+' · Smoothing '+smoothing+' · 原音 B − A';
  $('diffMessage').textContent=!slots.A||!slots.B?'A/Bを読み込むと差分を表示します。':!rows.length?'比較可能な有音帯域がありません。':`${scope} · Smoothing ${smoothing} · 差の大きい${ranked.length}帯域`;
  if(!rows.length){g.fillStyle='#7995a8';g.fillText('NO COMPARABLE BANDS',l+12,(t+b)/2-14)}
}
