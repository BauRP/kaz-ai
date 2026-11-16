import assert from 'node:assert/strict';
import test from 'node:test';
import {LEVELS,MODEL,parseUsage,runLiveVerification} from '../scripts/verify-cloudflare-reasoning.mjs';

const ACCOUNT='0123456789abcdef0123456789abcdef';
const TOKEN='safe-token-for-unit-tests-only';
test('live diagnostic sends documented effort to all 3 levels in balanced order',async()=>{
  const inputs=[],messages=[];
  const fake=async(url,init)=>{
    assert.equal(url,'https://api.cloudflare.com/client/v4/accounts/'+ACCOUNT+'/ai/run/'+MODEL);
    assert.equal(init.headers.Authorization,'Bearer '+TOKEN);
    assert.equal(init.method,'POST');
    const body=JSON.parse(init.body);
    assert.deepEqual(Object.keys(body).sort(),['input','max_output_tokens','reasoning']);
    assert.equal(body.reasoning.effort,LEVELS[inputs.length%3] ?? body.reasoning.effort);
    inputs.push(body.reasoning.effort);
    assert.equal(body.input[0].role,'user');
    return {ok:true,status:200,json:async()=>({success:true,result:{output:[],usage:{
      input_tokens:100,output_tokens:120,output_tokens_details:{reasoning_tokens:40}
    }}})};
  };
  const report=await runLiveVerification({
    accountId:ACCOUNT,token:TOKEN,repeats:2,fetchFn:fake,write:m=>messages.push(m)
  });
  assert.deepEqual(inputs,['low','medium','high','high','medium','low']);
  assert.equal(messages.length,6);
  assert.match(report,/\| low \| 2 \|/);
  assert.match(report,/\| medium \| 2 \|/);
  assert.match(report,/\| high \| 2 \|/);
  assert.doesNotMatch(report,/safe-token|Authorization|For a grid/);
});
test('parseUsage handles normal and partial Cloudflare responses',()=>{
  assert.deepEqual(parseUsage({result:{usage:{
    prompt_tokens:15,completion_tokens:21,completion_tokens_details:{reasoning_tokens:7}
  }}}),{inputTokens:15,outputTokens:21,reasoningTokens:7});
  assert.deepEqual(parseUsage({result:{output:[]}}),{
    inputTokens:null,outputTokens:null,reasoningTokens:null
  });
});
test('live diagnostic rejects unsafe configuration without sending requests',async()=>{
  let called=false;const fake=async()=>{called=true;throw Error('Never call')};
  await assert.rejects(()=>runLiveVerification({accountId:'bad',token:TOKEN,fetchFn:fake}),/ACCOUNT_ID/);
  await assert.rejects(()=>runLiveVerification({accountId:ACCOUNT,token:'',fetchFn:fake}),/API_TOKEN/);
  await assert.rejects(()=>runLiveVerification({accountId:ACCOUNT,token:TOKEN,repeats:9,fetchFn:fake}),/REPEATS/);
  assert.equal(called,false);
});
test('live diagnostic emits only sanitized provider error code, not body or token',async()=>{
  const secret='DO_NOT_EXPOSE_PROTECTED_PROVIDER_REPLY';
  const fake=async()=>({ok:false,status:403,json:async()=>({errors:[{code:10020,message:secret}]})});
  await assert.rejects(()=>runLiveVerification({accountId:ACCOUNT,token:TOKEN,fetchFn:fake}),err=>{
    assert.match(err.message,/HTTP 403/);
    assert.doesNotMatch(err.message,new RegExp(secret+'|'+TOKEN));
    return true;
  });
});
