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

test('real browser: session chats, search, project folders, editing, branch, export and calculator', async () => {
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
    await page.locator('#chatMessages [data-session="edit-message"]').first().click();
    await page.locator('#sessionBody textarea').fill('Обновлённое первое сообщение');
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    assert.equal((await page.evaluate(()=>window.KazSession.snapshot().threads[0].messages)),1);
    assert.ok((await page.locator('#chatMessages').innerText()).includes('Обновлённое первое сообщение'));
    await page.locator('#chatMessages [data-session="branch-message"]').first().click();
    assert.equal((await page.evaluate(()=>window.KazSession.snapshot().threads.length)),2);
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

test('real browser: failed GPT answer retry retains original reply and editing regenerates', async () => {
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
          body:JSON.stringify({text:calls===1?'Первый успешный ответ':calls===3?'Повторный успешный ответ':'Новый ответ после редактирования'})
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
    await page.locator('[data-session="edit-message"]').first().click();
    await page.locator('#sessionBody textarea').fill('Исправленный вопрос');
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    await page.waitForFunction(()=>document.querySelector('.message-assistant')?.textContent.includes('Новый ответ после редактирования'));
    assert.equal(calls,4);
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
