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
async function equalSecret(a,b){
  if(typeof a!=="string"||typeof b!=="string"||b.length<24||a.length>1000)return false;
  const encoder=new TextEncoder();
  const [ha,hb]=await Promise.all([crypto.subtle.digest("SHA-256",encoder.encode(a)),crypto.subtle.digest("SHA-256",encoder.encode(b))]);
  const aa=new Uint8Array(ha),bb=new Uint8Array(hb);
  let result=0;for(let i=0;i<aa.length;i++)result|=aa[i]^bb[i];
  return result===0;
}
function answerText(result){
  if(typeof result?.output_text==="string"&&result.output_text.trim())return result.output_text.trim();
  if(typeof result?.response==="string"&&result.response.trim())return result.response.trim();
  if(Array.isArray(result?.output)){
    const pieces=[];
    for(const item of result.output){
      if(item?.type!=="message"||!Array.isArray(item.content))continue;
      for(const part of item.content)if((part?.type==="output_text"||part?.type==="text")&&typeof part.text==="string")pieces.push(part.text);
    }
    return pieces.join("\n").trim();
  }
  if(typeof result?.choices?.[0]?.message?.content==="string")return result.choices[0].message.content.trim();
  return "";
}
function validatedInput(payload){
  if(!payload||typeof payload!=="object"||!Array.isArray(payload.messages))return null;
  if(payload.messages.length<1||payload.messages.length>16)return null;
  const messages=[];
  for(const m of payload.messages){
    if(!m||!["user","assistant"].includes(m.role)||typeof m.content!=="string"||!m.content.trim()||m.content.length>4000)return null;
    messages.push({role:m.role,content:m.content.trim()});
  }
  if(messages.at(-1).role!=="user")return null;
  if(!["low","medium","high"].includes(payload.effort))return null;
  if(payload.instructions!==undefined&&(typeof payload.instructions!=="string"||payload.instructions.length>2000))return null;
  return {messages,effort:payload.effort,instructions:(payload.instructions||"").trim()};
}
function isQuotaError(error){
  const msg=String(error?.message||error||"").toLowerCase();
  return /\b429\b|quota|neurons|daily limit|billing limit|rate limit|budget exceeded|exceeded your account limit/.test(msg);
}
export default {
  async fetch(request,env){
    const url=new URL(request.url);
    if(url.pathname!=="/api/chat")return env.ASSETS.fetch(request);
    if(request.method!=="POST")return codeError("METHOD_NOT_ALLOWED","Используйте POST.",405);
    const origin=request.headers.get("origin");
    if(origin&&origin!==url.origin)return codeError("ORIGIN_MISMATCH","Недопустимый источник запроса.",403);
    if(!env.KAZ_AI_ACCESS_KEY||!env.AI)return codeError("ACCESS_REQUIRED","Серверный ИИ ещё не настроен.",503);
    const auth=request.headers.get("authorization")||"";
    const permitted=await equalSecret(auth.startsWith("Bearer ")?auth.slice(7):"",env.KAZ_AI_ACCESS_KEY);
    if(!permitted)return codeError("ACCESS_REQUIRED","Неверный ключ доступа к тестовому ИИ.",401);
    if(!/^application\/json(?:;|$)/i.test(request.headers.get("content-type")||""))
      return codeError("INVALID_REQUEST","Требуется JSON.",415);
    const length=Number(request.headers.get("content-length")||0);
    if(length>50000)return codeError("INVALID_REQUEST","Слишком длинный запрос.",413);
    let raw;
    try{raw=await request.text()}catch{return codeError("INVALID_REQUEST","Ошибка чтения запроса.",400)}
    if(raw.length>50000)return codeError("INVALID_REQUEST","Слишком длинный запрос.",413);
    let payload;try{payload=JSON.parse(raw)}catch{return codeError("INVALID_REQUEST","Некорректный JSON.",400)}
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
      if(!text)return codeError("AI_EMPTY","Модель не вернула ответ. Попробуйте ещё раз.",502);
      return json({text,model:"gpt-oss-120b",effort:input.effort});
    }catch(e){
      if(isQuotaError(e))return codeError("AI_QUOTA_EXHAUSTED","Лимит ИИ исчерпан. Бесплатный дневной лимит закончился. Попробуйте позже, когда он обновится.",429);
      return codeError("AI_UNAVAILABLE","Не удалось получить ответ ИИ. Попробуйте позже.",503);
    }
  }
};
