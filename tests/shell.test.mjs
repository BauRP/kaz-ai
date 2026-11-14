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
test('41 active tool entries exclude explicitly removed message actions',()=>{const matches=Array.from(js.matchAll(/\[([0-9]+),"/g),x=>Number(x[1]));assert.equal(matches.length,41);assert.equal(new Set(matches).size,41);for(const n of [8,11,12,14,26])assert.ok(!matches.includes(n),'Removed action '+n);assert.ok(matches.includes(46));assert.match(html,/<span class="nav-count">41<\/span>/);});
test('four levels visible, deep stays locked',()=>{for(const key of ['low','medium','high','deep'])assert.match(js,new RegExp(key+':\\{name:'));assert.match(js,/value==="deep"/);assert.match(html,/data-feature="deep-reason"/);});
test('no accidental live AI, Google or data persistence',()=>{assert.doesNotMatch(js,/fetch\s*\(|localStorage|sessionStorage|indexedDB|google\.accounts|workers\.ai/i);assert.match(html,/История временная/);assert.match(js,/никакие данные аккаунта не запрашиваются/);});
test('responsive layouts including phones and reduced motion',()=>{assert.match(css,/@media\(max-width:760px\)/);assert.match(css,/@media\(max-width:390px\)/);assert.match(css,/prefers-reduced-motion/);assert.match(css,/safe-area-inset-bottom/);});
test('no external CDN or remote script injection',()=>{assert.doesNotMatch(html,/<script[^>]+src="https?:/);assert.doesNotMatch(html,/<link[^>]+href="https?:/);assert.doesNotMatch(js,/innerHTML\s*=/);});

test('reason selector initialization uses a collection of buttons',()=>{
  assert.ok(js.includes('$$("[data-reason]").forEach('));
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
  assert.ok(js.includes('$$("[data-reason]").forEach'),'Startup must select a collection');
  assert.ok(preview.includes('$$("[data-reason]").forEach'),'Preview must keep double-dollar selector');
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
  assert.deepEqual(config.assets.run_worker_first,['/api/*','/robots.txt','/sitemap.xml']);
  assert.match(worker,/env\.KAZ_AI_ACCESS_KEY/);
  assert.match(worker,/@cf\/openai\/gpt-oss-120b/);
  assert.doesNotMatch(html,/KAZ_AI_ACCESS_KEY|CLOUDFLARE_API_TOKEN/);
  assert.doesNotMatch(readFileSync('public/preview.html','utf8'),/CLOUDFLARE_API_TOKEN/);
});

test('About navigation is after Settings and the chat welcome has no SEO article',()=>{
  const settings=html.indexOf('data-screen="settings" class="nav-item"');
  const about=html.indexOf('data-screen="about" class="nav-item about-nav-link"');
  assert.ok(settings>0&&about>settings);
  assert.match(html,/data-screen="about" class="nav-item about-nav-link"/);
  assert.match(html,/id="view-about"/);
  assert.match(html,/id="aboutHelp"/);
  assert.doesNotMatch(html, /target="_blank"/);
  assert.doesNotMatch(html,/seo-home-intro|seo-home-links|info-links/);
  assert.doesNotMatch(css,/\.seo-home-intro\s*\{/);
  const aboutText=readFileSync('public/about/index.html','utf8');
  for(const word of ['116,83 миллиарда параметров','148,83 миллиарда параметров','Kaz AI Ultra','Kaz AI Vision','FLUX.2 dev']){assert.ok(aboutText.includes(word),'Static About: '+word);assert.ok(html.includes(word),'In-app About: '+word)}
  assert.ok(aboutText.includes('Помощь пользователям Kaz AI'));
});
test('user messages no longer render copy, edit or reply buttons',()=>{
  const session=readFileSync('public/session.js','utf8');
  for(const obsolete of ['copy-message','edit-message','branch-message','function copyValue','Ответвить']){
    assert.ok(!session.includes(obsolete),'Obsolete action remains: '+obsolete);
  }
  assert.match(session,/if\(message\.role==="assistant"\)\{/);
  assert.doesNotMatch(session,/if\(message\.role==="user"\)actions/);
  assert.match(session,/retry-answer/);
});

test('About introduces the Kazakhstan platform honestly and preserves full approved manifesto',()=>{
  const standalone=readFileSync('public/about/index.html','utf8');
  const preview=readFileSync('public/preview.html','utf8');
  const first='Kaz AI — создаваемый в Казахстане веб-сервис для общения с искусственным интеллектом. Он задуман для вопросов, подготовки текстов, переводов, программирования, обучения и помощи с документами.';
  const added='Он также задуман как пространство, где идеи превращаются в новые знания, полезные решения и собственные проекты.';
  const markers=[
    'Казахстанский искусственный интеллект нового поколения',
    'Интеллект. Технологии. Возможности будущего.',
    '116,83 миллиарда параметров','5,13 млрд','32 миллиарда параметров',
    '148,83 миллиарда параметров','Mixture of Experts (MoE)',
    'разработанной OpenAI','разработанной Black Forest Labs',
    'Технологическая основа','Масштаб технологий Kaz AI',
    'Возможности и развитие','Разработано в Казахстане','Текущий этап развития',
    'настоящие ответы нейросети пока не подключены',
    'Реализация зависит от технических возможностей и условий лицензирования.',
    'Большие технологии начинаются с больших идей.'
  ];
  for(const page of [html,standalone,preview]){
    assert.ok(page.includes(first));
    assert.ok(page.includes(added));
    for(const value of markers)assert.ok(page.includes(value),'Missing About text: '+value);
    assert.ok(!page.includes('ИИ для текста и изображений</h2>'));
    assert.ok(!page.includes('Kaz AI — создаваемый в Казахстане веб-сервис для общения с искусственным интеллектом на русском'));
  }
  assert.ok(html.includes('data-screen="about" class="nav-item about-nav-link"'));
  assert.ok(!html.includes('target="_blank"'));
  assert.match(standalone,/<section id="help">/);
});

test('the basic calculator is isolated from chat state and bundled before the session',()=>{
  const calculator=readFileSync('public/calculator.js','utf8');
  const preview=readFileSync('public/preview.html','utf8');
  assert.match(html,/<script src="\.\/calculator\.js" defer><\/script>\s*<script src="\.\/session\.js" defer><\/script>/);
  assert.ok(preview.includes(calculator));
  assert.ok(calculator.includes('window.KazCalculator=Object.freeze({compute,format})'));
  assert.doesNotMatch(calculator,/\beval\s*\(|\bFunction\s*\(|\bfetch\s*\(|localStorage|sessionStorage|indexedDB/);
});

test('Lotus favicon is a real transparent PNG used by live and preview tabs',()=>{
  const favicon=readFileSync('public/favicon.png');
  assert.ok(favicon.length>500&&favicon.length<20000,'Small optimized favicon expected');
  assert.equal(favicon.subarray(0,8).toString('hex'),'89504e470d0a1a0a','PNG magic header');
  assert.equal(favicon.readUInt32BE(16),64,'favicon width');
  assert.equal(favicon.readUInt32BE(20),64,'favicon height');
  assert.match(html,/<link rel="icon" href="\.\/favicon\.png" type="image\/png" sizes="64x64">/);
  const preview=readFileSync('public/preview.html','utf8');
  assert.match(preview,/<link rel="icon" href="\.\/favicon\.png" type="image\/png" sizes="64x64">/);
  assert.doesNotMatch(preview,/data:image\/svg\+xml,%3Csvg/,'Remove empty preview icon');
});
