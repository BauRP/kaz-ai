import { test as nodeTest } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { existsSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const test=(name,fn)=>nodeTest(name,{timeout:35000},fn);
const appUrl=pathToFileURL(resolve('public/preview.html')).href;
async function withPage(run){
  const executablePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({
    ...(executablePath?{executablePath}:{channel:'chrome'}),
    headless:true,args:['--no-sandbox','--disable-dev-shm-usage']
  });
  try{
    const page=await browser.newPage({locale:"ru-RU",viewport:{width:1280,height:820}});
    const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto(appUrl);
    await run(page);
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
}

async function makeConversation(page,contents){
  await page.locator('#messageInput').fill('Тема для поиска');
  await page.locator('#sendButton').click();
  await page.locator('#messageInput').fill(contents);
  await page.locator('#sendButton').click();
  await page.locator('.sidebar [data-screen="history"]').click();
}

test('long drafts stay scrollable and leave chat space on short laptop screens',async()=>{
  await withPage(async page=>{
    const draft=Array.from({length:30},(_,i)=>'Исходная строка '+i).join('\n');
    for(const [width,height] of [[1024,500],[844,390]]){
      await page.setViewportSize({width,height});
      await page.locator('#messageInput').fill(draft);
      const result=await page.locator('#messageInput').evaluate(el=>({
        height:el.getBoundingClientRect().height,scroll:el.scrollHeight,
        text:el.value,visible:el.getBoundingClientRect().bottom<=innerHeight+2
      }));
      assert.ok(result.height<=122,'Draft should not take over short viewport');
      assert.ok(result.scroll>result.height,'Draft must stay scrollable');
      assert.equal(result.text,draft);
      assert.ok(result.visible,'Composer must remain in the visible viewport');
    }
  });
});

test('tool category counts follow selected language without changing the active tools',async()=>{
  await withPage(async page=>{
    await page.locator('.sidebar [data-screen="tools"]').click();
    const count=await page.locator('#toolGroups [data-feature^="tool-"]').count();
    for(const [language,word] of [['de','Funktionen'],['es','funciones'],['fr','fonctions']]){
      await page.locator('.sidebar [data-screen="settings"]').click();
      await page.locator('#innerLanguage').selectOption(language);
      await page.locator('.sidebar [data-screen="tools"]').click();
      assert.ok((await page.locator('#toolGroups .tool-group-title small').allInnerTexts()).some(x=>x.includes(word)));
      assert.equal(await page.locator('#toolGroups [data-feature^="tool-"]').count(),count);
    }
  });
});

test('history counters translate into 17-language settings and preserve Arabic chat names',async()=>{
  await withPage(async page=>{
    const title='مرحبا Kaz AI Қазақша';
    await page.locator('#messageInput').fill(title);
    await page.locator('#sendButton').click();
    await page.locator('.sidebar [data-screen="history"]').click();
    assert.equal(await page.locator('#historyList .session-chat-label').first().getAttribute('dir'),'auto');
    assert.equal(await page.locator('#historyList .session-chat-label').first().textContent(),title);
    assert.equal(await page.locator('#recentChats .session-recent').first().getAttribute('dir'),'auto');
    await page.locator('#historySearch').fill('Kaz');
    await page.locator('.sidebar [data-screen="settings"]').click();
    await page.locator('#innerLanguage').selectOption('es');
    await page.locator('.sidebar [data-screen="history"]').click();
    assert.equal(await page.locator('#historySearchSummary').innerText(),'Conversaciones encontradas: 1 / 1');
    assert.equal(await page.locator('#historyList .session-chat-label').first().textContent(),title);
    await page.locator('.sidebar [data-screen="settings"]').click();
    await page.locator('#innerLanguage').selectOption('ar');
    await page.locator('.sidebar [data-screen="history"]').click();
    assert.equal(await page.locator('#historySearchSummary').innerText(),'المحادثات التي تم العثور عليها: 1 / 1');
    assert.equal(await page.locator('#historyList .session-chat-label').first().getAttribute('dir'),'auto');
    assert.equal(await page.locator('#historyList .session-chat-label').first().textContent(),title);
  });
});

test('AI response keeps natural writing direction under Arabic interface',async()=>{
  await withPage(async page=>{
    const html=readFileSync('public/preview.html','utf8');
    await page.route('https://kaz-ai.test/**',route=>{
      if(new URL(route.request().url()).pathname==='/api/chat'){
        return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({text:'English answer with 123 and API references.'})});
      }
      return route.fulfill({status:200,contentType:'text/html',body:html});
    });
    await page.goto('https://kaz-ai.test/');
    await page.locator('.sidebar [data-screen="settings"]').click();
    await page.locator('#innerLanguage').selectOption('ar');
    await page.locator('.sidebar [data-action="new-chat"]').click();
    await page.locator('#messageInput').fill('Explain this in English');
    await page.locator('#sendButton').click();
    await page.locator('#chatMessages .message-assistant .rich-answer').waitFor();
    const result=page.locator('#chatMessages .message-assistant .rich-answer').last();
    assert.equal(await result.getAttribute('dir'),'auto');
    assert.match(await result.innerText(),/English answer with 123/);
  });
});

test('responsive sidebar keeps Google, About, and recent chats reachable on short laptops and rotated phones',async()=>{
  await withPage(async page=>{
    await page.locator('#messageInput').fill('Разговор для проверки размеров экрана');
    await page.locator('#sendButton').click();
    const cases=[
      {width:1366,height:768,mobile:false},
      {width:1024,height:600,mobile:false},
      {width:800,height:500,mobile:false},
      {width:390,height:844,mobile:true},
      {width:844,height:390,mobile:false},
      {width:960,height:540,mobile:false},
      {width:768,height:480,mobile:false}
    ];
    for(const {width,height,mobile} of cases){
      await page.setViewportSize({width,height});
      if(mobile)await page.locator('.menu-button').first().click();
      const metrics=await page.evaluate(()=>{
        const sidebar=document.querySelector('#sidebar');
        const scroll=document.querySelector('#sidebarScroll');
        const footer=document.querySelector('.sidebar-footer');
        const google=footer.querySelector('.google-button');
        const recent=document.querySelector('#recentChats');
        const about=document.querySelector('.sidebar [data-screen="about"]');
        const rect=el=>{const r=el.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,width:r.width,height:r.height}};
        return {sidebar:rect(sidebar),scroll:rect(scroll),footer:rect(footer),google:rect(google),recent:rect(recent),about:rect(about),
          scrollHeight:scroll.scrollHeight,clientHeight:scroll.clientHeight,hasRecent:recent.textContent.includes('Разговор для проверки размеров экрана'),
          pageWidth:document.documentElement.scrollWidth,viewportWidth:document.documentElement.clientWidth};
      });
      assert.ok(metrics.google.height>20,'Google control should remain visible');
      assert.ok(metrics.footer.top>=metrics.scroll.bottom-2,'Footer must not overlap the scrolling navigation: '+JSON.stringify({width,height,metrics}));
      assert.ok(metrics.google.bottom<=height+2,'Google must fit within the viewport');
      assert.ok(metrics.pageWidth<=metrics.viewportWidth+2,'Page must not overflow horizontally');
      assert.ok(metrics.hasRecent,'Recent conversation must remain in sidebar');
      assert.ok(metrics.scrollHeight>=metrics.clientHeight,'Navigation must remain scrollable');
      await page.locator('.sidebar [data-screen="about"]').scrollIntoViewIfNeeded();
      await page.locator('#recentChats .session-recent').first().scrollIntoViewIfNeeded();
      if(mobile)await page.locator('[data-action="close-sidebar"]').click();
    }
  });
});

test('screen adaptation remains stable across pixel densities and viewport changes',async()=>{
  const executablePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(executablePath?{executablePath}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    for(const density of [1,1.5,2,3]){
      const context=await browser.newContext({locale:'ru-RU',deviceScaleFactor:density,viewport:{width:1024,height:600}});
      const page=await context.newPage();
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(appUrl);
      const measure=async()=>page.evaluate(()=>{
        const rect=selector=>{const r=document.querySelector(selector).getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right}};
        return {scroll:rect('#sidebarScroll'),footer:rect('.sidebar-footer'),google:rect('.google-button'),about:rect('.sidebar [data-screen="about"]'),documentWidth:document.documentElement.scrollWidth,viewport:document.documentElement.clientWidth};
      });
      const m=await measure();
      assert.ok(m.footer.top>=m.scroll.bottom-2,'Footer must not overlap navigation at density '+density);
      assert.ok(m.google.bottom<=600,'Google must stay reachable at density '+density);
      assert.ok(m.documentWidth<=m.viewport+2,'No horizontal overflow at density '+density);
      await page.locator('.sidebar [data-screen="about"]').scrollIntoViewIfNeeded();
      await context.close();
      assert.deepEqual(errors,[]);
    }
  }finally{await browser.close()}
});

test('normalization expansion and contraction do not shift search highlighting',async()=>{
  await withPage(async page=>{
    const original='\u0344Бe\u0301 ИСКОМОЕ';
    await makeConversation(page,original);
    await page.locator('#historySearch').fill('б');
    assert.equal(await page.locator('#historyList .session-chat-row').count(),1);
    assert.equal(await page.locator('#historyList .session-search-snippet mark').textContent(),'Б');
    await page.locator('#historyList [data-session="open-chat"]').click();
    assert.equal(await page.locator('#chatMessages .session-jump-hit mark').textContent(),'Б');
    assert.ok((await page.locator('#chatMessages').innerText()).includes(original));
    await page.locator('.sidebar [data-screen="history"]').click();
    await page.locator('#historySearch').fill('É');
    assert.equal(await page.locator('#historyList .session-search-snippet mark').textContent(),'e\u0301');
  });
});

test('matching a person in a family emoji highlights the full visible symbol',async()=>{
  await withPage(async page=>{
    const family='👨‍👩‍👧‍👦';
    await makeConversation(page,'Семья '+family+' вместе');
    await page.locator('#historySearch').fill('👨');
    assert.equal(await page.locator('#historyList .session-search-snippet mark').textContent(),family);
    await page.locator('#historyList [data-session="open-chat"]').click();
    assert.equal(await page.locator('#chatMessages .session-jump-hit mark').textContent(),family);
  });
});

test('search preview never cuts the beginning of a joined family emoji',async()=>{
  await withPage(async page=>{
    const family='👨‍👩‍👧‍👦';
    const content='а'.repeat(30)+family+'б'.repeat(35)+'найди здесь';
    await makeConversation(page,content);
    await page.locator('#historySearch').fill('найди');
    const snippet=await page.locator('#historyList .session-search-snippet').innerText();
    assert.ok(snippet.includes(family),JSON.stringify(snippet));
    assert.equal(await page.locator('#historyList .session-search-snippet mark').textContent(),'найди');
  });
});

test('translation, coding and document draft helpers preserve whitespace-only drafts',async()=>{
  await withPage(async page=>{
    const draft='  \n   ';
    await page.locator('#messageInput').fill(draft);
    await page.locator('.sidebar [data-screen="tools"]').click();
    for(const feature of [22,23,24]){
      await page.locator('#toolGroups [data-feature="tool-'+feature+'"]').click();
      await page.locator('#sessionBody textarea').fill('Подготовь текст запроса');
      await page.locator('#sessionBody [data-session="dialog-save"]').click();
      assert.equal(await page.locator('#sessionOverlay').isVisible(),true);
      assert.equal(await page.locator('#messageInput').inputValue(),draft);
      assert.match(await page.locator('#toast').innerText(),/есть черновик/);
      await page.locator('#sessionClose').click();
    }
    assert.equal((await page.evaluate(()=>window.KazSession.snapshot())).threads.length,0);
  });
});


test('newly enabled interface languages can prepare translation, code and document drafts',async()=>{
  await withPage(async page=>{
    await page.locator('.sidebar [data-screen="settings"]').click();
    await page.locator('#innerLanguage').selectOption('es');
    assert.equal(await page.locator('html').getAttribute('lang'),'es');
    await page.locator('.sidebar [data-screen="tools"]').click();
    await page.locator('#toolGroups [data-feature="tool-22"]').click();
    const languages=page.locator('#sessionBody select');
    assert.equal(await languages.locator('option').count(),17);
    await languages.selectOption('ja');
    await page.locator('#sessionBody textarea').fill('Buenos días');
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    const draft=await page.locator('#messageInput').inputValue();
    assert.match(draft,/Translate the following text into Japanese/);
    assert.match(draft,/Buenos días$/);
    await page.locator('#messageInput').fill('');
    await page.locator('.sidebar [data-screen="tools"]').click();
    await page.locator('#toolGroups [data-feature="tool-23"]').click();
    await page.locator('#sessionBody textarea').fill('  print("hola")\n');
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    assert.match(await page.locator('#messageInput').inputValue(),/Help with programming/);
    await page.locator('#messageInput').fill('');
    await page.locator('.sidebar [data-screen="tools"]').click();
    await page.locator('#toolGroups [data-feature="tool-24"]').click();
    await page.locator('#sessionBody textarea').fill('Brief meeting agenda');
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    assert.match(await page.locator('#messageInput').inputValue(),/Draft the document text/);
    assert.equal((await page.evaluate(()=>window.KazSession.snapshot())).threads.length,0);
  });
});

test('history and project controls translate dynamically on English and Kazakh without changing user titles',async()=>{
  await withPage(async page=>{
    await page.locator('#messageInput').fill('Личный проект Ω');
    await page.locator('#sendButton').click();
    await page.locator('.sidebar [data-screen="projects"]').click();
    await page.locator('[data-session="new-project"]').click();
    await page.locator('#sessionBody input').fill('Моя папка Ω');
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    for(const [lang,rename,folder] of [
      ['en','Rename','Add chat'],
      ['kk','Атау','Чат қосу']
    ]){
      await page.locator('#languageToggle').click();
      await page.locator('#languageMenu [data-language="'+lang+'"]').click();
      await page.locator('.sidebar [data-screen="history"]').click();
      const renameAction=page.locator('#historyList [data-session="rename-chat"]');
      assert.equal((await renameAction.innerText()).trim(),rename);
      assert.match(await page.locator('#historyList').innerText(),/Личный проект Ω/);
      await page.locator('.sidebar [data-screen="projects"]').click();
      assert.match(await page.locator('#projectsWorkspace').innerText(),/Моя папка Ω/);
      const add=page.locator('#projectsWorkspace [data-session="add-chat-to-project"]');
      assert.equal((await add.innerText()).trim(),'＋ '+folder);
    }
  });
});

test('split-CRLF streaming answer completes and counts only real API attempts',async()=>{
  const executablePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(executablePath?{executablePath}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({locale:"ru-RU"});
    const html=readFileSync('public/preview.html','utf8');
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.addInitScript(()=>{
      const nativeFetch=window.fetch.bind(window);
      window.fetch=(url,options)=>{
        if(new URL(url,location.href).pathname!=="/api/chat")return nativeFetch(url,options);
        // Every SSE byte is a separate read, including CR/LF and UTF-8 pieces.
        const payload=': connected\r\n\r\nevent: final\r\ndata: {"text":"Полный ответ без ошибок"}\r\n\r\nevent: done\r\ndata: {}\r\n\r\n';
        const bytes=new TextEncoder().encode(payload);
        return Promise.resolve(new Response(new ReadableStream({
          start(controller){for(const byte of bytes)controller.enqueue(Uint8Array.of(byte));controller.close()}
        }),{status:200,headers:{"content-type":"text/event-stream"}}));
      };
    });
    await page.route('https://kaz-ai.test/**',route=>route.fulfill({status:200,contentType:'text/html',body:html}));
    await page.goto('https://kaz-ai.test/');
    await page.locator('#messageInput').fill('Объясни мне потоки');
    await page.locator('#sendButton').click();
    await page.waitForFunction(()=>document.querySelector('#chatMessages .message-assistant')?.textContent.includes('Полный ответ без ошибок'));
    await page.waitForFunction(()=>document.querySelector('#sessionStop')?.hidden===true);
    assert.equal((await page.evaluate(()=>window.KazSession.snapshot())).threads[0].messages,2);
    await page.locator('.sidebar [data-screen="settings"]').click();
    await page.locator('#internalSettingsRoot [data-is-tab="usage"]').click();
    assert.equal(await page.locator('#innerRequestsAttempted').innerText(),'1');
    assert.equal(await page.locator('#innerRequestsSucceeded').innerText(),'1');
    assert.equal(await page.locator('#innerRequestsFailed').innerText(),'0');
    assert.equal(await page.locator('#innerRequestsStopped').innerText(),'0');
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});

test('translator prepares natural Russian and Kazakh names for additional target languages',async()=>{
  await withPage(async page=>{
    for(const [ui,target,text,expected] of [
      ['ru','ja','Доброе утро','на японский язык'],
      ['kk','pt','Қайырлы таң','португал тіліне']
    ]){
      await page.locator('#languageToggle').click();
      await page.locator('#languageMenu [data-language="'+ui+'"]').click();
      await page.locator('.sidebar [data-screen="tools"]').click();
      await page.locator('#toolGroups [data-feature="tool-22"]').click();
      await page.locator('#sessionBody select').selectOption(target);
      await page.locator('#sessionBody textarea').fill(text);
      await page.locator('#sessionBody [data-session="dialog-save"]').click();
      const prompt=await page.locator('#messageInput').inputValue();
      assert.ok(prompt.includes(expected),prompt);
      assert.ok(prompt.endsWith(text));
      await page.locator('#messageInput').fill('');
    }
  });
});

test('assigning an existing chat to a folder updates both screens and keeps keyboard focus',async()=>{
  await withPage(async page=>{
    await page.locator('#messageInput').fill('Сохранённый разговор');
    await page.locator('#sendButton').click();
    await page.locator('.sidebar [data-screen="projects"]').click();
    await page.locator('[data-session="new-project"]').click();
    await page.locator('#sessionBody input').fill('Дела');
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    await page.locator('.sidebar [data-screen="history"]').click();
    const action=page.locator('#historyList [data-session="assign-chat"]');
    await action.click();
    await page.locator('#sessionBody select').selectOption({label:'Дела'});
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    assert.equal(await page.evaluate(()=>document.activeElement?.dataset.session),'assign-chat');
    assert.equal(await page.locator('#sessionOverlay').isVisible(),false);
    await page.locator('.sidebar [data-screen="projects"]').click();
    assert.ok((await page.locator('#projectsWorkspace').innerText()).includes('Сохранённый разговор'));
    const snapshot=await page.evaluate(()=>window.KazSession.snapshot());
    assert.equal(snapshot.threads[0].projectId,snapshot.projects[0].id);
    await page.locator('.sidebar [data-screen="history"]').click();
    await page.locator('#historyList [data-session="open-chat"]').click();
    assert.ok((await page.locator('#chatMessages').innerText()).includes('Сохранённый разговор'));
  });
});

test('code indentation survives send, history navigation and TXT export',async()=>{
  await withPage(async page=>{
    const source='  function demo() {\n    return 42;\n  }\n';
    await page.locator('#messageInput').fill(source);
    await page.locator('#sendButton').click();
    assert.equal(await page.locator('#chatMessages .message-user > span').textContent(),source);
    const before=await page.evaluate(()=>window.KazSession.snapshot());
    assert.equal(before.threads[0].title,'function demo() {\n    return 42;\n  }\n');
    await page.locator('.sidebar [data-screen="history"]').click();
    await page.locator('#historyList [data-session="open-chat"]').click();
    assert.equal(await page.locator('#chatMessages .message-user > span').textContent(),source);
    await page.locator('.sidebar [data-screen="history"]').click();
    const pending=page.waitForEvent('download');
    await page.locator('#historyList [data-session="export-chat"]').click();
    const file=await pending;
    const {readFileSync}=await import('node:fs');
    assert.ok(readFileSync(await file.path(),'utf8').includes('Вы: '+source));
  });
});

test('full history TXT export works in all newly selectable languages',async()=>{
  await withPage(async page=>{
    const source='  Kaz AI: қазақша, русский, Español 😀';
    await page.locator('#messageInput').fill(source);
    await page.locator('#sendButton').click();
    await page.locator('.sidebar [data-screen="settings"]').click();
    for(const locale of ['fr','ar','ja']){
      await page.locator('#innerLanguage').selectOption(locale);
      const pending=page.waitForEvent('download');
      await page.locator('#view-settings [data-feature="export"]').click();
      const file=await pending;
      assert.equal(file.suggestedFilename(),'Kaz-AI-history.txt');
      const text=readFileSync(await file.path(),'utf8');
      assert.ok(text.startsWith('\uFEFF'));
      assert.match(text,/Kaz AI: қазақша, русский, Español/);
      const localized={
        fr:['Export de la conversation actuelle','Vous : '],
        ar:['تصدير المحادثة الحالية','أنت: '],
        ja:['現在の会話をエクスポート','あなた: ']
      }[locale];
      assert.ok(text.includes(localized[0]),'Localized export heading: '+locale);
      assert.ok(text.includes(localized[1]),'Localized speaker: '+locale);
    }
  });
});

test('AI-dependent rating and personal instructions accurately show partial status',async()=>{
  await withPage(async page=>{
    await page.locator('.sidebar [data-screen="tools"]').click();
    for(const id of [13,40]){
      assert.equal(await page.locator('#toolGroups [data-feature="tool-'+id+'"] small').innerText(),'Частично');
    }
    await page.locator('#languageToggle').click();
    await page.locator('#languageMenu [data-language="en"]').click();
    for(const id of [13,40]){
      assert.equal(await page.locator('#toolGroups [data-feature="tool-'+id+'"] small').innerText(),'Partly working');
    }
    await page.locator('#languageToggle').click();
    await page.locator('#languageMenu [data-language="kk"]').click();
    for(const id of [13,40]){
      const status=await page.locator('#toolGroups [data-feature="tool-'+id+'"] small').innerText();
      assert.notEqual(status,'Жұмыс істейді');
      assert.notEqual(status,'Работает');
    }
  });
});

test('whitespace-only input cannot create a new message',async()=>{
  await withPage(async page=>{
    await page.locator('#messageInput').fill(' \n\t  ');
    assert.equal(await page.locator('#sendButton').isDisabled(),true);
    assert.equal((await page.evaluate(()=>window.KazSession.snapshot())).threads.length,0);
  });
});


test('old browser fallback preserves family emoji in title and search highlighting',async()=>{
  await withPage(async page=>{
    await page.addInitScript(()=>{Object.defineProperty(Intl,'Segmenter',{value:undefined,configurable:true})});
    await page.reload();
    const family='👨‍👩‍👧‍👦';
    await page.locator('#messageInput').fill('З'.repeat(54)+family+'конец');
    await page.locator('#sendButton').click();
    assert.equal((await page.evaluate(()=>window.KazSession.snapshot())).threads[0].title,'З'.repeat(54)+family);
    await page.locator('#messageInput').fill('Семья '+family+' вместе');
    await page.locator('#sendButton').click();
    await page.locator('.sidebar [data-screen="history"]').click();
    await page.locator('#historySearch').fill('👨');
    assert.equal(await page.locator('#historyList .session-search-snippet mark').textContent(),family);
    await page.locator('#historyList [data-session="open-chat"]').click();
    assert.equal(await page.locator('#chatMessages .session-jump-hit mark').textContent(),family);
  });
});

test('IME confirmation keyCode 229 does not send unfinished Kazakh input',async()=>{
  await withPage(async page=>{
    const input=page.locator('#messageInput');
    await input.fill('Қазақша мәтін');
    await page.evaluate(()=>{
      const field=document.querySelector('#messageInput');
      const event=new KeyboardEvent('keydown',{bubbles:true,cancelable:true,key:'Enter',isComposing:false});
      Object.defineProperty(event,'keyCode',{get:()=>229});
      field.dispatchEvent(event);
    });
    assert.equal((await page.evaluate(()=>window.KazSession.snapshot())).threads.length,0);
    assert.equal(await input.inputValue(),'Қазақша мәтін');
    await input.press('Enter');
    assert.equal((await page.evaluate(()=>window.KazSession.snapshot())).threads.length,1);
    assert.equal(await page.locator('.message-user').count(),1);
  });
});


test('text helpers preserve leading whitespace and trailing newlines without automatic send',async()=>{
  await withPage(async page=>{
    const sample='  if (ready) {\n    return value;\n  }\n\n';
    await page.locator('.sidebar [data-screen="tools"]').click();
    for(const feature of [22,23,24]){
      await page.locator('#toolGroups [data-feature="tool-'+feature+'"]').click();
      if(feature===22)await page.locator('#sessionBody select').selectOption('en');
      await page.locator('#sessionBody textarea').fill(sample);
      await page.locator('#sessionBody [data-session="dialog-save"]').click();
      assert.equal(await page.locator('#sessionOverlay').isVisible(),false);
      const result=await page.locator('#messageInput').inputValue();
      assert.ok(result.endsWith('\n\n'+sample),'whitespace changed for tool-'+feature+': '+JSON.stringify(result.slice(-70)));
      assert.equal((await page.evaluate(()=>window.KazSession.snapshot())).threads.length,0);
      await page.locator('#messageInput').fill('');
      await page.locator('.sidebar [data-screen="tools"]').click();
    }
  });
});

test('mixed Arabic and Latin drafts keep automatic text direction without altering content',async()=>{
  await withPage(async page=>{
    const sample='مرحبا Kazakhstan 123 /api/chat';
    const input=page.locator('#messageInput');
    assert.equal(await input.getAttribute('dir'),'auto');
    await input.fill(sample);
    assert.equal(await input.inputValue(),sample);
    await page.locator('.sidebar [data-screen="tools"]').click();
    for(const feature of [22,23,24]){
      await page.locator('#toolGroups [data-feature="tool-'+feature+'"]').click();
      const field=page.locator('#sessionBody textarea');
      assert.equal(await field.getAttribute('dir'),'auto');
      await page.locator('#sessionClose').click();
    }
    assert.equal(await input.inputValue(),sample);
    await page.locator('#languageToggle').click();
    await page.locator('#languageMenu [data-language="kk"]').click();
    assert.equal(await input.inputValue(),sample);
    assert.equal(await input.getAttribute('dir'),'auto');
    // Submitted message text must keep its own direction even when the UI
    // has switched to an RTL language.
    await page.locator('#sendButton').click();
    assert.equal(await page.locator('#chatMessages .session-user-text').first().getAttribute('dir'),'auto');
    assert.equal(await page.locator('#chatMessages .session-user-text').first().textContent(),sample);
  });
});

test('IME confirmation does not prematurely rename a chat or create a project',async()=>{
  await withPage(async page=>{
    await page.locator('#messageInput').fill('Исходный чат');
    await page.locator('#sendButton').click();
    await page.locator('.sidebar [data-screen="history"]').click();
    await page.locator('#historyList [data-session="rename-chat"]').click();
    const name=page.locator('#sessionBody input');
    await name.fill('Жаңа атау');
    await page.evaluate(()=>{
      const input=document.querySelector('#sessionBody input');
      const key=new KeyboardEvent('keydown',{bubbles:true,cancelable:true,key:'Enter',isComposing:false});
      Object.defineProperty(key,'keyCode',{get:()=>229});
      input.dispatchEvent(key);
    });
    assert.equal(await page.locator('#sessionOverlay').isVisible(),true);
    assert.equal((await page.evaluate(()=>window.KazSession.snapshot())).threads[0].title,'Исходный чат');
    await name.press('Enter');
    assert.equal((await page.evaluate(()=>window.KazSession.snapshot())).threads[0].title,'Жаңа атау');
    await page.locator('.sidebar [data-screen="projects"]').click();
    await page.locator('[data-session="new-project"]').click();
    await page.locator('#sessionBody input').fill('Қазақша жоба');
    await page.evaluate(()=>{
      const input=document.querySelector('#sessionBody input');
      input.dispatchEvent(new KeyboardEvent('keydown',{bubbles:true,cancelable:true,key:'Enter',isComposing:true}));
    });
    assert.equal(await page.locator('#sessionOverlay').isVisible(),true);
    assert.equal((await page.evaluate(()=>window.KazSession.snapshot())).projects.length,0);
    await page.locator('#sessionBody input').press('Enter');
    const projects=(await page.evaluate(()=>window.KazSession.snapshot())).projects;
    assert.equal(projects.length,1);
    assert.equal(projects[0].name,'Қазақша жоба');
  });
});

test('chat and project action accessibility labels identify their item on RU EN and KK',async()=>{
  await withPage(async page=>{
    for(const title of ['Первый уникальный чат','Второй уникальный чат']){
      if(title.startsWith('Второй'))await page.locator('.sidebar [data-action="new-chat"]').click();
      await page.locator('#messageInput').fill(title);
      await page.locator('#sendButton').click();
    }
    await page.locator('.sidebar [data-screen="projects"]').click();
    await page.locator('[data-session="new-project"]').click();
    await page.locator('#sessionBody input').fill('Рабочая папка');
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    for(const [lang,rename,remove,download] of [
      ['ru','Название','Удалить','Скачать'],['en','Rename','Delete','Download'],['kk','Атау','Жою','Жүктеп алу']
    ]){
      if(lang!=='ru'){
        await page.locator('#languageToggle').click();
        await page.locator('#languageMenu [data-language="'+lang+'"]').click();
      }
      await page.locator('.sidebar [data-screen="history"]').click();
      const rows=page.locator('#historyList .session-chat-row');
      assert.equal(await rows.count(),2);
      for(const i of [0,1]){
        const row=rows.nth(i);
        const name=(await row.locator('.session-chat-label').textContent()).trim();
        assert.equal(await row.locator('[data-session="rename-chat"]').getAttribute('aria-label'),rename+': '+name);
        assert.equal(await row.locator('[data-session="delete-chat"]').getAttribute('aria-label'),remove+': '+name);
        assert.equal(await row.locator('[data-session="export-chat"]').getAttribute('aria-label'),download+': '+name);
      }
      await page.locator('.sidebar [data-screen="projects"]').click();
      const control=page.locator('#projectsWorkspace [data-session="rename-project"]');
      const verb=lang==='en'?'Rename':lang==='kk'?'Қайта атау':'Переименовать';
      assert.equal(await control.getAttribute('aria-label'),verb+': Рабочая папка');
    }
  });
});


test('temporary-mode toggle preserves unsent welcome and temporary-chat drafts',async()=>{
  await withPage(async page=>{
    const composer=page.locator('#messageInput');
    const toggle=page.locator('#sessionTemporary');
    await composer.fill('Незавершённый черновик до первого чата');
    await page.locator('.sidebar [data-screen="settings"]').click();
    // Click, not Playwright.check(): the app intentionally reverses this change.
    await toggle.click();
    assert.equal(await toggle.isChecked(),false,'must reject a destructive switch');
    assert.equal(await composer.inputValue(),'Незавершённый черновик до первого чата');
    assert.match(await page.locator('#toast').innerText(),/есть черновик/);
    assert.equal((await page.evaluate(()=>window.KazSession.snapshot())).threads.length,0);
    await composer.fill('');
    // The rejected switch deliberately returned to the visible composer.
    await page.locator('.sidebar [data-screen="settings"]').click();
    await toggle.check();
    assert.equal(await toggle.isChecked(),true);
    await composer.fill('Приватный разговор');
    await page.locator('#sendButton').click();
    const state=await page.evaluate(()=>window.KazSession.snapshot());
    assert.equal(state.threads.length,1);
    assert.equal(state.threads[0].temporary,true);
    await composer.fill('Неотправленный приватный черновик');
    await page.locator('.sidebar [data-screen="settings"]').click();
    // App restores the checkbox because a temporary draft is still present.
    await toggle.click();
    assert.equal(await toggle.isChecked(),true,'active temporary draft must remain');
    assert.equal(await composer.inputValue(),'Неотправленный приватный черновик');
    assert.equal((await page.evaluate(()=>window.KazSession.snapshot())).threads.length,1);
    await composer.fill('');
    await page.locator('.sidebar [data-screen="settings"]').click();
    await toggle.uncheck();
    assert.equal(await toggle.isChecked(),false);
    assert.equal((await page.evaluate(()=>window.KazSession.snapshot())).threads.length,0);
    assert.equal(await composer.inputValue(),'');
  });
});

test('IME Escape does not erase chat search or close a naming dialog prematurely',async()=>{
  await withPage(async page=>{
    await page.locator('#messageInput').fill('Тестовая переписка для поиска');
    await page.locator('#sendButton').click();
    await page.locator('.sidebar [data-screen="history"]').click();
    const search=page.locator('#historySearch');
    await search.fill('Тестовая');
    await search.evaluate(input=>{
      const event=new KeyboardEvent('keydown',{key:'Escape',isComposing:true,bubbles:true,cancelable:true});
      input.dispatchEvent(event);
    });
    assert.equal(await search.inputValue(),'Тестовая');
    await search.press('Escape');
    assert.equal(await search.inputValue(),'');
    await page.locator('.sidebar [data-screen="projects"]').click();
    await page.locator('[data-session="new-project"]').click();
    const projectName=page.locator('#sessionBody input');
    await projectName.fill('Название, ещё вводится');
    await projectName.evaluate(input=>{
      const event=new KeyboardEvent('keydown',{key:'Escape',isComposing:true,bubbles:true,cancelable:true});
      input.dispatchEvent(event);
    });
    assert.equal(await page.locator('#sessionOverlay').isVisible(),true);
    assert.equal(await projectName.inputValue(),'Название, ещё вводится');
    await projectName.press('Escape');
    assert.equal(await page.locator('#sessionOverlay').isVisible(),false);
    assert.equal((await page.evaluate(()=>window.KazSession.snapshot())).projects.length,0);
  });
});

test('new chat does not discard an unsent welcome or temporary conversation draft',async()=>{
  await withPage(async page=>{
    const composer=page.locator('#messageInput');
    const newChat=page.locator('.sidebar [data-action="new-chat"]');
    await composer.fill('Черновик приветственного сообщения');
    await newChat.click();
    assert.equal(await composer.inputValue(),'Черновик приветственного сообщения');
    assert.match(await page.locator('#toast').innerText(),/есть черновик/);
    assert.equal((await page.evaluate(()=>window.KazSession.snapshot())).threads.length,0);
    await composer.fill('');
    await page.locator('.sidebar [data-screen="settings"]').click();
    await page.locator('#sessionTemporary').check();
    await composer.fill('Приватное сообщение');
    await page.locator('#sendButton').click();
    await composer.fill('Секретный неотправленный черновик');
    await newChat.click();
    assert.equal(await composer.inputValue(),'Секретный неотправленный черновик');
    const blocked=await page.evaluate(()=>window.KazSession.snapshot());
    assert.equal(blocked.threads.length,1);
    assert.equal(blocked.threads[0].temporary,true);
    await composer.fill('');
    await newChat.click();
    assert.equal(await composer.inputValue(),'');
    assert.equal((await page.evaluate(()=>window.KazSession.snapshot())).threads.length,0);
  });
});

test('IME Escape never closes Google or feature dialogs before composition finishes',async()=>{
  await withPage(async page=>{
    await page.locator('.sidebar .google-button').click();
    const google=page.locator('#googleOverlay');
    assert.equal(await google.isVisible(),true);
    await page.evaluate(()=>{
      document.dispatchEvent(new KeyboardEvent('keydown',{
        key:'Escape',isComposing:true,bubbles:true,cancelable:true
      }));
    });
    assert.equal(await google.isVisible(),true);
    await page.keyboard.press('Escape');
    assert.equal(await google.isVisible(),false);
    await page.locator('#attachToggle').click();
    await page.locator('#attachMenu [data-feature="file"]').click();
    const modal=page.locator('#modalOverlay');
    assert.equal(await modal.isVisible(),true);
    await page.evaluate(()=>{
      const event=new KeyboardEvent('keydown',{
        key:'Escape',bubbles:true,cancelable:true
      });
      Object.defineProperty(event,'keyCode',{get:()=>229});
      document.dispatchEvent(event);
    });
    assert.equal(await modal.isVisible(),true);
    await page.keyboard.press('Escape');
    assert.equal(await modal.isVisible(),false);
  });
});

test('opening a saved conversation never loses an unsent temporary draft',async()=>{
  await withPage(async page=>{
    const composer=page.locator('#messageInput');
    await composer.fill('Сохранённая тема');
    await page.locator('#sendButton').click();
    await page.locator('.sidebar [data-screen="settings"]').click();
    await page.locator('#sessionTemporary').check();
    await composer.fill('Секретное отправленное сообщение');
    await page.locator('#sendButton').click();
    await composer.fill('Приватный черновик, нельзя потерять');
    await page.locator('.sidebar [data-screen="history"]').click();
    await page.locator('#historyList [data-session="open-chat"]').first().click();
    assert.equal(await page.locator('#view-chat').isVisible(),true);
    assert.equal(await composer.inputValue(),'Приватный черновик, нельзя потерять');
    let snapshot=await page.evaluate(()=>window.KazSession.snapshot());
    assert.equal(snapshot.threads.length,2);
    assert.equal(snapshot.threads.find(x=>x.id===snapshot.active).temporary,true);
    assert.equal(await page.locator('#sessionTemporary').isChecked(),true);
    assert.match(await page.locator('#toast').innerText(),/есть черновик/);
    await composer.fill('');
    await page.locator('.sidebar [data-screen="history"]').click();
    await page.locator('#historyList [data-session="open-chat"]').first().click();
    snapshot=await page.evaluate(()=>window.KazSession.snapshot());
    assert.equal(snapshot.threads.length,1);
    assert.equal(snapshot.threads[0].temporary,false);
    assert.equal(snapshot.active,snapshot.threads[0].id);
    assert.equal(await page.locator('#sessionTemporary').isChecked(),false);
  });
});

test('blocked new-chat navigation reveals the draft behind Settings or Tools',async()=>{
  await withPage(async page=>{
    const composer=page.locator('#messageInput');
    await composer.fill('Черновик на стартовом экране');
    await page.locator('.sidebar [data-screen="settings"]').click();
    await page.locator('.sidebar [data-action="new-chat"]').click();
    assert.equal(await page.locator('#view-welcome').isVisible(),true);
    assert.equal(await composer.inputValue(),'Черновик на стартовом экране');
    assert.equal(await composer.evaluate(e=>document.activeElement===e),true);
    await composer.fill('');
    await page.locator('.sidebar [data-screen="settings"]').click();
    await page.locator('#sessionTemporary').check();
    await composer.fill('Тема временного разговора');
    await page.locator('#sendButton').click();
    await composer.fill('Временный черновик');
    await page.locator('.sidebar [data-screen="tools"]').click();
    await page.locator('.sidebar [data-action="new-chat"]').click();
    assert.equal(await page.locator('#view-chat').isVisible(),true);
    assert.equal(await composer.inputValue(),'Временный черновик');
    assert.equal((await page.evaluate(()=>window.KazSession.snapshot())).threads.length,1);
  });
});

test('brand Home handles unsent temporary and welcome drafts without double navigation',async()=>{
  await withPage(async page=>{
    const composer=page.locator('#messageInput');
    const home=page.locator('[data-action="home"]');
    await composer.fill('Черновик перед первым чатом');
    await home.click();
    assert.equal(await page.locator('#view-welcome').isVisible(),true);
    assert.equal(await composer.inputValue(),'Черновик перед первым чатом');
    assert.equal((await page.evaluate(()=>window.KazSession.snapshot())).threads.length,0);
    await composer.fill('');
    await page.locator('.sidebar [data-screen="settings"]').click();
    await page.locator('#sessionTemporary').check();
    await composer.fill('Сообщение временного чата');
    await page.locator('#sendButton').click();
    await composer.fill('Неотправленное личное сообщение');
    await home.click();
    assert.equal(await page.locator('#view-chat').isVisible(),true);
    assert.equal(await composer.inputValue(),'Неотправленное личное сообщение');
    assert.equal((await page.evaluate(()=>window.KazSession.snapshot())).threads.length,1);
    assert.equal(await page.locator('#sessionTemporary').isChecked(),true);
    await composer.fill('');
    await home.click();
    assert.equal(await page.locator('#view-welcome').isVisible(),true);
    assert.equal((await page.evaluate(()=>window.KazSession.snapshot())).threads.length,0);
  });
});

test('rejected temporary toggle reveals the unsent draft rather than hiding it behind settings',async()=>{
  await withPage(async page=>{
    const composer=page.locator('#messageInput');
    const toggle=page.locator('#sessionTemporary');
    await composer.fill('Важный черновик перед переключением');
    await page.locator('.sidebar [data-screen="settings"]').click();
    await toggle.click();
    assert.equal(await toggle.isChecked(),false);
    assert.equal(await page.locator('#view-welcome').isVisible(),true);
    assert.equal(await composer.inputValue(),'Важный черновик перед переключением');
    assert.equal(await composer.evaluate(input=>document.activeElement===input),true);
    await composer.fill('');
    await page.locator('.sidebar [data-screen="settings"]').click();
    await toggle.check();
    await composer.fill('Вопрос временного чата');
    await page.locator('#sendButton').click();
    await composer.fill('Приватный черновик');
    await page.locator('.sidebar [data-screen="settings"]').click();
    await toggle.click();
    assert.equal(await toggle.isChecked(),true);
    assert.equal(await page.locator('#view-chat').isVisible(),true);
    assert.equal(await composer.inputValue(),'Приватный черновик');
    assert.equal((await page.evaluate(()=>window.KazSession.snapshot())).threads.length,1);
  });
});

test('English and Kazakh accessible region names follow the interface language without altering user text',async()=>{
  await withPage(async page=>{
    const sidebar=page.locator('#sidebar'),welcome=page.locator('#view-welcome'),chat=page.locator('#view-chat');
    assert.equal(await sidebar.getAttribute('aria-label'),'Боковое меню');
    assert.equal(await welcome.getAttribute('aria-label'),'Главная Kaz AI');
    assert.equal(await chat.getAttribute('aria-label'),'Переписка');
    const composer=page.locator('#messageInput');
    await composer.fill('Переписка');
    await page.locator('#sendButton').click();
    for(const [lang,sidebarLabel,welcomeLabel,chatLabel] of [
      ['en','Sidebar','Kaz AI home','Conversation'],
      ['kk','Бүйірлік мәзір','Kaz AI басты беті','Әңгіме'],
      ['ru','Боковое меню','Главная Kaz AI','Переписка']
    ]){
      await page.locator('#languageToggle').click();
      await page.locator('#languageMenu [data-language="'+lang+'"]').click();
      assert.equal(await sidebar.getAttribute('aria-label'),sidebarLabel);
      assert.equal(await welcome.getAttribute('aria-label'),welcomeLabel);
      assert.equal(await chat.getAttribute('aria-label'),chatLabel);
      assert.equal(await page.locator('#chatMessages .message-user > span').textContent(),'Переписка');
      assert.equal(await page.locator('html').getAttribute('lang'),lang);
    }
  });
});

test('project names differing only by repeated Unicode spaces do not create duplicate folders',async()=>{
  await withPage(async page=>{
    await page.locator('.sidebar [data-screen="projects"]').click();
    await page.locator('[data-session="new-project"]').click();
    await page.locator('#sessionBody input').fill('Планы  2027');
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    assert.equal((await page.evaluate(()=>window.KazSession.snapshot())).projects.length,1);
    await page.locator('[data-session="new-project"]').click();
    await page.locator('#sessionBody input').fill('Планы\u00a02027');
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    assert.equal((await page.evaluate(()=>window.KazSession.snapshot())).projects.length,1);
    assert.equal(await page.locator('#sessionOverlay').isVisible(),true);
    assert.match(await page.locator('#toast').innerText(),/уже существует/);
    await page.locator('#sessionBody input').fill('Другие планы');
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    assert.equal((await page.evaluate(()=>window.KazSession.snapshot())).projects.length,2);
    await page.locator('#projectsWorkspace [data-session="rename-project"]').last().click();
    await page.locator('#sessionBody input').fill('Планы    2027');
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    const snapshot=await page.evaluate(()=>window.KazSession.snapshot());
    assert.equal(snapshot.projects.length,2);
    assert.equal(snapshot.projects.at(-1).name,'Другие планы');
    assert.equal(await page.locator('#sessionOverlay').isVisible(),true);
    await page.locator('#sessionClose').click();
  });
});

test('pinning from Tools shows the reordered history and focuses the changed control',async()=>{
  await withPage(async page=>{
    await page.locator('#messageInput').fill('Сохранённый разговор');
    await page.locator('#sendButton').click();
    await page.locator('#messageInput').fill('Неотправленный текст');
    await page.locator('.sidebar [data-screen="tools"]').click();
    await page.locator('#toolGroups [data-feature="tool-6"]').click();
    assert.equal(await page.locator('#view-history').isVisible(),true);
    const pin=page.locator('#historyList [data-session="pin-chat"]');
    assert.equal(await pin.getAttribute('aria-pressed'),'true');
    assert.equal(await pin.evaluate(el=>document.activeElement===el),true);
    assert.equal(await page.locator('#messageInput').inputValue(),'Неотправленный текст');
    await page.locator('.sidebar [data-screen="tools"]').click();
    await page.locator('#toolGroups [data-feature="tool-6"]').click();
    assert.equal(await page.locator('#view-history').isVisible(),true);
    assert.equal(await pin.getAttribute('aria-pressed'),'false');
    assert.equal(await pin.evaluate(el=>document.activeElement===el),true);
    await page.locator('#historyList [data-session="open-chat"]').click();
    assert.equal(await page.locator('#messageInput').inputValue(),'Неотправленный текст');
  });
});

test('tools search recognizes names in all three languages without changing the selected interface',async()=>{
  await withPage(async page=>{
    await page.locator('.sidebar [data-screen="tools"]').click();
    const search=page.locator('#toolsSearch');
    const results=page.locator('#toolGroups [data-feature="tool-22"]');
    for(const [query,expectedLang] of [
      ['Translator','ru'],
      ['АУДАРМАШЫ','ru'],
      ['Переводчик','ru']
    ]){
      await search.fill(query);
      assert.equal(await results.count(),1,query);
      assert.equal(await page.locator('html').getAttribute('lang'),expectedLang);
    }
    await search.fill('Translator');
    await page.locator('#languageToggle').click();
    await page.locator('#languageMenu [data-language="kk"]').click();
    assert.equal(await search.inputValue(),'Translator');
    assert.equal(await results.count(),1);
    assert.equal(await page.locator('html').getAttribute('lang'),'kk');
    await page.locator('#languageToggle').click();
    await page.locator('#languageMenu [data-language="en"]').click();
    assert.equal(await search.inputValue(),'Translator');
    assert.equal(await results.count(),1);
    await search.fill('Аудармашы');
    assert.equal(await results.count(),1);
    await page.locator('#languageToggle').click();
    await page.locator('#languageMenu [data-language="ru"]').click();
    assert.equal(await search.inputValue(),'Аудармашы');
    assert.equal(await results.count(),1);
    assert.equal((await page.evaluate(()=>window.KazSession.snapshot())).threads.length,0);
  });
});

test('all active light and medium tool names and descriptions have English and Kazakh translations',async()=>{
  await withPage(async page=>{
    const active=[1,2,3,4,5,6,7,9,10,13,15,16,22,23,24,40,41,42,43,44,45];
    const original=await page.evaluate(ids=>ids.map(id=>{
      const item=FEATURE_GROUPS.flatMap(g=>g.items).find(x=>x[0]===id);
      return {id,title:item[1],description:item[2]};
    }),active);
    const composer=page.locator('#messageInput');
    await composer.fill('Не менять: Қазақша, русский, English');
    await page.locator('.sidebar [data-screen="tools"]').click();
    for(const lang of ['en','kk']){
      await page.locator('#languageToggle').click();
      await page.locator('#languageMenu [data-language="'+lang+'"]').click();
      const values=await page.evaluate(ids=>ids.map(id=>{
        const item=FEATURE_GROUPS.flatMap(g=>g.items).find(x=>x[0]===id);
        const card=document.querySelector('#toolGroups [data-feature="tool-'+id+'"]');
        return {id,title:card.querySelector('strong').textContent,
          description:card.querySelector('p').textContent,
          targetTitle:window.KazI18n.translateFor(window.KazI18n.language,item[1]),
          targetDescription:window.KazI18n.translateFor(window.KazI18n.language,item[2])};
      }),active);
      assert.equal(values.length,21);
      for(const item of values){
        const baseline=original.find(x=>x.id===item.id);
        assert.equal(item.title,item.targetTitle,'Title for '+lang+' feature '+item.id);
        assert.equal(item.description,item.targetDescription,'Description for '+lang+' feature '+item.id);
        assert.notEqual(item.description,baseline.description,'Untranslated '+lang+' description for '+item.id);
      }
      for(const id of [5,6,7,10,13,15,16,23,24,42])
        assert.notEqual(values.find(x=>x.id===id).title,original.find(x=>x.id===id).title,
          'Untranslated '+lang+' title for '+id);
      assert.equal(await composer.inputValue(),'Не менять: Қазақша, русский, English');
      assert.equal(await page.locator('html').getAttribute('lang'),lang);
    }
    await page.locator('#languageToggle').click();
    await page.locator('#languageMenu [data-language="ru"]').click();
    for(const item of original){
      const card=page.locator('#toolGroups [data-feature="tool-'+item.id+'"]');
      assert.equal(await card.locator('strong').textContent(),item.title);
      assert.equal(await card.locator('p').textContent(),item.description);
    }
  });
});

test('changing interface language refreshes stop, retry and temporary-chat labels in place',async()=>{
  await withPage(async page=>{
    await page.locator('.sidebar [data-screen="settings"]').click();
    for(const [lang,stop,retry,temporary] of [
      ['en','Stop','Retry request','Temporary chat'],
      ['kk','Тоқтату','Сұрауды қайталау','Уақытша чат'],
      ['ru','Остановить','Повторить запрос','Временный чат']
    ]){
      await page.locator('#languageToggle').click();
      await page.locator('#languageMenu [data-language="'+lang+'"]').click();
      assert.equal(await page.locator('#sessionStop').textContent(),stop);
      assert.equal(await page.locator('#sessionRetry').textContent(),retry);
      assert.equal(await page.locator('#sessionTemporary').locator('xpath=ancestor::div[contains(@class,"setting-item")]//h2').textContent(),temporary);
    }
    assert.equal((await page.evaluate(()=>window.KazSession.snapshot())).threads.length,0);
  });
});

test('language and font tools move keyboard focus from hidden cards onto visible controls',async()=>{
  await withPage(async page=>{
    await page.locator('.sidebar [data-screen="tools"]').click();
    await page.locator('#toolGroups [data-feature="tool-43"]').click();
    assert.equal(await page.locator('#languageMenu').isVisible(),true);
    assert.equal(await page.locator('#languageToggle').getAttribute('aria-expanded'),'true');
    assert.equal(await page.locator('#languageToggle').evaluate(el=>document.activeElement===el),true);
    await page.keyboard.press('Escape');
    await page.locator('.sidebar [data-screen="tools"]').click();
    await page.locator('#toolGroups [data-feature="tool-44"]').click();
    assert.equal(await page.locator('#view-settings').isVisible(),true);
    assert.equal(await page.locator('#fontMenu').isVisible(),true);
    assert.equal(await page.locator('#fontToggle').getAttribute('aria-expanded'),'true');
    assert.equal(await page.locator('#fontToggle').evaluate(el=>document.activeElement===el),true);
    assert.equal((await page.evaluate(()=>window.KazSession.snapshot())).threads.length,0);
  });
});

test('public chat has no access key in settings',async()=>{
  await withPage(async page=>{
    await page.locator('.sidebar [data-screen="settings"]').click();
    assert.equal(await page.locator('[data-session="ai-access"]').count(),0);
    assert.equal(await page.locator('input[type=password]').count(),0);
  });
});

test('project assignment dialog heading follows English and Kazakh interface choices',async()=>{
  await withPage(async page=>{
    await page.locator('#messageInput').fill('Project assignment locale');
    await page.locator('#sendButton').click();
    for(const [lang,expected] of [['en','Add chat to project'],['kk','Чатты жобаға қосу']]){
      await page.locator('#languageToggle').click();
      await page.locator('#languageMenu [data-language="'+lang+'"]').click();
      await page.locator('.sidebar [data-screen="history"]').click();
      await page.locator('#historyList [data-session="assign-chat"]').click();
      assert.equal(await page.locator('#sessionTitle').innerText(),expected);
      await page.locator('#sessionClose').click();
    }
    assert.ok((await page.locator('#historyList').innerText()).includes('Project assignment locale'),
      'The user-authored title must remain unchanged');
  });
});

test('project dialog localizes commands without translating the project title',async()=>{
  await withPage(async page=>{
    await page.locator('#messageInput').fill('Saved discussion');
    await page.locator('#sendButton').click();
    await page.locator('.sidebar [data-screen="projects"]').click();
    await page.locator('#projectsWorkspace [data-session="new-project"]').click();
    await page.locator('#sessionBody input').fill('Жоба & Study');
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    for(const [lang,title] of [
      ['en','Add chat to “Жоба & Study”'],['kk','«Жоба & Study» жобасына чат қосу']
    ]){
      await page.locator('#languageToggle').click();
      await page.locator('#languageMenu [data-language="'+lang+'"]').click();
      await page.locator('#projectsWorkspace [data-session="add-chat-to-project"]').click();
      assert.equal(await page.locator('#sessionTitle').innerText(),title);
      await page.locator('#sessionClose').click();
    }
  });
});

test('public chat key stays hidden in EN and KK',async()=>{
  await withPage(async page=>{
    for(const lang of ['en','kk']){
      await page.locator('#languageToggle').click();
      await page.locator('#languageMenu [data-language="'+lang+'"]').click();
      await page.locator('.sidebar [data-screen="settings"]').click();
      assert.equal(await page.locator('[data-session="ai-access"]').count(),0);
    }
  });
});

test('sending a message in a long conversation keeps the chat scrollbar at the newest message',async()=>{
  await withPage(async page=>{
    for(let i=0;i<15;i++){
      await page.locator('#messageInput').fill('Сообщение номер '+i+' '.repeat(10)+'Длинная переписка. '.repeat(9));
      await page.locator('#sendButton').click();
    }
    await page.waitForFunction(()=>document.querySelector('#mainContent').scrollHeight>document.querySelector('#mainContent').clientHeight+300);
    await page.locator('#mainContent').evaluate(el=>{el.scrollTop=0});
    await page.locator('#messageInput').fill('Новое сообщение, которое должно остаться внизу');
    await page.locator('#sendButton').click();
    await page.waitForTimeout(100);
    const info=await page.locator('#mainContent').evaluate(el=>({
      top:el.scrollTop,bottom:el.scrollHeight-el.scrollTop-el.clientHeight
    }));
    assert.ok(info.top>100,'Long conversation must have an actual scrollable area');
    assert.ok(info.bottom<=4,'Sending must scroll to the latest message, not to the top: '+JSON.stringify(info));
    assert.equal(await page.locator('#chatMessages .message-user').last().locator('.session-user-text').textContent(),
      'Новое сообщение, которое должно остаться внизу');
  });
});
test('receiving a late AI response keeps the position when reading older chat messages',async()=>{
  const executablePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(executablePath?{executablePath}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({locale:'ru-RU',viewport:{width:1280,height:720}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const html=readFileSync('public/preview.html','utf8');
    let requests=0;
    let finishSecond;
    const gate=new Promise(resolve=>{finishSecond=resolve});
    await page.route('https://kaz-ai.test/**',async route=>{
      if(new URL(route.request().url()).pathname!=='/api/chat')
        return route.fulfill({status:200,contentType:'text/html',body:html});
      requests++;
      if(requests===2)await gate;
      return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
        text:requests===1?Array.from({length:100},(_,i)=>'Старая строка ответа '+i).join('\n'):'НОВЫЙ_ОТВЕТ'
      })});
    });
    await page.goto('https://kaz-ai.test/');
    await page.locator('#messageInput').fill('Первый вопрос');
    await page.locator('#sendButton').click();
    await page.waitForFunction(()=>document.querySelector('#chatMessages')?.textContent.includes('Старая строка ответа 99'));
    await page.locator('#messageInput').fill('Второй вопрос');
    await page.locator('#sendButton').click();
    await page.waitForFunction(()=>document.querySelector('#sessionStop')?.hidden===false);
    await page.locator('#mainContent').evaluate(el=>{el.scrollTop=0});
    const before=await page.locator('#mainContent').evaluate(el=>el.scrollTop);
    finishSecond();
    await page.waitForFunction(()=>document.querySelector('#chatMessages')?.textContent.includes('НОВЫЙ_ОТВЕТ'));
    const after=await page.locator('#mainContent').evaluate(el=>el.scrollTop);
    assert.ok(after<=before+4,'Reader must not jump down on response completion: '+JSON.stringify({before,after}));
    assert.equal(requests,2);
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});

test('long user bubbles collapse to ten rendered lines and expand/collapse without losing text',async()=>{
  await withPage(async page=>{
    const prompt=Array.from({length:22},(_,i)=>'Строка '+(i+1)+': полное содержание сообщения').join('\n');
    await page.locator('#messageInput').fill(prompt);
    await page.locator('#sendButton').click();
    const bubble=page.locator('#chatMessages .message-user').last();
    const content=bubble.locator('.session-user-text');
    const toggle=bubble.locator('.session-message-expand');
    await toggle.waitFor({state:'visible'});
    assert.equal(await toggle.getAttribute('aria-expanded'),'false');
    const before=await content.evaluate(el=>({
      shown:el.clientHeight,full:el.scrollHeight,line:parseFloat(getComputedStyle(el).lineHeight)
    }));
    assert.ok(before.full>before.shown+10);
    assert.ok(before.shown<=before.line*10+3,
      'Collapsed prompt must show at most about ten lines: '+JSON.stringify(before));
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-expanded'),'true');
    assert.equal(await content.textContent(),prompt,'Expanding must preserve the entire exact prompt');
    const expanded=await content.evaluate(el=>el.clientHeight);
    assert.ok(expanded>before.shown);
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-expanded'),'false');
    const collapsed=await content.evaluate(el=>el.clientHeight);
    assert.ok(collapsed<expanded);
    assert.equal(await content.textContent(),prompt,'Collapsing must not cut or modify the saved user text');
    await page.locator('#messageInput').fill('Короткий текст');
    await page.locator('#sendButton').click();
    assert.equal(await page.locator('#chatMessages .message-user').last().locator('.session-message-expand').isVisible(),false);
    await page.setViewportSize({width:390,height:800});
    await page.waitForTimeout(100);
    assert.equal(await page.locator('#chatMessages .message-user').first().locator('.session-message-expand').isVisible(),true);
  });
});

test('long prompt expand labels switch languages without collapsing or changing the message',async()=>{
  await withPage(async page=>{
    const prompt=Array.from({length:22},(_,i)=>'Длинная строка '+(i+1)+' с текстом').join('\n');
    await page.locator('#messageInput').fill(prompt);
    await page.locator('#sendButton').click();
    const bubble=page.locator('#chatMessages .message-user').last();
    const toggle=bubble.locator('.session-message-expand');
    await toggle.waitFor({state:'visible'});
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-expanded'),'true');
    await page.locator('#languageToggle').click();
    await page.locator('#languageMenu [data-language="en"]').click();
    assert.equal(await toggle.getAttribute('aria-label'),'Show less');
    assert.equal(await toggle.getAttribute('aria-expanded'),'true');
    assert.equal(await bubble.locator('.session-user-text').textContent(),prompt);
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-label'),'Show more');
    await page.locator('#languageToggle').click();
    await page.locator('#languageMenu [data-language="kk"]').click();
    assert.equal(await toggle.getAttribute('aria-label'),'Толық көрсету');
    // A fourth language must not fall back to English in long chat messages.
    // The quick language popover is intentionally RU/KK/EN only. The other
    // 14 supported locales are selected through the internal Settings page.
    await page.locator('.sidebar [data-screen="settings"]').click();
    await page.locator('#innerLanguage').selectOption('de');
    await page.locator('#recentChats .session-recent').first().click();
    assert.equal(await toggle.getAttribute('aria-label'),'Mehr anzeigen');
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-label'),'Weniger anzeigen');
    assert.equal(await bubble.locator('.session-user-text').textContent(),prompt);
    await page.locator('.sidebar [data-screen="settings"]').click();
    await page.locator('#innerLanguage').selectOption('es');
    await page.locator('#recentChats .session-recent').first().click();
    assert.equal(await toggle.getAttribute('aria-label'),'Mostrar menos');
  });
});
test('text size setting updates composer and history text without losing draft',async()=>{
  await withPage(async page=>{
    const draft='Проверка размера текста в поле ввода';
    await page.locator('#messageInput').fill(draft);
    await page.locator('.sidebar [data-screen="settings"]').click();
    await page.locator('#fontToggle').click();
    await page.locator('#fontMenu [data-font="large"]').click();
    let size=await page.locator('#messageInput').evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
    assert.ok(size>=17,'Large text applies to composer');
    assert.equal(await page.locator('#messageInput').inputValue(),draft);
    await page.locator('#fontToggle').click();
    await page.locator('#fontMenu [data-font="small"]').click();
    size=await page.locator('#messageInput').evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
    assert.ok(size<=12,'Compact text applies to composer');
    assert.equal(await page.locator('#messageInput').inputValue(),draft);
  });
});

test('translation dialog remains within short laptop and rotated-phone viewports',async()=>{
  await withPage(async page=>{
    await page.locator('.sidebar [data-screen="tools"]').click();
    for(const [width,height] of [[1024,500],[800,390],[390,560]]){
      await page.setViewportSize({width,height});
      await page.locator('#toolGroups [data-feature="tool-22"]').click();
      const bounds=await page.locator('#sessionOverlay .session-dialog').evaluate(el=>{
        const r=el.getBoundingClientRect();
        return {top:r.top,bottom:r.bottom,left:r.left,right:r.right,height:r.height};
      });
      assert.ok(bounds.top>=-2&&bounds.bottom<=height+2,'Dialog fits height: '+JSON.stringify({width,height,bounds}));
      assert.ok(bounds.left>=-2&&bounds.right<=width+2,'Dialog fits width: '+JSON.stringify({width,height,bounds}));
      await page.locator('#sessionClose').click();
      assert.equal(await page.locator('#sessionOverlay').isVisible(),false);
    }
  });
});

test('mobile navigation scrim closes when zoom or rotation switches to desktop width',async()=>{
  await withPage(async page=>{
    await page.setViewportSize({width:390,height:844});
    await page.locator('[data-action="toggle-sidebar"]').click();
    assert.equal(await page.locator('#sidebar').getAttribute('class').then(v=>v.includes('open')),true);
    assert.equal(await page.locator('#drawerScrim').isVisible(),true);
    await page.setViewportSize({width:1024,height:640});
    await page.waitForFunction(()=>!document.querySelector('#sidebar').classList.contains('open'));
    assert.equal(await page.locator('#drawerScrim').isVisible(),false);
    assert.equal(await page.locator('.sidebar [data-screen="history"]').isVisible(),true);
  });
});

test('expanded long prompt stays expanded across assistant response and history navigation',async()=>{
  await withPage(async page=>{
    const prompt=Array.from({length:24},(_,i)=>'Строка '+i+' с данными').join('\n');
    await page.locator('#messageInput').fill(prompt);
    await page.locator('#sendButton').click();
    let question=page.locator('#chatMessages .message-user').last();
    let toggle=question.locator('.session-message-expand');
    await toggle.waitFor({state:'visible'});
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-expanded'),'true');
    // Opening the conversation later must not discard this display preference.
    await page.locator('.sidebar [data-screen="history"]').click();
    await page.locator('#historyList [data-session="open-chat"]').first().click();
    question=page.locator('#chatMessages .message-user').last();
    toggle=question.locator('.session-message-expand');
    assert.equal(await toggle.getAttribute('aria-expanded'),'true');
    assert.equal(await question.locator('.session-user-text').textContent(),prompt);
    assert.equal(await toggle.isVisible(),true);
    await toggle.click();
    assert.equal(await toggle.getAttribute('aria-expanded'),'false');
  });
});
test('preliminary AI reasoning preview is replaced by finished answer, without saving the draft',async()=>{
  const executablePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(executablePath?{executablePath}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({locale:"ru-RU",viewport:{width:1280,height:820}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const {readFileSync}=await import('node:fs');
    const html=readFileSync('public/preview.html','utf8');
    const frames=[
      ': connected',
      'event: progress\ndata: '+JSON.stringify({message:'Проверяю решение'}),
      'event: preview\ndata: '+JSON.stringify({text:'## Предварительный ответ\n\nНЕПРОВЕРЕННОЕ_РЕШЕНИЕ'}),
      'event: final\ndata: '+JSON.stringify({text:'## Исправленный ответ (повторно не проверен)\n\nИСПРАВЛЕННАЯ_ВЕРСИЯ'}),
      'event: done\ndata: {}'
    ].join('\n\n')+'\n\n';
    await page.route('https://kaz-ai.test/**',route=>new URL(route.request().url()).pathname==='/api/chat'
      ?route.fulfill({status:200,contentType:'text/event-stream',body:frames,headers:{'Cache-Control':'no-store'}})
      :route.fulfill({status:200,contentType:'text/html',body:html}));
    await page.goto('https://kaz-ai.test/');
    await page.locator('#messageInput').fill('Строго докажи корректность математической формулы');
    await page.locator('#sendButton').click();
    await page.waitForFunction(()=>document.querySelector('#chatMessages .message-assistant')?.textContent.includes('ИСПРАВЛЕННАЯ_ВЕРСИЯ'));
    const answer=await page.locator('#chatMessages .message-assistant').last().textContent();
    assert.match(answer,/Исправленный ответ/);
    assert.doesNotMatch(answer,/НЕПРОВЕРЕННОЕ_РЕШЕНИЕ/);
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});

test('incomplete JSON AI reply stays a temporary preview and retry saves only the finished response',async()=>{
  const executablePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(executablePath?{executablePath}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({locale:"ru-RU",viewport:{width:1280,height:820}});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    const {readFileSync}=await import('node:fs');
    const html=readFileSync('public/preview.html','utf8');
    let calls=0;
    await page.route('https://kaz-ai.test/**',route=>new URL(route.request().url()).pathname==='/api/chat'
      ?route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(
        ++calls===1
          ?{text:'## Ответ модели не завершён\\n\\nНЕПОЛНОЕ_РЕШЕНИЕ',incomplete:true}
          :{text:'Проверенный_полный_ответ',incomplete:false}
      )})
      :route.fulfill({status:200,contentType:'text/html',body:html}));
    await page.goto('https://kaz-ai.test/');
    await page.locator('#messageInput').fill('Сложный вопрос');
    await page.locator('#sendButton').click();
    await page.waitForFunction(()=>document.querySelector('#chatMessages')?.textContent.includes('Ответ прервался'));
    assert.match(await page.locator('#chatMessages').innerText(),/НЕПОЛНОЕ_РЕШЕНИЕ/);
    assert.equal(await page.evaluate(()=>window.KazSession.snapshot().threads[0].messages),1);
    assert.equal(await page.locator('#sessionRetry').isVisible(),true);
    await page.locator('#sessionRetry').click();
    await page.waitForFunction(()=>document.querySelector('#chatMessages')?.textContent.includes('Проверенный_полный_ответ'));
    const savedCount=await page.evaluate(()=>window.KazSession.snapshot().threads[0].messages);
    assert.equal(savedCount,2);
    assert.match(await page.locator('#chatMessages .message-assistant').last().innerText(),/Проверенный_полный_ответ/);
    assert.doesNotMatch(await page.locator('#chatMessages').innerText(),/НЕПОЛНОЕ_РЕШЕНИЕ/);
    assert.equal(calls,2);
    const usage=await page.evaluate(()=>window.KazSession.usageSnapshot());
    assert.deepEqual(usage,{requestsAttempted:2,requestsSucceeded:1,requestsFailed:1,requestsStopped:0});
    assert.deepEqual(errors,[]);
  }finally{await browser.close()}
});


test('internal settings shell exposes languages, appearance, account and payment without fake data',async()=>{
  await withPage(async page=>{
    await page.locator('.sidebar [data-screen="settings"]').click();
    const settings=page.locator('#internalSettingsRoot');
    assert.equal(await settings.locator('[data-is-tab]').count(),7);
    assert.equal(await page.locator('#innerLanguage option').count(),18);
    await settings.locator('[data-is-tab="appearance"]').click();
    assert.equal(await page.locator('#innerTheme option').count(),10);
    await page.locator('input[name="innerMode"][value="light"]').check();
    assert.equal(await page.locator('body').evaluate(el=>el.classList.contains("light")),true);
    await page.locator('#innerAccent').evaluate(input=>{
      input.value='#ff8800';
      input.dispatchEvent(new Event('input',{bubbles:true}));
    });
    assert.equal(await page.locator('body').evaluate(el=>el.style.getPropertyValue('--accent')),'#ff8800');
    await settings.locator('[data-is-tab="billing"]').click();
    assert.match(await settings.innerText(),/•••• •••• •••• ••••/);
    await settings.locator('[data-is-dialog="transactions"]').click();
    assert.equal(await page.locator('#innerSettingsDialog').isVisible(),true);
    assert.match(await page.locator('#innerDialogBody').innerText(),/не подключена/i);
    await page.locator('[data-is-dialog-close]').last().click();
    await settings.locator('[data-is-tab="general"]').click();
    await page.locator('#innerLanguage').selectOption('en');
    assert.equal(await page.locator('#innerSettingsTitle').innerText(),'Internal settings');
    assert.equal(await page.locator('html').getAttribute('lang'),'en');
    await page.locator('#innerLanguage').selectOption('ar');
    assert.equal(await page.locator('html').getAttribute('dir'),'rtl');
    await page.locator('#innerLanguage').selectOption('ru');
    assert.equal(await page.locator('html').getAttribute('dir'),'ltr');
  });
});

test('internal settings translate account, security and billing details and dialogs without fake account data',async()=>{
  await withPage(async page=>{
    await page.locator('.sidebar [data-screen="settings"]').click();
    const root=page.locator('#internalSettingsRoot');
    await page.locator('#innerLanguage').selectOption('en');
    await root.locator('[data-is-tab="appearance"]').click();
    assert.equal(await page.locator('#innerTheme option[value="ocean"]').innerText(),'Ocean');
    await root.locator('[data-is-action="reset-appearance"]').click();
    assert.match(await page.locator('#toast').innerText(),/Appearance reset/);
    await root.locator('[data-is-tab="account"]').click();
    assert.match(await root.innerText(),/Google sign-in is not connected/);
    assert.match(await root.innerText(),/Email address/);
    assert.match(await root.innerText(),/Not connected/);
    await root.locator('[data-is-tab="security"]').click();
    await root.locator('[data-is-dialog="sessions"]').click();
    assert.equal(await page.locator('#innerDialogTitle').innerText(),'Active sessions');
    assert.match(await page.locator('#innerDialogBody').innerText(),/No real session history/);
    await page.locator('[data-is-dialog-close]').last().click();
    await root.locator('[data-is-tab="billing"]').click();
    assert.match(await root.innerText(),/Payments and subscriptions are disabled/);
    await root.locator('[data-is-dialog="transactions"]').click();
    assert.match(await page.locator('#innerDialogBody').innerText(),/no genuine transaction history/);
    await page.locator('[data-is-dialog-close]').last().click();
    await root.locator('[data-is-tab="general"]').click();
    await page.locator('#innerLanguage').selectOption('kk');
    await root.locator('[data-is-tab="appearance"]').click();
    assert.equal(await page.locator('#innerTheme option[value="forest"]').innerText(),'Орман');
    await root.locator('[data-is-tab="account"]').click();
    assert.match(await root.innerText(),/Google арқылы кіру әлі қосылмаған/);
    await root.locator('[data-is-tab="security"]').click();
    await root.locator('[data-is-dialog="sessions"]').click();
    assert.match(await page.locator('#innerDialogBody').innerText(),/Әзірге нақты тарих жоқ/);
    await page.locator('[data-is-dialog-close]').last().click();
    await root.locator('[data-is-tab="general"]').click();
    await page.locator('#innerLanguage').selectOption('es');
    await root.locator('[data-is-tab="billing"]').click();
    assert.match(await root.innerText(),/Payments and subscriptions are disabled/);
    await root.locator('[data-is-tab="usage"]').click();
    await root.locator('[data-is-dialog="plans"]').click();
    assert.match(await page.locator('#innerDialogBody').innerText(),/Payments and subscriptions|payments are disabled/i);
    await page.locator('[data-is-dialog-close]').last().click();
  });
});

test('temporary chat cannot be pinned or shown in saved history',async()=>{
  await withPage(async page=>{
    await page.locator('.sidebar [data-screen="settings"]').click();
    await page.locator('#sessionTemporary').check();
    await page.locator('#messageInput').fill('Временный чат для проверки закрепления');
    await page.locator('#sendButton').click();
    await page.locator('.sidebar [data-screen="tools"]').click();
    await page.locator('#toolGroups [data-feature="tool-6"]').click();
    assert.match(await page.locator('#toast').innerText(),/Временные чаты нельзя закреплять/);
    const snapshot=await page.evaluate(()=>window.KazSession.snapshot());
    assert.equal(snapshot.threads[0].temporary,true);
    assert.equal(snapshot.threads[0].pinned,false);
    await page.locator('.sidebar [data-screen="history"]').click();
    assert.equal(await page.locator('#historyList [data-session="pin-chat"]').count(),0);
  });
});

test('local welcome greeting is not mistaken for a genuine rated AI answer',async()=>{
  await withPage(async page=>{
    await page.locator('#messageInput').fill('Муханова Айслу');
    await page.locator('#sendButton').click();
    assert.match(await page.locator('#chatMessages').innerText(),/Здравствуйте, мама создателя/);
    assert.equal(await page.locator('#chatMessages [data-session="rate-up"]').count(),0);
    assert.equal(await page.locator('#chatMessages [data-session="rate-down"]').count(),0);
    assert.equal(await page.locator('#chatMessages [data-session="retry-answer"]').count(),0);
  });
});

test('font size and reasoning effort persist across reload without restoring chat history',async()=>{
  await withPage(async page=>{
    await page.locator('.sidebar [data-screen="settings"]').click();
    await page.locator('#fontToggle').click();
    await page.locator('[data-font="large"]').click();
    assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('font-large')),true);
    await page.locator('.sidebar [data-screen="tools"]').click();
    await page.locator('#toolGroups [data-feature="tool-16"]').click();
    await page.locator('[data-reason="high"]').click();
    await page.reload();
    assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('font-large')),true);
    assert.equal(await page.locator('#fontLabel').innerText(),'Крупный');
    assert.equal(await page.locator('#currentReason').innerText(),'Высокий');
    assert.equal(await page.locator('[data-reason="high"]').getAttribute('aria-pressed'),'true');
    assert.equal((await page.evaluate(()=>window.KazSession.snapshot())).threads.length,0);
  });
});

test('reset appearance restores original dark mode as well as custom colors',async()=>{
  await withPage(async page=>{
    await page.locator('.sidebar [data-screen="settings"]').click();
    const root=page.locator('#internalSettingsRoot');
    await root.locator('[data-is-tab="appearance"]').click();
    await root.locator('input[name="innerMode"][value="light"]').check();
    await root.locator('#innerTheme').selectOption('ocean');
    await root.locator('[data-is-action="reset-appearance"]').click();
    assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('light')),false);
    assert.equal(await root.locator('#innerTheme').inputValue(),'kaz');
    assert.equal(await root.locator('input[name="innerMode"][value="dark"]').isChecked(),true);
  });
});

test('math formatter preserves prose after a same-line closed block formula',async()=>{
  await withPage(async page=>{
    const result=await page.evaluate(()=>{
      const el=window.KazFormat.render('$$x=1$$ Это важное условие после формулы.');
      return el.textContent;
    });
    assert.match(result,/x=1/);
    assert.match(result,/Это важное условие после формулы/);
  });
});
test('preview survives progress updates and a failed review, without claiming verification',async()=>{
  const executablePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(executablePath?{executablePath}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({locale:"ru-RU",viewport:{width:1280,height:820}});
    const {readFileSync}=await import('node:fs');
    const html=readFileSync('public/preview.html','utf8');
    const frames=[
      ': connected',
      'event: preview\ndata: '+JSON.stringify({text:'## Предварительный ответ\n\nСОХРАНИТЬ_ЭТОТ_ТЕКСТ'}),
      'event: progress\ndata: '+JSON.stringify({message:'Идёт проверка решения'}),
      'event: error\ndata: '+JSON.stringify({code:'AI_PROVIDER_TIMEOUT',message:'Проверка не завершилась',incidentId:'abcdef123456'})
    ].join('\n\n')+'\n\n';
    await page.route('https://kaz-ai.test/**',route=>new URL(route.request().url()).pathname==='/api/chat'
      ?route.fulfill({status:200,contentType:'text/event-stream',body:frames})
      :route.fulfill({status:200,contentType:'text/html',body:html}));
    await page.goto('https://kaz-ai.test/');
    await page.locator('#messageInput').fill('Строго докажи результат');
    await page.locator('#sendButton').click();
    await page.waitForFunction(()=>document.querySelector('#chatMessages')?.textContent.includes('СОХРАНИТЬ_ЭТОТ_ТЕКСТ'));
    await page.waitForFunction(()=>document.querySelector('#chatMessages')?.textContent.includes('Ответ прервался'));
    const text=await page.locator('#chatMessages').innerText();
    assert.match(text,/СОХРАНИТЬ_ЭТОТ_ТЕКСТ/);
    assert.match(text,/неполный/i);
  }finally{await browser.close()}
});

test('mother surprise appears locally for both spellings without asking for credentials',async()=>{
  for(const name of ['Муханова Айслу','Муханова Айсулу']){
    await withPage(async page=>{
      await page.locator('#messageInput').fill(name);
      await page.locator('#sendButton').click();
      const reply=page.locator('#chatMessages .message-assistant');
      assert.equal(await reply.count(),1);
      assert.ok((await reply.innerText()).includes('Здравствуйте, мама создателя. ❤️'));
      assert.ok((await reply.innerText()).includes('Для вас все ограничения платных систем выключены.'));
      assert.equal(await page.locator('#sessionOverlay').isVisible(),false);
      assert.equal(await page.locator('#chatMessages [data-session="retry-answer"]').count(),0);
    });
  }
});

test('history search highlights text inside formatted AI answers without removing formatting',async()=>{
  await withPage(async page=>{
    const html=readFileSync('public/preview.html','utf8');
    await page.route('https://kaz-ai.test/**',route=>{
      if(new URL(route.request().url()).pathname==='/api/chat')
        return route.fulfill({status:200,contentType:'application/json',
          body:JSON.stringify({text:'## Результат\n\n**Особенное** слово в ответе'})});
      return route.fulfill({status:200,contentType:'text/html',body:html});
    });
    await page.goto('https://kaz-ai.test/');
    await page.locator('#messageInput').fill('Проверка поиска в ответе');
    await page.locator('#sendButton').click();
    await page.waitForFunction(()=>document.querySelector('#chatMessages .rich-answer')?.textContent.includes('Особенное'));
    await page.locator('.sidebar [data-screen="history"]').click();
    await page.locator('#historySearch').fill('Особенное');
    await page.locator('#historyList [data-session="open-chat"]').first().click();
    assert.equal(await page.locator('#chatMessages .session-jump-hit .rich-answer strong mark.session-search-hit').count(),1);
    assert.equal(await page.locator('#chatMessages .session-jump-hit .rich-answer strong').innerText(),'Особенное');
  });
});
test('programming text helper keeps indents and prepares draft by Ctrl+Enter',async()=>{
  await withPage(async page=>{
    await page.locator('#languageToggle').click();
    await page.locator('#languageMenu [data-language="en"]').click();
    await page.locator('.sidebar [data-screen="tools"]').click();
    await page.locator('#toolGroups [data-feature="tool-23"]').click();
    const field=page.locator('#sessionBody textarea');
    assert.equal(await field.getAttribute('aria-label'),'Programming task');
    await field.fill('  const k = 42;\n');
    await field.press('Control+Enter');
    assert.ok((await page.locator('#messageInput').inputValue()).includes('  const k = 42;\n'));
    assert.equal(await page.locator('#sessionOverlay').isVisible(),false);
  });
});

test('very long AI answer keeps its beginning and conclusion in the next request',async()=>{
  await withPage(async page=>{
    const html=readFileSync('public/preview.html','utf8');
    const reply='НАЧАЛО_ОТВЕТА\n'+'Подробности '.repeat(3800)+'\nЗАКЛЮЧЕНИЕ_ОТВЕТА';
    let calls=0,followup=null;
    await page.route('https://kaz-ai.test/**',route=>{
      if(new URL(route.request().url()).pathname==='/api/chat'){
        calls++;
        if(calls===2)followup=route.request().postDataJSON();
        return route.fulfill({status:200,contentType:'application/json',
          body:JSON.stringify({text:calls===1?reply:'Следующий ответ'})});
      }
      return route.fulfill({status:200,contentType:'text/html',body:html});
    });
    await page.goto('https://kaz-ai.test/');
    await page.locator('#messageInput').fill('Первый вопрос');
    await page.locator('#sendButton').click();
    await page.waitForFunction(()=>document.querySelector('#chatMessages')?.textContent.includes('ЗАКЛЮЧЕНИЕ_ОТВЕТА'));
    await page.locator('#messageInput').fill('Второй вопрос');
    await page.locator('#sendButton').click();
    await page.waitForFunction(()=>document.querySelector('#chatMessages')?.textContent.includes('Следующий ответ'));
    assert.equal(calls,2);
    const earlier=followup?.messages.find(m=>m.role==='assistant');
    assert.ok(earlier,'Long assistant answer was omitted');
    assert.match(earlier.content,/НАЧАЛО_ОТВЕТА/);
    assert.match(earlier.content,/ЗАКЛЮЧЕНИЕ_ОТВЕТА/);
    assert.match(earlier.content,/середина предыдущего ответа сокращена/);
    assert.ok(earlier.content.length<=20000);
    assert.equal(followup.messages.at(-1).content,'Второй вопрос');
  });
});
test('search across formatted text nodes keeps Markdown formatting',async()=>{
  await withPage(async page=>{
    const html=readFileSync('public/preview.html','utf8');
    await page.route('https://kaz-ai.test/**',route=>{
      if(new URL(route.request().url()).pathname==='/api/chat')
        return route.fulfill({status:200,contentType:'application/json',
          body:JSON.stringify({text:'**Сильная** связь сохраняется'})});
      return route.fulfill({status:200,contentType:'text/html',body:html});
    });
    await page.goto('https://kaz-ai.test/');
    await page.locator('#messageInput').fill('Проверка формата');
    await page.locator('#sendButton').click();
    await page.waitForFunction(()=>document.querySelector('#chatMessages .rich-answer strong')?.textContent==='Сильная');
    await page.locator('.sidebar [data-screen="history"]').click();
    await page.locator('#historySearch').fill('Сильная связь');
    await page.locator('#historyList [data-session="open-chat"]').first().click();
    const mark=page.locator('#chatMessages .session-jump-hit mark.session-search-hit');
    assert.equal(await mark.count(),1);
    assert.equal(await mark.innerText(),'Сильная связь');
    assert.equal(await page.locator('#chatMessages .session-jump-hit strong').innerText(),'Сильная');
  });
});

test('chat sends long code between 4K and 8K without truncation',async()=>{
  await withPage(async page=>{
    const html=readFileSync('public/preview.html','utf8');
    let sent=null;
    await page.route('https://kaz-ai.test/**',route=>{
      if(new URL(route.request().url()).pathname==='/api/chat'){
        sent=route.request().postDataJSON();
        return route.fulfill({status:200,contentType:'application/json',
          body:JSON.stringify({text:'Код принят полностью'})});
      }
      return route.fulfill({status:200,contentType:'text/html',body:html});
    });
    await page.goto('https://kaz-ai.test/');
    const code='  const x = 1;\n'+' console.log(x);\n'.repeat(440);
    assert.ok(code.length>4000&&code.length<8000);
    await page.locator('#messageInput').fill(code);
    await page.locator('#sendButton').click();
    await page.waitForFunction(()=>document.querySelector('#chatMessages')?.textContent.includes('Код принят полностью'));
    assert.equal(sent.messages.at(-1).content,code);
  });
});
test('all three text helpers preserve longer source drafts',async()=>{
  for(const id of [22,23,24]){
    await withPage(async page=>{
      await page.locator('.sidebar [data-screen="tools"]').click();
      await page.locator('#toolGroups [data-feature="tool-'+id+'"]').click();
      const field=page.locator('#sessionBody textarea');
      assert.equal(await field.getAttribute('maxlength'),'7800');
      const value='  Исходный текст\n'.repeat(260);
      assert.ok(value.length>3500&&value.length<7800);
      await field.fill(value);
      await page.locator('#sessionBody [data-session="dialog-save"]').click();
      assert.equal(await page.locator('#sessionOverlay').isVisible(),false);
      assert.ok((await page.locator('#messageInput').inputValue()).includes(value));
    });
  }
});

test('failed history export reports an error and never deletes chat content',async()=>{
  await withPage(async page=>{
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.locator('#messageInput').fill('Важные заметки для экспорта');
    await page.locator('#sendButton').click();
    await page.locator('.sidebar [data-screen="history"]').click();
    await page.evaluate(()=>{
      URL.createObjectURL=()=>{throw new Error('Simulated blocked download')};
    });
    await page.locator('#historyList [data-session="export-chat"]').first().click();
    const toast=await page.locator('#toast').innerText();
    assert.match(toast,/Не удалось подготовить файл/);
    assert.doesNotMatch(toast,/скачана/);
    assert.equal((await page.evaluate(()=>window.KazSession.snapshot().threads[0].messages)),1);
    assert.deepEqual(errors,[]);
  });
});

test('history search matches bold inline code and italic text as one visible phrase',async()=>{
  await withPage(async page=>{
    const html=readFileSync('public/preview.html','utf8');
    await page.route('https://kaz-ai.test/**',route=>{
      if(new URL(route.request().url()).pathname==='/api/chat')
        return route.fulfill({status:200,contentType:'application/json',
          body:JSON.stringify({text:'**Важный** \x60код\x60 и *перевод* выполнены'})});
      return route.fulfill({status:200,contentType:'text/html',body:html});
    });
    await page.goto('https://kaz-ai.test/');
    await page.locator('#messageInput').fill('Тест поиска по оформленному ответу');
    await page.locator('#sendButton').click();
    await page.waitForFunction(()=>document.querySelector('#chatMessages .rich-answer')?.textContent.includes('Важный'));
    await page.locator('.sidebar [data-screen="history"]').click();
    await page.locator('#historySearch').fill('Важный код и перевод');
    assert.equal(await page.locator('#historyList [data-session="open-chat"]').count(),1);
    await page.locator('#historyList [data-session="open-chat"]').click();
    const text=page.locator('#chatMessages .session-jump-hit .rich-answer');
    assert.ok((await text.innerText()).includes('Важный код и перевод'));
    assert.equal(await text.locator('mark.session-search-hit').count(),1);
    assert.equal(await text.locator('mark.session-search-hit').innerText(),'Важный код и перевод');
  });
});
test('updated history remains localized in English after adding and searching a chat',async()=>{
  await withPage(async page=>{
    await page.locator('#languageToggle').click();
    await page.locator('#languageMenu [data-language="en"]').click();
    await page.locator('#messageInput').fill('Keep original title');
    await page.locator('#sendButton').click();
    await page.locator('.sidebar [data-screen="history"]').click();
    await page.locator('#historySearch').fill('Keep');
    assert.equal(await page.locator('#historyList .session-chat-row').count(),1);
    assert.equal(await page.locator('#historyList [data-session="rename-chat"]').first().innerText(),'Rename');
    assert.match(await page.locator('#historyList .session-chat-label').innerText(),/Keep/);
    await page.locator('#historySearch').fill('No matching text');
    assert.equal(await page.locator('#historyList .session-chat-row').count(),0);
    assert.match(await page.locator('#historyList .empty-card').innerText(),/No matches/);
  });
});

test('all three text helpers restore unsent modal drafts and clear them after preparation',async()=>{
  await withPage(async page=>{
    for(const id of [22,23,24]){
      await page.locator('.sidebar [data-screen="tools"]').click();
      const tool=page.locator('#toolGroups [data-feature="tool-'+id+'"]');
      await tool.click();
      const field=page.locator('#sessionBody textarea');
      const source='  Исходный текст '+id+'\n';
      await field.fill(source);
      if(id===22)await page.locator('#sessionBody select').selectOption('ja');
      await field.press('Escape');
      await tool.click();
      assert.equal(await field.inputValue(),source);
      if(id===22)assert.equal(await page.locator('#sessionBody select').inputValue(),'ja');
      await page.locator('#sessionBody [data-session="dialog-save"]').click();
      assert.ok((await page.locator('#messageInput').inputValue()).endsWith(source));
      await page.locator('#messageInput').fill('');
      await page.locator('.sidebar [data-screen="tools"]').click();
      await tool.click();
      assert.equal(await field.inputValue(),'');
      await field.press('Escape');
    }
  });
});

test('internal settings font choice applies to readable settings text and modal',async()=>{
  await withPage(async page=>{
    await page.locator('.sidebar [data-screen="settings"]').click();
    await page.locator('#fontToggle').click();
    await page.locator('#fontMenu [data-font="large"]').click();
    const root=page.locator('#internalSettingsRoot');
    await root.locator('[data-is-tab="security"]').click();
    assert.ok(await root.locator('[data-is-panel="security"] .is-row p').first().evaluate(el=>parseFloat(getComputedStyle(el).fontSize))>=15);
    await root.locator('[data-is-dialog="sessions"]').click();
    assert.ok(await page.locator('#innerDialogBody').evaluate(el=>parseFloat(getComputedStyle(el).fontSize))>=17);
    await page.locator('[data-is-dialog-close]').last().click();
  });
});
test('automatic interface language uses the first supported browser preference',async()=>{
  await withPage(async page=>{
    await page.locator('.sidebar [data-screen="settings"]').click();
    await page.evaluate(()=>{
      Object.defineProperty(navigator,'languages',{configurable:true,value:['nl-NL','de-DE','en-US']});
      document.querySelector('#innerLanguage').value='auto';
      document.querySelector('#innerLanguage').dispatchEvent(new Event('change',{bubbles:true}));
    });
    assert.equal(await page.locator('html').getAttribute('lang'),'de');
    await page.evaluate(()=>{
      Object.defineProperty(navigator,'languages',{configurable:true,value:['es-ES','en-US']});
      window.dispatchEvent(new Event('languagechange'));
    });
    assert.equal(await page.locator('html').getAttribute('lang'),'es');
    await page.locator('#innerLanguage').selectOption('ru');
    await page.evaluate(()=>window.dispatchEvent(new Event('languagechange')));
    assert.equal(await page.locator('html').getAttribute('lang'),'ru');
  });
});

test('reopening the same conversation retains the live stream until completion',async()=>{
  await withPage(async page=>{
    const html=readFileSync('public/preview.html','utf8');
    await page.route('https://kaz-ai.test/**',route=>route.fulfill({status:200,contentType:'text/html',body:html}));
    await page.goto('https://kaz-ai.test/');
    await page.evaluate(()=>{
      const enc=new TextEncoder();
      window.fetch=async()=>new Response(new ReadableStream({start(c){
        c.enqueue(enc.encode('data: {"response":"ЖИВОЙ_ТЕКСТ"}\n\n'));
        window.finishTestStream=()=>{c.enqueue(enc.encode('data: {"response":"_КОНЕЦ"}\n\nevent: done\ndata: {}\n\n'));c.close()};
      }}),{headers:{"content-type":"text/event-stream"}});
    });
    await page.locator('#messageInput').fill('Вопрос для потока');
    await page.locator('#sendButton').click();
    await page.waitForFunction(()=>document.querySelector('#chatMessages')?.textContent.includes('ЖИВОЙ_ТЕКСТ'));
    await page.locator('.sidebar [data-screen="history"]').click();
    await page.locator('#historyList [data-session="open-chat"]').first().click();
    assert.match(await page.locator('#chatMessages').innerText(),/ЖИВОЙ_ТЕКСТ/);
    await page.evaluate(()=>window.finishTestStream());
    await page.waitForFunction(()=>document.querySelector('#sessionStop').hidden);
    assert.equal(await page.locator('#chatMessages .message-assistant').count(),1);
    assert.match(await page.locator('#chatMessages').innerText(),/ЖИВОЙ_ТЕКСТ_КОНЕЦ/);
  });
});
test('private welcome draft cannot leak when opening a saved chat',async()=>{
  await withPage(async page=>{
    await page.locator('#messageInput').fill('Обычная переписка');
    await page.locator('#sendButton').click();
    await page.locator('.sidebar [data-screen="settings"]').click();
    await page.locator('#sessionTemporary').check();
    await page.locator('#messageInput').fill('Личный черновик');
    await page.locator('#recentChats .session-recent').first().click();
    assert.equal(await page.locator('#messageInput').inputValue(),'Личный черновик');
    assert.equal((await page.evaluate(()=>window.KazSession.snapshot())).active,null);
    await page.locator('#messageInput').fill('');
    await page.locator('#recentChats .session-recent').first().click();
    assert.equal(await page.locator('#messageInput').inputValue(),'');
    assert.equal(await page.locator('#sessionTemporary').isChecked(),false);
  });
});

 test('personal instruction edits survive closing without applying automatically',async()=>{
  await withPage(async page=>{
    await page.locator('.sidebar [data-screen="tools"]').click();
    const tool=page.locator('#toolGroups [data-feature="tool-40"]');
    await tool.click();
    const area=page.locator('#sessionBody textarea');
    await area.fill('  Незавершённые инструкции\n');
    await area.press('Escape');
    await tool.click();
    assert.equal(await area.inputValue(),'  Незавершённые инструкции\n');
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    await tool.click();
    assert.equal(await area.inputValue(),'  Незавершённые инструкции\n');
    await area.press('Escape');
  });
});
test('unsent text-tool draft survives creation of its first conversation',async()=>{
  await withPage(async page=>{
    await page.locator('.sidebar [data-screen="tools"]').click();
    await page.locator('#toolGroups [data-feature="tool-23"]').click();
    await page.locator('#sessionBody textarea').fill('  const unfinished = 1;\n');
    await page.locator('#sessionClose').click();
    await page.locator('#toolGroups [data-feature="tool-24"]').click();
    await page.locator('#sessionBody textarea').fill('Описание письма');
    await page.locator('#sessionBody [data-session="dialog-save"]').click();
    await page.locator('#sendButton').click();
    await page.locator('.sidebar [data-screen="tools"]').click();
    await page.locator('#toolGroups [data-feature="tool-23"]').click();
    assert.equal(await page.locator('#sessionBody textarea').inputValue(),'  const unfinished = 1;\n');
  });
});

test('new chat from Tools focuses the visible empty composer',async()=>{
  await withPage(async page=>{
    await page.locator('.sidebar [data-screen="tools"]').click();
    await page.locator('#toolGroups [data-feature="tool-1"]').click();
    assert.equal(await page.locator('#messageInput').evaluate(el=>document.activeElement===el),true);
    assert.equal(await page.locator('#messageInput').inputValue(),'');
  });
});

test('formatted document retains original ordered list numbering',async()=>{
  await withPage(async page=>{
    const result=await page.evaluate(()=>{
      const root=window.KazFormat.render('4. Первый пункт\n7. Другой пункт\n8. Следующий');
      const list=root.querySelector('ol');
      return {start:list.start,second:list.children[1].getAttribute('value'),third:list.children[2].getAttribute('value'),text:list.children[1].textContent};
    });
    assert.deepEqual(result,{start:4,second:'7',third:null,text:'Другой пункт'});
  });
});
test('invalid saved theme cannot break appearance initialization',async()=>{
  await withPage(async page=>{
    await page.evaluate(()=>localStorage.setItem('kaz-ai-internal-settings-v1',JSON.stringify({theme:'constructor',mode:'light'})));
    await page.reload();
    assert.equal(await page.locator('body').getAttribute('data-kaz-theme'),'kaz');
    assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('light')),true);
    await page.locator('.sidebar [data-screen="settings"]').click();
    await page.locator('#internalSettingsRoot [data-is-tab="appearance"]').click();
    assert.equal(await page.locator('#innerTheme').inputValue(),'kaz');
  });
});
test('only the latest AI answer offers an enabled repeat action',async()=>{
  await withPage(async page=>{
    const html=readFileSync('public/preview.html','utf8');
    await page.route('https://kaz-ai.test/**',route=>{
      if(new URL(route.request().url()).pathname==='/api/chat')
        return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({text:'Ответ модели'})});
      return route.fulfill({status:200,contentType:'text/html',body:html});
    });
    await page.goto('https://kaz-ai.test/');
    for(const question of ['Первый вопрос','Второй вопрос']){
      await page.locator('#messageInput').fill(question);
      await page.locator('#sendButton').click();
      await page.waitForFunction(()=>document.querySelector('#sessionStop').hidden);
    }
    const retry=page.locator('#chatMessages [data-session="retry-answer"]');
    assert.equal(await retry.count(),2);
    assert.equal(await retry.first().isDisabled(),true);
    assert.equal(await retry.last().isEnabled(),true);
  });
});
