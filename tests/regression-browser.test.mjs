import { test as nodeTest } from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { existsSync } from 'node:fs';
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
