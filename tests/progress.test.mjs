import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const data=JSON.parse(readFileSync('PROGRESS.json','utf8'));
const report=readFileSync('PROGRESS.md','utf8');
const expected=Array.from({length:46},(_,i)=>i+1).filter(x=>x!==12&&x!==26);
test('progress covers all 44 approved requirements exactly once',()=>{
  assert.equal(data.items.length,44);
  assert.deepEqual(data.items.map(x=>x.id).sort((a,b)=>a-b),expected);
  assert.equal(new Set(data.items.map(x=>x.id)).size,44);
});
test('before-after progress and grouped direction deltas are mathematically consistent',()=>{
  const avg=(items,key)=>items.reduce((sum,x)=>sum+x[key],0)/items.length;
  for(const entry of data.items){
    assert.ok(entry.before>=0&&entry.before<=100&&entry.after>=0&&entry.after<=100);
    assert.equal(entry.delta,entry.after-entry.before);
    assert.ok(entry.after>=entry.before,'No unsupported negative progress:'+entry.id);
  }
  assert.ok(Math.abs(data.totalBefore-avg(data.items,'before'))<1e-9);
  assert.ok(Math.abs(data.totalAfter-avg(data.items,'after'))<1e-9);
  assert.ok(Math.abs(data.totalDelta-(data.totalAfter-data.totalBefore))<1e-9);
  const counts=data.groups.reduce((n,g)=>n+g.count,0);
  assert.equal(counts,44);
  for(const group of data.groups){
    const subset=data.items.filter(x=>x.group===group.name);
    assert.equal(subset.length,group.count);
    assert.ok(Math.abs(group.before-avg(subset,'before'))<1e-9);
    assert.ok(Math.abs(group.after-avg(subset,'after'))<1e-9);
  }
});
test('human report shows total and every individual direction',()=>{
  assert.match(report,/Общая готовность/);
  assert.match(report,/База «до» восстановлена/);
  for(const entry of data.items){
    assert.ok(report.includes('| '+entry.id+' | '+entry.name+' |'), 'Missing row '+entry.id);
  }
  assert.ok(report.includes(data.totalAfter.toFixed(2)+'%'));
  assert.ok(report.includes('+'+data.totalDelta.toFixed(2)+' п.п.'));
});
