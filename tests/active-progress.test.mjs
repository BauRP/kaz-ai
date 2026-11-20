import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const d=JSON.parse(readFileSync('ACTIVE_PROGRESS.json','utf8'));
const prior=JSON.parse(readFileSync('progress/2026-11-16-before-visible-names-and-test-repair.json','utf8'));
const report=readFileSync('ACTIVE_PROGRESS.md','utf8');
const activeIds=new Set([1,2,3,4,5,6,7,9,10,13,15,16,22,23,24,40,41,42,43,44,45,47]);
const mean=(xs,key)=>xs.reduce((sum,x)=>sum+x[key],0)/xs.length;
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,'Expected '+a+' ≈ '+b);
test('the calculator is archived and all 22 working directions exclude it',()=>{
  assert.equal(d.items.length,22);
  assert.equal(new Set(d.items.map(i=>i.id)).size,22);
  assert.ok(d.items.every(i=>activeIds.has(i.id)&&i.id!==25&&i.status==='in_progress'));
  assert.equal(d.completed_items.length,1);
  assert.equal(d.completed_items[0].id,25);
  assert.equal(d.completed_items[0].now,100);
  assert.deepEqual(d.completed_ids,[25]);
  assert.equal(d.completed_count,1);
  assert.equal(d.incomplete_count,22);
  assert.equal(d.completed_count+d.incomplete_count,23);
  assert.equal(d.groups.reduce((s,g)=>s+g.count,0),22);
});
test('individual and group progress agrees with the last full baseline',()=>{
  for(const item of d.items){
    const old=prior.items.find(i=>i.id===item.id);
    if(item.id===47){assert.equal(item.name,'внутренности настроек');assert.equal(item.previous,0);close(item.delta,item.now);continue}
    assert.ok(old,'Unknown item '+item.id);
    assert.ok(item.previous>=old.now,'Previous cycle score cannot fall below the archived baseline for '+item.id);
    close(item.delta,item.now-item.previous);
    assert.ok(item.now>=old.now&&item.now<100);
  }
  close(d.previous,mean(d.items,'previous'));
  close(d.now,mean(d.items,'now'));
  close(d.delta,d.now-d.previous);
  for(const group of d.groups){
    const xs=d.items.filter(i=>i.group===group.name);
    assert.equal(xs.length,group.count);
    close(group.previous,mean(xs,'previous'));
    close(group.now,mean(xs,'now'));
    close(group.delta,group.now-group.previous);
  }
});
test('stable extended 23-feature score keeps the completed calculator in its denominator',()=>{
  const priorMean=(prior.items.reduce((s,x)=>s+x.now,0)+prior.completed_items[0].now)/22;
  assert.ok(d.overall_previous>=priorMean*22/23,'Expanded baseline must preserve the historical completed work');
  close(d.overall_now,(d.items.reduce((s,x)=>s+x.now,0)+d.completed_items[0].now)/23);
  close(d.overall_delta,d.overall_now-d.overall_previous);
  assert.ok(d.overall_now>=d.overall_previous);
  assert.ok(d.now<d.overall_now,'Active-only average cannot be padded by completed feature');
});
test('human report reflects the 22 working features without misleading AI claims',()=>{
  for(const item of d.items)assert.ok(report.includes('| '+item.id+' | '+item.name+' |'));
  assert.match(report,/Завершено \(отдельно от рабочих направлений\)/);
  assert.match(report,/22 незавершённ/);
  assert.ok(report.includes(d.overall_now.toFixed(2).replace('.',',')));
  assert.ok(report.includes(d.now.toFixed(2).replace('.',',')));
  assert.match(report,/Основной Cloudflare Worker опубликован/);
  assert.match(report,/ручное тестирование на чужих устройствах/);
  assert.doesNotMatch(report,/Нужны защищённое развёртывание, AI binding/);
  assert.doesNotMatch(report,/\| 29 \| Создание изображений/);
  const fullList=report.slice(report.indexOf('## Все 23 направления:'),report.indexOf('## Прогресс по группам'));
  assert.match(fullList,/\| 25 \|/,'Completed calculator must stay visible in the main progress list');
  assert.match(fullList,/completed-calculator-name\.svg/);
  assert.match(fullList,/completed-calculator-100\.svg/);
  assert.match(fullList,/completed-calculator-done\.svg/);
  assert.equal((fullList.match(/\| 25 \|/g)||[]).length,1,'Calculator listed once in main table');
});
