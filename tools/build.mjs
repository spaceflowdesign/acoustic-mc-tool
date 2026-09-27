import {readFileSync,writeFileSync} from 'node:fs';
// Mechanical embedding keeps file:// and the original strict, offline CSP.
let html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
for(const [tag,file] of [['memory-audio','memory-audio.js'],['stream-analysis','stream-analysis.js']]){
  const source=readFileSync(new URL('../'+file,import.meta.url),'utf8');
  html=html.replace(new RegExp('// BEGIN '+tag+'[\\s\\S]*?// END '+tag),()=>`// BEGIN ${tag}\n${source}\n// END ${tag}`);
}
writeFileSync(new URL('../index.html',import.meta.url),html);
