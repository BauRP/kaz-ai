import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import worker from '../src/index.js';
const routes=['about','capabilities','questions','privacy','kk','en'];
const file=name=>readFileSync('public/'+name,'utf8');
const main=file('index.html');
const preview=file('preview.html');
const config=JSON.parse(readFileSync('wrangler.jsonc','utf8'));

test('six crawlable pages render substantial body content without scripts',()=>{
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
  assert.match(main,/<nav class="info-links"/);
  for(const route of routes)assert.ok(main.includes('href="./'+route+'/"'),'Missing crawler link: '+route);
  assert.match(main,/<meta name="description"/);
  assert.match(main,/<meta property="og:title"/);
  assert.match(main,/<h1 class="hero-wordmark"/,'Do not replace chatbot design');
  assert.match(main,/id="messageInput"/,'Chat retained');
  assert.match(main,/data-action="toggle-reason"/,'Reasoning control retained');
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
  assert.equal((xml.match(/<loc>/g)||[]).length,7);
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
