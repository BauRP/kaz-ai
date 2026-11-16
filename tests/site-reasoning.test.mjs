import test from 'node:test';
import assert from 'node:assert/strict';
import {SITE,verifySite} from '../scripts/verify-site-reasoning.mjs';
import {median,mean} from '../scripts/verify-cloudflare-reasoning.mjs';

test('median is numerically correct with one, two or three observations',()=>{
  assert.equal(median([6747,5008]),5877.5);
  assert.equal(median([26741,20861]),23801);
  assert.equal(median([30503,28623]),29563);
  assert.equal(median([5,1,3]),3);
  assert.equal(mean([30503,28623]),29563);
  assert.throws(()=>median([]),/Median/);
});
test('real-site harness checks all three levels and never stores user responses',async()=>{
  const levels=[],logs=[];
  const fake=async(url,opts)=>{
    assert.equal(url,SITE+'/api/chat');
    assert.equal(opts.headers.Accept,'text/event-stream');
    const parsed=JSON.parse(opts.body);
    const effort=parsed.effort;
    levels.push(effort);
    return new Response(': connected\n\ndata: {"response":"SECRET_AI_ANSWER"}\n\nevent: done\ndata: {}\n\n',{
      headers:{'x-kaz-ai-reasoning-effort':effort,'x-kaz-ai-request-id':'abcdef123456'},
      status:200
    });
  };
  const {report,samples}=await verifySite({fetchFn:fake,write:x=>logs.push(x)});
  assert.deepEqual(levels,['low','medium','high']);
  assert.equal(samples.length,3);
  assert.ok(samples.every(x=>x.effortHeaderMatches&&x.completed&&x.requestIdPresent));
  assert.doesNotMatch(report+logs.join(''),/SECRET_AI_ANSWER|Назови количество|Authorization/);
});
test('real-site harness does not falsely claim success if streaming error occurs',async()=>{
  const fake=async(_url,opts)=>new Response(
    'event: error\ndata: {"code":"AI_UNAVAILABLE","message":"PRIVATE_FAILURE"}\n\n',{
      headers:{'x-kaz-ai-reasoning-effort':JSON.parse(opts.body).effort,'x-kaz-ai-request-id':'abcdef123456'},
      status:200
    });
  const {report,samples}=await verifySite({fetchFn:fake,write:()=>{}});
  assert.ok(samples.every(x=>!x.completed));
  assert.match(report,/NOT CONFIRMED/);
  assert.doesNotMatch(report,/PRIVATE_FAILURE/);
});
test('real-site harness rejects arbitrary destinations before any request',async()=>{
  let called=false;
  await assert.rejects(()=>verifySite({url:'https://wrong.example',fetchFn:async()=>{called=true}}),/Unexpected site/);
  assert.equal(called,false);
});
