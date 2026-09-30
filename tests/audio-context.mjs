import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../audio-context.js',import.meta.url),'utf8');
class Context {
  constructor(state='suspended',behavior='ok',time=0){Object.assign(this,{state,behavior,time,listeners:new Set(),resumes:0,closes:0,started:Date.now()});}
  get currentTime(){return this.time+(this.state==='running'&&this.behavior!=='frozen'?(Date.now()-this.started)/1000:0)}
  addEventListener(_,f){this.listeners.add(f)}
  removeEventListener(_,f){this.listeners.delete(f)}
  change(state){this.state=state;for(const f of this.listeners)f()}
  resume(){
    this.resumes++;
    if(this.behavior==='reject')return Promise.reject(Error('resume rejected'));
    if(this.behavior==='throw')throw Error('resume threw');
    if(this.behavior==='hang'||this.behavior==='frozen')return new Promise(()=>{});
    if(this.behavior==='delayed'){setTimeout(()=>this.change('running'),8);return Promise.resolve()}
    if(this.behavior==='resolve-stuck')return Promise.resolve();
    this.change('running');return Promise.resolve();
  }
  close(){this.closes++;this.change('closed');return new Promise(()=>{})} // Hung close must not block rebuilding.
}
function setup(old,newBehavior='ok'){
  const created=[],sentinel={asset:{id:1},power:[1],env:[2]},cache=new Map([['1:0',{}]]);
  const s={ctx:old,rec:null,playing:null,cursor:123.5,origin:90,playToken:1,slots:{A:sentinel,B:sentinel},offset:.125,memo:'keep',reference:{values:[1]},
    document:{hidden:false},pcmStore:{cache},Promise,Error,
    setTimeout:(f,ms)=>setTimeout(f,ms===2500?40:ms),clearTimeout,
    setInterval:f=>setInterval(f,1),clearInterval,
    window:{AudioContext:class{constructor(){const c=new Context('suspended',newBehavior);created.push(c);return c}}},
    update(){},draw(){},stopRecord(){s.recordStopped=true},cut(){s.cutCount=(s.cutCount||0)+1},
    position(){return s.playing?s.ctx.currentTime-s.origin:s.cursor},
    pause(){s.playToken++;s.cancelAudioStart();s.cursor=s.position();s.playing=null;s.cut()}};
  vm.createContext(s);vm.runInContext(source,s);return {s,created,sentinel,cache};
}
let count=0;
async function test(name,fn){await fn();console.log('PASS '+name);count++}
for(const state of ['suspended','interrupted'])await test(state+' resumes and waits for asynchronous statechange',async()=>{
  const c=new Context(state,'delayed'),{s,created}=setup(c);
  assert.equal(await s.audio(),c);assert.equal(c.state,'running');assert.equal(c.resumes,1);assert.equal(created.length,0);assert.equal(c.listeners.size,0);
});
for(const behavior of ['reject','throw','hang','resolve-stuck','frozen'])await test(behavior+' old output recreates once and preserves data',async()=>{
  const c=new Context(behavior==='frozen'?'running':'interrupted',behavior,100),{s,created,sentinel}=setup(c);
  s.backgroundAudio();s.playing='A';s.origin=90;
  const restored=await s.audio();
  assert.equal(restored,created[0]);assert.equal(created.length,1);assert.equal(c.closes,1);
  assert.equal(s.cursor,10);assert.equal(s.playing,null);assert.equal(s.offset,.125);assert.equal(s.memo,'keep');assert.equal(s.slots.A,sentinel);assert.equal(s.slots.B,sentinel);assert.deepEqual(s.reference.values,[1]);assert.equal(c.listeners.size,0);
});
await test('closed context is replaced synchronously on the explicit call',async()=>{
  const c=new Context('closed'),{s,created}=setup(c),pending=s.audio();assert.equal(created.length,1);assert.equal(created[0].resumes,1);await pending;assert.equal(c.resumes,0);
});
await test('duplicate taps share one recovery and one replacement',async()=>{
  const {s,created}=setup(new Context('interrupted','hang'));const a=s.audio(),b=s.audio();assert.equal(a,b);await Promise.all([a,b]);assert.equal(created.length,1);
});
await test('fresh output failure is bounded; next explicit tap can retry',async()=>{
  const {s,created,sentinel}=setup(new Context('interrupted','reject'),'reject');await assert.rejects(s.audio(),/復旧できません/);assert.equal(created.length,1);assert.equal(s.slots.A,sentinel);
  created[0].behavior='ok';assert.equal(await s.audio(),created[0]);assert.equal(created.length,1);
});
await test('background cancels pending start, late resolution cannot rebuild or play',async()=>{
  const c=new Context('interrupted','hang'),{s,created}=setup(c);const promise=s.audio();s.document.hidden=true;s.backgroundAudio();await assert.rejects(promise);c.change('running');assert.equal(created.length,0);assert.equal(s.playing,null);assert.equal(c.listeners.size,0);
});
await test('foreground does not auto-resume; explicit call recovers',async()=>{
  const c=new Context('running'),{s}=setup(c);s.playing='A';s.document.hidden=true;s.backgroundAudio();const p=s.cursor;c.change('interrupted');s.document.hidden=false;
  assert.equal(c.resumes,0);assert.equal(s.playing,null);assert.equal(s.cursor,p);await s.audio();assert.equal(c.resumes,1);assert.equal(s.cursor,p);
});
await test('STOP cancels recovery without delayed replacement',async()=>{
  const {s,created}=setup(new Context('interrupted','hang'));const p=s.audio();s.pause();s.cursor=0;await assert.rejects(p);assert.equal(s.cursor,0);assert.equal(created.length,0);
});
await test('file decode does not resume a suspended/closed context',async()=>{
  const c=new Context('closed'),{s,created}=setup(c);assert.equal(await s.audio(false),c);assert.equal(c.resumes,0);assert.equal(created.length,0);assert.equal(s.cursor,123.5);
});
await test('AIR REC context is not closed during active recording',async()=>{
  const c=new Context('interrupted','reject'),{s,created}=setup(c);s.rec={};await assert.rejects(s.audio(),/録音中/);assert.equal(c.closes,0);assert.equal(created.length,0);s.document.hidden=true;s.backgroundAudio();assert.equal(s.recordStopped,true);
});
await test('hidden explicit call does not create output',async()=>{
  const {s,created}=setup(null);s.document.hidden=true;await assert.rejects(s.audio());assert.equal(created.length,0);
});
console.log(`${count} AudioContext regression scenarios passed`);
