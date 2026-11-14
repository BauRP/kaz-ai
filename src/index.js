/* Kaz AI private-text beta Worker. Requires AI binding + secret; never opens to anonymous use. */
const json=(data,status=200)=>new Response(JSON.stringify(data),{
  status,
  headers:{
    "content-type":"application/json; charset=utf-8",
    "cache-control":"no-store",
    "x-content-type-options":"nosniff"
  }
});
const codeError=(code,message,status)=>json({code,message},status);
const MAX_CHAT_BYTES=50000;
// The content-length header is optional and cannot be trusted to enforce the
// limit. Read in bounded chunks, cancelling oversized streams immediately.
async function readLimitedBody(request){
  if(!request.body)return {raw:""};
  const reader=request.body.getReader();
  const decoder=new TextDecoder("utf-8",{fatal:true});
  let bytes=0,raw="";
  try{
    while(true){
      const {value,done}=await reader.read();
      if(done)break;
      bytes+=value.byteLength;
      if(bytes>MAX_CHAT_BYTES){
        void reader.cancel("request exceeds 50 KB").catch(()=>{});
        return {tooLarge:true};
      }
      raw+=decoder.decode(value,{stream:true});
    }
    raw+=decoder.decode();
    return {raw};
  }finally{
    reader.releaseLock();
  }
}
async function equalSecret(a,b){
  if(typeof a!=="string"||typeof b!=="string"||b.length<24||a.length>1000)return false;
  const encoder=new TextEncoder();
  const [ha,hb]=await Promise.all([crypto.subtle.digest("SHA-256",encoder.encode(a)),crypto.subtle.digest("SHA-256",encoder.encode(b))]);
  const aa=new Uint8Array(ha),bb=new Uint8Array(hb);
  let result=0;for(let i=0;i<aa.length;i++)result|=aa[i]^bb[i];
  return result===0;
}
function answerText(result){
  if(typeof result?.output_text==="string"&&result.output_text.trim())return result.output_text;
  if(typeof result?.response==="string"&&result.response.trim())return result.response;
  if(Array.isArray(result?.output)){
    const pieces=[];
    for(const item of result.output){
      if(item?.type!=="message"||!Array.isArray(item.content))continue;
      for(const part of item.content)if((part?.type==="output_text"||part?.type==="text")&&typeof part.text==="string")pieces.push(part.text);
    }
    const combined=pieces.join("\n");
    if(combined.trim())return combined;
  }
  if(typeof result?.choices?.[0]?.message?.content==="string")return result.choices[0].message.content;
  return "";
}
function validatedInput(payload){
  if(!payload||typeof payload!=="object"||!Array.isArray(payload.messages))return null;
  if(payload.messages.length<1||payload.messages.length>16)return null;
  const messages=[];
  for(const m of payload.messages){
    if(!m||!["user","assistant"].includes(m.role)||typeof m.content!=="string"||!m.content.trim()||m.content.length>4000)return null;
    // Preserve leading indentation and trailing newlines in code or documents.
    // The trim above is validation-only, not an edit to user content.
    messages.push({role:m.role,content:m.content});
  }
  if(messages.at(-1).role!=="user")return null;
  if(!["low","medium","high"].includes(payload.effort))return null;
  if(payload.instructions!==undefined&&(typeof payload.instructions!=="string"||payload.instructions.length>2000))return null;
  return {messages,effort:payload.effort,instructions:(payload.instructions||"").trim()};
}
function classifyAILimit(error){
  // Cloudflare may reject with an Error, a nested cause, or a structured HTTP status.
  // A plain 429 means temporary throttling; never call that a daily quota exhaustion.
  const details=[error?.message,error?.error?.message,error?.cause?.message,
    typeof error?.error==="string"?error.error:"",typeof error==="string"?error:""];
  const msg=details.filter(x=>typeof x==="string").join(" ").toLowerCase();
  if(/daily|neurons|quota exceeded|quota exhausted|billing limit|budget exceeded|exceeded your account limit/.test(msg))return "daily";
  if(/\b429\b|rate limit|too many requests|throttl/.test(msg))return "rate";
  const status=Number(error?.status??error?.statusCode??error?.response?.status);
  if(status===429)return "rate";
  return null;
}
export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname==="/robots.txt"&&request.method==="GET"){
      return new Response("User-agent: *\nAllow: /\nDisallow: /api/\nSitemap: "+url.origin+"/sitemap.xml\n",{
        headers:{"content-type":"text/plain; charset=utf-8","cache-control":"public, max-age=3600","x-content-type-options":"nosniff"}
      });
    }
    if(url.pathname==="/sitemap.xml"&&request.method==="GET"){
      const urls=["/","/about/","/capabilities/","/questions/","/privacy/","/kk/","/en/","/ai-chat/","/ai-images/"];
      const entries=urls.map(path=>"<url><loc>"+url.origin+path+"</loc></url>").join("");
      return new Response('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+entries+'</urlset>',{
        headers:{"content-type":"application/xml; charset=utf-8","cache-control":"public, max-age=3600","x-content-type-options":"nosniff"}
      });
    }
    if(url.pathname!=="/api/chat")return env.ASSETS.fetch(request);
    if(request.method!=="POST")return codeError("METHOD_NOT_ALLOWED","Используйте POST.",405);
    const origin=request.headers.get("origin");
    if(origin&&origin!==url.origin)return codeError("ORIGIN_MISMATCH","Недопустимый источник запроса.",403);
    if(typeof env.KAZ_AI_ACCESS_KEY!=="string"||env.KAZ_AI_ACCESS_KEY.length<24
       ||env.KAZ_AI_ACCESS_KEY.length>1000||!env.AI)
      return codeError("ACCESS_REQUIRED","Серверный ИИ ещё не настроен.",503);
    const auth=request.headers.get("authorization")||"";
    const permitted=await equalSecret(auth.startsWith("Bearer ")?auth.slice(7):"",env.KAZ_AI_ACCESS_KEY);
    if(!permitted)return codeError("ACCESS_REQUIRED","Неверный ключ доступа к тестовому ИИ.",401);
    if(!/^application\/json(?:;|$)/i.test(request.headers.get("content-type")||""))
      return codeError("INVALID_REQUEST","Требуется JSON.",415);
    const length=Number(request.headers.get("content-length")||0);
    if(length>MAX_CHAT_BYTES)return codeError("INVALID_REQUEST","Слишком длинный запрос.",413);
    let body;
    try{body=await readLimitedBody(request)}
    catch{return codeError("INVALID_REQUEST","Ошибка чтения запроса.",400)}
    if(body.tooLarge)return codeError("INVALID_REQUEST","Слишком длинный запрос.",413);
    let payload;try{payload=JSON.parse(body.raw)}catch{return codeError("INVALID_REQUEST","Некорректный JSON.",400)}
    const input=validatedInput(payload);
    if(!input)return codeError("INVALID_REQUEST","Неподдерживаемый запрос.",400);
    const messages=[
      {role:"system",content:"Ты Kaz AI. Отвечай полезно, точно и понятно. Не выдумывай источники. Если ответа не знаешь, так и скажи."+
        (input.instructions?" Пользовательские предпочтения: "+input.instructions:"")},
      ...input.messages
    ];
    try{
      const result=await env.AI.run("@cf/openai/gpt-oss-120b",{
        messages,
        reasoning_effort:input.effort,
        max_tokens:1200
      });
      const text=answerText(result);
      if(!text.trim())return codeError("AI_EMPTY","Модель не вернула ответ. Попробуйте ещё раз.",502);
      return json({text,model:"gpt-oss-120b",effort:input.effort});
    }catch(e){
      const kind=classifyAILimit(e);
      if(kind==="daily")return codeError("AI_QUOTA_EXHAUSTED","Дневной лимит ИИ исчерпан. Попробуйте после его обновления.",429);
      if(kind==="rate")return codeError("AI_RATE_LIMITED","Слишком много запросов за короткое время. Попробуйте позднее.",429);
      return codeError("AI_UNAVAILABLE","Не удалось получить ответ ИИ. Попробуйте позже.",503);
    }
  }
};
