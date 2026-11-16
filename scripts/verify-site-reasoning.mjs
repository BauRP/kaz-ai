// Opt-in verification of the ACTUAL Kaz AI website's browser-facing SSE route.
// The report records only timings, response headers and event types, NEVER user texts or AI answers.
import {appendFile} from 'node:fs/promises';
export const SITE='https://kaz-ai.tengrize.workers.dev';
export const LEVELS=['low','medium','high'];
const QUESTION='Назови количество вершин квадрата 2 на 2. Ответь одним числом.';

function hasModelText(sseBody){
  for(const frame of sseBody.replace(/\r\n/g,'\n').split('\n\n')){
    for(const line of frame.split('\n')){
      if(!line.startsWith('data:'))continue;
      try{
        const payload=JSON.parse(line.slice(5).trim());
        if(typeof payload?.response==='string'&&payload.response.trim())return true;
        if(typeof payload?.choices?.[0]?.delta?.content==='string'&&payload.choices[0].delta.content.trim())return true;
        if(payload?.type==='response.output_text.delta'&&typeof payload?.delta==='string'&&payload.delta.trim())return true;
      }catch{}
    }
  }
  return false;
}
export async function verifySite({url=SITE,fetchFn=fetch,write=console.log}={}){
  // Do not allow arbitrary hosts or moving secrets to another origin.
  if(url!==SITE)throw Error('Unexpected site origin');
  const samples=[];
  for(const effort of LEVELS){
    const ctrl=new AbortController();
    const timeout=setTimeout(()=>ctrl.abort(),90000);
    const start=performance.now();
    let response,body;
    try{
      response=await fetchFn(url+'/api/chat',{
        method:'POST',
        headers:{'Content-Type':'application/json','Accept':'text/event-stream'},
        body:JSON.stringify({messages:[{role:'user',content:QUESTION}],effort}),
        signal:ctrl.signal
      });
      body=await response.text();
    }finally{clearTimeout(timeout)}
    const elapsedMs=Math.round(performance.now()-start);
    const returnedEffort=response.headers.get('x-kaz-ai-reasoning-effort');
    const requestId=response.headers.get('x-kaz-ai-request-id');
    const done=/^event: done$/m.test(body);
    const failure=/^event: error$/m.test(body);
    const receivedText=hasModelText(body);
    const sample={
      effort,elapsedMs,status:response.status,
      effortHeaderMatches:returnedEffort===effort,
      requestIdPresent:/^[a-f0-9]{12}$/.test(requestId||''),
      completed:response.ok&&done&&!failure&&receivedText
    };
    samples.push(sample);
    write('Chat test '+samples.length+'/3 '+effort+': HTTP '+sample.status+', '+elapsedMs+'ms, effort header '+(sample.effortHeaderMatches?'matches':'MISSING/MISMATCH')+', SSE '+(sample.completed?'completed':'NOT CONFIRMED'));
  }
  const lines=['## Kaz AI real public chat route, three reasoning settings','',
    'One real public chat request per level. NO prompt text or answer stored; may use Workers AI quota.','',
    '| Level | HTTP | Total time | Effort header | SSE done |','|---|---:|---:|---|---|'];
  for(const s of samples)lines.push('| '+s.effort+' | '+s.status+' | '+s.elapsedMs+' ms | '+(s.effortHeaderMatches?'matches':'missing/mismatch')+' | '+(s.completed?'yes':'no')+' |');
  lines.push('',samples.every(s=>s.completed&&s.effortHeaderMatches&&s.requestIdPresent)
    ?'**Confirmed:** live website receives and echoes three selected levels, and all three SSE requests finish. This does NOT prove model itself uses each level internally.'
    :'**NOT CONFIRMED:** at least one real website request failed, or the deployment does not yet expose diagnostic effort headers.');
  lines.push('**Limit:** Cloudflare currently does not expose a trustworthy per-request internal reasoning effort signal for site Chat Completions streaming. No inference of true model effort from latency alone.','');
  return {samples,report:lines.join('\n')};
}
if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
  try{
    const {report}=await verifySite();
    console.log('\n'+report);
    if(process.env.GITHUB_STEP_SUMMARY)await appendFile(process.env.GITHUB_STEP_SUMMARY,report+'\n');
  }catch(err){console.error('Site diagnostic failed:',err?.name==='AbortError'?'one call timed out':err?.message);process.exitCode=1}
}
