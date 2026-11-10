import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const d=JSON.parse(readFileSync('ACTIVE_PROGRESS.json','utf8'));
const previous=JSON.parse(readFileSync('progress/2026-11-10-before-calc-tool-retry.json','utf8'));

const report=readFileSync('ACTIVE_PROGRESS.md','utf8');
const ids=new Set([1,2,3,4,5,6,7,9,10,13,15,16,22,23,24,25,40,41,42,43,44,45]);
const avg=(a,k)=>a.reduce((sum,x)=>sum+x[k],0)/a.length;
test('only 22 active light-medium items are counted',()=>{
  assert.equal(d.items.length,22);
  assert.equal(new Set(d.items.map(x=>x.id)).size,22);
  assert.ok(d.items.every(x=>ids.has(x.id)));
  assert.ok(d.items.every(x=>['Чаты','Интеллект','Настройки'].includes(x.group)));
  assert.equal(d.groups.reduce((s,x)=>s+x.count,0),22);
});
test('baseline uses last-stage values and per-item improvements reconcile',()=>{
  for(const item of d.items){
    const prior=previous.items.find(x=>x.id===item.id);
    assert.equal(item.previous,prior.now);
    assert.equal(item.now-item.previous,item.delta);
    assert.ok(item.now>=item.previous&&item.now<=100);
  }
  assert.ok(Math.abs(d.previous-avg(d.items,'previous'))<1e-10);
  assert.ok(Math.abs(d.now-avg(d.items,'now'))<1e-10);
  assert.ok(Math.abs(d.delta-(d.now-d.previous))<1e-10);
  for(const g of d.groups){
    const subset=d.items.filter(x=>x.group===g.name);
    assert.equal(subset.length,g.count);
    assert.ok(Math.abs(g.now-avg(subset,'now'))<1e-10);
    assert.ok(Math.abs(g.previous-avg(subset,'previous'))<1e-10);
    assert.ok(Math.abs(g.delta-(g.now-g.previous))<1e-10);
  }
});
test('human report shows only active items and avoids claiming real AI deployment',()=>{
  assert.ok(report.includes(d.previous.toFixed(2).replace('.',',')));
  assert.ok(report.includes(d.now.toFixed(2).replace('.',',')));
  for(const i of d.items)assert.ok(report.includes('| '+i.id+' | '+i.name+' |'));
  assert.match(report,/Настоящие ответы GPT-OSS 120B пока не проверены/);
  assert.doesNotMatch(report,/\| 29 \| Создание изображений/);
});
