import {createServer} from 'node:http';
import {readFileSync,createReadStream,existsSync} from 'node:fs';
const root=new URL('../',import.meta.url);
createServer((req,res)=>{
  if(req.url==='/camera.mov'){
    const path=new URL('../../fixtures/camera.mov',import.meta.url);
    if(!existsSync(path)){res.writeHead(404);res.end('fixture missing');return}
    res.setHeader('Content-Type','video/quicktime');createReadStream(path).pipe(res);return;
  }
  if(req.url==='/navigation-landing'){res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><meta name="viewport" content="width=device-width"><h1>Navigation test landing</h1><a href="/tests">Open Tool navigation test</a>');return}
  if(req.url==='/fixture.mp4'||req.url==='/fixture-distinct.mp4'){
    const path=new URL('../../fixtures/'+(req.url==='/fixture.mp4'?'13min.mp4':'13min-distinct.mp4'),import.meta.url);
    if(!existsSync(path)){res.writeHead(404);res.end('fixture missing');return}
    res.setHeader('Content-Type','video/mp4');createReadStream(path).pipe(res);return;
  }
  let html=readFileSync(new URL(req.url==='/baseline'?'Acoustic_MC_Tool_baseline_RC1.html':'index.html',root),'utf8');
  if(req.url==='/tests')html=html.replace("connect-src 'none'","connect-src 'self'").replace('</script></body>',['browser.js','browser-recovery.js','browser-workspace.js','browser-gain.js','browser-bands.js','alternate-fixture.js','browser-video.js','browser-extras.js'].map(file=>readFileSync(new URL(file,import.meta.url),'utf8')).join('\n')+'</script></body>');
  res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);
}).listen(8765,'127.0.0.1',()=>console.log('http://127.0.0.1:8765/tests'));
