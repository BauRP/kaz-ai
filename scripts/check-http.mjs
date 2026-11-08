import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';

const hostname='127.0.0.1';
const port=8798;
const origin='http://'+hostname+':'+port;
const child=spawn('node',['./node_modules/wrangler/bin/wrangler.js','dev','--local','--ip',hostname,'--port',String(port)],{
  stdio:['ignore','pipe','pipe'],
  env:{...process.env,WRANGLER_SEND_METRICS:'false'}
});
let output='',settled=false;
for(const stream of [child.stdout,child.stderr])stream.on('data',d=>{output=(output+d.toString()).slice(-9000)});
const sleep=n=>new Promise(r=>setTimeout(r,n));
async function poll(){
  for(let i=0;i<45;i++){
    if(child.exitCode!==null)throw Error('Cloudflare local server exited: '+output);
    try{
      const response=await fetch(origin+'/robots.txt',{signal:AbortSignal.timeout(1500)});
      if(response.ok)return;
    }catch{}
    await sleep(350);
  }
  throw Error('Cloudflare local server did not start: '+output);
}
const get=async path=>fetch(origin+path,{redirect:'manual',signal:AbortSignal.timeout(5000)});
try{
  await poll();
  const root=await get('/');
  assert.equal(root.status,200,'HTML homepage');
  assert.match(await root.text(),/Kaz AI/);
  for(const path of ['/about/','/capabilities/','/questions/','/privacy/','/kk/','/en/','/ai-chat/','/ai-images/','/help/']){
    const response=await get(path);
    assert.equal(response.status,200,'Static page '+path);
    const text=await response.text();
    assert.match(text,/<h1>/,'Static text without JS on '+path);
    assert.doesNotMatch(text,/<script\b/);
  }
  const help=await get('/help/');
  assert.equal(help.status,200);
  assert.match(help.headers.get('x-robots-tag')||'',/noindex/);
  assert.match(await help.text(),/Помощь/);
  const missing=await get('/not-a-real-kaz-ai-page-12345');
  assert.equal(missing.status,404,'Nonexistent routes cannot be a soft-404 homepage');
  assert.match(await missing.text(),/Страница не найдена/);
  const robots=await get('/robots.txt');
  assert.equal(robots.status,200);
  const robotsText=await robots.text();
  assert.match(robotsText,/Disallow: \/api\//);
  assert.ok(robotsText.includes(origin+'/sitemap.xml'));
  const sitemap=await get('/sitemap.xml');
  assert.equal(sitemap.status,200);
  const sitemapText=await sitemap.text();
  assert.equal((sitemapText.match(/<loc>/g)||[]).length,9);
  assert.ok(sitemapText.includes(origin+'/ai-chat/'));
  assert.ok(sitemapText.includes(origin+'/ai-images/'));
  assert.ok(!sitemapText.includes('/help/'));
  assert.ok(sitemapText.includes(origin+'/kk/'));
  const previewRedirect=await get('/preview.html');
  assert.ok([200,301,302,307,308].includes(previewRedirect.status),'Preview response or canonical redirect');
  const preview=await fetch(origin+'/preview.html',{redirect:'follow',signal:AbortSignal.timeout(5000)});
  assert.equal(preview.status,200);
  assert.match(preview.headers.get('x-robots-tag')||'',/noindex/);
  assert.match(await preview.text(),/<meta name="robots" content="noindex,follow">/);
  const api=await get('/api/chat');
  assert.equal(api.status,405,'Unconfigured AI endpoint must not return real responses to GET');
  console.log('HTTP checks passed: 9 static pages incl. Help, sitemap with 9 search pages, robots, true 404, preview/help noindex, protected API.');
}finally{
  child.kill('SIGTERM');
  await sleep(200);
  if(child.exitCode===null)child.kill('SIGKILL');
}
