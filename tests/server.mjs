import {createServer} from 'node:http';
import {readFileSync,createReadStream,existsSync} from 'node:fs';
const root=new URL('../',import.meta.url);
createServer((req,res)=>{
  if(req.url==='/fixture.mp4'||req.url==='/fixture-distinct.mp4'){
    const path=new URL('../../fixtures/'+(req.url==='/fixture.mp4'?'13min.mp4':'13min-distinct.mp4'),import.meta.url);
    if(!existsSync(path)){res.writeHead(404);res.end('fixture missing');return}
    res.setHeader('Content-Type','video/mp4');createReadStream(path).pipe(res);return;
  }
  let html=readFileSync(new URL('index.html',root),'utf8');
  if(req.url==='/tests')html=html.replace("connect-src 'none'","connect-src 'self'").replace('</script></body>',readFileSync(new URL('browser.js',import.meta.url),'utf8')+'\n'+readFileSync(new URL('browser-recovery.js',import.meta.url),'utf8')+'</script></body>');
  res.setHeader('Content-Type','text/html; charset=utf-8');res.end(html);
}).listen(8765,'127.0.0.1',()=>console.log('http://127.0.0.1:8765/tests'));
