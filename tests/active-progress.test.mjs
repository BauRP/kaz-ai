import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const d=JSON.parse(readFileSync('ACTIVE_PROGRESS.json','utf8'));
const prior=JSON.parse(readFileSync('progress/2026-11-15-before-bilingual-export-hardening.json','utf8'));
const report=readFileSync('ACTIVE_PROGRESS.md','utf8');
const activeIds=new Set([1,2,3,4,5,6,7,9,10,13,15,16,22,23,24,40,41,42,43,44,45]);
const mean=(xs,key)=>xs.reduce((sum,x)=>sum+x[key],0)/xs.length;
const close=(a,b)=>assert.ok(Math.abs(a-b)<1e-10,'Expected '+a+' ≈ '+b);
test('the calculator is archived and all 21 working directions exclude it',()=>{
  assert.equal(d.items.length,21);
  assert.equal(new Set(d.items.map(i=>i.id)).size,21);
  assert.ok(d.items.every(i=>activeIds.has(i.id)&&i.id!==25&&i.status==='in_progress'));
  assert.equal(d.completed_items.length,1);
  assert.equal(d.completed_items[0].id,25);
  assert.equal(d.completed_items[0].now,100);
  assert.deepEqual(d.completed_ids,[25]);
  assert.equal(d.completed_count,1);
  assert.equal(d.incomplete_count,21);
  assert.equal(d.completed_count+d.incomplete_count,22);
  assert.equal(d.groups.reduce((s,g)=>s+g.count,0),21);
});
test('individual and group progress agrees with the last full baseline',()=>{
  for(const item of d.items){
    const old=prior.items.find(i=>i.id===item.id);
    assert.ok(old,'Unknown item '+item.id);
    assert.equal(item.previous,old.now);
    assert.equal(item.delta,item.now-item.previous);
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
test('stable original 22-feature score keeps the completed calculator in its denominator',()=>{
  const priorMean=(prior.items.reduce((s,x)=>s+x.now,0)+prior.completed_items[0].now)/22;
  close(d.overall_previous,priorMean);
  close(d.overall_now,(d.items.reduce((s,x)=>s+x.now,0)+d.completed_items[0].now)/22);
  close(d.overall_delta,d.overall_now-d.overall_previous);
  assert.ok(d.overall_now>=d.overall_previous);
  assert.ok(d.now<d.overall_now,'Active-only average cannot be padded by completed feature');
});
test('human report reflects the 21 working features without misleading AI claims',()=>{
  for(const item of d.items)assert.ok(report.includes('| '+item.id+' | '+item.name+' |'));
  assert.match(report,/Завершено \(отдельно от рабочих направлений\)/);
  assert.match(report,/21 незавершённ/);
  assert.ok(report.includes(d.overall_now.toFixed(2).replace('.',',')));
  assert.ok(report.includes(d.now.toFixed(2).replace('.',',')));
  assert.match(report,/Настоящие ответы GPT-OSS 120B пока не проверены/);
  assert.doesNotMatch(report,/\| 29 \| Создание изображений/);
  const working=report.slice(report.indexOf('## Рабочий список:'),report.indexOf('## Прогресс по группам'));
  assert.doesNotMatch(working,/\| 25 \|/);
});
