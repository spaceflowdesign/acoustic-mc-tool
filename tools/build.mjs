import {readFileSync,writeFileSync} from 'node:fs';
// Mechanical embedding keeps file:// and the original strict, offline CSP.
let html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
for(const [tag,file] of [['memory-audio','memory-audio.js'],['k-weighting','k-weighting.js'],['stream-analysis','stream-analysis.js'],['audio-context','audio-context.js'],['comparison-math','comparison-math.js'],['comparison-view','comparison-view.js'],['gain-match','gain-match.js'],['workspace-ui','workspace-ui.js']]){
  const source=readFileSync(new URL('../'+file,import.meta.url),'utf8')+(tag==='workspace-ui'?['band-display.js','realtime-view.js','fixed-ui.js'].map(f=>'\n'+readFileSync(new URL('../'+f,import.meta.url),'utf8')).join(''):'');
  html=html.replace(new RegExp('// BEGIN '+tag+'[\\s\\S]*?// END '+tag),()=>`// BEGIN ${tag}\n${source}\n// END ${tag}`);
}
html=html.replace(/\/\* BEGIN workspace-ui \*\/[\s\S]*?\/\* END workspace-ui \*\//,()=>`/* BEGIN workspace-ui */\n${readFileSync(new URL('../workspace-ui.css',import.meta.url),'utf8')}\n/* END workspace-ui */`);
writeFileSync(new URL('../index.html',import.meta.url),html);
