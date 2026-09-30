let repeatEnabled=false;
function renderRepeat(){document.querySelectorAll('[data-repeat]').forEach(b=>{b.textContent='REPEAT '+(repeatEnabled?'ON':'OFF');b.setAttribute('aria-pressed',String(repeatEnabled));});}
function toggleRepeat(){repeatEnabled=!repeatEnabled;renderRepeat();}
function finishPlayback(){const side=playing;pause(true);if(repeatEnabled&&side&&!document.hidden)void play(side);}
const repeatInit=initWorkspace,repeatUpdate=updateWorkspace;
initWorkspace=function(){repeatInit();
  $('pause').classList.add('small-transport');$('stop').classList.add('small-transport');
  $('stop').after(makeAction('REPEAT OFF',toggleRepeat,{'data-repeat':'',id:'repeatToggle'}));
  const fullStop=document.querySelector('[data-control-page="0"]').querySelectorAll('button')[4];fullStop.id='fullStop';fullStop.classList.add('small-transport');
  fullStop.after(makeAction('REPEAT OFF',toggleRepeat,{'data-repeat':'',id:'fullRepeat'}));renderRepeat();
};
updateWorkspace=function(){repeatUpdate();$('fullPlay')?.classList.toggle('small-transport',!!playing);renderRepeat();};
