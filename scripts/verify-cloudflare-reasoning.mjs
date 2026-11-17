// Manual, opt-in live diagnostic. Calls Workers AI directly, never logs secrets or answer text.
// This does not modify the public Kaz AI chat or spend AI credits on normal deployments.
import {appendFile} from 'node:fs/promises';

export const LEVELS=['low','medium','high'];
export const MODEL='@cf/openai/gpt-oss-120b';
const PROMPT='For a grid of 4 rows and 4 columns, explain in one paragraph how to count spanning trees using a reduced Laplacian, and give the number if you know it. If unsure, say so.';

function finiteCount(value){
  return typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;
}
export function parseUsage(body){
  const result=body?.result??body;
  const usage=result?.usage??body?.usage??{};
  const details=usage?.output_tokens_details??usage?.completion_tokens_details??{};
  return {
    inputTokens:finiteCount(usage.input_tokens??usage.prompt_tokens),
    outputTokens:finiteCount(usage.output_tokens??usage.completion_tokens),
    reasoningTokens:finiteCount(details.reasoning_tokens??usage.reasoning_tokens)
  };
}
export function median(values){
  if(!Array.isArray(values)||values.length===0)throw Error('Median needs at least one value');
  const sorted=[...values].sort((a,b)=>a-b);
  const mid=Math.floor(sorted.length/2);
  return sorted.length%2?sorted[mid]:(sorted[mid-1]+sorted[mid])/2;
}
export function mean(values){
  if(!Array.isArray(values)||values.length===0)throw Error('Mean needs at least one value');
  return values.reduce((sum,x)=>sum+x,0)/values.length;
}
export async function runLiveVerification({
  accountId,token,repeats=2,fetchFn=fetch,write=console.log
}){
  if(!/^[-a-f0-9]{32}$/i.test(accountId||''))throw Error('CLOUDFLARE_ACCOUNT_ID must be 32 hexadecimal characters.');
  if(typeof token!=='string'||token.length<12)throw Error('CLOUDFLARE_API_TOKEN is missing.');
  if(!Number.isInteger(repeats)||repeats<1||repeats>3)throw Error('REPEATS must be 1, 2, or 3.');
  const url='https://api.cloudflare.com/client/v4/accounts/'+accountId+'/ai/run/'+MODEL;
  const samples=[];
  for(let trial=0;trial<repeats;trial++){
    // Alternate ordering to avoid mistaking temporary provider load for a level effect.
    for(const effort of trial%2?LEVELS.slice().reverse():LEVELS){
      const ctrl=new AbortController();
      const timeout=setTimeout(()=>ctrl.abort(),120000);
      let response,data;
      const t0=performance.now();
      try{
        response=await fetchFn(url,{
          method:'POST',
          headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json'},
          body:JSON.stringify({
            input:[{role:'user',content:PROMPT}],
            reasoning:{effort},
            max_output_tokens:1536
          }),
          signal:ctrl.signal
        });
        data=await response.json().catch(()=>({}));
      }finally{clearTimeout(timeout)}
      // Latency includes reading the COMPLETE model response.
      const elapsed=Math.round(performance.now()-t0);
      const result=data?.result??data;
      const output=typeof result?.output_text==="string"?result.output_text:
        typeof result?.response==="string"?result.response:
        Array.isArray(result?.output)
          ?result.output.flatMap(x=>x?.content||[]).filter(x=>x?.type==="output_text"||x?.type==="text").map(x=>x.text||"").join("")
          :"";
      if(response.ok&&data?.success!==false&&(!output.trim()||result?.status==="incomplete"||result?.incomplete_details)){
        throw Error('Cloudflare returned no complete model text at effort '+effort);
      }
      if(!response.ok||data?.success===false){
        const code=data?.errors?.[0]?.code??data?.error?.code??'unknown';
        throw Error('Cloudflare inference failed: HTTP '+response.status+'; code '+String(code).replace(/[^A-Za-z0-9_-]/g,'').slice(0,40));
      }
      const usage=parseUsage(data);
      samples.push({effort,elapsedMs:elapsed,...usage});
      write('Test '+samples.length+' / '+(3*repeats)+': '+effort+' — HTTP '+response.status+', '+elapsed+' ms; output tokens: '+(usage.outputTokens??'not reported')+'; reasoning tokens: '+(usage.reasoningTokens??'not reported'));
    }
  }
  const lines=['## GPT-OSS 120B: live reasoning-effort verification','',
    'Cloudflare Workers AI, direct documented Responses API; '+repeats+' request(s) per level. No user text or model answer stored.','',
    '| Level | Calls | Each latency | Mean latency | Median latency | Output tokens | Reasoning tokens |','|---|---:|---|---:|---:|---|---|'];
  for(const effort of LEVELS){
    const arr=samples.filter(s=>s.effort===effort);
    const times=arr.map(s=>s.elapsedMs);
    const r=arr.map(s=>s.reasoningTokens);
    const out=arr.map(s=>s.outputTokens);
    lines.push('| '+effort+' | '+arr.length+' | '+times.join(', ')+' ms | '+Math.round(mean(times))+' ms | '+median(times)+' ms | '+(out.every(x=>x!==null)?out.join(', '):'not reported')+' | '+(r.every(x=>x!==null)?r.join(', '):'not reported')+' |');
  }
  const withTokens=samples.filter(x=>x.reasoningTokens!==null);
  lines.push('','**What is confirmed:** the official low/medium/high request parameters were sent and Cloudflare returned successful HTTP results.');
  lines.push(withTokens.length===samples.length
    ?'**Additional evidence:** provider reported reasoning-token counts. Different counts can indicate distinct effort behavior but cannot by themselves prove the internal model settings.'
    :'**Limitation:** provider did not report reasoning-token counts on every request. The model\'s internal effort cannot be independently confirmed from these API replies.');
  lines.push('**Important:** inference latency is influenced by server load, queuing and generated text length. HIGH is not expected to always run longer than MEDIUM. With only '+repeats+' repeats per level, timing differences alone are inconclusive.');
  lines.push('**Important:** this tests the model through the documented Responses API. Kaz AI website uses streaming Chat Completions for live text; its provider behavior needs separate validation.','');
  return lines.join('\n');
}

if(process.argv[1]&&import.meta.url===new URL('file://'+process.argv[1]).href){
  try{
    const report=await runLiveVerification({
      accountId:process.env.CLOUDFLARE_ACCOUNT_ID,
      token:process.env.CLOUDFLARE_API_TOKEN,
      repeats:Number(process.env.REPEATS||2)
    });
    console.log('\n'+report);
    if(process.env.GITHUB_STEP_SUMMARY)
      await appendFile(process.env.GITHUB_STEP_SUMMARY,report+'\n');
  }catch(error){
    console.error('Verification could not complete:',error?.message||'unknown error');
    process.exitCode=1;
  }
}
