import {test as nodeTest} from 'node:test';
// Browser hangs must surface as a failed test, not block CI indefinitely.
const test=(name,fn)=>nodeTest(name,{timeout:35000},fn);
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const appUrl = pathToFileURL(resolve('public/preview.html')).href;

test('real browser: interactive Kaz AI design preview', async () => {
  const chromePath = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find(existsSync);
  const browser = await chromium.launch({
    ...(chromePath ? { executablePath: chromePath } : { channel: 'chrome' }),
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(appUrl);
    assert.equal(await page.locator('#view-welcome').isVisible(), true);
    assert.equal(await page.locator('#view-settings').isVisible(), false);

    await page.locator('#reasonToggle').click();
    assert.equal(await page.locator('#reasonMenu').isVisible(), true);
    assert.equal(await page.locator('#reasonMenu [data-reason]').count(), 3);
    assert.equal(await page.locator('#reasonMenu [data-feature="deep-reason"]').count(), 1);
    await page.locator('#reasonMenu [data-reason="high"]').click();
    assert.equal(await page.locator('#currentReason').textContent(), 'Высокий');

    await page.locator('#languageToggle').click();
    assert.equal(await page.locator('#languageMenu').isVisible(), true);
    await page.locator('#languageMenu [data-language="kk"]').click();
    assert.equal(await page.locator('#languageToggle .language-current').textContent(), 'Қазақша');

    await page.locator('#attachToggle').click();
    assert.equal(await page.locator('#attachMenu').isVisible(), true);
    await page.locator('#attachMenu [data-feature="file"]').click();
    assert.equal(await page.locator('#modalOverlay').isVisible(), true);
    await page.locator('#modalOverlay [data-action="close-modal"]').first().click();
    assert.equal(await page.locator('#modalOverlay').isVisible(), false);

    await page.locator('.sidebar .google-button').click();
    assert.equal(await page.locator('#googleOverlay').isVisible(), true);
    await page.locator('[data-action="google-demo"]').click();
    assert.equal(await page.locator('#googleOverlay').isVisible(), true);
    await page.locator('[data-action="close-google"]').first().click();
    assert.equal(await page.locator('#googleOverlay').isVisible(), false);

    await page.locator('.sidebar [data-screen="settings"]').click();
    assert.equal(await page.locator('#view-settings').isVisible(), true);
    await page.locator('#fontToggle').click();
    assert.equal(await page.locator('#fontMenu').isVisible(), true);
    await page.locator('[data-font="large"]').click();
    assert.equal(await page.locator('body').getAttribute('class'), 'font-large');
    await page.locator('#settingsLanguageToggle').click();
    assert.equal(await page.locator('#settingsLanguageMenu').isVisible(), true);
    await page.locator('#settingsLanguageMenu [data-language="en"]').click();
    assert.equal(await page.locator('#settingsLanguageToggle .language-current').textContent(), 'English');

    for (const screen of ['history', 'projects', 'tools', 'settings']) {
      await page.locator('.sidebar [data-screen="' + screen + '"]').click();
      assert.equal(await page.locator('#view-' + screen).isVisible(), true, 'navigation to ' + screen);
    }
    await page.locator('#messageInput').fill('Пример сообщения');
    await page.locator('#sendButton').click();
    assert.equal(await page.locator('#view-chat').isVisible(), true);
    assert.ok((await page.locator('#chatMessages').innerText()).includes('Пример сообщения'));
    assert.deepEqual(errors, []);

    const mobile = await browser.newPage({ viewport: { width: 390, height: 844 }, isMobile: true });
    const mobileErrors = [];
    mobile.on('pageerror', e => mobileErrors.push(e.message));
    await mobile.goto(appUrl);
    await mobile.locator('[data-action="toggle-sidebar"]').click();
    assert.equal(await mobile.locator('#sidebar').evaluate(el => el.classList.contains('open')), true);
    await mobile.locator('.sidebar [data-screen="settings"]').click();
    assert.equal(await mobile.locator('#view-settings').isVisible(), true);
    await mobile.locator('#reasonToggle').click();
    assert.equal(await mobile.locator('#reasonMenu').isVisible(), true);
    assert.deepEqual(mobileErrors, []);
    await mobile.close();
    await page.close();
  } finally {
    await browser.close();
  }
});

test('real browser: session chats, search, project folders, export and calculator', async () => {
  const chromePath = ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({
    ...(chromePath ? {executablePath:chromePath}:{channel:'chrome'}),
    headless:true,args:['--no-sandbox','--disable-dev-shm-usage']
  });
  try {
    const page=await browser.newPage({viewport:{width:1400,height:900},acceptDownloads:true});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(appUrl);
    assert.equal(await page.evaluate(()=>Boolean(window.KazSession)),true);
    await page.locator('#messageInput').fill('Моя первая тема');
    await page.locator('#sendButton').click();
    assert.equal((await page.evaluate(()=>window.KazSession.snapshot().threads)).length,1);
    assert.ok((await page.locator('#chatMessages').innerText()).includes('Моя первая тема'));
    await page.locator('#messageInput').fill('Второе сообщение проекта');
    await page.locator('#sendButton').click();
    assert.equal((await page.evaluate(()=>window.KazSession.snapshot().threads[0].messages)),2);
    const chatId=await page.evaluate(()=>window.KazSession.snapshot().threads[0].id);
    await page.locator('.sidebar [data-screen="history"]').click();
    await page.locator('#historySearch').fill('Второе сообщение проекта');
    assert.equal(await page.locator('#historyList .session-chat-row').count(),1);
    await page.locator('#historySearch').fill('не существует');
    assert.equal(await page.locator('#historyList .session-chat-row').count(),0);
    await page.locator('#historySearch').fill('');
    await page.locator('#historyList [data-session="rename-chat"]').click();
    await page.locator('#sessionBody input').fill('Тема для проекта');
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    assert.equal((await page.evaluate(()=>window.KazSession.snapshot().threads[0].title)),'Тема для проекта');
    await page.locator('#historyList [data-session="pin-chat"]').click();
    assert.equal((await page.evaluate(()=>window.KazSession.snapshot().threads[0].pinned)),true);
    await page.locator('.sidebar [data-screen="projects"]').click();
    await page.locator('[data-session="new-project"]').click();
    await page.locator('#sessionBody input').fill('Мои разработки');
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    assert.equal((await page.evaluate(()=>window.KazSession.snapshot().projects.length)),1);
    await page.locator('.sidebar [data-screen="history"]').click();
    await page.locator('#historyList [data-session="assign-chat"]').click();
    await page.locator('#sessionBody select').selectOption({index:1});
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    assert.ok((await page.evaluate(()=>window.KazSession.snapshot().threads[0].projectId)));
    await page.locator('.sidebar [data-screen="projects"]').click();
    assert.ok((await page.locator('#projectsWorkspace').innerText()).includes('Тема для проекта'));
    await page.locator('.sidebar [data-screen="history"]').click();
    await page.locator('#historyList [data-session="open-chat"]').click();
    assert.equal(await page.locator('#chatMessages .message-user').count(),2);
    assert.equal(await page.locator('#chatMessages .message-user .session-message-actions').count(),0);
    for(const action of ['copy-message','edit-message','branch-message'])assert.equal(await page.locator('[data-session="'+action+'"]').count(),0);
    assert.equal((await page.evaluate(()=>window.KazSession.snapshot().threads)).length,1);
    await page.locator('.sidebar [data-screen="settings"]').click();
    await page.locator('[data-feature="instructions"]').click();
    await page.locator('#sessionBody textarea').fill('Отвечай просто');
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    await page.locator('.sidebar [data-screen="tools"]').click();
    await page.locator('#toolGroups [data-feature="tool-25"]').click();
    await page.locator('#sessionBody input').fill('(10+5)*2');
    await page.locator('#sessionBody [data-session="calc-run"]').click();
    assert.ok((await page.locator('.session-calc-output').innerText()).includes('30'));
    await page.locator('#sessionClose').click();
    assert.equal(await page.evaluate(()=>window.KazSession.compute('3+4*2')),11);
    await page.locator('.sidebar [data-screen="settings"]').click();
    await page.locator('#sessionTemporary').check();
    assert.equal((await page.evaluate(()=>window.KazSession.snapshot().active)),null);
    await page.locator('#messageInput').fill('Временный текст');
    await page.locator('#sendButton').click();
    await page.locator('.sidebar [data-screen="history"]').click();
    assert.ok(!(await page.locator('#historyList').innerText()).includes('Временный текст'));
    assert.deepEqual(errors,[]);
    await page.close();
  }finally{await browser.close()}
});

test('real browser: Russian English Kazakh navigation and safe temporary chats', async () => {
  const chromePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({
    ...(chromePath?{executablePath:chromePath}:{channel:'chrome'}),
    headless:true,args:['--no-sandbox','--disable-dev-shm-usage']
  });
  try{
    const page=await browser.newPage({viewport:{width:1280,height:800}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(appUrl);
    await page.locator('#languageToggle').click();
    await page.locator('#languageMenu [data-language="en"]').click();
    assert.equal(await page.locator('.primary-nav [data-screen="history"] span').first().innerText(),'Chats');
    assert.equal(await page.locator('#messageInput').getAttribute('placeholder'),'Type a message...');
    await page.locator('.sidebar [data-screen="settings"]').click();
    assert.equal(await page.locator('#settingsHeading').innerText(),'Settings');
    await page.locator('#settingsLanguageToggle').click();
    await page.locator('#settingsLanguageMenu [data-language="kk"]').click();
    assert.equal(await page.locator('.primary-nav [data-screen="history"] span').first().innerText(),'Чаттар');
    assert.equal(await page.locator('#settingsHeading').innerText(),'Баптаулар');
    assert.equal(await page.locator('#messageInput').getAttribute('placeholder'),'Хабарлама жазыңыз...');
    await page.locator('#settingsLanguageToggle').click();
    await page.locator('#settingsLanguageMenu [data-language="ru"]').click();
    assert.equal(await page.locator('#settingsHeading').innerText(),'Настройки');

    await page.locator('#sessionTemporary').check();
    await page.locator('#messageInput').fill('Секретный временный вопрос');
    await page.locator('#sendButton').click();
    let current=await page.evaluate(()=>window.KazSession.snapshot());
    assert.equal(current.threads.filter(c=>c.temporary).length,1);
    await page.locator('.sidebar [data-screen="history"]').click();
    assert.ok(!(await page.locator('#historyList').innerText()).includes('Секретный временный вопрос'));
    await page.locator('.sidebar [data-action="new-chat"]').click();
    current=await page.evaluate(()=>window.KazSession.snapshot());
    assert.equal(current.threads.filter(c=>c.temporary).length,0);
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});

test('real browser: failed GPT answer retry preserves original reply until new response succeeds', async () => {
  const chromePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({
    ...(chromePath?{executablePath:chromePath}:{channel:'chrome'}),
    headless:true,args:['--no-sandbox','--disable-dev-shm-usage']
  });
  try{
    const page=await browser.newPage({viewport:{width:1200,height:800}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const html=readFileSync('public/preview.html','utf8');
    let calls=0;
    await page.route('https://kaz-ai.test/**',async route=>{
      const url=new URL(route.request().url());
      if(url.pathname==='/api/chat'){
        calls++;
        const payload=route.request().postDataJSON();
        assert.ok(['low','medium','high'].includes(payload.effort));
        assert.ok(route.request().headers().authorization.startsWith('Bearer '));
        if(calls===2)return route.fulfill({
          status:503,contentType:'application/json',
          body:JSON.stringify({code:'AI_UNAVAILABLE',message:'Тестовая ошибка ответа'})
        });
        return route.fulfill({
          status:200,contentType:'application/json',
          body:JSON.stringify({text:calls===1?'Первый успешный ответ':'Повторный успешный ответ'})
        });
      }
      return route.fulfill({status:200,contentType:'text/html',body:html});
    });
    await page.goto('https://kaz-ai.test/');
    await page.locator('#messageInput').fill('Первая задача');
    await page.locator('#sendButton').click();
    assert.equal(await page.locator('#sessionOverlay').isVisible(),true);
    await page.locator('#sessionBody input').fill('test-secret-1234567890123456789');
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    await page.waitForFunction(()=>document.querySelector('.message-assistant')?.textContent.includes('Первый успешный ответ'));
    await page.locator('[data-session="retry-answer"]').click();
    await page.waitForFunction(()=>document.querySelector('#statusBanner')?.textContent.includes('Тестовая ошибка ответа'));
    assert.ok((await page.locator('#chatMessages').innerText()).includes('Первый успешный ответ'),'failed retry must not delete previous answer');
    await page.locator('[data-session="retry-answer"]').click();
    await page.waitForFunction(()=>document.querySelector('.message-assistant')?.textContent.includes('Повторный успешный ответ'));
    assert.ok(!(await page.locator('#chatMessages').innerText()).includes('Первый успешный ответ'));
    for(const action of ['copy-message','edit-message','branch-message'])assert.equal(await page.locator('[data-session="'+action+'"]').count(),0);
    assert.equal(await page.locator('.message-user .session-message-actions').count(),0);
    assert.equal(calls,3);
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});

test('real browser: retry a failed request without duplicating question; cancel stale reply on new chat',async()=>{
  const chromePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({
    ...(chromePath?{executablePath:chromePath}:{channel:'chrome'}),
    headless:true,args:['--no-sandbox','--disable-dev-shm-usage']
  });
  try{
    const page=await browser.newPage({viewport:{width:1200,height:800}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    let count=0;
    const html=readFileSync('public/preview.html','utf8');
    await page.route('https://kaz-ai.test/**',async(route)=>{
      if(new URL(route.request().url()).pathname==='/api/chat'){
        count++;
        if(count===1)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'AI_UNAVAILABLE',message:'Временный сбой'})});
        if(count===2)return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({text:'Повтор удался'})});
        await new Promise(resolve=>setTimeout(resolve,700));
        try{return await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({text:'Запоздавший ответ'})})}catch{return}
      }
      return route.fulfill({status:200,contentType:'text/html',body:html});
    });
    await page.goto('https://kaz-ai.test/');
    await page.locator('#messageInput').fill('Задача после сбоя');
    await page.locator('#sendButton').click();
    await page.locator('#sessionBody input').fill('test-key-12345678901234567890123');
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    await page.locator('#sessionRetry').waitFor({state:'visible'});
    assert.equal((await page.evaluate(()=>window.KazSession.snapshot().threads[0].messages)),1);
    await page.locator('#sessionRetry').click();
    await page.waitForFunction(()=>document.querySelector('.message-assistant')?.textContent.includes('Повтор удался'));
    assert.equal((await page.evaluate(()=>window.KazSession.snapshot().threads[0].messages)),2);
    assert.equal(await page.locator('#sessionRetry').isVisible(),false);
    await page.locator('#messageInput').fill('Отменённый вопрос');
    await page.locator('#sendButton').click();
    await page.waitForFunction(()=>document.querySelector('#sessionStop')?.hidden===false);
    await page.locator('[data-action="new-chat"]').first().click();
    assert.equal(await page.locator('#sessionStop').isVisible(),false);
    await page.waitForTimeout(850);
    assert.equal(await page.locator('.message-assistant').count(),0);
    assert.deepEqual(errors,[]);
    assert.equal(count,3);
  }finally{await browser.close()}
});

test('keyboard modal: focus stays inside dialog and returns to opening control',async()=>{
  const executablePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({
    ...(executablePath?{executablePath}:{channel:'chrome'}),
    headless:true,args:['--no-sandbox','--disable-dev-shm-usage']
  });
  try{
    const page=await browser.newPage({viewport:{width:1200,height:780}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(appUrl);
    await page.locator('.sidebar [data-screen="settings"]').click();
    const trigger=page.locator('[data-feature="instructions"]');
    await trigger.click();
    assert.equal(await page.locator('#sessionOverlay').isVisible(),true);
    assert.equal(await page.locator('#sessionBody textarea').evaluate(el=>document.activeElement===el),true);
    await page.locator('#sessionBody [data-session="dialog-save"]').focus();
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('#sessionClose').evaluate(el=>document.activeElement===el),true);
    await page.keyboard.press('Shift+Tab');
    assert.equal(await page.locator('#sessionBody [data-session="dialog-save"]').evaluate(el=>document.activeElement===el),true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#sessionOverlay').isVisible(),false);
    assert.equal(await trigger.evaluate(el=>document.activeElement===el),true);
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});

test('SEO pages remain readable with JavaScript disabled and responsive layout',async()=>{
  const chromePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(chromePath?{executablePath:chromePath}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    for(const [pagePath,heading] of [
      ['about','Что такое Kaz AI'],['capabilities','Что умеет Kaz AI'],['questions','Частые вопросы'],
      ['privacy','Конфиденциальность'],['kk','Kaz AI дегеніміз не'],['en','What is Kaz AI'],
      ['ai-chat','ИИ-чат Kaz AI'],['ai-images','Создание и редактирование картинок'],['help','Помощь']
    ]){
      const page=await browser.newPage({viewport:{width:390,height:844},javaScriptEnabled:false});
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(pathToFileURL(resolve('public',pagePath,'index.html')).href);
      assert.ok((await page.locator('main').innerText()).includes(heading));
      assert.ok((await page.locator('main').innerText()).length>(pagePath==='help'?150:400),'Content must be informative, except deliberate Help placeholder: '+pagePath);
      assert.ok(await page.locator('main h1').isVisible());
      assert.equal(await page.locator('main script').count(),0);
      const widthInfo=await page.evaluate(()=>({page:document.documentElement.scrollWidth,viewport:window.innerWidth,offenders:Array.from(document.querySelectorAll('*')).map(el=>({tag:el.tagName,cl:el.className,txt:el.textContent?.slice(0,24),right:Math.round(el.getBoundingClientRect().right)})).filter(x=>x.right>window.innerWidth+1).slice(0,8)}));
      assert.equal(widthInfo.page<=widthInfo.viewport,true,pagePath+': '+JSON.stringify(widthInfo));
      assert.deepEqual(errors,[]);
      await page.close();
    }
  }finally{await browser.close()}
});

test('Kaz AI starts with a clean chat and opens About outside the conversation',async()=>{
  const chromePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(chromePath?{executablePath:chromePath}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    for(const viewport of [{width:1366,height:850},{width:390,height:844}]){
      const page=await browser.newPage({viewport});
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(appUrl);
      assert.equal(await page.title(),'Kaz AI — Казахстанский искусственный интеллект онлайн');
      assert.ok(await page.locator('.hero-wordmark').isVisible());
      assert.ok(await page.locator('#messageInput').isVisible());
      assert.equal(await page.locator('.seo-home-intro').count(),0);
      assert.equal(await page.locator('.info-links').count(),0);
      const nav=page.locator('.primary-nav .nav-item');
      assert.equal(await nav.last().innerText(),'О проекте');
      assert.equal(await nav.nth(3).innerText(),'Настройки');
      assert.equal(await nav.last().getAttribute('data-screen'),'about');
      assert.equal(await nav.last().getAttribute('target'),null);
      await page.locator('#messageInput').fill('Незаконченный черновик');
      if(viewport.width<760)await page.locator('[data-action="toggle-sidebar"]').click();
      await nav.last().click();
      assert.ok(await page.locator('#view-about').isVisible());
      assert.equal(await page.locator('#view-chat').isVisible(),false);
      assert.equal(await page.locator('.composer-region').isVisible(),false);
      assert.ok((await page.locator('#view-about').innerText()).includes('148,83 миллиарда параметров'));
      assert.ok((await page.locator('#view-about').innerText()).includes('Kaz AI Ultra'));
      assert.ok((await page.locator('#view-about').innerText()).includes('Kaz AI Vision'));
      await page.locator('#aboutHelp summary').click();
      assert.ok((await page.locator('.about-help-content').innerText()).includes('Инструкции'));
      await page.locator('[data-action="back-to-chat"]').click();
      assert.equal(await page.locator('#view-welcome').isVisible(),true);
      assert.ok(await page.locator('#messageInput').isVisible());
      assert.equal(await page.locator('#messageInput').inputValue(),'Незаконченный черновик');
      await page.locator('#messageInput').fill('Проверка интерфейса');
      await page.locator('#sendButton').click();
      assert.ok((await page.locator('#chatMessages').innerText()).includes('Проверка интерфейса'));
      assert.equal(await page.locator('.message-user .session-message-actions').count(),0);
      for(const label of ['Копировать','Изменить','Ответвить'])assert.equal(await page.locator('.message-user button',{hasText:label}).count(),0);
      assert.deepEqual(errors,[]);
      await page.close();
    }
  }finally{await browser.close()}
});

test('same-tab About keeps existing chat and projects unchanged on desktop and mobile', async()=>{
  const chromePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(chromePath?{executablePath:chromePath}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    for(const mobile of [false,true]){
      const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1280,height:800},isMobile:mobile});
      const page=await context.newPage();
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(appUrl);
      await page.locator('#messageInput').fill('Сохрани нашу переписку');
      await page.locator('#sendButton').click();
      const before=await page.evaluate(()=>JSON.stringify(window.KazSession.snapshot()));
      assert.ok(await page.locator('#view-chat').isVisible());
      if(mobile)await page.locator('[data-action="toggle-sidebar"]').click();
      await page.locator('.sidebar [data-screen="about"]').click();
      assert.ok(await page.locator('#view-about').isVisible());
      assert.equal(await page.locator('.composer-region').isVisible(),false);
      assert.equal(await page.locator('#pageTitle').innerText(),'О проекте');
      assert.equal(await page.locator('#aboutHelp .about-help-content').isVisible(),false);
      await page.locator('#aboutHelp summary').click();
      assert.ok(await page.locator('#aboutHelp .about-help-content').isVisible());
      assert.equal(await page.evaluate(()=>JSON.stringify(window.KazSession.snapshot())),before,'Entering About must not reset chats');
      await page.locator('[data-action="back-to-chat"]').click();
      assert.ok(await page.locator('#view-chat').isVisible());
      assert.ok((await page.locator('#chatMessages').innerText()).includes('Сохрани нашу переписку'));
      assert.ok(await page.locator('.composer-region').isVisible());
      assert.deepEqual(errors,[]);
      await context.close();
    }
  }finally{await browser.close()}
});

test('drafts stay with their conversation and About never clears the composer',async()=>{
  const chromePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(chromePath?{executablePath:chromePath}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:800}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(appUrl);
    await page.locator('#messageInput').fill('Первый чат');
    await page.locator('#sendButton').click();
    await page.locator('#messageInput').fill('Черновик первого чата');
    await page.locator('.sidebar [data-screen="about"]').click();
    assert.equal(await page.locator('#view-about').isVisible(),true);
    await page.locator('#aboutHelp summary').click();
    await page.locator('[data-action="back-to-chat"]').click();
    assert.equal(await page.locator('#messageInput').inputValue(),'Черновик первого чата');
    await page.locator('.sidebar [data-action="new-chat"]').click();
    await page.locator('#messageInput').fill('Второй чат');
    await page.locator('#sendButton').click();
    await page.locator('#messageInput').fill('Черновик второго чата');
    await page.locator('.sidebar [data-screen="history"]').click();
    await page.locator('#historyList [data-session="open-chat"]').last().click();
    assert.equal(await page.locator('#messageInput').inputValue(),'Черновик первого чата');
    await page.locator('.sidebar [data-screen="history"]').click();
    await page.locator('#historyList [data-session="open-chat"]').first().click();
    assert.equal(await page.locator('#messageInput').inputValue(),'Черновик второго чата');
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});

test('search highlights matching message safely while pinned and recent chats remain stable',async()=>{
  const chromePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(chromePath?{executablePath:chromePath}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:800}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(appUrl);
    await page.locator('#messageInput').fill('Первый разговор');
    await page.locator('#sendButton').click();
    await page.locator('#messageInput').fill('секретный пароль <img src=x onerror=alert(1)> безопасный тест');
    await page.locator('#sendButton').click();
    await page.locator('.sidebar [data-action="new-chat"]').click();
    await page.locator('#messageInput').fill('Второй разговор');
    await page.locator('#sendButton').click();
    await page.locator('.sidebar [data-screen="history"]').click();
    const recent=await page.locator('#recentChats').innerText();
    await page.locator('#historySearch').fill('пароль');
    assert.equal(await page.locator('#historyList .session-chat-row').count(),1);
    assert.equal(await page.locator('#historySearchSummary').innerText(),'Найдено переписок: 1 из 2');
    assert.equal(await page.locator('#historyList mark.session-search-hit').count(),1);
    assert.ok((await page.locator('.session-search-snippet').innerText()).includes('пароль'));
    assert.equal(await page.locator('#historyList img').count(),0,'Search snippets must never interpret user HTML');
    assert.equal(await page.locator('#recentChats').innerText(),recent,'Search must not erase recent chats');
    await page.locator('#historySearch').fill('несуществующее слово');
    assert.equal(await page.locator('#historyList .session-chat-row').count(),0);
    assert.equal(await page.locator('#historySearchSummary').innerText(),'Найдено переписок: 0 из 2');
    assert.equal(await page.locator('#recentChats').innerText(),recent);
    await page.locator('#languageToggle').click();
    await page.locator('#languageMenu [data-language="en"]').click();
    assert.equal(await page.locator('#historySearchSummary').innerText(),'Chats found: 0 of 2');
    assert.equal(await page.locator('#sessionClearSearch').innerText(),'Clear');
    assert.ok(await page.locator('#sessionClearSearch').isVisible());
    await page.locator('#sessionClearSearch').click();
    assert.equal(await page.locator('#historySearch').inputValue(),'');
    assert.equal(await page.locator('#sessionClearSearch').isVisible(),false);
    assert.equal(await page.locator('#historyList .session-chat-row').count(),2);
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});
test('project names cannot be duplicated by case and modal remains editable',async()=>{
  const chromePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(chromePath?{executablePath:chromePath}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:800}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(appUrl);
    await page.locator('.sidebar [data-screen="projects"]').click();
    await page.locator('[data-session="new-project"]').click();
    await page.locator('#sessionBody input').fill('Мой проект');
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    assert.equal((await page.evaluate(()=>window.KazSession.snapshot().projects)).length,1);
    await page.locator('[data-session="new-project"]').click();
    await page.locator('#sessionBody input').fill('мой ПРОЕКТ');
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    assert.ok(await page.locator('#sessionOverlay').isVisible());
    assert.equal((await page.evaluate(()=>window.KazSession.snapshot().projects)).length,1);
    await page.locator('#sessionBody input').fill('Другой проект');
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    assert.equal((await page.evaluate(()=>window.KazSession.snapshot().projects)).length,2);
    await page.locator('[data-session="rename-project"]').last().click();
    await page.locator('#sessionBody input').fill('МОЙ ПРОЕКТ');
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    assert.ok(await page.locator('#sessionOverlay').isVisible());
    assert.equal((await page.evaluate(()=>window.KazSession.snapshot().projects)).length,2);
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});

test('history TXT export keeps Cyrillic readable and excludes temporary chats',async()=>{
  const chromePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(chromePath?{executablePath:chromePath}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:800},acceptDownloads:true});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(appUrl);
    await page.locator('#messageInput').fill('Қазақша и русский: проверка');
    await page.locator('#sendButton').click();
    await page.locator('.sidebar [data-screen="settings"]').click();
    await page.locator('#sessionTemporary').check();
    await page.locator('#messageInput').fill('PRIVATE TEMP NEVER EXPORT');
    await page.locator('#sendButton').click();
    await page.locator('.sidebar [data-screen="settings"]').click();
    const downloading=page.waitForEvent('download');
    await page.locator('[data-feature="export"]').click();
    const file=await downloading;
    assert.equal(file.suggestedFilename(),'Kaz-AI-history.txt');
    const body=readFileSync(await file.path(),'utf8');
    assert.ok(body.startsWith('\uFEFF'),'Text export must be UTF-8 BOM for Windows editors');
    assert.ok(body.includes('Қазақша и русский: проверка'));
    assert.ok(!body.includes('PRIVATE TEMP NEVER EXPORT'));
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});

test('real browser: match navigation, in-place project organization and individual TXT export',async()=>{
  const executablePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(executablePath?{executablePath}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({viewport:{width:1240,height:820},acceptDownloads:true});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(appUrl);
    await page.locator('#messageInput').fill('Начало проекта');
    await page.locator('#sendButton').click();
    await page.locator('#messageInput').fill('Важный фрагмент поиска');
    await page.locator('#sendButton').click();
    await page.locator('.sidebar [data-action="new-chat"]').click();
    await page.locator('#messageInput').fill('Вторая переписка');
    await page.locator('#sendButton').click();
    await page.keyboard.press('Control+k');
    assert.equal(await page.locator('#historySearch').evaluate(el=>document.activeElement===el),true);
    await page.locator('#historySearch').fill('Важный фрагмент');
    await page.locator('#historyList [data-session="open-chat"]').click();
    assert.equal(await page.locator('#chatMessages .session-jump-hit').count(),1);
    assert.ok((await page.locator('.session-jump-hit').innerText()).includes('Важный фрагмент'));
    await page.locator('.sidebar [data-screen="history"]').click();
    await page.locator('#sessionClearSearch').click();
    const downloading=page.waitForEvent('download');
    await page.locator('#historyList [data-session="export-chat"]').first().click();
    const file=await downloading;
    assert.ok(file.suggestedFilename().endsWith('.txt'));
    assert.ok(readFileSync(await file.path(),'utf8').startsWith('\uFEFF'));
    assert.equal((await page.evaluate(()=>window.KazSession.snapshot().threads)).length,2);
    await page.locator('.sidebar [data-screen="projects"]').click();
    await page.locator('[data-session="new-project"]').click();
    await page.locator('#sessionBody input').fill('Мой рабочий проект');
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    await page.locator('[data-session="add-chat-to-project"]').click();
    await page.locator('#sessionBody select').selectOption({index:0});
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    assert.equal((await page.evaluate(()=>window.KazSession.snapshot().threads.filter(c=>c.projectId).length)),1);
    assert.ok((await page.locator('.session-project-card').first().innerText()).includes('1 чат'));
    await page.locator('.session-project-card').first().locator('[data-session="remove-chat-from-project"]').click();
    assert.equal((await page.evaluate(()=>window.KazSession.snapshot().threads.filter(c=>c.projectId).length)),0);
    assert.ok((await page.locator('#projectsWorkspace').innerText()).includes('Без проекта'));
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});

test('text helpers prepare safe drafts but never send without user confirmation',async()=>{
  const executablePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const instance=await chromium.launch({...(executablePath?{executablePath}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await instance.newPage({viewport:{width:1240,height:820}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(appUrl);
    await page.locator('.sidebar [data-screen="tools"]').click();
    await page.locator('#toolGroups [data-feature="tool-22"]').click();
    await page.locator('#sessionBody select').selectOption('en');
    await page.locator('#sessionBody textarea').fill('Сәлем, әлем!');
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    assert.ok((await page.locator('#messageInput').inputValue()).includes('Сәлем, әлем!'));
    assert.ok((await page.locator('#messageInput').inputValue()).includes('английский'));
    assert.equal((await page.evaluate(()=>window.KazSession.snapshot().threads)).length,0,'text helper must not send a request automatically');
    const firstDraft=await page.locator('#messageInput').inputValue();
    await page.locator('.sidebar [data-screen="tools"]').click();
    await page.locator('#toolGroups [data-feature="tool-23"]').click();
    await page.locator('#sessionBody textarea').fill('Объясни функцию JavaScript');
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    assert.equal(await page.locator('#messageInput').inputValue(),firstDraft,'preparing another prompt must not erase existing draft');
    assert.ok(await page.locator('#sessionOverlay').isVisible(),'unsent draft keeps helper dialog open');
    await page.locator('#sessionClose').click();
    await page.locator('#messageInput').fill('');
    await page.locator('.sidebar [data-screen="tools"]').click();
    await page.locator('#toolGroups [data-feature="tool-24"]').click();
    await page.locator('#sessionBody textarea').fill('Письмо о встрече');
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    assert.ok((await page.locator('#messageInput').inputValue()).includes('Письмо о встрече'));
    assert.deepEqual(errors,[]);
  }finally{await instance.close()}
});

test('recent chats reorder by activity while pinned chats remain at the top',async()=>{
  const executablePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(executablePath?{executablePath}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:800}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(appUrl);
    await page.locator('#messageInput').fill('Первый чат');await page.locator('#sendButton').click();
    await page.locator('.sidebar [data-action="new-chat"]').click();
    await page.locator('#messageInput').fill('Второй чат');await page.locator('#sendButton').click();
    assert.ok((await page.locator('#recentChats .session-recent').first().innerText()).includes('Второй чат'));
    await page.locator('#recentChats .session-recent').last().click();
    await page.locator('#messageInput').fill('Обновление первого чата');
    await page.locator('#sendButton').click();
    assert.ok((await page.locator('#recentChats .session-recent').first().innerText()).includes('Первый чат'));
    await page.locator('.sidebar [data-screen="history"]').click();
    await page.locator('#historyList .session-chat-row').filter({hasText:'Второй чат'}).locator('[data-session="pin-chat"]').click();
    assert.ok((await page.locator('#recentChats .session-recent').first().innerText()).includes('Второй чат'));
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});
test('closing access-key modal removes hidden password input; temporary drafts do not survive removal',async()=>{
  const executablePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(executablePath?{executablePath}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:800}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(appUrl);
    await page.locator('.sidebar [data-screen="settings"]').click();
    await page.locator('[data-session="ai-access"]').click();
    await page.locator('#sessionBody input[type=password]').fill('unsaved-test-private-key-value');
    await page.locator('#sessionClose').click();
    assert.equal(await page.locator('#sessionBody input[type=password]').count(),0);
    await page.locator('#sessionTemporary').check();
    await page.locator('#messageInput').fill('Временное сообщение');
    await page.locator('#sendButton').click();
    await page.locator('#messageInput').fill('Секретный несохранённый черновик');
    await page.locator('.sidebar [data-action="new-chat"]').click();
    const snapshot=await page.evaluate(()=>window.KazSession.snapshot());
    assert.equal(snapshot.threads.length,0);
    assert.equal(snapshot.draftCount,0);
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});
test('project TXT export downloads only saved project conversations',async()=>{
  const executablePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(executablePath?{executablePath}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:800},acceptDownloads:true});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(appUrl);
    await page.locator('#messageInput').fill('ПЕРВЫЙ ТЕКСТ ПРОЕКТА');await page.locator('#sendButton').click();
    await page.locator('.sidebar [data-action="new-chat"]').click();
    await page.locator('#messageInput').fill('ВТОРОЙ ТЕКСТ ВНЕ ПРОЕКТА');await page.locator('#sendButton').click();
    await page.locator('.sidebar [data-screen="projects"]').click();
    await page.locator('[data-session="new-project"]').click();
    await page.locator('#sessionBody input').fill('Рабочие идеи');
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    await page.locator('[data-session="add-chat-to-project"]').click();
    await page.locator('#sessionBody select').selectOption({label:'ПЕРВЫЙ ТЕКСТ ПРОЕКТА'});
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    const started=page.waitForEvent('download');
    await page.locator('[data-session="export-project"]').click();
    const result=await started;
    assert.ok(result.suggestedFilename().includes('Рабочие идеи'));
    const body=readFileSync(await result.path(),'utf8');
    assert.ok(body.startsWith('\uFEFF'));
    assert.ok(body.includes('ПЕРВЫЙ ТЕКСТ ПРОЕКТА'));
    assert.ok(!body.includes('ВТОРОЙ ТЕКСТ ВНЕ ПРОЕКТА'));
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});

test('send stays disabled while a GPT request is pending, including when typing',async()=>{
  const executablePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(executablePath?{executablePath}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  let release;
  try{
    const page=await browser.newPage({viewport:{width:1280,height:800}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const gate=new Promise(resolve=>{release=resolve});
    const html=readFileSync('public/preview.html','utf8');
    await page.route('https://kaz-ai.test/**',async route=>{
      if(new URL(route.request().url()).pathname==='/api/chat'){
        await gate;
        try{return await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({text:'Запрос завершился'})})}catch{return}
      }
      return route.fulfill({status:200,contentType:'text/html',body:html});
    });
    await page.goto('https://kaz-ai.test/');
    await page.locator('#messageInput').fill('Первый запрос');
    await page.locator('#sendButton').click();
    await page.locator('#sessionBody input[type=password]').fill('my-safe-private-test-token-123456789');
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    await page.waitForFunction(()=>document.querySelector('#sessionStop')?.hidden===false);
    await page.locator('#messageInput').fill('Второй запрос, не отправлять пока');
    assert.equal(await page.locator('#sendButton').isDisabled(),true);
    release();
    await page.waitForFunction(()=>document.querySelector('.message-assistant')?.textContent.includes('Запрос завершился'));
    // Rendering can finish a microtask before the request's finally block unlocks Send.
    await page.waitForFunction(()=>!document.querySelector('#sendButton').disabled);
    assert.equal(await page.locator('#sendButton').isEnabled(),true);
    assert.equal(await page.locator('#messageInput').inputValue(),'Второй запрос, не отправлять пока');
    assert.deepEqual(errors,[]);
  }finally{release?.();await browser.close()}
});

test('manually cancelled AI request offers retry and rejects late responses',async()=>{
  const executablePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(executablePath?{executablePath}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  let release;
  try{
    const page=await browser.newPage({viewport:{width:1280,height:800}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const html=readFileSync('public/preview.html','utf8');
    const gate=new Promise(resolve=>{release=resolve});
    let calls=0;
    await page.route('https://kaz-ai.test/**',async route=>{
      if(new URL(route.request().url()).pathname==='/api/chat'){
        const ordinal=++calls;
        if(ordinal===1)await gate;
        try{return await route.fulfill({status:200,contentType:'application/json',
          body:JSON.stringify({text:ordinal===1?'Запоздавший ответ':'Новый ответ после повтора'})})}catch{return}
      }
      return route.fulfill({status:200,contentType:'text/html',body:html});
    });
    await page.goto('https://kaz-ai.test/');
    await page.locator('#messageInput').fill('Не дублировать вопрос');
    await page.locator('#sendButton').click();
    await page.locator('#sessionBody input[type=password]').fill('another-secure-test-secret-1234567890');
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    await page.waitForFunction(()=>document.querySelector('#sessionStop')?.hidden===false);
    await page.locator('#sessionStop').click();
    await page.waitForFunction(()=>document.querySelector('#statusBanner')?.textContent.includes('остановлена'));
    assert.equal(await page.locator('#sessionRetry').isVisible(),true);
    await page.waitForFunction(()=>document.querySelector('#sessionStop')?.hidden===true);
    release();
    await page.locator('#sessionRetry').click();
    await page.waitForFunction(()=>document.querySelector('.message-assistant')?.textContent.includes('Новый ответ после повтора'));
    assert.equal(await page.locator('#chatMessages .message-user').count(),1);
    assert.equal(await page.locator('#chatMessages .message-assistant').count(),1);
    assert.ok(!(await page.locator('#chatMessages').innerText()).includes('Запоздавший ответ'));
    assert.equal(calls,2);
    assert.deepEqual(errors,[]);
  }finally{release?.();await browser.close()}
});

test('real browser: failed answer regeneration can be retried without duplicating messages',async()=>{
  const executablePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(executablePath?{executablePath}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:800}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const html=readFileSync('public/preview.html','utf8');
    let calls=0;
    await page.route('https://kaz-ai.test/**',async route=>{
      if(new URL(route.request().url()).pathname==='/api/chat'){
        const ordinal=++calls;
        if(ordinal===2)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'AI_UNAVAILABLE',message:'Временная ошибка'})});
        return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({text:ordinal===1?'Первый ответ':'Ответ после удачного повтора'})});
      }
      return route.fulfill({status:200,contentType:'text/html',body:html});
    });
    await page.goto('https://kaz-ai.test/');
    await page.locator('#messageInput').fill('Проверь повтор ответа');
    await page.locator('#sendButton').click();
    await page.locator('#sessionBody input[type=password]').fill('private-test-access-token-1234567890');
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    await page.waitForFunction(()=>document.querySelector('.message-assistant')?.textContent.includes('Первый ответ'));
    await page.locator('[data-session="retry-answer"]').click();
    await page.waitForFunction(()=>document.querySelector('#statusBanner')?.textContent.includes('Временная ошибка'));
    await page.waitForFunction(()=>document.querySelector('#sessionStop')?.hidden===true);
    assert.equal(await page.locator('#sessionRetry').isVisible(),true);
    assert.ok((await page.locator('#chatMessages').innerText()).includes('Первый ответ'));
    await page.locator('#sessionRetry').click();
    await page.waitForFunction(()=>document.querySelector('.message-assistant')?.textContent.includes('Ответ после удачного повтора'));
    assert.equal(await page.locator('.message-user').count(),1);
    assert.equal(await page.locator('.message-assistant').count(),1);
    assert.equal(calls,3);
    assert.equal(await page.locator('#sessionRetry').isVisible(),false);
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});
test('real browser: a long assistant reply does not invalidate the next chat request',async()=>{
  const executablePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(executablePath?{executablePath}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:800}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const html=readFileSync('public/preview.html','utf8');
    const bodies=[];
    await page.route('https://kaz-ai.test/**',async route=>{
      if(new URL(route.request().url()).pathname==='/api/chat'){
        const body=route.request().postDataJSON();
        bodies.push(body);
        return route.fulfill({status:200,contentType:'application/json',
          body:JSON.stringify({text:bodies.length===1?'Длинный ответ '+('А'.repeat(4900)):'Второй ответ'})});
      }
      return route.fulfill({status:200,contentType:'text/html',body:html});
    });
    await page.goto('https://kaz-ai.test/');
    await page.locator('#messageInput').fill('Первый вопрос');
    await page.locator('#sendButton').click();
    await page.locator('#sessionBody input[type=password]').fill('private-test-access-token-1234567890');
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    await page.waitForFunction(()=>document.querySelector('.message-assistant')?.textContent.length>4800);
    await page.locator('#messageInput').fill('Второй вопрос');
    await page.locator('#sendButton').click();
    await page.waitForFunction(()=>document.querySelectorAll('.message-assistant').length===2);
    assert.equal(bodies.length,2);
    assert.ok(bodies[1].messages.some(m=>m.role==='assistant'&&m.content.length===4000));
    assert.equal(bodies[1].messages.at(-1).content,'Второй вопрос');
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});
test('real browser: calculator keeps tiny results and language selection translates status',async()=>{
  const executablePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(executablePath?{executablePath}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:800}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(appUrl);
    assert.equal(await page.evaluate(()=>window.KazSession.compute('1/10000000000')),1e-10);
    assert.equal(await page.evaluate(()=>window.KazSession.compute('0,1+0,2')),0.3);
    assert.equal(await page.evaluate(()=>window.KazSession.compute('9007199254740991')),9007199254740991);
    await page.locator('#languageToggle').click();
    await page.locator('#languageMenu [data-language="en"]').click();
    await page.locator('#messageInput').fill('Verify status translations');
    await page.locator('#sendButton').click();
    await page.waitForFunction(()=>document.querySelector('#statusBanner')?.textContent.includes('Preview:'));
    assert.equal(await page.locator('#statusBanner').isVisible(),true);
    await page.locator('#messageInput').fill('Draft after preview warning');
    assert.equal(await page.locator('#statusBanner').isVisible(),false);
    await page.locator('#languageToggle').click();
    await page.locator('#languageMenu [data-language="kk"]').click();
    await page.locator('#messageInput').fill('Сәлем');
    await page.locator('#sendButton').click();
    await page.waitForFunction(()=>document.querySelector('#statusBanner')?.textContent.includes('Алдын ала қарау:'));
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});

test('deleting the selected conversation clears its private draft and leaves other chats intact',async()=>{
  const chromePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(chromePath?{executablePath:chromePath}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:820}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(appUrl);
    await page.locator('#messageInput').fill('Чат, который нужно сохранить');
    await page.locator('#sendButton').click();
    await page.locator('.sidebar [data-action="new-chat"]').click();
    await page.locator('#messageInput').fill('Чат для удаления');
    await page.locator('#sendButton').click();
    await page.locator('#messageInput').fill('ЛИЧНЫЙ НЕСОХРАНЁННЫЙ ЧЕРНОВИК');
    await page.locator('.sidebar [data-screen="history"]').click();
    await page.locator('#historyList .session-chat-row').filter({hasText:'Чат для удаления'}).locator('[data-session="delete-chat"]').click();
    await page.locator('#sessionBody [data-session="dialog-confirm"]').click();
    assert.equal(await page.locator('#messageInput').inputValue(),'');
    assert.equal((await page.evaluate(()=>window.KazSession.snapshot())).threads.length,1);
    assert.equal((await page.locator('#view-welcome').isVisible()),true);
    await page.locator('#messageInput').fill('Новый вопрос без старого черновика');
    await page.locator('#sendButton').click();
    const snapshot=await page.evaluate(()=>window.KazSession.snapshot());
    assert.equal(snapshot.threads.length,2);
    assert.ok(snapshot.threads.every(c=>c.title!=='Чат для удаления'));
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});
test('home starts fresh chat without erasing the previous conversation or its draft',async()=>{
  const chromePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(chromePath?{executablePath:chromePath}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:820}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(appUrl);
    await page.locator('#messageInput').fill('Первый пользовательский вопрос');
    await page.locator('#sendButton').click();
    await page.locator('#messageInput').fill('Черновик старого чата');
    await page.locator('[data-action="home"]').click();
    assert.equal(await page.locator('#messageInput').inputValue(),'');
    await page.locator('#messageInput').fill('Второй пользовательский вопрос');
    await page.locator('#sendButton').click();
    const before=await page.evaluate(()=>window.KazSession.snapshot());
    assert.equal(before.threads.length,2);
    assert.equal(before.threads.find(x=>x.title==='Первый пользовательский вопрос').messages,1);
    assert.equal(before.threads.find(x=>x.title==='Второй пользовательский вопрос').messages,1);
    await page.locator('.sidebar [data-screen="history"]').click();
    await page.locator('#historyList .session-chat-row').filter({hasText:'Первый пользовательский вопрос'}).locator('[data-session="open-chat"]').click();
    assert.equal(await page.locator('#messageInput').inputValue(),'Черновик старого чата');
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});
test('search opens highlighted message text safely, including special characters',async()=>{
  const chromePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(chromePath?{executablePath:chromePath}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:820}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(appUrl);
    await page.locator('#messageInput').fill('Первое сообщение');
    await page.locator('#sendButton').click();
    await page.locator('#messageInput').fill('Здесь есть <script>НЕ_ИСПОЛНЯТЬ</script> в середине');
    await page.locator('#sendButton').click();
    await page.locator('.sidebar [data-screen="history"]').click();
    await page.locator('#historySearch').fill('<script>');
    await page.locator('#historyList [data-session="open-chat"]').click();
    assert.equal(await page.locator('#chatMessages .session-jump-hit mark').count(),1);
    assert.equal(await page.locator('#chatMessages .session-jump-hit mark').textContent(),'<script>');
    assert.equal(await page.locator('script:has-text("НЕ_ИСПОЛНЯТЬ")').count(),0);
    assert.ok((await page.locator('.session-jump-hit').innerText()).includes('</script>'));
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});
test('ratings and pin controls expose their toggled state to assistive technology',async()=>{
  const chromePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(chromePath?{executablePath:chromePath}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:820}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(appUrl);
    await page.locator('#messageInput').fill('Для закрепления');
    await page.locator('#sendButton').click();
    await page.locator('.sidebar [data-screen="history"]').click();
    const pin=page.locator('#historyList [data-session="pin-chat"]').first();
    assert.equal(await pin.getAttribute('aria-pressed'),'false');
    await pin.click();
    assert.equal(await page.locator('#historyList [data-session="pin-chat"]').first().getAttribute('aria-pressed'),'true');
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});

test('temporary chat never leaks an unsent private draft into the new-chat composer',async()=>{
  const binary=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(binary?{executablePath:binary}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:820}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(appUrl);
    await page.locator('#messageInput').fill('Обычный чат сохранён в истории');
    await page.locator('#sendButton').click();
    await page.locator('.sidebar [data-screen="settings"]').click();
    await page.locator('#sessionTemporary').check();
    await page.locator('#messageInput').fill('Временная переписка');
    await page.locator('#sendButton').click();
    await page.locator('#messageInput').fill('СЕКРЕТНЫЙ_ЧЕРНОВИК_ВРЕМЕННОГО_ЧАТА');
    await page.locator('#recentChats [data-session="open-chat"]').first().click();
    assert.equal(await page.locator('#messageInput').inputValue(),'');
    assert.equal((await page.evaluate(()=>window.KazSession.snapshot())).threads.length,1);
    await page.locator('.sidebar [data-action="new-chat"]').click();
    assert.equal(await page.locator('#messageInput').inputValue(),'');
    assert.equal((await page.evaluate(()=>window.KazSession.snapshot())).draftCount,0);
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});
test('rating a response changes only its buttons without destroying the displayed message',async()=>{
  const binary=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(binary?{executablePath:binary}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:820}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const html=readFileSync('public/preview.html','utf8');
    await page.route('https://kaz-ai.test/**',route=>{
      if(new URL(route.request().url()).pathname==='/api/chat')return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({text:'Подробный ответ от модели '+('Пример текста. '.repeat(350))})});
      return route.fulfill({status:200,contentType:'text/html',body:html});
    });
    await page.goto('https://kaz-ai.test/');
    await page.locator('#messageInput').fill('Оцени этот ответ');
    await page.locator('#sendButton').click();
    await page.locator('#sessionBody input[type=password]').fill('long-safe-browser-test-access-key-1234567890');
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    await page.waitForFunction(()=>document.querySelector('.message-assistant')?.textContent.includes('Подробный ответ от модели'));
    const result=await page.evaluate(()=>{
      const message=document.querySelector('.message-assistant');
      const before=message;
      const content=message.textContent;
      document.querySelector('#mainContent').scrollTop=0;
      message.querySelector('[data-session="rate-up"]').click();
      const after=document.querySelector('.message-assistant');
      return {same:after===before,content:after.textContent===content,pressed:after.querySelector('[data-session="rate-up"]').getAttribute('aria-pressed'),scroll:document.querySelector('#mainContent').scrollTop};
    });
    assert.equal(result.same,true);
    assert.equal(result.content,true);
    assert.equal(result.pressed,'true');
    assert.equal(result.scroll,0);
    await page.locator('.message-assistant [data-session="rate-down"]').click();
    assert.equal(await page.locator('.message-assistant [data-session="rate-up"]').getAttribute('aria-pressed'),'false');
    assert.equal(await page.locator('.message-assistant [data-session="rate-down"]').getAttribute('aria-pressed'),'true');
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});
test('project selection opens with keyboard focus on the choice, not Save',async()=>{
  const binary=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(binary?{executablePath:binary}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:820}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(appUrl);
    await page.locator('#messageInput').fill('Переписка для проекта');
    await page.locator('#sendButton').click();
    await page.locator('.sidebar [data-screen="projects"]').click();
    await page.locator('[data-session="new-project"]').click();
    await page.locator('#sessionBody input').fill('Рабочая папка');
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    await page.locator('[data-session="add-chat-to-project"]').click();
    assert.equal(await page.locator('#sessionBody select').evaluate(e=>document.activeElement===e),true);
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('#sessionBody select').count(),0);
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});

test('real browser: rejected AI key allows retry with a new key and no duplicate user message',async()=>{
  const binary=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(binary?{executablePath:binary}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:820}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const html=readFileSync('public/preview.html','utf8');
    let requests=0;
    await page.route('https://kaz-ai.test/**',async route=>{
      if(new URL(route.request().url()).pathname==='/api/chat'){
        requests++;
        if(requests===1)return route.fulfill({status:401,contentType:'application/json',body:JSON.stringify({code:'ACCESS_REQUIRED',message:'Bad key'})});
        return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({text:'Ответ после обновления ключа'})});
      }
      return route.fulfill({status:200,contentType:'text/html',body:html});
    });
    await page.goto('https://kaz-ai.test/');
    await page.locator('#messageInput').fill('Вопрос, который нельзя дублировать');
    await page.locator('#sendButton').click();
    await page.locator('#sessionBody input[type=password]').fill('first-invalid-key-12345678901234567890');
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    await page.waitForFunction(()=>document.querySelector('#statusBanner')?.textContent.includes('Ключ доступа не принят'));
    await page.locator('#sessionRetry').waitFor({state:'visible'});
    await page.waitForFunction(()=>document.querySelector('#sessionStop')?.hidden===true);
    await page.locator('#sessionRetry').click();
    await page.locator('#sessionBody input[type=password]').fill('new-valid-test-key-12345678901234567890');
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    await page.waitForFunction(()=>document.querySelector('.message-assistant')?.textContent.includes('Ответ после обновления ключа'));
    const snapshot=await page.evaluate(()=>window.KazSession.snapshot());
    assert.equal(snapshot.threads.length,1);
    assert.equal(snapshot.threads[0].messages,2);
    assert.equal(requests,2);
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});
test('projects reject equivalent Unicode names without changing an existing project',async()=>{
  const binary=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(binary?{executablePath:binary}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:820}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(appUrl);
    await page.locator('.sidebar [data-screen="projects"]').click();
    await page.locator('[data-session="new-project"]').click();
    await page.locator('#sessionBody input').fill('Work');
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    await page.locator('[data-session="new-project"]').click();
    await page.locator('#sessionBody input').fill('Ｗｏｒｋ');
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    assert.equal((await page.evaluate(()=>window.KazSession.snapshot())).projects.length,1);
    assert.equal(await page.locator('#sessionOverlay').isVisible(),true);
    await page.locator('#sessionBody input').fill('Другая папка');
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    assert.equal((await page.evaluate(()=>window.KazSession.snapshot())).projects.length,2);
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});
test('all three existing font settings change composer and dialog text without altering typed drafts',async()=>{
  const binary=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(binary?{executablePath:binary}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:820}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(appUrl);
    await page.locator('#messageInput').fill('Сохраняемый черновик');
    await page.locator('.sidebar [data-screen="settings"]').click();
    await page.locator('#fontToggle').click();
    await page.locator('#fontMenu [data-font="large"]').click();
    const large=await page.locator('#messageInput').evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
    await page.locator('[data-feature="instructions"]').click();
    const dlg=await page.locator('#sessionBody textarea').evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
    assert.equal(large,17);
    assert.equal(dlg,17);
    await page.locator('#sessionClose').click();
    await page.locator('#fontToggle').click();
    await page.locator('#fontMenu [data-font="small"]').click();
    const small=await page.locator('#messageInput').evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
    assert.equal(small,12);
    assert.equal(await page.locator('#messageInput').inputValue(),'Сохраняемый черновик');
    await page.locator('#fontToggle').click();
    await page.locator('#fontMenu [data-font="normal"]').click();
    const normal=await page.locator('#messageInput').evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
    assert.ok(normal>small&&normal<large,'regular size should be between small and large');
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});

test('project counters use correct Russian forms and live Kazakh/English labels while preserving chat titles',async()=>{
  const chromePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(chromePath?{executablePath:chromePath}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({viewport:{width:1240,height:820}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(appUrl);
    await page.locator('.sidebar [data-screen="projects"]').click();
    await page.locator('[data-session="new-project"]').click();
    await page.locator('#sessionBody input').fill('Мой проект');
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    assert.equal(await page.locator('.session-project-title small').first().innerText(),'0 чатов');
    for(let i=0;i<5;i++){
      await page.locator('.sidebar [data-action="new-chat"]').click();
      await page.locator('#messageInput').fill(i===0?'Настройки':'Сообщение №'+(i+1));
      await page.locator('#sendButton').click();
      await page.locator('.sidebar [data-screen="projects"]').click();
      await page.locator('[data-session="add-chat-to-project"]').click();
      await page.locator('#sessionBody select').selectOption({label:i===0?'Настройки':'Сообщение №'+(i+1)});
      await page.locator('#sessionBody [data-session="dialog-save"]').click();
      const expected=['1 чат','2 чата','3 чата','4 чата','5 чатов'][i];
      assert.equal(await page.locator('.session-project-title small').first().innerText(),expected);
    }
    await page.locator('#settingsLanguageToggle').count(); // same global session, switch from settings
    await page.locator('.sidebar [data-screen="settings"]').click();
    await page.locator('#settingsLanguageToggle').click();
    await page.locator('#settingsLanguageMenu [data-language="en"]').click();
    await page.locator('.sidebar [data-screen="projects"]').click();
    assert.equal(await page.locator('.session-project-title small').first().innerText(),'5 chats');
    assert.ok((await page.locator('#projectsWorkspace').innerText()).includes('Folders organize chats.'));
    assert.ok((await page.locator('#projectsWorkspace').innerText()).includes('＋ Add chat'));
    assert.ok((await page.locator('#projectsWorkspace').innerText()).includes('Настройки'),'User chat title must remain in its original language');
    await page.locator('.sidebar [data-screen="settings"]').click();
    await page.locator('#settingsLanguageToggle').click();
    await page.locator('#settingsLanguageMenu [data-language="kk"]').click();
    await page.locator('.sidebar [data-screen="projects"]').click();
    assert.equal(await page.locator('.session-project-title small').first().innerText(),'5 чат');
    assert.ok((await page.locator('#projectsWorkspace').innerText()).includes('Қалталар чаттарды топтастырады.'));
    assert.ok((await page.locator('#projectsWorkspace').innerText()).includes('Настройки'));
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});
test('changing language does not translate user-written history search snippets or titles',async()=>{
  const chromePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(chromePath?{executablePath:chromePath}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({viewport:{width:1240,height:820}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(appUrl);
    await page.locator('#messageInput').fill('Пример темы');
    await page.locator('#sendButton').click();
    await page.locator('#messageInput').fill('Настройки');
    await page.locator('#sendButton').click();
    await page.locator('.sidebar [data-screen="history"]').click();
    await page.locator('#historySearch').fill('Настройки');
    assert.ok((await page.locator('#historyList .session-search-snippet').innerText()).includes('Настройки'));
    await page.locator('.sidebar [data-screen="settings"]').click();
    await page.locator('#settingsLanguageToggle').click();
    await page.locator('#settingsLanguageMenu [data-language="en"]').click();
    await page.locator('.sidebar [data-screen="history"]').click();
    assert.ok((await page.locator('#historyList .session-search-snippet').innerText()).includes('Настройки'));
    assert.equal(await page.locator('#historyList .session-search-snippet mark').innerText(),'Настройки');
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});
test('access dialog never sends a former conversation after programmatic navigation to new chat',async()=>{
  const chromePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(chromePath?{executablePath:chromePath}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({viewport:{width:1240,height:820}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const html=readFileSync('public/preview.html','utf8');
    let calls=0;
    await page.route('https://kaz-ai.test/**',async route=>{
      if(new URL(route.request().url()).pathname==='/api/chat'){
        calls++;return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({text:'Old response'})});
      }
      return route.fulfill({status:200,contentType:'text/html',body:html});
    });
    await page.goto('https://kaz-ai.test/');
    await page.locator('#messageInput').fill('Original protected request');
    await page.locator('#sendButton').click();
    await page.locator('#sessionOverlay').waitFor({state:'visible'});
    await page.evaluate(()=>newChat());
    await page.locator('#sessionBody input[type=password]').fill('test-secret-1234567890123456789');
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    await page.waitForTimeout(100);
    assert.equal(calls,0);
    assert.equal((await page.evaluate(()=>window.KazSession.snapshot())).threads.length,1);
    assert.equal(await page.locator('.message-assistant').count(),0);
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});

test('failed AI request does not leak Retry into settings and restores it on returning to chat',async()=>{
  const chromePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(chromePath?{executablePath:chromePath}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({viewport:{width:1240,height:820}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const html=readFileSync('public/preview.html','utf8');
    let calls=0;
    await page.route('https://kaz-ai.test/**',async route=>{
      if(new URL(route.request().url()).pathname==='/api/chat'){
        const index=++calls;
        if(index===1){
          await new Promise(resolve=>setTimeout(resolve,250));
          return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'AI_UNAVAILABLE',message:'Временный отказ сервера'})});
        }
        return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({text:'Ответ после возвращения'})});
      }
      return route.fulfill({status:200,contentType:'text/html',body:html});
    });
    await page.goto('https://kaz-ai.test/');
    await page.locator('#messageInput').fill('Вопрос для повтора');
    await page.locator('#sendButton').click();
    await page.locator('#sessionBody input[type=password]').fill('my-test-access-secret-12345678901234567890');
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    await page.waitForFunction(()=>document.querySelector('#sessionStop')?.hidden===false);
    await page.locator('.sidebar [data-screen="settings"]').click();
    await page.waitForFunction(()=>document.querySelector('#statusBanner')?.textContent.includes('Временный отказ сервера'));
    assert.equal(await page.locator('#statusBanner').isVisible(),false);
    assert.equal(await page.locator('#sessionRetry').isVisible(),false);
    await page.locator('.sidebar [data-screen="history"]').click();
    await page.locator('#historyList [data-session="open-chat"]').first().click();
    assert.equal(await page.locator('#statusBanner').isVisible(),true);
    assert.equal(await page.locator('#sessionRetry').isVisible(),true);
    await page.locator('#sessionRetry').click();
    await page.waitForFunction(()=>document.querySelector('.message-assistant')?.textContent.includes('Ответ после возвращения'));
    assert.equal((await page.evaluate(()=>window.KazSession.snapshot().threads[0].messages)),2);
    assert.equal(calls,2);
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});

test('text helpers use EN and KK prompts while preserving user drafts and never sending',async()=>{
  const exec=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(exec?{executablePath:exec}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({viewport:{width:1240,height:820}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(appUrl);
    await page.locator('.sidebar [data-screen="settings"]').click();
    await page.locator('#settingsLanguageToggle').click();
    await page.locator('#settingsLanguageMenu [data-language="en"]').click();
    await page.locator('.sidebar [data-screen="tools"]').click();
    await page.locator('[data-feature="tool-22"]').click();
    await page.locator('#sessionBody select').selectOption('kk');
    await page.locator('#sessionBody textarea').fill('Hello world');
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    assert.ok((await page.locator('#messageInput').inputValue()).startsWith('Translate the following text into Kazakh.'));
    await page.locator('#messageInput').fill('');
    await page.locator('.sidebar [data-screen="tools"]').click();
    await page.locator('[data-feature="tool-23"]').click();
    await page.locator('#sessionBody textarea').fill('JavaScript problem');
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    assert.ok((await page.locator('#messageInput').inputValue()).startsWith('Help with programming.'));
    await page.locator('#messageInput').fill('');
    await page.locator('.sidebar [data-screen="settings"]').click();
    await page.locator('#settingsLanguageToggle').click();
    await page.locator('#settingsLanguageMenu [data-language="kk"]').click();
    await page.locator('.sidebar [data-screen="tools"]').click();
    await page.locator('[data-feature="tool-24"]').click();
    await page.locator('#sessionBody textarea').fill('Кездесу туралы хат');
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    assert.ok((await page.locator('#messageInput').inputValue()).startsWith('Төмендегі сипаттамаға сай құжат мәтінін дайында.'));
    assert.equal((await page.evaluate(()=>window.KazSession.snapshot())).threads.length,0);
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});
test('calculator result and errors use selected RU EN and KK',async()=>{
  const exec=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(exec?{executablePath:exec}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({viewport:{width:1240,height:820}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(appUrl);
    async function calculate(input){
      await page.locator('.sidebar [data-screen="tools"]').click();
      await page.locator('[data-feature="tool-25"]').click();
      await page.locator('#sessionBody input').fill(input);
      await page.locator('#sessionBody [data-session="calc-run"]').click();
      const output=await page.locator('.session-calc-output').innerText();
      await page.locator('#sessionClose').click();return output;
    }
    async function language(lang){
      await page.locator('.sidebar [data-screen="settings"]').click();
      await page.locator('#settingsLanguageToggle').click();
      await page.locator('#settingsLanguageMenu [data-language="'+lang+'"]').click();
    }
    assert.equal(await calculate('12*5'),'Ответ: 60');
    await language('en');
    assert.equal(await calculate('12*5'),'Result: 60');
    assert.equal(await calculate('5/0'),'Cannot divide by zero.');
    await language('kk');
    assert.equal(await calculate('12*5'),'Нәтиже: 60');
    assert.equal(await calculate('5/0'),'Нөлге бөлуге болмайды.');
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});
test('tools search supports translated names and correct group counts',async()=>{
  const exec=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(exec?{executablePath:exec}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({viewport:{width:1240,height:820}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(appUrl);
    await page.locator('.sidebar [data-screen="tools"]').click();
    await page.locator('#toolsSearch').fill('Переводчик');
    assert.equal(await page.locator('#toolGroups .tool-card').count(),1);
    assert.equal(await page.locator('#toolGroups .tool-group-title small').innerText(),'1 функция');
    await page.locator('.sidebar [data-screen="settings"]').click();
    await page.locator('#settingsLanguageToggle').click();
    await page.locator('#settingsLanguageMenu [data-language="en"]').click();
    await page.locator('.sidebar [data-screen="tools"]').click();
    await page.locator('#toolsSearch').fill('Translator');
    assert.equal(await page.locator('#toolGroups .tool-card').count(),1);
    assert.equal(await page.locator('#toolGroups .tool-group-title small').innerText(),'1 function');
    await page.locator('#toolsSearch').fill('chat');
    assert.ok((await page.locator('#toolGroups .tool-card').count())>=2);
    assert.ok((await page.locator('#toolGroups').innerText()).includes('functions'));
    await page.locator('.sidebar [data-screen="settings"]').click();
    await page.locator('#settingsLanguageToggle').click();
    await page.locator('#settingsLanguageMenu [data-language="kk"]').click();
    await page.locator('.sidebar [data-screen="tools"]').click();
    await page.locator('#toolsSearch').fill('Аудармашы');
    assert.equal(await page.locator('#toolGroups .tool-card').count(),1);
    assert.equal(await page.locator('#toolGroups .tool-group-title small').innerText(),'1 функция');
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});

test('calculator rejects inputs and intermediate results beyond safe numeric precision',async()=>{
  const binary=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(binary?{executablePath:binary}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:820}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(appUrl);
    assert.equal(await page.evaluate(()=>window.KazSession.compute('9007199254740991')),9007199254740991);
    assert.equal(await page.evaluate(()=>window.KazSession.compute('0,1+0,2')),0.3);
    assert.equal(await page.evaluate(()=>window.KazSession.compute('1/10000000000')),1e-10);
    await page.locator('.sidebar [data-screen="tools"]').click();
    await page.locator('#toolGroups [data-feature="tool-25"]').click();
    for(const expr of ['9007199254740992','9007199254740991+1','9007199254740991*2']){
      await page.locator('#sessionBody input').fill(expr);
      await page.locator('#sessionBody [data-session="calc-run"]').click();
      assert.equal(await page.locator('.session-calc-output').innerText(),'Число слишком большое для точного расчёта.');
    }
    await page.locator('#sessionBody input').fill('9007199254740991');
    await page.locator('#sessionBody [data-session="calc-run"]').click();
    assert.equal(await page.locator('.session-calc-output').innerText(),'Ответ: 9007199254740991');
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});
test('existing Retry answer tool recovers the latest unanswered question without duplication',async()=>{
  const binary=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(binary?{executablePath:binary}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:820}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    let calls=0;
    const html=readFileSync('public/preview.html','utf8');
    await page.route('https://kaz-ai.test/**',route=>{
      if(new URL(route.request().url()).pathname==='/api/chat'){
        calls++;
        if(calls===1)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'AI_UNAVAILABLE',message:'Временный отказ'})});
        return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({text:'Ответ после повторной попытки'})});
      }
      return route.fulfill({status:200,contentType:'text/html',body:html});
    });
    await page.goto('https://kaz-ai.test/');
    await page.locator('#messageInput').fill('Вопрос без ответа');
    await page.locator('#sendButton').click();
    await page.locator('#sessionBody input[type=password]').fill('reliable-test-key-1234567890123456789012');
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    await page.waitForFunction(()=>document.querySelector('#statusBanner')?.textContent.includes('Временный отказ'));
    await page.waitForFunction(()=>document.querySelector('#sessionStop')?.hidden===true);
    await page.locator('.sidebar [data-screen="tools"]').click();
    await page.locator('#toolGroups [data-feature="tool-9"]').click();
    await page.waitForFunction(()=>document.querySelector('.message-assistant')?.textContent.includes('Ответ после повторной попытки'));
    assert.equal(calls,2);
    const snapshot=await page.evaluate(()=>window.KazSession.snapshot());
    assert.equal(snapshot.threads[0].messages,2);
    assert.equal(await page.locator('.message-user').count(),1);
    assert.equal(await page.locator('.message-assistant').count(),1);
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});

test('new About story remains readable, inside the same tab and without horizontal scrolling',async()=>{
  const chromePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(chromePath?{executablePath:chromePath}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    for(const viewport of [{width:390,height:844},{width:1366,height:850}]){
      const page=await browser.newPage({viewport});
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(appUrl);
      const before=page.url();
      if(viewport.width<760)await page.locator('[data-action="toggle-sidebar"]').click();
      await page.locator('.primary-nav [data-screen="about"]').click();
      assert.equal(page.url(),before,'About should stay in same tab and page');
      assert.equal(await page.locator('#view-about').isVisible(),true);
      assert.equal(await page.locator('.about-story h2').count(),2);
      assert.ok((await page.locator('.about-story').innerText()).includes('148,83 миллиарда параметров'));
      assert.ok((await page.locator('.about-story').innerText()).includes('Black Forest Labs'));
      assert.ok((await page.locator('.about-story').innerText()).includes('Полноценное подключение находится на этапе разработки.'));
      const widths=await page.evaluate(()=>({document:document.documentElement.scrollWidth,viewport:innerWidth}));
      assert.ok(widths.document<=widths.viewport,'No horizontal overflow: '+JSON.stringify(widths));
      await page.locator('#aboutHelp summary').click();
      assert.equal(await page.locator('.about-help-content').isVisible(),true);
      assert.deepEqual(errors,[]);
      await page.close();
    }
  }finally{await browser.close()}
});

test('returning from About restores the previous reading position in the same chat',async()=>{
  const binary=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(binary?{executablePath:binary}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({viewport:{width:1200,height:700}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(appUrl);
    await page.locator('#messageInput').fill('Длинная переписка '+('Содержание для проверки позиции. '.repeat(90)));
    await page.locator('#sendButton').click();
    const before=await page.evaluate(()=>{
      const main=document.querySelector('#mainContent');
      const maximum=main.scrollHeight-main.clientHeight;
      main.scrollTop=Math.max(1,Math.floor(maximum/3));
      return {position:main.scrollTop,maximum,chat:window.KazSession.snapshot().active};
    });
    assert.ok(before.maximum>100,'Long conversation must create a scrollable reading area');
    assert.ok(before.position>0);
    await page.locator('.sidebar [data-screen="about"]').click();
    assert.equal(await page.locator('#view-about').isVisible(),true);
    await page.locator('[data-action="back-to-chat"]').click();
    const after=await page.evaluate(()=>({position:document.querySelector('#mainContent').scrollTop,chat:window.KazSession.snapshot().active}));
    assert.ok(Math.abs(after.position-before.position)<=2,'Reading position must be preserved');
    assert.equal(after.chat,before.chat);
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});
test('TXT export retains original messages while localizing headers and user labels',async()=>{
  const binary=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(binary?{executablePath:binary}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({viewport:{width:1250,height:800},acceptDownloads:true});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(appUrl);
    await page.locator('#messageInput').fill('Қазақша и русский: ORIGINAL');
    await page.locator('#sendButton').click();
    for(const [lang,header,label] of [
      ['en','Current conversation export (not saved to the cloud)','You: '],
      ['kk','Ағымдағы әңгіме экспорты (бұлтта сақталмайды)','Сіз: ']
    ]){
      await page.locator('.sidebar [data-screen="settings"]').click();
      await page.locator('#settingsLanguageToggle').click();
      await page.locator('#settingsLanguageMenu [data-language="'+lang+'"]').click();
      await page.locator('.sidebar [data-screen="history"]').click();
      const started=page.waitForEvent('download');
      await page.locator('#historyList [data-session="export-chat"]').first().click();
      const download=await started;
      const data=readFileSync(await download.path(),'utf8');
      assert.ok(data.startsWith('\uFEFF'));
      assert.ok(data.includes(header));
      assert.ok(data.includes(label+'Қазақша и русский: ORIGINAL'));
      assert.ok(data.includes('Kaz AI — Қазақша и русский: ORIGINAL'));
      assert.equal((await page.evaluate(()=>window.KazSession.snapshot().threads)).length,1);
    }
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});
test('reasoning effort buttons announce selection and send existing low-medium-high values',async()=>{
  const binary=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(binary?{executablePath:binary}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({viewport:{width:1250,height:800}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(appUrl);
    assert.equal(await page.locator('[data-reason="medium"]').getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('[data-reason="low"]').getAttribute('aria-pressed'),'false');
    await page.locator('#reasonToggle').click();
    await page.locator('[data-reason="high"]').click();
    assert.equal(await page.locator('[data-reason="high"]').getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('[data-reason="medium"]').getAttribute('aria-pressed'),'false');
    assert.equal(await page.locator('[data-feature="deep-reason"]').getAttribute('aria-pressed'),null);
    await page.locator('#languageToggle').click();
    await page.locator('#languageMenu [data-language="en"]').click();
    await page.locator('#reasonToggle').click();
    await page.locator('[data-reason="low"]').click();
    assert.ok((await page.locator('#toast').innerText()).includes('Reasoning level:'));
    assert.equal(await page.locator('[data-reason="low"]').getAttribute('aria-pressed'),'true');
    await page.locator('.sidebar [data-screen="settings"]').click();
    assert.equal(await page.locator('.primary-nav [data-screen="settings"]').getAttribute('aria-current'),'page');
    assert.equal(await page.locator('.primary-nav [data-screen="tools"]').getAttribute('aria-current'),null);
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});

test('isolated calculator completes exact decimal and repeating arithmetic on desktop and mobile without touching chats',async()=>{
  const binary=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(binary?{executablePath:binary}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    for(const viewport of [{width:1280,height:800},{width:390,height:844}]){
      const page=await browser.newPage({viewport});
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(appUrl);
      const before=await page.evaluate(()=>JSON.stringify(window.KazSession.snapshot()));
      if(viewport.width<760)await page.locator('[data-action="toggle-sidebar"]').click();
      await page.locator('.sidebar [data-screen="tools"]').click();
      await page.locator('#toolGroups [data-feature="tool-25"]').click();
      assert.equal(await page.locator('#sessionOverlay').isVisible(),true);
      async function check(expr,result){
        await page.locator('#sessionBody input').fill(expr);
        await page.locator('#sessionBody [data-session="calc-run"]').click();
        assert.equal(await page.locator('.session-calc-output').innerText(),result,expr);
      }
      await check('0,1+0,2','Ответ: 0.3');
      await check('(15+7)×2','Ответ: 44');
      await check('1/3','Ответ: ≈ 0.333333333333333');
      await check('3/0','На ноль делить нельзя.');
      await check('Math.random()','Проверьте математическое выражение.');
      await page.locator('#sessionClose').click();
      assert.equal(await page.locator('#sessionOverlay').isVisible(),false);
      assert.equal(await page.evaluate(()=>JSON.stringify(window.KazSession.snapshot())),before);
      assert.deepEqual(errors,[]);
      await page.close();
    }
  }finally{await browser.close()}
});


test('Tools reasoning entry opens the visible composer control without losing chat or draft',async()=>{
  const executablePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(executablePath?{executablePath}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:800}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(appUrl);
    await page.locator('#messageInput').fill('Несохранённый черновик');
    await page.locator('.sidebar [data-screen="tools"]').click();
    await page.locator('#toolGroups [data-feature="tool-16"]').click();
    assert.equal(await page.locator('#view-welcome').isVisible(),true);
    assert.equal(await page.locator('#reasonMenu').isVisible(),true);
    assert.equal(await page.locator('#reasonToggle').getAttribute('aria-expanded'),'true');
    assert.equal(await page.locator('#messageInput').inputValue(),'Несохранённый черновик');
    await page.locator('#reasonMenu [data-reason="high"]').click();
    assert.equal(await page.locator('#currentReason').innerText(),'Высокий');
    assert.equal(await page.locator('#reasonMenu').isVisible(),false);
    await page.locator('#messageInput').fill('Начальный вопрос');
    await page.locator('#sendButton').click();
    const snapshot=await page.evaluate(()=>JSON.stringify(window.KazSession.snapshot()));
    await page.locator('#messageInput').fill('Черновик текущего чата');
    await page.locator('.sidebar [data-screen="tools"]').click();
    await page.locator('#toolGroups [data-feature="tool-16"]').click();
    assert.equal(await page.locator('#view-chat').isVisible(),true);
    assert.equal(await page.locator('#reasonMenu').isVisible(),true);
    assert.equal(await page.locator('#messageInput').inputValue(),'Черновик текущего чата');
    assert.equal(await page.evaluate(()=>JSON.stringify(window.KazSession.snapshot())),snapshot);
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});
test('Rating entry from Tools focuses the latest AI rating rather than rating the reply automatically',async()=>{
  const executablePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(executablePath?{executablePath}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:800}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const html=readFileSync('public/preview.html','utf8');
    await page.route('https://kaz-ai.test/**',route=>{
      if(new URL(route.request().url()).pathname==='/api/chat')
        return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({text:'Проверяемый ответ модели'})});
      return route.fulfill({status:200,contentType:'text/html',body:html});
    });
    await page.goto('https://kaz-ai.test/');
    await page.locator('#messageInput').fill('Вопрос для оценки');
    await page.locator('#sendButton').click();
    await page.locator('#sessionBody input[type=password]').fill('safe-test-only-key-12345678901234567890');
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    await page.waitForFunction(()=>document.querySelector('.message-assistant')?.textContent.includes('Проверяемый ответ модели'));
    await page.locator('.sidebar [data-screen="tools"]').click();
    await page.locator('#toolGroups [data-feature="tool-13"]').click();
    assert.equal(await page.locator('#view-chat').isVisible(),true);
    const up=page.locator('#chatMessages [data-session="rate-up"]');
    assert.equal(await up.evaluate(el=>document.activeElement===el),true);
    assert.equal(await up.getAttribute('aria-pressed'),'false');
    await up.click();
    assert.equal(await up.getAttribute('aria-pressed'),'true');
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});
test('Rating entry is truthful when the latest chat has no generated assistant reply',async()=>{
  const executablePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(executablePath?{executablePath}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:800}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(appUrl);
    await page.locator('#messageInput').fill('Вопрос без подключения модели');
    await page.locator('#sendButton').click();
    await page.locator('.sidebar [data-screen="tools"]').click();
    await page.locator('#toolGroups [data-feature="tool-13"]').click();
    assert.equal(await page.locator('#view-chat').isVisible(),true);
    assert.equal(await page.locator('#chatMessages [data-session="rate-up"]').count(),0);
    assert.equal(await page.locator('#toast').innerText(),'Пока нет ответа ИИ для оценки.');
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});

test('existing tools show localized warnings without altering drafts or automatically sending',async()=>{
  const binary=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(binary?{executablePath:binary}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:800}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(appUrl);
    async function language(value){
      await page.locator('#languageToggle').click();
      await page.locator('#languageMenu [data-language="'+value+'"]').click();
    }
    await language('en');
    await page.locator('.sidebar [data-screen="tools"]').click();
    await page.locator('#toolGroups [data-feature="tool-22"]').click();
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    await page.waitForFunction(()=>document.querySelector('#toast')?.textContent==='Enter a text or task description first.');
    await page.locator('#sessionClose').click();
    await page.locator('#messageInput').fill('PREEXISTING PRIVATE DRAFT');
    await page.locator('.sidebar [data-screen="tools"]').click();
    await page.locator('#toolGroups [data-feature="tool-23"]').click();
    await page.locator('#sessionBody textarea').fill('test');
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    await page.waitForFunction(()=>document.querySelector('#toast')?.textContent==='You already have a draft. Send or clear it first.');
    assert.equal(await page.locator('#messageInput').inputValue(),'PREEXISTING PRIVATE DRAFT');
    await page.locator('#sessionClose').click();
    await language('kk');
    await page.locator('#toolGroups [data-feature="tool-24"]').click();
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    await page.waitForFunction(()=>document.querySelector('#toast')?.textContent==='Алдымен мәтінді немесе тапсырма сипаттамасын енгізіңіз.');
    assert.equal(await page.locator('#messageInput').inputValue(),'PREEXISTING PRIVATE DRAFT');
    assert.equal((await page.evaluate(()=>window.KazSession.snapshot())).threads.length,0);
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});

test('history search highlights case-expanding Unicode letters at correct original indices',async()=>{
  const path=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(path?{executablePath:path}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:820}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(appUrl);
    await page.locator('#messageInput').fill('Начальная тема');
    await page.locator('#sendButton').click();
    await page.locator('#messageInput').fill('До İSTANBUL и далее');
    await page.locator('#sendButton').click();
    await page.locator('.sidebar [data-screen="history"]').click();
    await page.locator('#historySearch').fill('istan');
    assert.equal(await page.locator('#historyList .session-chat-row').count(),1);
    assert.equal(await page.locator('#historyList .session-search-snippet mark').textContent(),'İSTAN');
    await page.locator('#historySearch').fill('stan');
    assert.equal(await page.locator('#historyList .session-search-snippet mark').textContent(),'STAN');
    await page.locator('#historyList [data-session="open-chat"]').click();
    assert.equal(await page.locator('#chatMessages .session-jump-hit mark').textContent(),'STAN');
    assert.ok((await page.locator('#chatMessages .session-jump-hit').innerText()).includes('İSTANBUL'));
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});
test('Stop response from Tools returns to visible chat and offers retry without a duplicate question',async()=>{
  const path=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(path?{executablePath:path}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  let release;
  try{
    const page=await browser.newPage({viewport:{width:1280,height:820}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const html=readFileSync('public/preview.html','utf8');
    const gate=new Promise(resolve=>{release=resolve});
    let requests=0;
    await page.route('https://kaz-ai.test/**',async route=>{
      if(new URL(route.request().url()).pathname==='/api/chat'){
        const call=++requests;
        if(call===1)await gate;
        try{return await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({text:call===1?'Запоздавший ответ':'Новый ответ после остановки'})})}catch{return}
      }
      return route.fulfill({status:200,contentType:'text/html',body:html});
    });
    await page.goto('https://kaz-ai.test/');
    await page.locator('#messageInput').fill('Отменить через инструменты');
    await page.locator('#sendButton').click();
    await page.locator('#sessionBody input[type=password]').fill('preview-safe-test-key-12345678901234567890');
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    await page.waitForFunction(()=>document.querySelector('#sessionStop')?.hidden===false);
    await page.locator('.sidebar [data-screen="tools"]').click();
    await page.locator('#toolGroups [data-feature="tool-10"]').click();
    assert.equal(await page.locator('#view-chat').isVisible(),true);
    await page.waitForFunction(()=>document.querySelector('#statusBanner')?.textContent.includes('остановлена'));
    await page.waitForFunction(()=>document.querySelector('#sessionStop')?.hidden===true);
    assert.equal(await page.locator('#sessionRetry').isVisible(),true);
    release();
    await page.locator('#sessionRetry').click();
    await page.waitForFunction(()=>document.querySelector('.message-assistant')?.textContent.includes('Новый ответ после остановки'));
    assert.equal(requests,2);
    assert.equal(await page.locator('.message-user').count(),1);
    assert.equal(await page.locator('.message-assistant').count(),1);
    assert.ok(!(await page.locator('#chatMessages').innerText()).includes('Запоздавший ответ'));
    assert.deepEqual(errors,[]);
  }finally{release?.();await browser.close()}
});
test('theme and font settings announce their current state across navigation and keep drafts',async()=>{
  const path=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(path?{executablePath:path}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:800}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(appUrl);
    await page.locator('#messageInput').fill('Текст оставляем без изменений');
    const theme=page.locator('.topbar [data-action="toggle-theme"]');
    const settingsTheme=page.locator('#view-settings [data-action="toggle-theme"]');
    assert.equal(await theme.getAttribute('aria-pressed'),'false');
    await theme.click();
    assert.equal(await theme.getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('body').evaluate(e=>e.classList.contains('light')),true);
    await page.locator('.sidebar [data-screen="settings"]').click();
    assert.equal(await settingsTheme.getAttribute('aria-pressed'),'true');
    await settingsTheme.click();
    assert.equal(await theme.getAttribute('aria-pressed'),'false');
    assert.equal(await page.locator('body').evaluate(e=>e.classList.contains('light')),false);
    await page.locator('#fontToggle').click();
    assert.equal(await page.locator('[data-font="normal"]').getAttribute('aria-pressed'),'true');
    await page.locator('[data-font="large"]').click();
    assert.equal(await page.locator('[data-font="large"]').getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('[data-font="normal"]').getAttribute('aria-pressed'),'false');
    await page.locator('.sidebar [data-screen="history"]').click();
    await page.locator('.sidebar [data-screen="settings"]').click();
    await page.locator('#fontToggle').click();
    assert.equal(await page.locator('[data-font="large"]').getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('#messageInput').inputValue(),'Текст оставляем без изменений');
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});

test('history search Escape clears the filter without losing chat or draft',async()=>{
  const path=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(path?{executablePath:path}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:820}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(appUrl);
    await page.locator('#messageInput').fill('Павлодар и университет');
    await page.locator('#sendButton').click();
    await page.locator('#messageInput').fill('Этот черновик не потерять');
    await page.locator('.sidebar [data-screen="history"]').click();
    await page.locator('#historySearch').fill('нет такого совпадения');
    assert.equal(await page.locator('#historyList .session-chat-row').count(),0);
    await page.locator('#historySearch').press('Escape');
    assert.equal(await page.locator('#historySearch').inputValue(),'');
    assert.equal(await page.locator('#historyList .session-chat-row').count(),1);
    assert.equal(await page.locator('#messageInput').inputValue(),'Этот черновик не потерять');
    assert.equal((await page.evaluate(()=>window.KazSession.snapshot())).threads.length,1);
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});

test('tools show accurate localized readiness and accessible labels after language changes',async()=>{
  const path=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(path?{executablePath:path}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:820}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(appUrl);
    await page.locator('#languageToggle').click();
    await page.locator('#languageMenu [data-language="en"]').click();
    assert.equal(await page.locator('#toast').textContent(),'Interface language: English');
    await page.locator('.sidebar [data-screen="tools"]').click();
    assert.match(await page.locator('#toolGroups [data-feature="tool-1"]').getAttribute('aria-label'),/Working$/);
    assert.match(await page.locator('#toolGroups [data-feature="tool-15"]').getAttribute('aria-label'),/Partly working$/);
    assert.match(await page.locator('#toolGroups [data-feature="tool-17"]').getAttribute('aria-label'),/Planned$/);
    assert.equal(await page.locator('#toolGroups [data-feature="tool-15"] small').textContent(),'Partly working');
    await page.locator('#languageToggle').click();
    await page.locator('#languageMenu [data-language="kk"]').click();
    assert.equal(await page.locator('#toast').textContent(),'Интерфейс тілі: Қазақша');
    assert.match(await page.locator('#toolGroups [data-feature="tool-1"]').getAttribute('aria-label'),/Жұмыс істейді$/);
    assert.match(await page.locator('#toolGroups [data-feature="tool-15"]').getAttribute('aria-label'),/Ішінара$/);
    assert.match(await page.locator('#toolGroups [data-feature="tool-17"]').getAttribute('aria-label'),/Жоспарда$/);
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});

test('chat pins and reply ratings have localized accessible names without changing user text',async()=>{
  const path=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(path?{executablePath:path}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:820}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const html=readFileSync('public/preview.html','utf8');
    await page.route('https://kaz-ai.test/**',route=>new URL(route.request().url()).pathname==='/api/chat'
      ?route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({text:'Надёжный ответ'})})
      :route.fulfill({status:200,contentType:'text/html',body:html}));
    await page.goto('https://kaz-ai.test/');
    await page.locator('#messageInput').fill('Настройки проекта');
    await page.locator('#sendButton').click();
    await page.locator('#sessionBody input[type=password]').fill('preview-safe-test-key-12345678901234567890');
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    await page.waitForFunction(()=>document.querySelector('.message-assistant')?.textContent.includes('Надёжный ответ'));
    await page.locator('.sidebar [data-screen="history"]').click();
    assert.equal(await page.locator('#historyList .session-chat-name').getAttribute('aria-label'),'Открыть чат: Настройки проекта');
    await page.locator('#historyList [data-session="pin-chat"]').click();
    await page.locator('#languageToggle').click();
    await page.locator('#languageMenu [data-language="en"]').click();
    assert.equal(await page.locator('#historyList .session-chat-name').getAttribute('aria-label'),'Pinned chat: Настройки проекта');
    assert.equal(await page.locator('#historyList [data-session="pin-chat"]').getAttribute('aria-label'),'Unpin: Настройки проекта');
    await page.locator('#historyList .session-chat-name').click();
    assert.equal(await page.locator('#chatMessages [data-session="rate-up"]').getAttribute('aria-label'),'Positive response rating');
    await page.locator('#languageToggle').click();
    await page.locator('#languageMenu [data-language="kk"]').click();
    assert.equal(await page.locator('#chatMessages [data-session="rate-up"]').getAttribute('aria-label'),'Жауапқа оң баға');
    assert.ok((await page.locator('#chatMessages').innerText()).includes('Настройки проекта'));
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});

test('locked fourth reasoning level is never labelled as selected',async()=>{
  const path=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(path?{executablePath:path}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:820}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(appUrl);
    await page.locator('#reasonToggle').click();
    await page.locator('[data-reason="high"]').click();
    assert.equal(await page.locator('[data-reason="high"]').getAttribute('aria-pressed'),'true');
    assert.equal(await page.locator('[data-feature="deep-reason"]').getAttribute('aria-pressed'),null);
    assert.equal(await page.locator('#currentReason').textContent(),'Высокий');
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});

test('pinning preserves keyboard focus after history cards reorder',async()=>{
  const binary=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(binary?{executablePath:binary}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({viewport:{width:1240,height:820}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(appUrl);
    await page.locator('#messageInput').fill('Первый чат');
    await page.locator('#sendButton').click();
    await page.locator('.sidebar [data-action="new-chat"]').click();
    await page.locator('#messageInput').fill('Второй чат');
    await page.locator('#sendButton').click();
    await page.locator('.sidebar [data-screen="history"]').click();
    const pin=page.locator('#historyList [data-session="pin-chat"]').last();
    await pin.click();
    assert.equal(await page.locator('#historyList [data-session="pin-chat"][aria-pressed="true"]').count(),1);
    assert.equal(await page.evaluate(()=>document.activeElement?.dataset.session),'pin-chat');
    assert.equal(await page.evaluate(()=>document.activeElement?.getAttribute('aria-pressed')),'true');
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('#historyList [data-session="pin-chat"][aria-pressed="true"]').count(),0);
    assert.equal(await page.evaluate(()=>document.activeElement?.dataset.session),'pin-chat');
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});

test('project changes and removing chats restore visible keyboard focus',async()=>{
  const binary=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(binary?{executablePath:binary}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({viewport:{width:1240,height:820}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(appUrl);
    await page.locator('#messageInput').fill('Задачи команды');
    await page.locator('#sendButton').click();
    await page.locator('.sidebar [data-screen="projects"]').click();
    await page.locator('[data-session="new-project"]').click();
    await page.locator('#sessionBody input').fill('Работа');
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    assert.equal(await page.evaluate(()=>document.activeElement?.dataset.session),'new-project');
    await page.locator('[data-session="add-chat-to-project"]').click();
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    await page.locator('[data-session="remove-chat-from-project"]').click();
    assert.equal(await page.evaluate(()=>document.activeElement?.dataset.session),'open-chat');
    assert.ok((await page.locator('#projectsWorkspace').innerText()).includes('Задачи команды'));
    await page.locator('[data-session="delete-project"]').click();
    await page.locator('#sessionBody [data-session="dialog-confirm"]').click();
    assert.equal(await page.evaluate(()=>document.activeElement?.dataset.session),'new-project');
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});

test('deleting active chat returns keyboard focus to the clean composer',async()=>{
  const binary=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(binary?{executablePath:binary}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:820}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(appUrl);
    await page.locator('#messageInput').fill('Удалить только этот чат');
    await page.locator('#sendButton').click();
    await page.locator('.sidebar [data-screen="history"]').click();
    await page.locator('#historyList [data-session="delete-chat"]').click();
    await page.locator('#sessionBody [data-session="dialog-confirm"]').click();
    assert.equal(await page.evaluate(()=>document.activeElement?.id),'messageInput');
    assert.equal((await page.evaluate(()=>window.KazSession.snapshot())).threads.length,0);
    assert.equal(await page.locator('#messageInput').inputValue(),'');
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});

test('pending AI status reappears on returning to the same chat without duplicate requests',async()=>{
  const binary=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(binary?{executablePath:binary}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  let release;
  try{
    const page=await browser.newPage({viewport:{width:1240,height:820}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const html=readFileSync('public/preview.html','utf8');
    const gate=new Promise(resolve=>{release=resolve});
    let requests=0;
    await page.route('https://kaz-ai.test/**',async route=>{
      if(new URL(route.request().url()).pathname==='/api/chat'){
        requests++;
        await gate;
        try{return await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({text:'Готовый ответ'})})}catch{return}
      }
      return route.fulfill({status:200,contentType:'text/html',body:html});
    });
    await page.goto('https://kaz-ai.test/');
    await page.locator('#messageInput').fill('Проверяем возврат к ответу');
    await page.locator('#sendButton').click();
    await page.locator('#sessionBody input[type=password]').fill('preview-safe-test-key-12345678901234567890');
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    await page.waitForFunction(()=>document.querySelector('#sessionStop')?.hidden===false);
    await page.locator('.sidebar [data-screen="history"]').click();
    assert.equal(await page.locator('#statusBanner').isVisible(),false);
    await page.evaluate(()=>showScreen('chat'));
    assert.equal(await page.locator('#statusBanner').isVisible(),true);
    assert.ok((await page.locator('#statusBanner').innerText()).includes('Анализирую'));
    assert.equal(requests,1);
    release();
    await page.waitForFunction(()=>document.querySelector('.message-assistant')?.textContent.includes('Готовый ответ'));
    assert.equal(await page.locator('#statusBanner').isVisible(),false);
    assert.equal(await page.locator('.message-user').count(),1);
    assert.equal(await page.locator('.message-assistant').count(),1);
    assert.deepEqual(errors,[]);
  }finally{release?.();await browser.close()}
});

test('Unicode search matches precomposed and decomposed letters while showing original text',async()=>{
  const binary=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(binary?{executablePath:binary}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:820}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(appUrl);
    await page.locator('#messageInput').fill('Тема изучения');
    await page.locator('#sendButton').click();
    await page.locator('#messageInput').fill('Cafe\u0301 рядом с ёлкой');
    await page.locator('#sendButton').click();
    await page.locator('.sidebar [data-screen="history"]').click();
    await page.locator('#historySearch').fill('CAFÉ');
    assert.equal(await page.locator('#historyList .session-chat-row').count(),1);
    assert.equal(await page.locator('#historyList .session-search-snippet mark').textContent(),'Cafe\u0301');
    await page.locator('#historyList [data-session="open-chat"]').click();
    assert.equal(await page.locator('#chatMessages .session-jump-hit mark').textContent(),'Cafe\u0301');
    assert.ok((await page.locator('#chatMessages').innerText()).includes('Cafe\u0301 рядом'));
    await page.locator('.sidebar [data-screen="history"]').click();
    await page.locator('#historySearch').fill('Е\u0308ЛКОЙ');
    assert.equal(await page.locator('#historyList .session-search-snippet mark').textContent(),'ёлкой');
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});

test('retrying an AI request moves keyboard focus from the hidden Retry button to Stop',async()=>{
  const path=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(path?{executablePath:path}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  let release;
  try{
    const page=await browser.newPage({viewport:{width:1280,height:820}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const html=readFileSync('public/preview.html','utf8');
    const gate=new Promise(resolve=>{release=resolve});
    let calls=0;
    await page.route('https://kaz-ai.test/**',async route=>{
      if(new URL(route.request().url()).pathname==='/api/chat'){
        calls++;
        if(calls===1)return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'AI_UNAVAILABLE',message:'Ответ ИИ сейчас недоступен. Попробуйте позже.'})});
        await gate;
        try{return await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({text:'Успешный повтор'})})}catch{return}
      }
      return route.fulfill({status:200,contentType:'text/html',body:html});
    });
    await page.goto('https://kaz-ai.test/');
    await page.locator('#messageInput').fill('Проверка безопасного повтора');
    await page.locator('#sendButton').click();
    await page.locator('#sessionBody input[type=password]').fill('preview-safe-test-key-12345678901234567890');
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    await page.waitForFunction(()=>document.querySelector('#sessionRetry')?.hidden===false);
    await page.locator('#sessionRetry').click();
    await page.waitForFunction(()=>document.querySelector('#sessionStop')?.hidden===false);
    assert.equal(await page.evaluate(()=>document.activeElement?.id),'sessionStop');
    assert.equal(await page.locator('#sessionRetry').isVisible(),false);
    assert.equal(calls,2);
    release();
    await page.waitForFunction(()=>document.querySelector('.message-assistant')?.textContent.includes('Успешный повтор'));
    assert.equal(await page.locator('.message-user').count(),1);
    assert.equal(await page.locator('.message-assistant').count(),1);
    assert.deepEqual(errors,[]);
  }finally{release?.();await browser.close()}
});

test('AI pending and error messages remain localized when switching language mid-request',async()=>{
  const path=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(path?{executablePath:path}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  let release;
  try{
    const page=await browser.newPage({viewport:{width:1280,height:820}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const html=readFileSync('public/preview.html','utf8');
    const gate=new Promise(resolve=>{release=resolve});
    await page.route('https://kaz-ai.test/**',async route=>{
      if(new URL(route.request().url()).pathname==='/api/chat'){
        await gate;
        try{return await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'AI_UNAVAILABLE',message:'Ответ ИИ сейчас недоступен. Попробуйте позже.'})})}catch{return}
      }
      return route.fulfill({status:200,contentType:'text/html',body:html});
    });
    await page.goto('https://kaz-ai.test/');
    await page.locator('#messageInput').fill('Ошибка должна быть переведена');
    await page.locator('#sendButton').click();
    await page.locator('#sessionBody input[type=password]').fill('preview-safe-test-key-12345678901234567890');
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    await page.waitForFunction(()=>document.querySelector('#sessionStop')?.hidden===false);
    await page.locator('#languageToggle').click();
    await page.locator('#languageMenu [data-language="en"]').click();
    await page.waitForFunction(()=>document.querySelector('#statusBanner')?.textContent.includes('Processing your request'));
    assert.equal(await page.locator('#sessionStop').innerText(),'Stop');
    release();
    await page.waitForFunction(()=>document.querySelector('#statusBanner')?.textContent.includes('AI response is unavailable'));
    assert.equal(await page.locator('#sessionRetry').innerText(),'Retry request');
    await page.locator('#languageToggle').click();
    await page.locator('#languageMenu [data-language="kk"]').click();
    await page.waitForFunction(()=>document.querySelector('#statusBanner')?.textContent.includes('ЖИ жауабы'));
    assert.equal(await page.locator('#sessionRetry').innerText(),'Сұрауды қайталау');
    assert.equal(await page.locator('.message-user').count(),1);
    assert.deepEqual(errors,[]);
  }finally{release?.();await browser.close()}
});

test('Unicode search preserves accent highlights when Intl.Segmenter is unavailable',async()=>{
  const path=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(path?{executablePath:path}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:820}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.addInitScript(()=>{Intl.Segmenter=undefined});
    await page.goto(appUrl);
    await page.locator('#messageInput').fill('Латинский тест');
    await page.locator('#sendButton').click();
    await page.locator('#messageInput').fill('Cafe\u0301 and more');
    await page.locator('#sendButton').click();
    await page.locator('.sidebar [data-screen="history"]').click();
    await page.locator('#historySearch').fill('CAFÉ');
    assert.equal(await page.locator('#historyList .session-search-snippet mark').textContent(),'Cafe\u0301');
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});

test('manual Stop immediately unlocks retry while the old request remains unresolved',async()=>{
  const bin=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(bin?{executablePath:bin}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  let release;
  try{
    const page=await browser.newPage({viewport:{width:1280,height:820}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const html=readFileSync('public/preview.html','utf8');
    const gate=new Promise(resolve=>{release=resolve});
    let calls=0;
    await page.route('https://kaz-ai.test/**',async route=>{
      if(new URL(route.request().url()).pathname==='/api/chat'){
        const order=++calls;
        if(order===1)await gate;
        try{return await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({text:order===1?'Устаревший ответ':'Новый ответ'})})}catch{return}
      }
      return route.fulfill({status:200,contentType:'text/html',body:html});
    });
    await page.goto('https://kaz-ai.test/');
    await page.locator('#messageInput').fill('Остановка без ожидания сети');
    await page.locator('#sendButton').click();
    await page.locator('#sessionBody input[type=password]').fill('safe-test-protected-key-123456789012345');
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    await page.waitForFunction(()=>document.querySelector('#sessionStop')?.hidden===false);
    await page.locator('#sessionStop').click();
    assert.equal(await page.locator('#sessionStop').isVisible(),false);
    assert.equal(await page.locator('#sessionRetry').isVisible(),true);
    assert.equal(await page.evaluate(()=>document.activeElement?.id),'sessionRetry');
    await page.locator('#sessionRetry').click();
    await page.waitForFunction(()=>document.querySelector('.message-assistant')?.textContent.includes('Новый ответ'));
    assert.equal(calls,2);
    assert.equal(await page.locator('.message-user').count(),1);
    assert.equal(await page.locator('.message-assistant').count(),1);
    release();
    await page.waitForTimeout(150);
    assert.ok(!(await page.locator('#chatMessages').innerText()).includes('Устаревший ответ'));
    assert.deepEqual(errors,[]);
  }finally{release?.();await browser.close()}
});

test('stop and retry of regeneration keeps original reply until a real replacement succeeds',async()=>{
  const bin=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(bin?{executablePath:bin}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  let release;
  try{
    const page=await browser.newPage({viewport:{width:1280,height:820}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const html=readFileSync('public/preview.html','utf8');
    const gate=new Promise(resolve=>{release=resolve});
    let calls=0;
    await page.route('https://kaz-ai.test/**',async route=>{
      if(new URL(route.request().url()).pathname==='/api/chat'){
        const order=++calls;
        if(order===2)await gate;
        try{return await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({text:order===1?'Исходный ответ':order===2?'Ненужный ответ':'Успешная замена'})})}catch{return}
      }
      return route.fulfill({status:200,contentType:'text/html',body:html});
    });
    await page.goto('https://kaz-ai.test/');
    await page.locator('#messageInput').fill('Проверить замену ответа');
    await page.locator('#sendButton').click();
    await page.locator('#sessionBody input[type=password]').fill('safe-test-protected-key-123456789012345');
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    await page.waitForFunction(()=>document.querySelector('.message-assistant')?.textContent.includes('Исходный ответ'));
    await page.locator('[data-session="retry-answer"]').click();
    await page.waitForFunction(()=>document.querySelector('#sessionStop')?.hidden===false);
    await page.locator('#sessionStop').click();
    assert.equal(await page.locator('#sessionRetry').isVisible(),true);
    assert.ok((await page.locator('#chatMessages').innerText()).includes('Исходный ответ'));
    await page.locator('#sessionRetry').click();
    await page.waitForFunction(()=>document.querySelector('.message-assistant')?.textContent.includes('Успешная замена'));
    release();
    await page.waitForTimeout(120);
    assert.equal(await page.locator('.message-assistant').count(),1);
    assert.equal(await page.locator('.message-user').count(),1);
    assert.ok(!(await page.locator('#chatMessages').innerText()).includes('Ненужный ответ'));
    assert.equal(calls,3);
    assert.deepEqual(errors,[]);
  }finally{release?.();await browser.close()}
});

test('opening a saved chat after a temporary chat switches off temporary mode safely',async()=>{
  const bin=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(bin?{executablePath:bin}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:820}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(appUrl);
    await page.locator('#messageInput').fill('Сохранённая тема');
    await page.locator('#sendButton').click();
    await page.locator('.sidebar [data-screen="settings"]').click();
    await page.locator('#sessionTemporary').check();
    await page.locator('#messageInput').fill('Временная секретная тема');
    await page.locator('#sendButton').click();
    await page.locator('.sidebar [data-screen="history"]').click();
    await page.locator('#historyList [data-session="open-chat"]').first().click();
    assert.equal(await page.locator('#sessionTemporary').isChecked(),false);
    assert.equal(await page.locator('#chatMessages .message-user').count(),1);
    await page.locator('.sidebar [data-action="new-chat"]').click();
    await page.locator('#messageInput').fill('Второй сохранённый чат');
    await page.locator('#sendButton').click();
    const snapshot=await page.evaluate(()=>window.KazSession.snapshot());
    assert.equal(snapshot.threads.length,2);
    assert.ok(snapshot.threads.every(x=>x.temporary===false));
    assert.ok(snapshot.threads.every(x=>!x.title.includes('секретная')));
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});

test('chat title ends at a complete emoji without corrupt surrogate halves',async()=>{
  const bin=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(bin?{executablePath:bin}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:820}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(appUrl);
    const message='А'.repeat(54)+'😀'+'продолжение';
    await page.locator('#messageInput').fill(message);
    await page.locator('#sendButton').click();
    const snapshot=await page.evaluate(()=>window.KazSession.snapshot());
    assert.equal(snapshot.threads[0].title,'А'.repeat(54)+'😀');
    assert.equal(await page.locator('.message-user').first().innerText(),message);
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});

test('projects show ungrouped chats before any folder and after deleting the last folder',async()=>{
  const bin=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(bin?{executablePath:bin}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:820}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(appUrl);
    await page.locator('#messageInput').fill('Обычная переписка без папки');
    await page.locator('#sendButton').click();
    await page.locator('.sidebar [data-screen="projects"]').click();
    assert.ok((await page.locator('#projectsWorkspace').innerText()).includes('Пока нет проектов'));
    assert.ok((await page.locator('#projectsWorkspace').innerText()).includes('Без проекта'));
    assert.equal(await page.locator('#projectsWorkspace [data-session="open-chat"]').count(),1);
    assert.equal(await page.locator('#projectsWorkspace [data-session="open-chat"]').getAttribute('aria-label'),'Открыть чат: Обычная переписка без папки');
    await page.locator('[data-session="new-project"]').click();
    await page.locator('#sessionBody input').fill('Рабочая папка');
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    await page.locator('[data-session="add-chat-to-project"]').click();
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    await page.locator('[data-session="delete-project"]').click();
    await page.locator('#sessionBody [data-session="dialog-confirm"]').click();
    assert.ok((await page.locator('#projectsWorkspace').innerText()).includes('Обычная переписка без папки'));
    assert.equal(await page.locator('#projectsWorkspace [data-session="open-chat"]').count(),1);
    await page.locator('#projectsWorkspace [data-session="open-chat"]').click();
    assert.equal(await page.locator('.message-user').count(),1);
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});

test('individual TXT export does not split an emoji in long filenames',async()=>{
  const bin=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(bin?{executablePath:bin}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:820},acceptDownloads:true});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(appUrl);
    await page.locator('#messageInput').fill('Проверка длинного имени файла');
    await page.locator('#sendButton').click();
    await page.locator('.sidebar [data-screen="history"]').click();
    await page.locator('#historyList [data-session="rename-chat"]').click();
    const longName='Я'.repeat(69)+'😀'+'конец';
    await page.locator('#sessionBody input').fill(longName);
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    const started=page.waitForEvent('download');
    await page.locator('#historyList [data-session="export-chat"]').click();
    const download=await started;
    assert.equal(download.suggestedFilename(),'Kaz-AI-'+'Я'.repeat(69)+'😀'+'.txt');
    const body=readFileSync(await download.path(),'utf8');
    assert.ok(body.includes('Проверка длинного имени файла'));
    assert.ok(body.includes(longName));
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});

test('clear-history-search accessible label follows RU EN KK and preserves search text',async()=>{
  const bin=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(bin?{executablePath:bin}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:820}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(appUrl);
    await page.locator('.sidebar [data-screen="history"]').click();
    await page.locator('#historySearch').fill('қарапайым');
    assert.equal(await page.locator('#sessionClearSearch').getAttribute('aria-label'),'Очистить поиск переписок');
    for(const [language,expected] of [['en','Clear chat search'],['kk','Чат іздеуін тазалау'],['ru','Очистить поиск переписок']]){
      await page.locator('#languageToggle').click();
      await page.locator('#languageMenu [data-language="'+language+'"]').click();
      assert.equal(await page.locator('#sessionClearSearch').getAttribute('aria-label'),expected);
      assert.equal(await page.locator('#historySearch').inputValue(),'қарапайым');
    }
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});

test('renaming a chat and a project restores focus to the same action after rebuilding cards',async()=>{
  const bin=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(bin?{executablePath:bin}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:820}});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(appUrl);
    await page.locator('#messageInput').fill('Первый вопрос');
    await page.locator('#sendButton').click();
    await page.locator('#messageInput').fill('Черновик, который нельзя потерять');
    await page.locator('.sidebar [data-screen="history"]').click();
    await page.locator('#historyList [data-session="rename-chat"]').click();
    await page.locator('#sessionBody input').fill('Новое имя чата');
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    assert.equal(await page.evaluate(()=>document.activeElement?.dataset.session),'rename-chat');
    assert.ok((await page.locator('#historyList').innerText()).includes('Новое имя чата'));
    await page.locator('.sidebar [data-screen="projects"]').click();
    await page.locator('[data-session="new-project"]').click();
    await page.locator('#sessionBody input').fill('Проект номер один');
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    await page.locator('[data-session="rename-project"]').click();
    await page.locator('#sessionBody input').fill('Переименованная папка');
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    assert.equal(await page.evaluate(()=>document.activeElement?.dataset.session),'rename-project');
    assert.ok((await page.locator('#projectsWorkspace').innerText()).includes('Переименованная папка'));
    await page.locator('.sidebar [data-screen="history"]').click();
    await page.locator('#historyList [data-session="open-chat"]').click();
    assert.equal(await page.locator('#messageInput').inputValue(),'Черновик, который нельзя потерять');
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});

test('adding a chat to a project preserves keyboard focus and its saved conversation',async()=>{
  const bin=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(bin?{executablePath:bin}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:820}});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(appUrl);
    await page.locator('#messageInput').fill('План на неделю');
    await page.locator('#sendButton').click();
    await page.locator('.sidebar [data-screen="projects"]').click();
    await page.locator('[data-session="new-project"]').click();
    await page.locator('#sessionBody input').fill('Рабочий проект');
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    await page.locator('[data-session="add-chat-to-project"]').click();
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    assert.equal(await page.evaluate(()=>document.activeElement?.dataset.session),'add-chat-to-project');
    assert.ok((await page.locator('#projectsWorkspace').innerText()).includes('План на неделю'));
    const snapshot=await page.evaluate(()=>window.KazSession.snapshot());
    assert.equal(snapshot.threads.length,1);
    assert.equal(snapshot.threads[0].projectId,snapshot.projects[0].id);
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});

test('compound emoji remain whole in first-message titles and exported TXT filenames',async()=>{
  const bin=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(bin?{executablePath:bin}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:820},acceptDownloads:true});
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.goto(appUrl);
    const family='👨‍👩‍👧‍👦';
    const title='З'.repeat(54)+family+'Хвост';
    await page.locator('#messageInput').fill(title);
    await page.locator('#sendButton').click();
    assert.equal((await page.evaluate(()=>window.KazSession.snapshot())).threads[0].title,'З'.repeat(54)+family);
    await page.locator('.sidebar [data-screen="history"]').click();
    await page.locator('#historyList [data-session="rename-chat"]').click();
    const joined='👩🏽‍💻';
    const downloadTitle='А'.repeat(69)+joined+'после';
    await page.locator('#sessionBody input').fill(downloadTitle);
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    const pending=page.waitForEvent('download');
    await page.locator('#historyList [data-session="export-chat"]').click();
    const file=await pending;
    // Chromium replaces the zero-width joiner in a download filename with an
    // underscore. The source chat title and TXT body must keep it unchanged.
    const filename=file.suggestedFilename();
    assert.equal(filename,'Kaz-AI-'+'А'.repeat(69)+joined.replace(/\u200d/g,'_')+'.txt');
    const body=readFileSync(await file.path(),'utf8');
    assert.ok(body.includes(downloadTitle));
    assert.ok(body.includes(title));
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});

test('AI timeout unlocks Retry even if a stalled fetch ignores AbortSignal, and rejects late answer',async()=>{
  const chromePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(chromePath?{executablePath:chromePath}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  let release;
  try{
    const page=await browser.newPage({viewport:{width:1280,height:820}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const html=readFileSync('public/preview.html','utf8');
    const gate=new Promise(resolve=>{release=resolve});
    let calls=0;
    await page.addInitScript(()=>{
      const baseSetTimeout=window.setTimeout.bind(window);
      window.setTimeout=(callback,delay,...args)=>
        baseSetTimeout(callback,delay===45000?600:delay,...args);
    });
    await page.route('https://kaz-ai.test/**',async route=>{
      if(new URL(route.request().url()).pathname==='/api/chat'){
        const index=++calls;
        if(index===1)await gate;
        try{
          return await route.fulfill({
            status:200,contentType:'application/json',
            body:JSON.stringify({text:index===1?'Устаревший ответ после тайм-аута':'Свежий ответ'})
          });
        }catch{return}
      }
      return route.fulfill({status:200,contentType:'text/html',body:html});
    });
    await page.goto('https://kaz-ai.test/');
    await page.locator('#messageInput').fill('Ответ должен завершиться по времени');
    await page.locator('#sendButton').click();
    await page.locator('#sessionBody input[type=password]').fill('safe-private-key-for-testing-123456789');
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    await page.waitForFunction(()=>document.querySelector('#sessionStop')?.hidden===false);
    await page.waitForFunction(()=>document.querySelector('#sessionRetry')?.hidden===false,{timeout:5000});
    assert.equal(await page.locator('#sessionStop').isVisible(),false);
    assert.ok((await page.locator('#statusBanner').innerText()).includes('45 секунд'));
    assert.equal(await page.locator('#sendButton').isDisabled(),true);
    await page.locator('#sessionRetry').click();
    await page.waitForFunction(()=>document.querySelector('.message-assistant')?.textContent.includes('Свежий ответ'));
    assert.equal(calls,2);
    release();
    await page.waitForTimeout(150);
    assert.ok(!(await page.locator('#chatMessages').innerText()).includes('Устаревший ответ'));
    assert.equal(await page.locator('.message-user').count(),1);
    assert.equal(await page.locator('.message-assistant').count(),1);
    assert.deepEqual(errors,[]);
  }finally{release?.();await browser.close()}
});

test('timed-out AI status stays hidden in History and restores Retry when returning to chat',async()=>{
  const chromePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(chromePath?{executablePath:chromePath}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  let release;
  try{
    const page=await browser.newPage({viewport:{width:1280,height:820}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const html=readFileSync('public/preview.html','utf8');
    const gate=new Promise(resolve=>{release=resolve});
    await page.addInitScript(()=>{
      const native=window.setTimeout.bind(window);
      window.setTimeout=(callback,ms,...args)=>native(callback,ms===45000?700:ms,...args);
    });
    let calls=0;
    await page.route('https://kaz-ai.test/**',async route=>{
      if(new URL(route.request().url()).pathname==='/api/chat'){
        calls++;
        await gate;
        try{return await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({text:'Старый ответ'})})}catch{return}
      }
      return route.fulfill({status:200,contentType:'text/html',body:html});
    });
    await page.goto('https://kaz-ai.test/');
    await page.locator('#messageInput').fill('Проверяем фоновый тайм-аут');
    await page.locator('#sendButton').click();
    await page.locator('#sessionBody input[type=password]').fill('safe-private-key-for-testing-123456789');
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    await page.waitForFunction(()=>document.querySelector('#sessionStop')?.hidden===false);
    await page.locator('.sidebar [data-screen="history"]').click();
    await page.waitForFunction(()=>document.querySelector('#sessionStop')?.hidden===true,{timeout:5000});
    assert.equal(await page.locator('#sessionRetry').isVisible(),false);
    await page.locator('#historyList [data-session="open-chat"]').click();
    assert.equal(await page.locator('#sessionRetry').isVisible(),true);
    assert.ok((await page.locator('#statusBanner').innerText()).includes('45 секунд'));
    assert.equal(calls,1);
    assert.deepEqual(errors,[]);
  }finally{release?.();await browser.close()}
});

test('static accessible control names switch RU EN KK and back without changing user chat text',async()=>{
  const path=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(path?{executablePath:path}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:820}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(appUrl);
    await page.locator('#messageInput').fill('Текст пользователя должен сохраниться');
    await page.locator('#sendButton').click();
    const selectors={'#historySearch':['Поиск по перепискам','Search chats','Чаттардан іздеу'],
      '#reasonToggle':['Уровень рассуждения','Reasoning level','Ойлау деңгейі'],
      '#sendButton':['Отправить сообщение','Send message','Хабарлама жіберу']};
    for(const [i,language] of ['ru','en','kk','ru'].entries()){
      if(i>0){
        await page.locator('#languageToggle').click();
        await page.locator('#languageMenu [data-language="'+language+'"]').click();
      }
      const index=language==='ru'?0:language==='en'?1:2;
      for(const [selector,values] of Object.entries(selectors)){
        assert.equal(await page.locator(selector).getAttribute('aria-label'),values[index],selector+' at '+language);
      }
      assert.ok((await page.locator('#chatMessages').innerText()).includes('Текст пользователя должен сохраниться'));
      assert.equal((await page.evaluate(()=>window.KazSession.snapshot())).threads.length,1);
    }
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});

test('AI access dialog validates the same 1,000-character maximum as the server',async()=>{
  const path=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(path?{executablePath:path}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:820}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(appUrl);
    await page.locator('.sidebar [data-screen="settings"]').click();
    await page.locator('[data-session="ai-access"]').click();
    const field=page.locator('#sessionBody input[type=password]');
    await field.fill('a'.repeat(1001));
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    assert.equal(await page.locator('#sessionOverlay').isVisible(),true);
    assert.match(await page.locator('#toast').innerText(),/Максимум 1000/);
    await page.locator('#sessionClose').click();
    assert.equal(await page.locator('#sessionBody input[type=password]').count(),0);
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});
