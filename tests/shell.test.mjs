import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
const html = readFileSync('public/index.html','utf8');
const css = readFileSync('public/styles.css','utf8');
const js = readFileSync('public/app.js','utf8');
const config = JSON.parse(readFileSync('wrangler.jsonc','utf8'));
test('Cloudflare static assets point at public directory', () => {assert.equal(config.assets.directory,'./public');assert.equal(config.name,'kaz-ai');});
test('main shell screens present',()=>{for(const id of ['welcome','chat','history','projects','tools','settings'])assert.match(html,new RegExp('id="view-'+id+'"'));});
test('composer has real accessible controls',()=>{for(const id of ['messageInput','sendButton','attachToggle','reasonToggle'])assert.match(html,new RegExp('id="'+id+'"'));assert.match(html,/aria-label="Отправить сообщение"/);assert.match(html,/ic-arrow/);assert.doesNotMatch(html,/telegram\.org/i);});
test('all 44 planned functions, without sharing conversation',()=>{const matches=Array.from(js.matchAll(/\[([0-9]+),"/g),x=>Number(x[1]));assert.equal(matches.length,44);assert.equal(new Set(matches).size,44);assert.ok(!matches.includes(12));assert.ok(!matches.includes(26));assert.ok(matches.includes(46));});
test('four levels visible, deep stays locked',()=>{for(const key of ['low','medium','high','deep'])assert.match(js,new RegExp(key+':\\{name:'));assert.match(js,/value==="deep"/);assert.match(html,/data-feature="deep-reason"/);});
test('no accidental live AI, Google or data persistence',()=>{assert.doesNotMatch(js,/fetch\s*\(|localStorage|sessionStorage|indexedDB|google\.accounts|workers\.ai/i);assert.match(html,/Демо интерфейса/);assert.match(js,/никакие данные аккаунта не запрашиваются/);});
test('responsive layouts including phones and reduced motion',()=>{assert.match(css,/@media\(max-width:760px\)/);assert.match(css,/@media\(max-width:390px\)/);assert.match(css,/prefers-reduced-motion/);assert.match(css,/safe-area-inset-bottom/);});
test('no external CDN or remote script injection',()=>{assert.doesNotMatch(html,/<script[^>]+src="https?:/);assert.doesNotMatch(html,/<link[^>]+href="https?:/);assert.doesNotMatch(js,/innerHTML\s*=/);});

test('reason selector initialization uses a collection of buttons',()=>{
  assert.ok(js.includes('$$("[data-reason=medium]").forEach('));
  assert.ok(!js.includes('; $("[data-reason=medium]").forEach('));
  assert.ok(!js.includes(';$("[data-reason=medium]").forEach('));
});

test('custom Kaz AI wordmark is styled and language slogan removed',()=>{
  const preview = readFileSync('public/preview.html','utf8');
  for(const page of [html,preview]){
    assert.doesNotMatch(page,/Ваш помощник на казахском, русском и английском языках/);
    assert.match(page,/class="hero-wordmark"/);
    assert.match(page,/class="brand-wordmark"/);
  }
  assert.match(css,/hero-copy h1\.hero-wordmark/);
  assert.match(css,/body\.light \.hero-copy h1\.hero-wordmark/);
  assert.match(preview,/<style>[\s\S]*?hero-wordmark/);
  assert.match(preview,/<script>[\s\S]*?FEATURE_GROUPS/);
});

test('photographic Earth design remains separate from functioning UI',()=>{
 const preview=readFileSync('public/preview.html','utf8');
 assert.match(html,/class="earth-sphere"/);
 assert.match(html,/class="hero-logo-line"/);
 assert.doesNotMatch(html,/id="earthFill"/);
 assert.match(css,/url\("\.\/earth\.webp"\)/);
 assert.match(preview,/url\("\.\/earth\.webp"\)/);
 assert.doesNotMatch(html,/Ваш помощник на казахском, русском и английском языках/);
 assert.doesNotMatch(html,/class="feature-cards"/);
});

test('cinematic Earth is not a clipped photographic strip',()=>{
 const preview=readFileSync('public/preview.html','utf8');
 assert.match(html,/class="earth-sphere"/);
 assert.match(css,/\.earth-photo\{[\s\S]*?height:100%/);
 assert.match(css,/mask-image:linear-gradient\(to bottom/);
 assert.match(html,/class="kaz-corner kaz-corner-tl"/);
 assert.match(html,/class="orbit-ribbon"/);
 assert.doesNotMatch(html,/Интеллект нового поколения/);
 assert.doesNotMatch(html,/Ваш помощник на казахском, русском и английском языках/);
 assert.ok(preview.includes('earth-photo'));
});

test('standalone preview preserves exact active CSS and JavaScript',()=>{
  const preview=readFileSync('public/preview.html','utf8');
  assert.ok(preview.includes(css),'Preview must contain the current stylesheet without modification');
  assert.ok(preview.includes(js),'Preview must contain the current JavaScript without modification');
  assert.ok(js.includes('$$("[data-reason=medium]").forEach'),'Startup must select a collection');
  assert.ok(preview.includes('$$("[data-reason=medium]").forEach'),'Preview must keep double-dollar selector');
});
test('design preview provides interactive menus and an accessible Google dialog',()=>{
  const preview=readFileSync('public/preview.html','utf8');
  for(const id of ['languageToggle','languageMenu','settingsLanguageToggle','settingsLanguageMenu','fontMenu','googleOverlay','googleDialogTitle','reasonMenu','attachMenu']){
    assert.match(html,new RegExp('id="'+id+'"'));
    assert.match(preview,new RegExp('id="'+id+'"'));
  }
  assert.match(html,/data-language="ru"/);
  assert.match(html,/data-language="kk"/);
  assert.match(html,/data-language="en"/);
  assert.match(html,/data-font="large"/);
  assert.match(html,/data-action="google-demo"/);
  assert.match(js,/function openGoogle\(/);
  assert.match(js,/function selectLanguage\(/);
  assert.match(js,/function selectFont\(/);
  assert.match(css,/body:not\(\.light\) \.view-welcome/);
  assert.match(css,/\.view-welcome \.hero-visual\{display:none!important\}/);
});

test('safely bundled session features are present without persistent storage',()=>{
  const session=readFileSync('public/session.js','utf8');
  const preview=readFileSync('public/preview.html','utf8');
  assert.ok(html.includes('src="./session.js"'));
  assert.ok(preview.includes(session),'Preview session code must exactly match live session module');
  const i18n=readFileSync('public/i18n.js','utf8');
  assert.ok(preview.includes(i18n),'Preview localization code must exactly match live module');
  assert.match(html,/src="\.\/i18n\.js"/);
  assert.ok(preview.includes(js),'Preview shell script must exactly match live shell module');
  assert.ok(preview.includes(css),'Preview styles must exactly match live styles');
  assert.doesNotMatch(session,/localStorage|sessionStorage|indexedDB|document\.cookie/);
  assert.match(session,/function renderSessionProjects\(/);
  assert.match(session,/function renderSessionHistory\(/);
  assert.match(session,/function showCalculator\(/);
  assert.match(session,/function configureAccess\(/);
  assert.match(session,/!c\.temporary/);
});
test('GPT-OSS route is server-side and requires private access key',()=>{
  const worker=readFileSync('src/index.js','utf8');
  const config=JSON.parse(readFileSync('wrangler.jsonc','utf8'));
  assert.equal(config.main,'./src/index.js');
  assert.equal(config.ai.binding,'AI');
  assert.deepEqual(config.assets.run_worker_first,['/api/*']);
  assert.match(worker,/env\.KAZ_AI_ACCESS_KEY/);
  assert.match(worker,/@cf\/openai\/gpt-oss-120b/);
  assert.doesNotMatch(html,/KAZ_AI_ACCESS_KEY|CLOUDFLARE_API_TOKEN/);
  assert.doesNotMatch(readFileSync('public/preview.html','utf8'),/CLOUDFLARE_API_TOKEN/);
});
