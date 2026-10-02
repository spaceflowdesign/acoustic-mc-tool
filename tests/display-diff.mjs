import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const mode={value:'music'},c=vm.createContext({$:()=>mode,slots:{},playing:null,offset:0});
for(const file of ['band-display.js','comparison-math.js','realtime-view.js'])vm.runInContext(readFileSync(new URL('../'+file,import.meta.url),'utf8'),c);
const power=new Float64Array(4097).fill(1e-7),other=power.slice();other[43]=.01;
c.a={power,fftSize:8192,buffer:{sampleRate:48000}};c.b={...c.a,power:other};
assert.equal(vm.runInContext('smoothingOct',c),0);
const off=c.currentDifferences(c.a,c.b);vm.runInContext('smoothingOct=1/3',c);const on=c.currentDifferences(c.a,c.b);
assert.ok(on.some((r,i)=>Math.abs(r.delta-off[i].delta)>.1));
const smoothed=c.smoothedDisplaySource(c.b);
for(const i of [8,43,100,512,2000,4000])assert.ok(Math.abs(10*Math.log10(smoothed.power[i])-c.plotLevel(c.b,i*48000/8192))<1e-6);
assert.equal(c.b.power,other);assert.equal(other[43],.01);assert.equal(power[43],1e-7);
vm.runInContext('smoothingOct=0',c);assert.equal(c.smoothedDisplaySource(c.b),c.b);
console.log('PASS fresh Smoothing OFF; DIFF responds to smoothing; prefix sums match COMPARE; raw input unchanged');
c.match={A:1,B:1};c.playbackMatchGain=side=>c.match[side];
c.standard=[63,125,250,500,1000,2000,4000,8000];c.band=(p,sr,n,f)=>c.rangeLevel(p,sr,n,f/2**(1/6),f*2**(1/6));
for(const modeName of ['music','standard'])for(const width of [0,1/6,1/3]){
  mode.value=modeName;vm.runInContext('smoothingOct='+width,c);c.match={A:1,B:1};const raw=c.currentDifferences(c.a,c.b),level=c.plotLevel(c.b,1000,'B');
  c.match.B=10**(-2.7/20);const matched=c.currentDifferences(c.a,c.b);
  assert.ok(Math.abs(c.plotLevel(c.b,1000,'B')-level+2.7)<1e-10);assert.ok(matched.every((r,i)=>Math.abs(r.delta-raw[i].delta+2.7)<1e-10));
  c.match={A:10**(-1.6/20),B:1};assert.ok(c.currentDifferences(c.a,c.b).every((r,i)=>Math.abs(r.delta-raw[i].delta-1.6)<1e-10));
  c.match={A:1,B:1};assert.deepEqual(c.currentDifferences(c.a,c.b),raw);assert.equal(c.plotLevel(c.b,1000,'B'),level);
}
assert.equal(other[43],.01);assert.equal(power[43],1e-7);
console.log('PASS display gain uses playback coefficient for both sides, all smoothing/standard modes; OFF is exact; raw power immutable');
mode.value='music';c.match={A:1,B:1};
for(const width of [1/6,1/3]){
  vm.runInContext('smoothingOct='+width,c);
  for(const sr of [48000,96000,48000]){
    const s={...c.b,buffer:{sampleRate:sr}},smooth=c.smoothedDisplaySource(s);
    for(const i of [2,4,8,43,100,2000]){
      const f=i*sr/s.fftSize,factor=2**(width/2),expected=c.rangeLevel(s.power,sr,s.fftSize,Math.max(20,f/factor),Math.min(sr/2,f*factor));
      assert.ok(expected===null?smooth.power[i]===1e-12:Math.abs(10*Math.log10(smooth.power[i])-expected)<1e-6);
      assert.ok(expected===null?c.plotLevel(s,f)===null:Math.abs(c.plotLevel(s,f)-expected)<1e-6);
    }
  }
}
console.log('PASS shared smoothing kernel matches independent band sum and invalidates cached sample-rate metadata');
c.a.at=c.b.at=10;c.match={A:1,B:10**(-2.7/20)};
const frames=[];
for(const width of [0,1/6,1/3]){
  vm.runInContext('smoothingOct='+width,c);const data=c.diffDisplayData(c.a,c.b);frames.push(data);
  assert.equal(data.meta.at,10);assert.equal(data.meta.width,width);assert.ok(data.points.length>1000);
  for(const p of data.points){
    const read=s=>{if(!width)return s.power[Math.round(p.f*s.fftSize/s.buffer.sampleRate)];const db=c.rangeLevel(s.power,s.buffer.sampleRate,s.fftSize,Math.max(20,p.f/2**(width/2)),Math.min(s.buffer.sampleRate/2,p.f*2**(width/2)));return 10**(db/10);};
    assert.ok(Math.abs(p.delta-(10*Math.log10(read(c.b)*c.match.B**2)-10*Math.log10(read(c.a))))<1e-6);
  }
  for(const row of data.rows){let sum=0,weight=0;for(const p of data.points){const w=Math.max(0,Math.min(row.high,p.high)-Math.max(row.low,p.low));sum+=w*p.delta;weight+=w;}assert.ok(Math.abs(row.delta-sum/weight)<1e-10);}
}
for(const [i,j]of [[0,1],[1,2],[0,2]]){assert.notDeepEqual(frames[i].points,frames[j].points);assert.notDeepEqual(frames[i].rows,frames[j].rows);}
console.log('PASS same 10s inputs: per-frequency matched A/B smoothing then B-A, every pair differs, bars derive only from these differences');
