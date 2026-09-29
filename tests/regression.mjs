import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const root=new URL('../',import.meta.url);
const html=readFileSync(new URL('index.html',root),'utf8');
const script=html.match(/<script>([\s\S]*)<\/script>/)[1];
new vm.Script(script); // Syntax check the actual standalone deliverable.
const workerSource=script.slice(script.indexOf('function dspWorker'),script.indexOf("\n'use strict';"));
const dsp=vm.createContext({self:{},Float32Array,Float64Array,Math});
vm.runInContext(workerSource+'\n'+workerSource.slice(workerSource.indexOf('{')+1,workerSource.lastIndexOf('}')),dsp);
let passed=0;
function check(name,fn){fn();passed++;console.log('PASS '+name)}
function signal(n,channels){return Array.from({length:channels},(_,c)=>Float32Array.from({length:n},(_,i)=>Math.sin(i*.071+c)*(.2+.15*Math.sin(i*.00011))));}
for(const [length,sr,ch,stride] of [[1,48000,1,1],[2000,44100,2,137],[8192,48000,1,450],[96337,48000,2,96000],[630123,44100,2,44100]]){
  check(`analysis equivalence ${length} frames / ${sr} Hz / ${ch} ch / chunk ${stride}`,()=>{
    const channels=signal(length,ch),expected=dsp.analyze(channels,sr);
    dsp.beginStream(length,sr,ch);
    for(let at=0;at<length;at+=stride)dsp.feedStream(at,channels.map(c=>c.slice(at,at+stride)));
    const actual=dsp.finishStream();
    assert.equal(actual.fftSize,expected.fftSize);assert.equal(actual.envRate,expected.envRate);
    for(const [key,tolerance] of [['power',1e-12],['env',1e-7]]){assert.equal(actual[key].length,expected[key].length);actual[key].forEach((v,i)=>assert.ok(Math.abs(v-expected[key][i])<=tolerance,`${key}[${i}]`));}
    for(let c=0;c<ch;c++){assert.deepEqual(actual.wave[c].min,expected.wave[c].min);assert.deepEqual(actual.wave[c].max,expected.wave[c].max);}
  });
}
check('reject incomplete and out-of-order analysis',()=>{dsp.beginStream(100,48000,1);assert.throws(()=>dsp.feedStream(1,[new Float32Array(2)]));assert.throws(()=>dsp.finishStream());});
check('AUTO SYNC known +500 ms, same-source zero and silence ambiguity',()=>{
  let seed=7;const a=Float32Array.from({length:1500},()=>{seed=(seed*16807)%2147483647;return seed/2147483647});
  const b=new Float32Array(1500);b.set(a.subarray(0,1450),50);
  assert.equal(dsp.sync(a,b,100,100).offset,.5);assert.equal(dsp.sync(a,a,100,100).offset,0);
  assert.equal(dsp.sync(new Float32Array(1500),new Float32Array(1500),100,100).ambiguous,true);
});
const mem=vm.createContext({Blob,Float32Array,Uint8Array,Promise,Map,Math,Number,Error,window:{},setInterval:()=>{},slots:{}});
vm.runInContext(readFileSync(new URL('memory-audio.js',root),'utf8'),mem);
const x=new Uint8Array(2*1024*1024+15);x[500]=1;const a=new Blob([x]);
assert.equal(await mem.equalBlobs(a,new Blob([x])),true);x[x.length-2]=2;
assert.equal(await mem.equalBlobs(a,new Blob([x])),false);assert.equal(await mem.equalBlobs(a,new Blob(['x'])),false);
console.log('PASS same-file sharing compares all bytes, including final chunk');passed++;
check('standalone keeps original controls, tabs, storage keys and download source',()=>{
  const baseline=readFileSync(new URL('Acoustic_MC_Tool_baseline_RC1.html',root),'utf8');
  const storageNotice='<span>メモリ負荷を減らすため端末内に作業用音声を一時保存します。強制終了時などに残った作業データは次回利用時に削除します。ブラウザによってはサイトデータの消去が必要です。</span>';
  // The approved UI delta is appended CSS + DOM reorganization. Preserve all
  // original markup/controls and baseline styles outside that explicit block.
  assert.equal(html.split('<script>')[0].replace(/\/\* BEGIN workspace-ui \*\/[\s\S]*?\/\* END workspace-ui \*\/\s*/, '').replace(storageNotice,'').replaceAll('\r\n','\n'),baseline.split('<script>')[0].replaceAll('\r\n','\n'));
  for(const key of ['amct_memo_v1','amct_reference_v1','amct_lastBands','audio/webm;codecs=opus','audio/mp4','a.download=s.name','URL.createObjectURL(s.blob)'])assert.ok(html.includes(key));
  assert.ok(!html.includes("job('analyze'"));
  assert.ok(!html.includes('node.buffer=slots[which].buffer'));
});
console.log(`${passed} regression groups passed`);
