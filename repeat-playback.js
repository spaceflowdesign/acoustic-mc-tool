let repeatEnabled=false;
const repeatIcon='<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 10V7h14l-3-3m3 3-3 3M20 14v3H6l3 3m-3-3 3-3"/></svg>';
function renderRepeat(){document.querySelectorAll('[data-repeat]').forEach(b=>{if(!b.firstElementChild)b.innerHTML=repeatIcon;b.setAttribute('aria-label','REPEAT '+(repeatEnabled?'ON':'OFF'));b.title=b.getAttribute('aria-label');b.setAttribute('aria-pressed',String(repeatEnabled));});}
function toggleRepeat(){repeatEnabled=!repeatEnabled;renderRepeat();}
function finishPlayback(){const side=playing;pause(true);if(repeatEnabled&&side&&!document.hidden)void play(side);}
const repeatInit=initWorkspace,repeatUpdate=updateWorkspace;
initWorkspace=function(){repeatInit();
  $('pause').classList.add('small-transport');$('stop').classList.add('small-transport');
  for(const [id,icon,label]of [['playA','A ▶','A PLAY'],['playB','B ▶','B PLAY'],['pause','‖','PAUSE'],['stop','■','STOP']]){$(id).textContent=icon;$(id).setAttribute('aria-label',label);$(id).title=label;}
  $('stop').after(makeAction('REPEAT OFF',toggleRepeat,{'data-repeat':'',id:'repeatToggle'}));
  const fullStop=$('fullStop');fullStop.classList.add('small-transport');
  fullStop.after(makeAction('REPEAT OFF',toggleRepeat,{'data-repeat':'',id:'fullRepeat'}));renderRepeat();
};
updateWorkspace=function(){repeatUpdate();$('fullPlay')?.classList.toggle('small-transport',!!playing);renderRepeat();};
