import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {inflateSync} from 'node:zlib';
import worker from '../src/index.js';
const routes=['about','capabilities','questions','privacy','kk','en','ai-chat','ai-images'];
const file=name=>readFileSync('public/'+name,'utf8');
const main=file('index.html');
const preview=file('preview.html');
const config=JSON.parse(readFileSync('wrangler.jsonc','utf8'));

test('eight crawlable pages render substantial body content without scripts',()=>{
  for(const route of routes){
    const text=file(route+'/index.html');
    assert.match(text,/^<!doctype html>/i);
    assert.match(text,/<title>[^<]{14,}<\/title>/);
    assert.match(text,/<meta name="description" content="[^"]{70,}"/);
    assert.match(text,/<main\b[^>]*>[\s\S]+<h1>[^<]+<\/h1>/);
    assert.ok((text.match(/<p[\s>]/g)||[]).length>=4,'not enough informative paragraphs: '+route);
    assert.doesNotMatch(text,/<script\b|<style\b[^>]*hidden/i,'Static pages must require no JavaScript');
    assert.match(text,/href="\.\.\/"/,'Back to actual app');
    assert.match(text,/href="\.\.\/info\.css"/);
    assert.doesNotMatch(text,/https?:\/\/(?:example\.com|localhost)/,'Do not invent a public domain');
  }
});
test('site exposes crawlable links to static information pages',()=>{
  assert.match(main, /data-screen="about" class="nav-item about-nav-link"/);
  assert.match(main,/id="view-about"/);
  assert.doesNotMatch(main,/seo-home-intro|seo-home-links|info-links/);
  assert.match(main,/<meta name="description"/);
  assert.match(main,/<title>Kaz AI — Казахстанский искусственный интеллект онлайн<\/title>/);
  const about=file('about/index.html');
  assert.match(about,/148,83 миллиарда параметров/);
  assert.match(about,/116,83 миллиарда параметров/);
  assert.match(about,/149 миллиардов параметров в двух отдельных моделях/);
  assert.match(about,/FLUX\.2 dev/);
  assert.match(about,/href="\.\.\/help\/"/);
  for(const route of routes)assert.ok(file(route+'/index.html').includes('href="../about/"'),'Missing static About link: '+route);
  assert.match(main,/<meta property="og:title"/);
  // The owner explicitly approved an empty welcome center. The chatbot
  // controls and sidebar branding must remain, but the old hero title must not return.
  const welcome=main.match(/<section id="view-welcome"[^>]*>([\s\S]*?)<\/section>/);
  assert.ok(welcome,'Welcome screen retained');
  assert.equal(welcome[1].trim(),'','Approved welcome center stays empty');
  assert.match(main,/class="brand-wordmark">Kaz <b>AI<\/b>/,'Sidebar branding retained');
  assert.match(main,/id="messageInput"/,'Chat retained');
  assert.match(main,/data-action="toggle-reason"/,'Reasoning control retained');
});

test('social previews expose the canonical Kaz AI logo without JavaScript',()=>{
  const origin='https://kaz-ai.tengrize.workers.dev',image=origin+'/kaz-ai-share.png';
  assert.ok(main.includes('<meta property="og:url" content="'+origin+'/">'));
  assert.ok(main.includes('<meta property="og:image" content="'+image+'">'));
  assert.ok(main.includes('<meta property="og:image:secure_url" content="'+image+'">'));
  assert.ok(main.includes('<meta property="og:image:type" content="image/png">'));
  assert.ok(main.includes('<meta property="og:image:width" content="1200">'));
  assert.ok(main.includes('<meta property="og:image:height" content="630">'));
  assert.ok(main.includes('<meta name="twitter:card" content="summary_large_image">'));
  assert.ok(main.includes('<meta name="twitter:image" content="'+image+'">'));
  assert.ok(preview.includes('<meta property="og:image" content="'+image+'">'));
});
test('the WhatsApp social image is a compact valid PNG with readable image data',()=>{
  const image=readFileSync('public/kaz-ai-share.png');
  assert.ok(image.byteLength<300_000);
  assert.equal(image.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  assert.equal(image.subarray(12,16).toString(),'IHDR');
  assert.equal(image.readUInt32BE(16),1200);
  assert.equal(image.readUInt32BE(20),630);
  assert.equal(image[24],8);
  assert.equal(image[25],3);
  let pos=8,idat=[];
  while(pos<image.length){
    const len=image.readUInt32BE(pos),tag=image.subarray(pos+4,pos+8).toString();
    if(tag==='IDAT')idat.push(image.subarray(pos+8,pos+8+len));
    pos+=12+len;
    if(tag==='IEND')break;
  }
  const pixels=inflateSync(Buffer.concat(idat));
  assert.equal(pixels.length,630*1201);
  assert.equal(pixels[0],2);
});

test('preview is noindex and not a duplicate public search result',()=>{
  assert.match(preview,/<meta name="robots" content="noindex,follow">/);
  assert.doesNotMatch(main,/<meta name="robots" content="noindex/);
  assert.match(file('404.html'),/<meta name="robots" content="noindex/);
});
test('real 404 handler and pretty static routes configured',()=>{
  assert.equal(config.assets.not_found_handling,'404-page');
  assert.equal(config.assets.html_handling,'auto-trailing-slash');
  assert.ok(config.assets.run_worker_first.includes('/robots.txt'));
  assert.ok(config.assets.run_worker_first.includes('/sitemap.xml'));
  assert.ok(config.assets.run_worker_first.includes('/api/*'));
});
test('sitemap has only real HTML URLs at the current origin',async()=>{
  const origin='https://kazai-check.example.test';
  const response=await worker.fetch(new Request(origin+'/sitemap.xml'),{});
  assert.equal(response.status,200);
  assert.match(response.headers.get('content-type'),/application\/xml/);
  const xml=await response.text();
  assert.match(xml,/^<\?xml version="1\.0" encoding="UTF-8"\?>\n<urlset /);
  for(const route of ['/',...routes.map(x=>'/'+x+'/')]){
    assert.ok(xml.includes('<loc>'+origin+route+'</loc>'),'Missing '+route);
  }
  assert.equal((xml.match(/<loc>/g)||[]).length,9);
  assert.doesNotMatch(xml,/\/help\/|{{SITE_ORIGIN}}/);
  assert.doesNotMatch(xml,/preview\.html|\/api\/chat|404\.html/);
});
test('robots allows reading preview noindex while excluding API',async()=>{
  const origin='https://kazai-check.example.test';
  const response=await worker.fetch(new Request(origin+'/robots.txt'),{});
  assert.equal(response.status,200);
  assert.match(response.headers.get('content-type'),/text\/plain/);
  const robots=await response.text();
  assert.match(robots,/^User-agent: \*\nAllow: \/\n/);
  assert.match(robots,/Disallow: \/api\/\n/);
  assert.doesNotMatch(robots,/Disallow: \/preview\.html/);
  assert.ok(robots.includes('Sitemap: '+origin+'/sitemap.xml\n'));
});

test('safe static security headers protect information pages without breaking chat scripts',()=>{
  const headers=file('_headers');
  assert.match(headers,/X-Content-Type-Options: nosniff/);
  assert.match(headers,/Referrer-Policy: strict-origin-when-cross-origin/);
  assert.match(headers,/\/preview\.html\s+X-Robots-Tag: noindex, follow/);
  for(const route of routes)assert.ok(headers.includes('/'+route+'/*'),'Missing CSP for '+route);
  assert.match(headers,/script-src 'none'/);
  const generalSection=headers.split('/preview.html')[0];
  assert.doesNotMatch(generalSection,/Content-Security-Policy:/,'Do not block live app scripts globally');
  assert.doesNotMatch(generalSection,/microphone=\(\)|camera=\(\)/,'Do not disable planned future media globally');
});

test('repository sitemap.xml and robots.txt templates match real Worker routes',()=>{
  const sitemap=readFileSync('seo/sitemap.xml','utf8');
  const robots=readFileSync('seo/robots.txt','utf8');
  assert.match(sitemap,/^\<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(sitemap,/{{SITE_ORIGIN}}/);
  assert.match(robots,/^# Reference template/);
  assert.match(robots,/Disallow: \/api\//);
  for(const path of ['/',...routes.map(x=>'/'+x+'/')]){
    assert.ok(sitemap.includes('<loc>{{SITE_ORIGIN}}'+path+'</loc>'),path);
  }
  assert.doesNotMatch(sitemap,/\/help\//);
});
test('about and capabilities explain separate AI models and Help is a reachable nonindex placeholder',()=>{
  for(const path of ['about','capabilities','ai-images']){
    const page=file(path+'/index.html');
    if(path==='about'){
      assert.match(page,/148,83 миллиарда параметров/);
      assert.match(page,/116,83 млрд параметров/);
      assert.match(page,/32 млрд параметров/);
      assert.match(page,/а не одна нейросеть такого размера/);
    }else{
      assert.match(page,/149 млрд/);
      assert.match(page,/117 млрд/);
      assert.match(page,/32 млрд/);
      assert.match(page,/не (?:одна|единая) (?:модель|нейросеть)/i);
    }
  }
  const about=file('about/index.html');
  assert.match(about,/Помощь пользователям Kaz AI/);
  assert.match(about,/href="\.\.\/help\/"/);
  const help=file('help/index.html');
  assert.match(help,/<h1>Помощь<\/h1>/);
  assert.match(help,/name="robots" content="noindex,follow"/);
  assert.match(help,/href="\.\.\/"/);
  assert.doesNotMatch(help,/<script\b/);
  assert.match(file('_headers'),/\/help\/\*\s+X-Robots-Tag: noindex, follow/);
});
