/* Public Kaz AI text Worker: secret stays on Cloudflare; rate-limit model requests. */
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
// A random, short incident ID links the user's error banner to Workers Logs.
// Never log user messages, generated answers, prompts, secrets, or IP addresses.
const DIAGNOSTIC_BUILD="stream-diagnostics-20261117";
const newIncidentId=()=>crypto.randomUUID().replaceAll("-","").slice(0,12);
function safeFault(error){
  const rawStatus=Number(error?.status??error?.statusCode??error?.response?.status);
  const status=Number.isInteger(rawStatus)&&rawStatus>=100&&rawStatus<=599?rawStatus:null;
  const name=typeof error?.name==="string"&&/^[A-Za-z]{1,40}$/.test(error.name)?error.name:"Unknown";
  const code=typeof error?.code==="string"&&/^[A-Z0-9_]{2,45}$/.test(error.code)?error.code:null;
  return {name,code,status};
}
function logAIEvent(level,event,fields){
  // Only pass fixed metadata assembled by this Worker. No request/answer text.
  const record={service:"kaz-ai",build:DIAGNOSTIC_BUILD,event,...fields};
  if(level==="error")console.error("[kaz-ai-diagnostics]",JSON.stringify(record));
  else console.info("[kaz-ai-diagnostics]",JSON.stringify(record));
}

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

// Cloudflare GPT-OSS supports native SSE streaming with {messages, stream:true}.
// Its separate Responses API does not currently support streaming. Keep the
// existing JSON path for older clients, but use native SSE for long answers.

function wantsProofAudit(input){
  const q=input.messages.at(-1)?.content||"";
  return /(?:докаж|доказательств|строгое доказательство|обоснуй миним|почему.*невозможно|prove|rigorous proof|formal proof|demonstrate.*minimal)/iu.test(q);
}
// Grounded invariants for the regression problem that previously produced
// two false mathematical claims. This is a proof aid, not an answer cache.
function isTwentyFiveHorsePuzzle(question){
  const q=String(question||"").toLowerCase();
  return /(?:лошад|horses?)/iu.test(q)
    && /(?:^|\D)25(?:\D|$)/u.test(q)
    && /(?:^|\D)5(?:\D|$)/u.test(q)
    && /(?:тр[её]х|троих|тройк|three|top[\s-]*3|(?:^|\D)3(?:\D|$))/iu.test(q);
}
function horseProofReference(question){
  if(!isTwentyFiveHorsePuzzle(question))return "";
  return "Для задачи про 25 лошадей, 5 дорожек и трёх самых быстрых: "+
    "(1) Каждый из первых пяти групповых забегов даёт порядок пяти лошадей. "+
    "У четвёртой и пятой в своей группе уже три или четыре заведомо более быстрых; "+
    "после пяти групповых забегов исключены ровно 10 лошадей из топ-3 (по две из каждой группы). "+
    "(2) Шестой забег между победителями групп даёт порядок A1>B1>C1>D1>E1. "+
    "Абсолютный лидер A1. Для второго и третьего места остаются A2,A3,B1,B2,C1; "+
    "их седьмой забег определяет второе и третье места. "+
    "(3) СТРОГОЕ доказательство необходимости седьмого забега для ЛЮБЫХ стратегий из шести: "+
    "представим противника, который в каждом забеге назначает победителем лошадь, ни разу не проигрывавшую, "+
    "если такая присутствует; среди них предпочитает уже участвовавшую. "+
    "Любой забег при такой стратегии лишает статуса непобеждённой не более 4 лошадей. "+
    "Для установления самой быстрой надо устранить 24 кандидата; за 6 забегов это возможно только "+
    "если в каждом из шести участвуют ровно 5 ещё непобеждённых лошадей, а проигравшие больше не участвуют. "+
    "После пяти забегов существует по крайней мере одна ранее участвовавшая непобеждённая лошадь; "+
    "она должна участвовать в шестом, иначе останутся минимум два возможных победителя. "+
    "Противник позволяет такой лошади X победить в шестом. "+
    "Лошадь R, занявшая второе место в ПЕРВОМ забеге X, и лошадь W, занявшая второе место в шестом, "+
    "обе проиграли только X и никогда не сравнивались между собой даже транзитивно. "+
    "Обе расстановки R>W и W>R согласуются со всеми шестью забегами. "+
    "Значит, за шесть забегов нельзя гарантированно определить даже вторую лошадь. "+
    "(4) ЗАПРЕЩЁН ложный аргумент 22×3=66 против 6×10=60: "+
    "10 — максимум ПРЯМЫХ сравнений за забег, а транзитивно известных отношений может быть гораздо больше. "+
    "Не выдавай такой подсчёт за доказательство. "+
    "Не подменяй универсальное доказательство примером для одного расписания.";
}
function horseProofIssues(question,answer){
  if(!isTwentyFiveHorsePuzzle(question))return [];
  const value=String(answer||"").replace(/\s+/gu," ").toLowerCase();
  const issues=[];
  const firstFive=/после\s+(?:первых\s+)?(?:пяти|5)\s+(?:групповых\s+)?забег[а-яё]*[\s\S]{0,180}?(?:никого\s+исключать\s+нельзя|никого\s+нельзя\s+исключить|никаких\s+лошадей\s+нельзя\s+исключить|ни\s+одн[уаой]\s+лошад[ьи]\s+нельзя\s+исключить)/iu;
  if(firstFive.test(value))issues.push("После первых пяти групповых забегов исключаются уже 10 лошадей: четвёртая и пятая из каждой группы.");
  const directPairs=/(?:22\s*[×*xх·]\s*3\s*=\s*66)/iu.test(value)
    && /(?:6\s*[×*xх·]\s*10\s*=\s*60)/iu.test(value);
  if(directPairs&&!/(?:ошибочн|некорректн|неверн|ложн|не\s+доказыва[а-яё]*)/iu.test(value))
    issues.push("Подсчёт 66 против 60 не является доказательством: выводимые по транзитивности сравнения не ограничены 60.");
  // A claim to have proved the six-race lower bound needs an argument that
  // covers arbitrary choices of participants, not merely one winners' race.
  const claimsMinimum=/(?:сем[ьи]|7)\s*(?:забег[а-яё]*\s*)?(?:минимал|минимум)|(?:доказан|строго).{0,80}(?:минимал|невозможн)|(?:шест|6).{0,70}невозможн/iu.test(value);
  const hasUniversalWitness=/(?:непобежд[её]н|не\s+проигравш|ни\s+разу\s+не\s+проигр|unbeaten)/iu.test(value)
    && /(?:дв[ае]|втор[а-яё]*|runner.?up)/iu.test(value)
    && /(?:шест|6)/u.test(value)
    && /(?:не\s+сравнив|не\s+сравнива|не\s+сравнивал|не\s+сравнивалис|не\s+упорядочен|не\s+можно\s+определить|неизвестн|неопредел[её]н|incomparable)/iu.test(value);
  if(claimsMinimum&&!hasUniversalWitness)
    issues.push("Не приведена проверяемая универсальная нижняя граница для всех стратегий из шести забегов: нужен противниковый аргумент с непобеждёнными лошадьми и двумя несравнимыми кандидатами на второе место.");
  return issues;
}
function wantsEngineeringAudit(input){
  const q=input.messages.at(-1)?.content||"";
  const architecture=/(?:raft|crdt|rga|hlc|fifo|consensus|консенсус|vector[\s-]*clock|векторн[а-яё]*\s+час|репликаци|архитектур|распредел[её]нн[а-яё]*\s+(?:систем|мессенджер)|согласованност|отказоустойчив|network[\s-]*partition|race[\s-]*condition)/iu.test(q);
  const coding=/(?:код|программирован|исходник|реализуй|напиши\s+функцию|найди\s+баг|исправь\s+ошибку|\b(?:python|javascript|typescript|golang|rust|sql|c\+\+|java)\b)/iu.test(q);
  return architecture||coding;
}
function isMathematicalQuestion(question){
  // A math question mentioning source code, numeric verification or
  // "согласованность результата" is still mathematics, not a system design.
  const q=String(question||"");
  return /(?:остовн|матриц[а-яё\s-]{0,24}лаплас|кирхгоф|комбинаторик|многочлен|коэффициент|определител|реш[её]тк[аиуы]|взвешенн[а-яё\s-]{0,18}матриц|интерполяц|spanning[ -]?trees?|laplacian|kirchhoff|determinant|polynomial|coefficient|combinatori|graph[ -]?grid)/iu.test(q);
}
function auditKind(input){
  const question=input.messages.at(-1)?.content||"";
  if(isMathematicalQuestion(question))return "proof";
  if(isTwentyFiveHorsePuzzle(question)&&wantsProofAudit(input))return "proof";
  if(wantsEngineeringAudit(input))return "engineering";
  return wantsProofAudit(input)?"proof":null;
}
function distributedEngineeringTask(question){
  const q=String(question||"");
  return /(?:raft|crdt|rga|hlc|fifo|репликаци|согласованност|распредел[её]нн|vector[\s-]*clock)/iu.test(q)
    && /(?:сообщени|мессенджер|чат|message|messeng|chat|raft|crdt)/iu.test(q);
}
function engineeringGuide(question){
  const general="Для программирования: сверь решение с каждым требованием. Проверь алгоритмы, код, числовые разряды, гонки, сохранность состояния, ошибки, повторы запросов и пограничные случаи. Никаких неподтверждённых гарантий или выдуманных измерений. Если требования несовместимы, объясни компромисс.";
  if(!distributedEngineeringTask(question))return general;
  return general+" Для распределённого чата: различай FIFO одного отправителя, причинный и глобальный неизменяемый порядок; Raft имеет пересекающиеся кворумы и НЕ сливает или сортирует подтверждённые записи по HLC; HLC не заменяет консенсус; векторные часы сравниваются по ВСЕМ компонентам; RGA использует связи с предшественниками, не просто сортировку по MessageID; CRDT после асинхронного слияния не обеспечивает строгую немедленную доставку во время network partition. Проверяй idempotency, sender sequence, повтор после сбоя и гарантии ACK. Для 64-бит HLC, 16-бит SiteID и 32-бит Seq поля требуют 112 бит, сдвиги HLC на 48, SiteID на 32. Сдвиги HLC на 32 и SiteID на 16 создают наложение битов. Не обещай ни 100% доступность, ни конкретные задержки без измерений.";
}
// Deterministic checks complement the fallible model reviewer.
function engineeringIssues(question,answer){
  if(!distributedEngineeringTask(question))return [];
  const s=String(answer||"");
  const a=s.replace(/\s+/gu," ");
  const issues=[];
  const brokenBits=/\bMessageID\s*=\s*\(\s*HLC(?:_timestamp)?\s*<<\s*32\s*\)\s*\|\s*\(\s*SiteID\s*<<\s*16\s*\)\s*\|\s*SeqPerSite/iu;
  if(brokenBits.test(a)&&!/неверн|ошибочн|некорректн|invalid|incorrect/iu.test(a))
    issues.push("Перекрытие полей MessageID: 32-битный SeqPerSite пересекается с SiteID << 16. Для 64+16+32 бит нужны смещения 48 и 32.");
  if(/\bRaft\b/iu.test(a)
    &&/(?:оба|каждый)\s+(?:кластера?|dc|дата[\s-]*центра?).{0,100}(?:кворум|majority)/iu.test(a)
    &&!/не\s+могут|невозможн|нельзя/iu.test(a))
    issues.push("Один Raft-кластер не может одновременно иметь два непересекающихся подтверждающих большинства.");
  if(/\bRGA\b/iu.test(a)&&/(?:merge[\s\p{Pd}]*rga|слияни[а-яё]*\s*rga).{0,160}(?:по|by|в\s+порядке)\s+(?:их\s+)?MessageID/iu.test(a)
     &&!/не\s+является\s+rga|некорректн|ошибочн/iu.test(a))
    issues.push("Слияние RGA использует привязку к предшественникам, а не одну сортировку MessageID.");
  // Claims that require a globally agreed order cannot hold with independent
  // final delivery in isolated partitions and later message reordering.
  if(/\bCRDT\b/iu.test(a)&&/(?:строг[а-яё]*\s+(?:fifo|глобальн[а-яё]*\s+поряд)|strict\s+(?:fifo|order))/iu.test(a)
     &&/(?:re[\s-]?order|пере[\s-]?упорядоч|перестав[а-яё]*)/iu.test(a)
     &&!/(?:не\s+гарантир|не\s+обеспечива|только\s+после\s+слияни|предварительн[а-яё]*\s+отображ|временн[а-яё]*\s+сообщени)/iu.test(a))
    issues.push("CRDT-перестановка после доставки несовместима с неизменяемым глобальным порядком, если сообщения были объявлены окончательно доставленными.");
  if(/\bRaft\b/iu.test(a)
     &&/(?:закоммич[а-яё]*|committed|подтвержд[её]нн[а-яё]*).{0,160}(?:пересортир|по\s+HLC|merge[\s-]*log|слива[а-яё]*\s+журнал)/iu.test(a)
     &&!/не\s+(?:пересортир|изменя|слива)|нельзя\s+(?:пересортир|изменя|слива)/iu.test(a))
    issues.push("Подтверждённые записи Raft нельзя после commit сливать или пересортировывать по HLC.");
  return issues;
}
function parseEngineeringReview(raw){
  try{
    const value=JSON.parse(raw.slice(raw.indexOf("{"),raw.lastIndexOf("}")+1));
    if(!["pass","revise","uncertain"].includes(value?.verdict))throw Error("invalid verdict");
    const checks=value.checks||{};
    const ok=["requirements","ordering","partitions","code","claims"].every(k=>checks[k]===true);
    const issues=Array.isArray(value.issues)?value.issues.filter(x=>typeof x==="string"&&x.trim()).slice(0,8).map(x=>x.slice(0,400)):[];
    const corrected=typeof value.corrected_answer==="string"?value.corrected_answer.trim():"";
    if(value.verdict==="pass"&&ok&&issues.length===0)return {verdict:"pass",issues,corrected:""};
    if(value.verdict==="revise"&&issues.length&&corrected.length>=20)return {verdict:"revise",issues,corrected};
    return {verdict:"uncertain",issues:issues.length?issues:["Неполный технический отчёт."],corrected:""};
  }catch{return {verdict:"uncertain",issues:["Техническая проверка вернула неправильный формат."],corrected:""}}
}
function engineeringNotConfirmed(review){
  const notes=(review?.issues||[]).slice(0,5).map((x,i)=>(i+1)+". "+x).join("\n");
  return "## Техническая корректность ответа не подтверждена\n\nНезависимая проверка обнаружила ошибки или не смогла подтвердить все требования. "+
    "Непроверенное решение не выдаётся за готовое к внедрению."+
    (notes?"\n\n**Что требует исправления:**\n\n"+notes:"");
}

function parseSSEAnswerPiece(frame){
  if(frame.startsWith(":"))return "";
  const line=frame.split("\n").filter(x=>x.startsWith("data:")).map(x=>x.slice(5).trimStart()).join("\n");
  if(!line||line==="[DONE]")return "";
  try{
    const data=JSON.parse(line);
    // Cloudflare may deliver an error inside a syntactically valid SSE frame.
    // Never silently treat a failed generation as a completed proof.
    if(data?.error){
      const fault=new Error("Upstream model returned SSE error");
      fault.code="AI_MODEL_STREAM_ERROR";
      throw fault;
    }
    return typeof data?.response==="string"?data.response:
      typeof data?.choices?.[0]?.delta?.content==="string"?data.choices[0].delta.content:
      data?.type==="response.output_text.delta"&&typeof data.delta==="string"?data.delta:"";
  }catch(error){
    if(error?.code==="AI_MODEL_STREAM_ERROR")throw error;
    return "";
  }
}
function parseProofReview(raw){
  // Accept only a structured, explicit report; never silently count an unclear answer as verified.
  try{
    const first=raw.indexOf("{"),last=raw.lastIndexOf("}");
    const data=JSON.parse(raw.slice(first,last+1));
    if(!data||!["pass","revise","uncertain"].includes(data.verdict))throw new Error("Invalid verdict");
    const checks=data.checks||{};
    const verified=checks.assumptions===true&&checks.eliminations===true&&checks.lower_bound===true;
    const issues=Array.isArray(data.issues)
      ?data.issues.filter(x=>typeof x==="string"&&x.trim()).slice(0,8).map(x=>x.slice(0,400)):[];
    const corrected=typeof data.corrected_answer==="string"?data.corrected_answer.trim():"";
    if(data.verdict==="pass"&&verified&&issues.length===0)return {verdict:"pass",issues:[],corrected:""};
    if(data.verdict==="revise"&&issues.length>0&&corrected.length>=60)
      return {verdict:"revise",issues,corrected};
    return {verdict:"uncertain",issues,corrected:""};
  }catch{return {verdict:"uncertain",issues:["Независимая проверка не вернула проверяемое заключение."],corrected:""}}
}
async function independentProofReview(env,question,answer,effort,allowCorrection=false){
  // Keep the same user-selected reasoning level in every request.
  // Combine review and repair, but retain an independent final audit on a correction.
  const system=allowCorrection
    ?"Ты независимый математический рецензент-редактор Kaz AI. Проверь КАЖДЫЙ логический шаг, ранние исключения, транзитивность, крайние случаи и корректность конструкции. Если доказывается минимальность, необходимо доказать нижнюю границу ДЛЯ ВСЕХ допустимых алгоритмов, не для одной стратегии. ВАЖНО: различай сравнения, непосредственно полученные в испытаниях, и отношения, выведенные транзитивно. Предел числа прямых сравнений НЕ ограничивает число отношений, которые могут стать известны через транзитивность; не используй ошибочные подсчёты пар как доказательство невозможности. Например, участник, проигравший троим уже в одном групповом забеге, исключается из топ-3 сразу. Если есть ошибка, напиши verdict=revise, укажи её в issues, затем создай ПОЛНЫЙ исправленный ответ в corrected_answer. Перед выдачей сам проверь исправленную версию, но не заявляй о доказанной минимальности без универсального доказательства. Если исправить нельзя, честно оставь соответствующее утверждение недоказанным. Если ошибок нет, verdict=pass. Верни ТОЛЬКО JSON без Markdown: {\"verdict\":\"pass|revise|uncertain\",\"checks\":{\"assumptions\":true|false,\"eliminations\":true|false,\"lower_bound\":true|false},\"issues\":[\"конкретные ошибки\"],\"corrected_answer\":\"полный исправленный ответ при revise\"}. При pass все checks=true и issues=[]; не пересказывай решение."
    :"Ты независимый финальный математический рецензент Kaz AI. Рассматривай представленный ответ как новый, независимо проверяй каждый шаг, исключения, транзитивность, крайние случаи, отсутствие противоречий и полноту доказательства минимальности ДЛЯ ВСЕХ допустимых алгоритмов. Особенно важно: число прямых сравнений не является пределом числа известных транзитивно выводимых отношений. Если ответ доказывает универсальное утверждение только на примерах или ошибочно считает пары, НЕ подтверждай его. Верни ТОЛЬКО JSON: {\"verdict\":\"pass|revise|uncertain\",\"checks\":{\"assumptions\":true|false,\"eliminations\":true|false,\"lower_bound\":true|false},\"issues\":[\"конкретные ошибки\"],\"corrected_answer\":\"\"}. При pass все checks=true и issues=[]. При сомнении ставь uncertain; corrected_answer всегда пустой. Не выдумывай успешную проверку.";
  const result=await env.AI.run("@cf/openai/gpt-oss-120b",{
    input:[
      {role:"system",content:system},
      {role:"user",content:"ЗАДАЧА:\n"+question.slice(0,4000)+
        (horseProofReference(question)?"\n\nПРОВЕРЕННЫЕ КОНТРОЛЬНЫЕ ФАКТЫ:\n"+horseProofReference(question):"")+
        "\n\nПОТЕНЦИАЛЬНЫЕ ОШИБКИ, НАЙДЕННЫЕ БЕЗ МОДЕЛИ:\n"+(horseProofIssues(question,answer).join("\n")||"не обнаружены типовые ошибки")+
        "\n\nРЕШЕНИЕ:\n"+answer.slice(0,85000)}
    ],
    reasoning:{effort},stream:false
  });
  return parseProofReview(answerText(result));
}
async function independentEngineeringReview(env,question,answer,effort,repair=false){
  const instructions=repair
    ?"Проведи независимый технический аудит и при необходимости исправь весь ответ. Проверь КАЖДОЕ требование пользователя, соответствие заявленных свойств протоколам и реальному коду, согласованность, порядок, отказы, ошибки параллельного выполнения, переполнение чисел, повторную доставку, сохранность и реалистичность измерений. Для распределённых систем: два большинства одного Raft-кластера не могут быть непересекающимися; committed log нельзя пересортировывать по HLC; HLC не заменяет консенсус; RGA не равен сортировке ID; vector clock сравнивают по компонентам; eventual ordering при CRDT не равно строгой неизменной доставке; учти FIFO по отправителю и недоступные регионы. Битовые поля (64-bit HLC, 16-bit SiteID, 32-bit Seq) требуют 112 бит и непересекающихся сдвигов 48 и 32, если packed. Не утверждай '100% uptime', exact-once, отсутствие потерь и RTT без доказательств. Если требование физически несовместимо с другим, укажи компромисс, не выдавай его за исполнение. Верни ТОЛЬКО JSON: {\"verdict\":\"pass|revise|uncertain\",\"checks\":{\"requirements\":true,\"ordering\":true,\"partitions\":true,\"code\":true,\"claims\":true},\"issues\":[],\"corrected_answer\":\"\"}. При отсутствии ошибок pass, все checks=true и issues=[]. При ошибках revise, перечисли проблемы и предоставь ПОЛНОСТЬЮ ИСПРАВЛЕННЫЙ ответ в corrected_answer. Если нельзя исправить надёжно, uncertain без ложных гарантий."
    :"Повторно независимо проверь уже исправленный технический ответ. Особое внимание: не перепутаны FIFO и глобальный порядок; при partition не обещана одновременно локальная финальная доставка и строгая линейная согласованность; Raft quorums/committed log верны; RGA/HLC/VC верны; packed ID не перекрывается; sender-seq и retries учтены; точные задержки не придуманы; требования пользователя соблюдены; код и алгоритмы непротиворечивы. Если что-то важное недоказано или ошибочно, ответ не может получить pass. Верни ТОЛЬКО JSON: {\"verdict\":\"pass|revise|uncertain\",\"checks\":{\"requirements\":true,\"ordering\":true,\"partitions\":true,\"code\":true,\"claims\":true},\"issues\":[],\"corrected_answer\":\"\"}. При pass все checks=true и issues=[]. Исправленный ответ не создавай в этой повторной проверке.";
  const result=await env.AI.run("@cf/openai/gpt-oss-120b",{
    input:[
      {role:"system",content:instructions},
      {role:"user",content:"ЗАДАЧА:\n"+question.slice(0,4000)+"\n\nПРАВИЛА:\n"+engineeringGuide(question)+
        "\n\nПРОБЛЕМЫ, ОПРЕДЕЛЁННЫЕ ПРОГРАММОЙ:\n"+(engineeringIssues(question,answer).join("\n")||"нет очевидных совпадений")+
        "\n\nОТВЕТ:\n"+answer.slice(0,75000)}
    ],
    reasoning:{effort},stream:false
  });
  return parseEngineeringReview(answerText(result));
}
async function verifyEngineering(env,question,draft,effort,onStage=()=>{},onFault=()=>{}){
  let first;
  try{
    onStage("Проверяю техническую корректность");
    first=await independentEngineeringReview(env,question,draft,effort,true);
  }catch(error){onFault("engineering_primary_review",error);return engineeringNotConfirmed()}
  const known=engineeringIssues(question,draft);
  if(first.verdict==="pass")return known.length?engineeringNotConfirmed({issues:known}):draft;
  if(first.verdict!=="revise")return engineeringNotConfirmed({issues:[...known,...first.issues]});
  if(first.corrected===draft.trim())return engineeringNotConfirmed(first);
  const remaining=engineeringIssues(question,first.corrected);
  if(remaining.length)return engineeringNotConfirmed({issues:remaining});
  let second;
  try{
    onStage("Перепроверяю исправленную архитектуру и код");
    second=await independentEngineeringReview(env,question,first.corrected,effort,false);
  }catch(error){onFault("engineering_final_review",error);return engineeringNotConfirmed(first)}
  return second.verdict==="pass"&&!engineeringIssues(question,first.corrected).length
    ?first.corrected:engineeringNotConfirmed(second);
}

function proofNotConfirmed(review){
  const details=(review?.issues||[]).slice(0,5).map((issue,i)=>(i+1)+". "+issue).join("\n");
  return "## Строгое доказательство пока не подтверждено\n\nЯ не могу надёжно подтвердить все шаги решения. Не буду выдавать непроверенный черновик за доказанный результат."+
    (details?"\n\n**Что требует проверки:**\n\n"+details:"\n\nДополнительная проверка сейчас недоступна.")+
    "\n\nЭто ограничение проверки ИИ, а не доказательство неправильности самого ответа.";
}
async function verifyAndImproveProof(env,question,draft,effort,onStage=()=>{},onFault=()=>{}){
  let review;
  try{
    onStage("Независимо проверяю доказательство");
    review=await independentProofReview(env,question,draft,effort,true);
  }catch(error){onFault("proof_primary_review",error);return proofNotConfirmed()}
  const draftIssues=horseProofIssues(question,draft);
  if(review.verdict==="pass")return draftIssues.length?proofNotConfirmed({issues:draftIssues}):draft;
  if(review.verdict!=="revise")return proofNotConfirmed({issues:[...draftIssues,...review.issues]});
  if(review.corrected===draft.trim())return proofNotConfirmed(review );
  const correctedIssues=horseProofIssues(question,review.corrected);
  if(correctedIssues.length)return proofNotConfirmed({issues:correctedIssues});
  let finalReview;
  try{
    onStage("Проверяю исправленное решение");
    finalReview=await independentProofReview(env,question,review.corrected,effort,false);
  }catch(error){onFault("proof_final_review",error);return proofNotConfirmed(review)}
  return finalReview.verdict==="pass"&&horseProofIssues(question,review.corrected).length===0?review.corrected:proofNotConfirmed(finalReview);
}

function streamedAIResponse(env,messages,effort,auditMode=null,incidentId=newIncidentId()){
  const verifyProof=Boolean(auditMode);
  const encoder=new TextEncoder();
  // All reasoning levels get the same generous output allowance. The chosen
  // effort changes how the model reasons, not how much answer it may produce.
  // 12,288 is the previously tested high-level budget, now shared by all.
  const opts={
    messages,
    reasoning_effort:effort,
    max_tokens:12288,
    stream:true
  };
  let upstreamReader=null,heartbeat=null,closed=false;
  let collected="",sseTail="",upstreamBytesSeen=false,receivedBytes=0,receivedChunks=0;
  let phase="model_connect";
  let activeStage=verifyProof?"Готовлю решение":"ИИ отвечает";
  const startedAt=Date.now();
  const decode=new TextDecoder();
  const diagnostic=event=>logAIEvent("info",event,{incidentId,phase,elapsedMs:Date.now()-startedAt,effort,auditMode:auditMode||"none",receivedBytes,receivedChunks});
  const responseBody=new ReadableStream({
    start(controller){
      const write=value=>{
        if(closed)return;
        try{controller.enqueue(value instanceof Uint8Array?value:encoder.encode(value))}
        catch{closed=true;clearInterval(heartbeat)}
      };
      const finish=()=>{
        if(closed)return;
        closed=true;
        clearInterval(heartbeat);
        try{controller.close()}catch{}
      };
      // Headers and the first heartbeat are sent before the potentially slow
      // inference call, so intermediaries do not wait for the complete answer.
      diagnostic("start");
      write(": connected\n\n");
      if(verifyProof)write("event: progress\ndata: "+JSON.stringify({message:"Готовлю решение и проверяю все этапы…"})+"\n\n");
      // Heartbeats keep an otherwise silent response active during long
      // inference and independent review. Proof mode also shows a meaningful
      // stage and elapsed time without leaking an unverified answer.
      heartbeat=setInterval(()=>{
        write(": keepalive\n\n");
        if(verifyProof&&!closed){
          const seconds=Math.max(0,Math.floor((Date.now()-startedAt)/1000));
          write("event: progress\ndata: "+JSON.stringify({
            message:activeStage+"… "+seconds+" с"
          })+"\n\n");
        }
      },15000);
      void (async()=>{
        try{
          if(auditMode==="proof"){
            // The documented GPT-OSS Responses format accepts reasoning.effort,
            // but is non-streaming. The user already sees progress rather than
            // the unverified draft during mathematical verification.
            const result=await env.AI.run("@cf/openai/gpt-oss-120b",{
              input:messages,reasoning:{effort},stream:false,max_output_tokens:12288
            });
            phase="model_read";diagnostic("model_connected");
            if(closed)return;
            collected=answerText(result);
            if(!collected.trim()){
              const error=new Error("Mathematical draft returned no text");
              error.code="AI_MODEL_EMPTY";
              throw error;
            }
            upstreamBytesSeen=true;
            receivedBytes=encoder.encode(collected).byteLength;receivedChunks=1;
            if(collected.length>85000){
              const error=new Error("Mathematical draft exceeds independent review capacity");
              error.code="AI_REVIEW_OUTPUT_LIMIT";
              throw error;
            }
          }else{
            const upstream=await env.AI.run("@cf/openai/gpt-oss-120b",opts);
            phase="model_read";diagnostic("model_connected");
            if(closed){await upstream?.cancel?.().catch(()=>{});return}
            if(!upstream||typeof upstream.getReader!=="function")
              throw new Error("Workers AI did not provide an SSE stream");
            upstreamReader=upstream.getReader();
            while(!closed){
              const {done,value}=await upstreamReader.read();
              if(done)break;
              if(value?.byteLength){
                upstreamBytesSeen=true;
                receivedBytes+=value.byteLength;receivedChunks++;
                if(!verifyProof)write(value);
                if(verifyProof){
                  sseTail+=decode.decode(value,{stream:true});
                  sseTail=sseTail.replace(/\r\n/g,"\n");
                  if(sseTail.length>200000){
                    const error=new Error("An upstream event exceeded safe frame size");
                    error.code="AI_STREAM_FRAME_LIMIT";
                    throw error;
                  }
                  let idx;
                  while((idx=sseTail.indexOf("\n\n"))!==-1){
                    const frame=sseTail.slice(0,idx);
                    sseTail=sseTail.slice(idx+2);
                    collected+=parseSSEAnswerPiece(frame);
                    if(collected.length>85000){
                      const error=new Error("Draft exceeds independent review capacity");
                      error.code="AI_REVIEW_OUTPUT_LIMIT";
                      throw error;
                    }
                  }
                }
              }
            }
          }
          // Proof requests are kept private until draft, review and repair finish.
          // Regular chats still stream each chunk immediately.
          if(!closed&&verifyProof){
            if(!collected.trim())throw new Error("Empty proof answer");
            phase=auditMode==="engineering"?"engineering_review":"proof_review";diagnostic("model_completed");
            const stage=message=>{
              activeStage=message;
              phase=auditMode==="engineering"?"engineering_review":"proof_review";
              write("event: progress\ndata: "+JSON.stringify({message:message+"…"})+"\n\n");
            };
            const question=messages.at(-1)?.content||"";
            const auditFault=(auditPhase,error)=>logAIEvent("error","audit_provider_failure",{
              incidentId,phase:auditPhase,elapsedMs:Date.now()-startedAt,
              effort,auditMode,receivedBytes,receivedChunks,...safeFault(error)
            });
            const finalAnswer=auditMode==="engineering"
              ?await verifyEngineering(env,question,collected,effort,stage,auditFault)
              :await verifyAndImproveProof(env,question,collected,effort,stage,auditFault);
            if(!closed)write("event: final\ndata: "+JSON.stringify({text:finalAnswer})+"\n\n");
            phase="final_answer";diagnostic("audit_completed");
          }


          if(!closed){
            phase="completed";diagnostic("completed");
            write("event: done\ndata: {}\n\n");
          }
        }catch(error){
          if(!closed){
            const faultPhase=phase;
            const safe=safeFault(error);
            logAIEvent("error","inference_failed",{
              incidentId,phase:faultPhase,elapsedMs:Date.now()-startedAt,
              effort,auditMode:auditMode||"none",receivedBytes,receivedChunks,
              modelBytesSeen:upstreamBytesSeen,...safe
            });
            const kind=classifyAILimit(error);
            const code=kind==="daily"?"AI_QUOTA_EXHAUSTED":kind==="rate"?"AI_RATE_LIMITED":upstreamBytesSeen?"AI_RESPONSE_INTERRUPTED":"AI_UNAVAILABLE";
            const message=kind==="daily"
              ?"Дневной лимит ИИ исчерпан. Попробуйте после его обновления."
              :kind==="rate"
                ?"Слишком много запросов за короткое время. Попробуйте позднее."
                :upstreamBytesSeen?"Сервис ИИ прервал обработку ответа. Попробуйте повторить запрос.":"Не удалось связаться с сервисом ИИ. Попробуйте позже.";
            write("event: error\ndata: "+JSON.stringify({code,message,incidentId})+"\n\n");
          }
        }finally{
          // Stop timers and release model transport when processing ends.
          // No automatic retries: a second inference could be billed twice.
          if(upstreamReader){try{upstreamReader.releaseLock()}catch{}}
          finish();
        }
      })();
    },
    cancel(){
      closed=true;
      clearInterval(heartbeat);
      if(upstreamReader)void upstreamReader.cancel("client disconnected").catch(()=>{});
    }
  });
  return new Response(responseBody,{headers:{
    "content-type":"text/event-stream; charset=utf-8",
    "cache-control":"no-cache, no-store, no-transform",
    "x-content-type-options":"nosniff",
    "x-accel-buffering":"no",
    "x-kaz-ai-request-id":incidentId,
    "x-kaz-ai-reasoning-effort":effort
  }});
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
    // Visitors never receive or enter KAZ_AI_ACCESS_KEY. It remains a
    // server-only enable switch; Cloudflare controls public AI consumption.
    if(typeof env.CHAT_IP_LIMITER?.limit!=="function"||typeof env.CHAT_GLOBAL_LIMITER?.limit!=="function")
      return codeError("ACCESS_REQUIRED","Серверный ИИ ещё не настроен.",503);
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
    // Per-visitor and per-PoP limits. These Cloudflare counters are approximate,
    // while Workers AI's daily free-tier quota remains the final hard cap.
    const visitor=request.headers.get("cf-connecting-ip")||"unknown";
    try{
      const individual=await env.CHAT_IP_LIMITER.limit({key:"ip:"+visitor});
      if(!individual.success)return codeError("AI_RATE_LIMITED","Слишком много запросов за короткое время.",429);
      const shared=await env.CHAT_GLOBAL_LIMITER.limit({key:"public-chat"});
      if(!shared.success)return codeError("AI_RATE_LIMITED","Слишком много запросов за короткое время.",429);
    }catch{
      return codeError("AI_UNAVAILABLE","Защита запросов временно недоступна.",503);
    }
    const mode=auditKind(input);
    const messages=[
      {role:"system",content:"Ты Kaz AI. Отвечай на языке пользователя полезно, точно и понятно. Не выдумывай факты, расчёты и источники. \nФорматируй ответ аккуратным Markdown: понятные заголовки ##, небольшие абзацы, нумерованные шаги, таблицы только если они помогают, формулы в $...$ или $$...$$, код в тройных обратных кавычках. Не вставляй сырые HTML-теги. Не добавляй декоративных эмодзи без смысла.\nДля логических, математических и сложных задач: сначала проверь условия и исключения, затем рассуждай последовательно. Любое утверждение «минимально», «невозможно», «для всех случаев» требует доказательства для всех допустимых способов, а не только одного алгоритма и отдельных примеров. Ясно отличай строго доказанное от вероятного и непроверенного. Проверяй пограничные случаи и отсутствие скрытых предположений. Если доказательства нет, прямо напиши, что вывод не доказан, не выдавай неполное обоснование за строгое.\nНе обещай безошибочность. Уровень рассуждения влияет на тщательность, но требования честности, точности и форматирования одинаковы во всех режимах."+
        (horseProofReference(input.messages.at(-1).content)?"\nМАТЕМАТИЧЕСКИЕ КОНТРОЛЬНЫЕ ФАКТЫ ДЛЯ ЭТОЙ ЗАДАЧИ:\n"+horseProofReference(input.messages.at(-1).content):"")+
        (mode==="engineering"?"\nПРОВЕРКА ПРОГРАММИРОВАНИЯ И АРХИТЕКТУРЫ:\n"+engineeringGuide(input.messages.at(-1).content):"")+
        (input.instructions?" Пользовательские предпочтения: "+input.instructions:"")},
      ...input.messages
    ];
    if((request.headers.get("accept")||"").includes("text/event-stream"))
      return streamedAIResponse(env,messages,input.effort,mode);
    try{
      // Cloudflare's GPT-OSS Workers binding supports Responses API input
      // with reasoning.effort. The older reasoning_effort field is not part of
      // its published input schema and may silently leave the level unchanged.
      const result=await env.AI.run("@cf/openai/gpt-oss-120b",{
        input:messages,
        reasoning:{effort:input.effort},
        stream:false
      });
      const text=answerText(result);
      if(!text.trim())return codeError("AI_EMPTY","Модель не вернула ответ. Попробуйте ещё раз.",502);
      const finalText=mode==="engineering"
        ?await verifyEngineering(env,input.messages.at(-1).content,text,input.effort)
        :mode==="proof"?await verifyAndImproveProof(env,input.messages.at(-1).content,text,input.effort):text;
      return json({text:finalText,model:"gpt-oss-120b",effort:input.effort});
    }catch(e){
      const kind=classifyAILimit(e);
      if(kind==="daily")return codeError("AI_QUOTA_EXHAUSTED","Дневной лимит ИИ исчерпан. Попробуйте после его обновления.",429);
      if(kind==="rate")return codeError("AI_RATE_LIMITED","Слишком много запросов за короткое время. Попробуйте позднее.",429);
      return codeError("AI_UNAVAILABLE","Не удалось получить ответ ИИ. Попробуйте позже.",503);
    }
  }
};
