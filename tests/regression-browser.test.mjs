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
    const page=await browser.newPage({viewport:{width:1280,height:820}});
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

test('preliminary AI reasoning preview is replaced by finished answer, without saving the draft',async()=>{
  const executablePath=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(existsSync);
  const browser=await chromium.launch({...(executablePath?{executablePath}:{channel:'chrome'}),headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
  try{
    const page=await browser.newPage({viewport:{width:1280,height:820}});
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
    const page=await browser.newPage({viewport:{width:1280,height:820}});
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
