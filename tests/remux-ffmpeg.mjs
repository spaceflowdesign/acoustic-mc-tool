// Optional independent decoder check; generated fixtures stay outside the repo.
// node tests/remux-ffmpeg.mjs /path/to/ffmpeg [../fixtures/camera.mov]
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import vm from 'node:vm';
const executable=process.argv[2];
if(!executable){console.log('SKIP independent FFmpeg check: supply executable (see TESTING.md)');process.exit(0);}
const path=process.argv[3]||new URL('../../fixtures/camera.mov',import.meta.url);
const original=readFileSync(path),c=vm.createContext({Blob});
vm.runInContext(readFileSync(new URL('../media-input.js',import.meta.url),'utf8'),c);
const result=await c.inspectMediaInput(new Blob([original],{type:'video/quicktime'}),'camera.mov');
assert.equal(result.selection,'single');assert.equal(result.selectedTrackId,2);assert.equal(result.codec,'mp4a');
const extracted=Buffer.from(await result.audioBlob.arrayBuffer());
assert.ok(extracted.length<original.length);
// Restricted hosts may allow direct FFmpeg but not Node child processes.
// Export only the generated test artifact for the documented shell check.
if(executable==='--export'){if(!process.argv[4])throw Error('Output .m4a path required');writeFileSync(process.argv[4],extracted);console.log('Exported normalized test fixture: '+process.argv[4]);process.exit(0);}
const decode=input=>{const r=spawnSync(executable,['-v','error','-i','pipe:0','-map','0:a:0','-c:a','pcm_f32le','-f','hash','-hash','sha256','pipe:1'],{input,maxBuffer:8*1024*1024,windowsHide:true});assert.ifError(r.error);assert.equal(r.status,0,r.stderr.toString());assert.equal(r.stderr.toString(),'');return r.stdout.toString();};
assert.equal(decode(extracted),decode(original));
console.log('PASS independent FFmpeg decode: single AAC MOV and normalized M4A have identical float PCM SHA256');
