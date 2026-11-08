import test from 'node:test';
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
      assert.ok((await page.locator('#view-about').innerText()).includes('149 млрд параметров'));
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
