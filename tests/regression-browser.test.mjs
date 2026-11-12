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
