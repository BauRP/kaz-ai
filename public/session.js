"use strict";
/* Kaz AI session functionality. No persistent storage, no secrets and no fake AI replies. */
(function () {
  const $ = selector => document.querySelector(selector);
  const make = (tag, className, value) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (value !== undefined) el.textContent = value;
    return el;
  };
  const button = (label, action, id, css="session-button") => {
    const el=make("button",css,label);
    el.type="button";el.dataset.session=action;
    if(id!==undefined && id!==null)el.dataset.id=String(id);
    return el;
  };
  const threads=[];
  const projects=[];
  const drafts=new Map();
  let welcomeDraft="";
  let activitySerial=0;
  const touchChat=chat=>{chat.activity=++activitySerial};
  const newestFirst=(a,b)=>(b.activity||0)-(a.activity||0);
  const projectCountLabel=count=>{
    const lang=window.KazI18n?.language||"ru";
    if(lang==="en")return count+" "+(count===1?"chat":"chats");
    if(lang==="kk")return count+" чат";
    const last=count%10,lastTwo=count%100;
    const suffix=last===1&&lastTwo!==11?"чат":last>=2&&last<=4&&(lastTwo<12||lastTwo>14)?"чата":"чатов";
    return count+" "+suffix;
  };
  let current=null,serial=0,modalReturn=null,abort=null,pending=null,pendingReplaceId=null,personalInstructions="",aiAccessKey="",retryAnswerId=null;
  let statusRetryable=false;
  const nextId=()=>String(++serial);
  const uiText=value=>window.KazI18n?.translate?.(value)||value;
  const selected=()=>threads.find(c=>c.id===current)||null;
  const displayThread=c=>{
    const next=c?.id||null;
    const input=$("#messageInput");
    if(current!==next){
      if(input){
        if(current&&threads.some(thread=>thread.id===current)){
          if(input.value)drafts.set(current,input.value);else drafts.delete(current);
        }
        else welcomeDraft=input.value;
      }
      current=next;
      if(input)input.value=next?(drafts.get(next)||""):welcomeDraft;
      resizeInput();
    }
    state.chat=c?c.messages:[];
    state.draftTitle=c?c.title:"Новый чат";
    // A saved chat is never temporary, even if the previous composer was.
    const temporarySetting=$("#sessionTemporary");
    if(c&&temporarySetting)temporarySetting.checked=Boolean(c.temporary);
  };
  const composeText=()=>$("#messageInput").value.trim();
  function showStatus(text,quota=false,retryable=false){
    const banner=$("#statusBanner");
    banner.textContent=text;
    if(!retryable)retryAnswerId=null;
    statusRetryable=Boolean(text&&retryable);
    banner.classList.toggle("is-quota",quota);
    banner.hidden=!text||state.screen!=="chat";
    const retry=$("#sessionRetry");
    if(retry)retry.hidden=!statusRetryable||state.screen!=="chat";
  }
  const baseResizeInput=resizeInput;
  resizeInput=function(){baseResizeInput();if(abort)$("#sendButton").disabled=true};
  const baseRenderChat=renderChat;
  const baseRenderTools=renderTools;
  const baseShowScreen=showScreen;
  const baseShowFeature=showFeature;
  const baseToggleTheme=toggleTheme;
  const safeExportName=name=>Array.from(name.normalize("NFKC")
    .replace(/[\\/:*?"<>|\x00-\x1f]/g,"").trim().replace(/^\.+/,"")).slice(0,70).join("")||"chat";
  const exportText=c=>{
    const lang=window.KazI18n?.language||"ru";
    const labels={
      ru:{note:"Экспорт текущей переписки (без сохранения в облаке)",user:"Вы: "},
      en:{note:"Current conversation export (not saved to the cloud)",user:"You: "},
      kk:{note:"Ағымдағы әңгіме экспорты (бұлтта сақталмайды)",user:"Сіз: "}
    }[lang];
    return [
      "Kaz AI — "+c.title,
      labels.note,
      "",
      ...c.messages.map(m=>(m.role==="assistant"?"Kaz AI: ":labels.user)+m.content+"\n")
    ].join("\n");
  };
  function download(name,body,mime){
    const blob=new Blob([mime.startsWith("text/plain")?"\uFEFF":"",body],{type:mime});
    const url=URL.createObjectURL(blob);
    const link=document.createElement("a");link.href=url;link.download=name;document.body.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),30000);
  }
  function openDialog(title,paragraph="",build){
    modalReturn=document.activeElement;
    const overlay=$("#sessionOverlay");const titleEl=$("#sessionTitle"),body=$("#sessionBody");
    titleEl.textContent=title;body.replaceChildren();
    if(paragraph)body.append(make("p","session-help",paragraph));
    if(build)build(body);
    overlay.hidden=false;
    const focus=body.querySelector("input,textarea,select,button")||$("#sessionClose");
    focus.focus();
  }
  function closeDialog(){
    const previous=modalReturn;
    const overlay=$("#sessionOverlay");
    overlay.hidden=true;
    $("#sessionBody").replaceChildren();
    $("#sessionTitle").textContent="";
    // A project or chat action can replace the opening button while the modal is open.
    // Never leave keyboard focus in a disconnected or hidden element after Save/Delete.
    const fallback=state.screen==="projects"
      ?$("#projectsWorkspace [data-session='new-project']")
      :state.screen==="history"
        ?$("#historySearch")
        :$("#messageInput");
    const visible=element=>element?.isConnected&&!element.closest("[hidden]")&&typeof element.focus==="function";
    if(visible(previous))previous.focus();
    else if(visible(fallback))fallback.focus();
    else $("#messageInput")?.focus();
    modalReturn=null;
  }
  const addButtons=(target,items)=>{
    const actions=make("div","session-actions");
    for(const item of items)actions.append(button(item.label,item.action,item.id,item.className||"session-button"));
    target.append(actions);
  };
  function sessionNewChat(temporary=false){
    if(abort)abort.abort("navigation");
    abort=null;pending=null;
    $("#sessionStop").hidden=true;
    for(let i=threads.length-1;i>=0;i--)if(threads[i].temporary){drafts.delete(threads[i].id);threads.splice(i,1)}
    if(current&&threads.some(thread=>thread.id===current)){
      if($("#messageInput").value)drafts.set(current,$("#messageInput").value);
      else drafts.delete(current);
    }
    welcomeDraft="";
    current=null;
    state.chat=[];state.draftTitle="Новый чат";
    $("#messageInput").value="";$("#messageInput").focus();
    $("#sendButton").disabled=true;
    const temp=$("#sessionTemporary");if(temp)temp.checked=temporary;
    showStatus("");
    renderHistory();renderChat();showScreen("welcome");
    if(temporary)notify("Временный чат не будет добавлен в историю.");
  }
  function newThread(firstMessage){
    const temporary=Boolean($("#sessionTemporary")?.checked);
    // Never cut a surrogate pair in half when the first message contains emoji.
    const title=Array.from(firstMessage).slice(0,55).join("")||"Новый чат";
    const chat={id:nextId(),title,
      messages:[],pinned:false,projectId:null,temporary};
    touchChat(chat);threads.unshift(chat);displayThread(chat);
    return chat;
  }
  // Match equivalent Unicode spellings while highlighting the exact original text.
  // Cache the grapheme segmenter so repeated searches don't rebuild it for every match.
  const graphemes=typeof Intl.Segmenter==="function"
    ?new Intl.Segmenter(undefined,{granularity:"grapheme"}):null;
  function findTextMatch(text,query){
    const fold=value=>value.normalize("NFC").toLocaleLowerCase()
      .replace(/\u0307/g,"").replace(/\u03c2/g,"\u03c3");
    const needle=fold(query);
    if(!needle)return null;
    const folded=fold(text);
    const start=folded.indexOf(needle);
    if(start<0)return null;
    if(folded.length===text.length)return {start,end:start+needle.length};
    const starts=[],ends=[];
    const append=(symbol,offset)=>{
      const end=offset+symbol.length;
      const normalized=fold(symbol);
      for(let n=0;n<normalized.length;n++){starts.push(offset);ends.push(end)}
      if(!normalized&&ends.length)ends[ends.length-1]=end;
    };
    if(graphemes){
      // Graphemes keep combining marks attached to their visible base letter.
      for(const {segment,index} of graphemes.segment(text))append(segment,index);
    }else{
      // Older browsers without Intl.Segmenter still group combining marks with
      // their base character instead of corrupting highlights of decomposed text.
      let combined="",startOffset=0;
      for(let offset=0;offset<text.length;){
        const symbol=String.fromCodePoint(text.codePointAt(offset));
        if(combined&&!/\p{M}/u.test(symbol)){
          append(combined,startOffset);combined="";
        }
        if(!combined)startOffset=offset;
        combined+=symbol;
        offset+=symbol.length;
      }
      if(combined)append(combined,startOffset);
    }
    if(start+needle.length>ends.length)return null;
    return {start:starts[start],end:ends[start+needle.length-1]};
  }
  function renderSessionHistory(){
    const list=$("#historyList"),recent=$("#recentChats"),summary=$("#historySearchSummary");
    list.replaceChildren();recent.replaceChildren();
    const query=($("#historySearch").value||"").trim();
    const value=query.toLocaleLowerCase();
    const saved=threads.filter(c=>!c.temporary)
      .sort((a,b)=>Number(b.pinned)-Number(a.pinned)||newestFirst(a,b));
    const shown=saved.filter(c=>!value||
      findTextMatch(c.title,query)||
      c.messages.some(m=>findTextMatch(m.content,query)));
    const language=window.KazI18n?.language||"ru";
    if(summary){
      summary.textContent=language==="en"
        ?(value?"Chats found: "+shown.length+" of "+saved.length:"Chats in this tab: "+saved.length)
        :language==="kk"
          ?(value?"Табылған чаттар: "+shown.length+" / "+saved.length:"Осы қойындыдағы чаттар: "+saved.length)
          :(value?"Найдено переписок: "+shown.length+" из "+saved.length:"Переписок в текущей вкладке: "+saved.length);
    }
    const clearButton=$("#sessionClearSearch");
    if(clearButton){
      clearButton.textContent=language==="en"?"Clear":language==="kk"?"Тазалау":"Очистить";
      clearButton.setAttribute("aria-label",uiText("Очистить поиск переписок"));
    }
    if(!shown.length){
      const empty=make("div","empty-card");
      empty.append(make("h2","",value?"Совпадений не найдено":"Пока нет чатов"),
        make("p","",value?"Попробуйте другое слово. Недавние чаты слева остаются доступны.":"История доступна, пока открыта эта вкладка. После обновления страницы разговоры исчезнут."));
      list.append(empty);
    }
    function highlighted(target,text,range=value?findTextMatch(text,query):null){
      if(!range){target.textContent=text;return}
      target.append(document.createTextNode(text.slice(0,range.start)),
        make("mark","session-search-hit",text.slice(range.start,range.end)),
        document.createTextNode(text.slice(range.end)));
    }
    for(const c of shown){
      const card=make("div","session-chat-row"+(c.id===current?" active":""));
      const name=button("","open-chat",c.id,"session-chat-name");
      const matchIndex=value?c.messages.findIndex(m=>findTextMatch(m.content,query)):-1;
      if(matchIndex>=0)name.dataset.matchIndex=String(matchIndex);
      name.setAttribute("aria-label",uiText(c.pinned?"Закреплённый чат":"Открыть чат")+": "+c.title);
      if(c.pinned)name.append(make("span","session-pin","📌 "));
      const label=make("span","session-chat-label");
      highlighted(label,c.title);
      name.append(label);
      card.append(name);
      if(value){
        const matched=matchIndex>=0?c.messages[matchIndex]:null;
        if(matched){
          const range=findTextMatch(matched.content,query);
          let from=Math.max(0,range.start-38),to=Math.min(matched.content.length,range.end+46);
          // Never cut an emoji or another supplementary Unicode character in half.
          if(from>0&&/[\uDC00-\uDFFF]/.test(matched.content[from]))from--;
          if(to<matched.content.length&&/[\uDC00-\uDFFF]/.test(matched.content[to]))to++;
          const snippet=make("div","session-search-snippet");
          if(from)snippet.append(document.createTextNode("…"));
          highlighted(snippet,matched.content.slice(from,to),
            {start:range.start-from,end:range.end-from});
          if(to<matched.content.length)snippet.append(document.createTextNode("…"));
          card.append(snippet);
        }
      }
      const ops=make("div","session-chat-ops");
      ops.append(
        (()=>{const pin=button(c.pinned?"Открепить":"Закрепить","pin-chat",c.id);pin.setAttribute("aria-pressed",String(Boolean(c.pinned)));pin.setAttribute("aria-label",uiText(c.pinned?"Открепить":"Закрепить")+": "+c.title);return pin})(),
        button("Название","rename-chat",c.id),
        button("Проект","assign-chat",c.id),
        button("Скачать","export-chat",c.id),
        button("Удалить","delete-chat",c.id,"session-button session-danger")
      );
      card.append(ops);list.append(card);
    }
    for(const c of saved.slice(0,6)){
      const entry=button((c.pinned?"📌 ":"")+c.title,"open-chat",c.id,"recent-item session-recent");
      entry.setAttribute("aria-label",uiText(c.pinned?"Закреплённый чат":"Открыть чат")+": "+c.title);
      recent.append(entry);
    }
    if(!saved.length)recent.append(make("div","sidebar-empty","Нет переписок"));
  }
  function renderSessionChat(){
    baseRenderChat();
    const chat=selected();
    if(!chat)return;
    const bubbles=Array.from($("#chatMessages").children);
    chat.messages.forEach((message,i)=>{
      const bubble=bubbles[i];if(!bubble)return;
      message.id||=nextId();
      if(message.role==="assistant"){
        const actions=make("div","session-message-actions");
        const up=button("👍","rate-up",message.id),down=button("👎","rate-down",message.id);
        if(message.rating==="up")up.classList.add("selected");
        if(message.rating==="down")down.classList.add("selected");
        up.setAttribute("aria-label",uiText("Положительная оценка ответа"));
        down.setAttribute("aria-label",uiText("Отрицательная оценка ответа"));
        up.setAttribute("aria-pressed",String(message.rating==="up"));
        down.setAttribute("aria-pressed",String(message.rating==="down"));
        actions.append(up,down,button("Повторить ответ","retry-answer",message.id));
        bubble.append(actions);
      }
    });
  }
  function renderSessionProjects(){
    const target=$("#projectsWorkspace");if(!target)return;
    target.replaceChildren();
    const top=make("div","session-project-header");
    top.append(make("p","session-help","Папки группируют чаты. Общей памяти, файлов и облачного хранения у них пока нет."));
    top.append(button("＋ Новый проект","new-project",null,"session-primary"));
    target.append(top);
    if(!projects.length){
      const empty=make("div","empty-card");
      empty.append(make("h2","","Пока нет проектов"),make("p","","Создайте папку, чтобы сгруппировать переписки текущего сеанса."));
      target.append(empty);
    }
    for(const project of projects){
      const card=make("section","session-project-card");
      const header=make("div","session-project-title");
      header.append(make("h2","",project.name),make("small","",projectCountLabel(threads.filter(c=>c.projectId===project.id&&!c.temporary).length)));
      card.append(header);
      const chats=threads.filter(c=>c.projectId===project.id&&!c.temporary).sort(newestFirst);
      if(!chats.length)card.append(make("p","session-help","Пока нет чатов в этом проекте."));
      for(const c of chats){
        const row=make("div","session-project-chat-row");
        const open=button("↳ "+c.title,"open-chat",c.id,"session-project-chat");
        open.setAttribute("aria-label",uiText("Открыть чат")+": "+c.title);
        const remove=button("Убрать","remove-chat-from-project",c.id,"session-button");
        remove.setAttribute("aria-label",uiText("Убрать из проекта")+": "+c.title);
        row.append(open,remove);
        card.append(row);
      }
      addButtons(card,[{label:"＋ Добавить чат",action:"add-chat-to-project",id:project.id},
        ...(chats.some(c=>c.messages.length)?[{label:"Скачать чаты",action:"export-project",id:project.id}]:[]),
        {label:"Переименовать",action:"rename-project",id:project.id},
        {label:"Удалить проект",action:"delete-project",id:project.id,className:"session-button session-danger"}]);
      target.append(card);
    }
    const ungrouped=threads.filter(c=>!c.projectId&&!c.temporary).sort(newestFirst);
    if(ungrouped.length){
      const box=make("section","session-project-card");
      box.append(make("h2","","Без проекта"));
      for(const c of ungrouped){
        const open=button("↳ "+c.title,"open-chat",c.id,"session-project-chat");
        open.setAttribute("aria-label",uiText("Открыть чат")+": "+c.title);
        box.append(open);
      }
      target.append(box);
    }
  }
  const allowRemote=()=>{
    const hostname=location.hostname;
    return (location.protocol==="https:"||hostname==="localhost"||hostname==="127.0.0.1")
      && !/raw\.githack\.com|github\.io|htmlpreview\.github\.io|github\.com|raw\.githubusercontent\.com/.test(hostname)
      && !location.pathname.endsWith("/preview.html");
  };
  function configureAccess(afterSave){
    openDialog("Доступ к GPT-OSS 120B",
      "Защитный ключ задаётся владельцем в Cloudflare. Он действует только в этой открытой вкладке и не сохраняется на устройстве.",body=>{
      const field=make("input","session-input");field.type="password";field.autocomplete="off";
      field.placeholder="Ключ доступа";field.setAttribute("aria-label","Ключ доступа");
      body.append(field);
      const save=button("Подключить","dialog-save",null,"session-primary");
      save.addEventListener("click",()=>{
        if(field.value.trim().length<24){notify("Введите ключ не короче 24 символов.");return}
        aiAccessKey=field.value.trim();field.value="";closeDialog();
        notify("Ключ принят для текущей вкладки. Проверка происходит при запросе.");
        if(typeof afterSave==="function")afterSave();
      });
      body.append(save);
    });
  }
  async function runAI(chat,replaceId=null){
    // A pending unlock dialog can outlive the conversation that opened it.
    // Never submit an old conversation when the user is now in another chat.
    if(!threads.includes(chat)||current!==chat.id)return;
    if(!allowRemote()){
      showStatus("Предпросмотр: настоящий GPT-OSS 120B ещё не подключён. Сообщения никуда не отправляются.");
      return;
    }
    if(!aiAccessKey){
      showStatus("Для подключения ИИ укажи приватный ключ доступа.");
      configureAccess(()=>runAI(chat,replaceId));return;
    }
    if(abort){notify("Завершите предыдущий запрос.");return}
    const previousFocus=document.activeElement;
    const controller=new AbortController();abort=controller;pending=chat.id;pendingReplaceId=replaceId;retryAnswerId=null;
    const timeout=setTimeout(()=>controller.abort("timeout"),45000);
    const stop=$("#sessionStop");stop.hidden=false;$("#sendButton").disabled=true;
    showStatus("Анализирую запрос…");
    // Retry hides its own button; focus the visible Stop control, not a hidden element.
    if(previousFocus?.id==="sessionRetry"||previousFocus?.closest("#view-tools"))stop.focus();
    const candidates=chat.messages.filter(m=>(m.role==="user"||m.role==="assistant")&&m.id!==replaceId).slice(-16)
      .map(m=>({role:m.role,content:m.role==="assistant"?m.content.slice(0,4000):m.content}));
    // Preserve full recent messages, but do not exceed the server's 50 KB payload cap.
    // Account for JSON encoding, user instructions and non-ASCII characters.
    const encoder=new TextEncoder();
    let budget=39000-encoder.encode(personalInstructions).length;
    const history=[];
    for(let i=candidates.length-1;i>=0;i--){
      const item={role:candidates[i].role,content:candidates[i].content};
      const bytes=encoder.encode(JSON.stringify(item)).length+2;
      if(bytes>budget)break;
      history.unshift(item);budget-=bytes;
    }
    while(history.length>1&&history[0].role!=="user")history.shift();
    if(!history.length||history.at(-1).role!=="user"){
      showStatus("Запрос слишком большой. Сократите последнее сообщение.",false,true);
      clearTimeout(timeout);abort=null;pending=null;pendingReplaceId=null;stop.hidden=true;resizeInput();
      return;
    }
    try{
      const response=await fetch("/api/chat",{
        method:"POST",headers:{"content-type":"application/json","authorization":"Bearer "+aiAccessKey},
        credentials:"same-origin",signal:controller.signal,
        body:JSON.stringify({messages:history,effort:state.reason,instructions:personalInstructions})
      });
      let data=null;try{data=await response.json()}catch{}
      // An outdated answer cannot change the status of a different chat.
      if(abort!==controller||controller.signal.aborted||!threads.includes(chat)||current!==chat.id)return;
      if(!response.ok){
        if(data?.code==="AI_QUOTA_EXHAUSTED")showStatus("Дневной лимит ИИ исчерпан. Попробуйте после его обновления.",true);
        else if(data?.code==="AI_RATE_LIMITED"){
          retryAnswerId=replaceId;
          showStatus("Слишком много запросов за короткое время. Попробуйте позднее.",false,true);
        }else if(data?.code==="ACCESS_REQUIRED"){
          // An invalid key should not force the user to send the same question twice.
          aiAccessKey="";
          retryAnswerId=replaceId;
          const mayRetry=replaceId
            ? chat.messages.at(-1)?.id===replaceId
            : chat.messages.at(-1)?.role==="user";
          showStatus("Ключ доступа не принят или ИИ на сервере ещё не настроен.",false,Boolean(mayRetry));
        }
        else{
          retryAnswerId=replaceId;
          showStatus(data?.message||"Ответ ИИ сейчас недоступен. Попробуйте позже.",false,true);
        }
        return;
      }
      if(abort!==controller||controller.signal.aborted||!threads.includes(chat))return;
      if(!data||typeof data.text!=="string"||!data.text.trim())throw new Error("EMPTY_RESPONSE");
      if(replaceId){
        const existing=chat.messages.find(m=>m.id===replaceId && m.role==="assistant");
        if(existing){existing.content=data.text.trim();existing.rating=null}
      }else{
        if(threads.includes(chat))chat.messages.push({id:nextId(),role:"assistant",content:data.text.trim()});
      }
      if(current===chat.id){touchChat(chat);displayThread(chat);renderChat();renderHistory()}
      showStatus("");
    }catch(e){
      if(abort!==controller)return;
      if(controller.signal.aborted){
        const timedOut=controller.signal.reason==="timeout";
        const manual=controller.signal.reason==="manual";
        const canRetry=replaceId
          ? chat.messages.at(-1)?.id===replaceId
          : chat.messages.at(-1)?.role==="user";
        if(timedOut||manual){
          retryAnswerId=replaceId;
          showStatus(timedOut?"ИИ не ответил за 45 секунд. Попробуйте повторить запрос.":"Генерация ответа остановлена.",false,Boolean(canRetry));
        }
        // Navigation and deletion must not display stale status messages.
      }else{
        retryAnswerId=replaceId;
        showStatus("Не удалось получить ответ ИИ. Проверьте подключение или повторите позже.",false,true);
      }
    }finally{
      clearTimeout(timeout);
      if(abort===controller){abort=null;pending=null;pendingReplaceId=null;stop.hidden=true;resizeInput()}
    }
  }
  function stopActiveRequest(){
    const controller=abort;
    if(!controller)return;
    const chat=selected(),replaceId=pendingReplaceId;
    const canRetry=Boolean(chat&&chat.id===pending&&(
      replaceId ? chat.messages.at(-1)?.id===replaceId
        : chat.messages.at(-1)?.role==="user"
    ));
    // Detach before signalling cancellation: even if the transport ignores Abort,
    // a late answer is rejected by the active-controller identity checks.
    abort=null;pending=null;pendingReplaceId=null;
    controller.abort("manual");
    $("#sessionStop").hidden=true;
    retryAnswerId=replaceId;
    showStatus("Генерация ответа остановлена.",false,canRetry);
    resizeInput();
    if(canRetry&&!$("#sessionRetry").hidden)$("#sessionRetry").focus();
    else $("#messageInput").focus();
  }
  function sendMessage(){
    const text=composeText();if(!text||abort)return;
    if(text.length>4000){notify("Сообщение длиннее 4000 символов. Сократите его перед отправкой.");return}
    const chat=(state.screen==="welcome"?newThread(text):selected()||newThread(text));
    chat.messages.push({id:nextId(),role:"user",content:text});
    touchChat(chat);displayThread(chat);
    $("#messageInput").value="";drafts.delete(chat.id);welcomeDraft="";resizeInput();
    renderChat();renderHistory();showScreen("chat");runAI(chat);
  }
  function textDialog(title,label,value,onSave){
    openDialog(title,"",body=>{
      const field=make("input","session-input");field.type="text";field.maxLength=100;
      field.value=value;field.setAttribute("aria-label",label);
      body.append(field);
      const save=button("Сохранить","dialog-save",null,"session-primary");
      save.addEventListener("click",()=>{const next=field.value.trim();if(!next){notify("Введите название.");return}if(onSave(next)===false)return;closeDialog()});
      field.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();save.click()}});
      body.append(save);
    });
  }
  function confirmDialog(title,explanation,onYes){
    openDialog(title,explanation,body=>{
      const yes=button("Удалить","dialog-confirm",null,"session-danger-button");
      yes.addEventListener("click",()=>{onYes();closeDialog()});
      body.append(yes);
    });
  }
  function handle(action,id,details={}){
    const chat=threads.find(c=>c.id===id);
    const project=projects.find(p=>p.id===id);
    if(action==="open-chat"&&chat){
      if(current!==chat.id){
        if(abort)abort.abort("navigation");
        abort=null;pending=null;$("#sessionStop").hidden=true;
        showStatus("");
        const old=selected();
        if(old?.temporary){
          const i=threads.indexOf(old);
          if(i>=0){threads.splice(i,1);drafts.delete(old.id)}
          // Temporary drafts must not leak into the welcome composer during navigation.
          welcomeDraft="";
          $("#messageInput").value="";
        }
      }
      displayThread(chat);renderChat();renderHistory();showScreen("chat");
      if(details.matchIndex!==undefined){
        const index=Number(details.matchIndex);
        const bubble=Number.isSafeInteger(index)?$("#chatMessages").children[index]:null;
        if(bubble){
          bubble.classList.add("session-jump-hit");
          const phrase=$("#historySearch").value.trim();
          const textNode=bubble.querySelector(":scope > span");
          if(phrase&&textNode){
            const content=textNode.textContent;
            const match=findTextMatch(content,phrase);
            if(match){
              textNode.replaceChildren(document.createTextNode(content.slice(0,match.start)),
                make("mark","session-search-hit",content.slice(match.start,match.end)),
                document.createTextNode(content.slice(match.end)));
            }
          }
          bubble.scrollIntoView({block:"center"});
        }
      }
      return
    }
    if(action==="rename-chat"&&chat){textDialog("Переименовать чат","Название",chat.title,v=>{chat.title=v;renderHistory();renderSessionProjects()});return}
    if(action==="pin-chat"&&chat){
      const focused=document.activeElement?.dataset.session==="pin-chat"
        &&document.activeElement.dataset.id===chat.id;
      chat.pinned=!chat.pinned;renderHistory();
      // Reordering rebuilds the history list. Restore focus to the same action.
      if(focused){
        const next=Array.from(document.querySelectorAll('#historyList [data-session="pin-chat"]'))
          .find(el=>el.dataset.id===chat.id);
        next?.focus();
      }
      return;
    }
    if(action==="export-chat"&&chat&&!chat.temporary){
      download("Kaz-AI-"+safeExportName(chat.title)+".txt",exportText(chat),"text/plain;charset=utf-8");
      notify("Переписка скачана в текстовый файл.");return
    }
    if(action==="remove-chat-from-project"&&chat){
      const focused=document.activeElement?.dataset.session==="remove-chat-from-project";
      chat.projectId=null;renderSessionProjects();renderHistory();
      if(focused){
        const next=Array.from(document.querySelectorAll('#projectsWorkspace [data-session="open-chat"]'))
          .find(el=>el.dataset.id===chat.id);
        next?.focus();
      }
      notify("Чат перемещён в «Без проекта».");return
    }
    if(action==="delete-chat"&&chat){confirmDialog("Удалить чат?","Сообщения будут удалены из текущей вкладки.",()=>{
      if(pending===chat.id){abort?.abort("navigation");abort=null;pending=null;$("#sessionStop").hidden=true;showStatus("")}
      const i=threads.indexOf(chat);threads.splice(i,1);drafts.delete(chat.id);
      if(current===chat.id)sessionNewChat(false);
      renderHistory();renderSessionProjects();
    });return}
    if(action==="assign-chat"&&chat){
      openDialog("Добавить чат в проект","Выберите проект для переписки.",body=>{
        const select=make("select","session-input");select.setAttribute("aria-label","Проект");
        for(const [value,label] of [[null,"Без проекта"],...projects.map(p=>[p.id,p.name])]){
          const option=make("option","",label);option.value=value||"";option.selected=(value===chat.projectId);select.append(option);
        }
        body.append(select);
        const save=button("Сохранить","dialog-save",null,"session-primary");
        save.addEventListener("click",()=>{chat.projectId=select.value||null;closeDialog();renderSessionProjects();notify("Проект чата изменён.")});
        body.append(save);
        if(!projects.length)body.append(make("p","session-help","Сначала создайте проект в разделе «Проекты»."));
      });return}
    if(action==="export-project"&&project){
      const saved=threads.filter(c=>c.projectId===project.id&&!c.temporary&&c.messages.length).sort(newestFirst);
      if(!saved.length){notify("В этом проекте пока нет переписок для скачивания.");return}
      download("Kaz-AI-project-"+safeExportName(project.name)+".txt",
        saved.map(exportText).join("\n\n"+"=".repeat(45)+"\n\n"),"text/plain;charset=utf-8");
      notify("Переписки проекта скачаны. Временные чаты не включены.");return
    }
    if(action==="add-chat-to-project"&&project){
      const available=threads.filter(c=>!c.temporary&&c.projectId!==project.id);
      if(!available.length){notify("Нет других чатов для добавления.");return}
      openDialog("Добавить чат в «"+project.name+"»","Можно выбрать чат без проекта или перенести из другого проекта.",body=>{
        const select=make("select","session-input");
        select.setAttribute("aria-label","Выберите чат для проекта");
        for(const candidate of available){
          const option=make("option","",candidate.title);option.value=candidate.id;select.append(option);
        }
        body.append(select);
        const save=button("Добавить","dialog-save",null,"session-primary");
        save.addEventListener("click",()=>{
          const chosen=threads.find(c=>c.id===select.value);
          if(!chosen||chosen.temporary){notify("Этот чат уже недоступен.");return}
          chosen.projectId=project.id;closeDialog();renderSessionProjects();renderHistory();
          notify("Чат добавлен в проект.");
        });
        body.append(save);
      });return
    }
    // NFKC also treats visually equivalent Unicode forms as one project name.
    const projectKey=name=>name.trim().normalize("NFKC").toLocaleLowerCase();
    const duplicateProject=(name,except=null)=>projects.some(p=>p.id!==except&&projectKey(p.name)===projectKey(name));
    if(action==="new-project"){textDialog("Новый проект","Название проекта","",name=>{
      if(duplicateProject(name)){notify("Проект с таким названием уже есть.");return false}
      projects.push({id:nextId(),name});renderSessionProjects();
    });return}
    if(action==="rename-project"&&project){textDialog("Название проекта","Название",project.name,name=>{
      if(duplicateProject(name,project.id)){notify("Проект с таким названием уже есть.");return false}
      project.name=name;renderSessionProjects();
    });return}
    if(action==="delete-project"&&project){confirmDialog("Удалить проект?","Чаты не удалятся, они перейдут в раздел «Без проекта».",()=>{
      const i=projects.indexOf(project);projects.splice(i,1);
      for(const c of threads)if(c.projectId===project.id)c.projectId=null;
      renderSessionProjects();renderHistory();
    });return}
    if(action==="rate-up"||action==="rate-down"||action==="retry-answer"){
      const c=selected(),index=c?.messages.findIndex(m=>m.id===id)??-1;
      if(index<0)return;
      const m=c.messages[index];
      if(action==="retry-answer"){
        if(abort){notify("Дождитесь завершения предыдущего запроса.");return}
        if(m.role!=="assistant"||index!==c.messages.length-1){notify("Повторить можно только последний ответ.");return}
        if(c.messages[index-1]?.role==="user")runAI(c,m.id);
        else showStatus("Не удалось определить вопрос для повторного ответа.");
        return;
      }
      if(action==="rate-up"||action==="rate-down"){
        const nextRating=action==="rate-up"?"up":"down";
        m.rating=m.rating===nextRating?null:nextRating;
        // Do not rebuild or scroll the entire conversation when rating a message.
        for(const control of document.querySelectorAll('#chatMessages [data-session="rate-up"],#chatMessages [data-session="rate-down"]')){
          if(control.dataset.id!==m.id)continue;
          const active=control.dataset.session===(m.rating==="up"?"rate-up":m.rating==="down"?"rate-down":"");
          control.classList.toggle("selected",active);
          control.setAttribute("aria-pressed",String(active));
        }
        return
      }

    }
    if(action==="stop"){stopActiveRequest();return}
    if(action==="retry-request"){
      if(abort){notify("Дождитесь завершения текущего запроса.");return}
      const fromRetryButton=document.activeElement?.id==="sessionRetry";
      const c=selected(),last=c?.messages.at(-1);
      if(last?.role==="user"){showStatus("");runAI(c)}
      else if(last?.role==="assistant"&&last.id===retryAnswerId){
        const target=retryAnswerId;
        showStatus("");runAI(c,target);
      }else notify("Не найден вопрос для повторной отправки.");
      // Clearing the old banner hides Retry before runAI can inspect focus.
      // At this point runAI has synchronously opened Stop for an active request.
      if(fromRetryButton&&abort&&!$("#sessionStop").hidden)$("#sessionStop").focus();
      return;
    }
    if(action==="temp-toggle"){
      sessionNewChat(Boolean($("#sessionTemporary").checked));return;
    }
    if(action==="export"){
      const saved=threads.filter(c=>!c.temporary&&c.messages.length).sort(newestFirst);
      if(!saved.length){notify("Для экспорта пока нет переписок.");return}
      const text=saved.map(exportText).join("\n\n"+"=".repeat(45)+"\n\n");
      download("Kaz-AI-history.txt",text,"text/plain;charset=utf-8");
      notify("История текущей вкладки скачана. Временные чаты не включены.");return;
    }
    if(action==="ai-access"){configureAccess();return}
    if(action==="instructions"){
      openDialog("Личные инструкции","Правила действуют только в этой вкладке. Они передаются модели вместе с вашим запросом при подключённом ИИ.",body=>{
        const area=make("textarea","session-textarea");area.value=personalInstructions;area.maxLength=2000;
        area.placeholder="Например: отвечай кратко, на русском языке";
        body.append(area);
        const save=button("Применить","dialog-save",null,"session-primary");
        save.addEventListener("click",()=>{personalInstructions=area.value.slice(0,2000);closeDialog();notify("Инструкции применены на текущий сеанс.")});
        body.append(save);
      });return;
    }
    if(action==="calc"){showCalculator();return}
  }
  const compute=window.KazCalculator.compute;

  // These text tools only prepare a draft. They never send it automatically.
  function openTextHelper(kind){
    const definitions={
      22:["Переводчик","Вставьте текст и выберите язык перевода. Отправка произойдёт только после вашего подтверждения."],
      23:["Помощь с программированием","Опишите задачу или вставьте код. Kaz AI подготовит вопрос для текстовой модели."],
      24:["Помощь с документами","Опишите, какой текст необходимо составить. Файлы Word и PDF здесь пока не создаются."]
    };
    const definition=definitions[kind];if(!definition)return;
    openDialog(definition[0],definition[1],body=>{
      let languageSelect=null;
      if(kind===22){
        languageSelect=make("select","session-input");
        languageSelect.setAttribute("aria-label","Язык перевода");
        for(const [value,label] of [["ru","Русский"],["kk","Қазақша"],["en","English"]]){
          const option=make("option","",label);option.value=value;languageSelect.append(option);
        }
        languageSelect.value=window.KazI18n?.language||"ru";
        body.append(languageSelect);
      }
      const field=make("textarea","session-textarea");field.rows=6;field.maxLength=3500;
      field.setAttribute("aria-label",kind===22?"Текст для перевода":kind===23?"Задача по программированию":"Описание документа");
      field.placeholder=kind===22?"Введите текст для перевода":kind===23?"Что нужно исправить или написать?":"Например: деловое письмо о встрече";
      body.append(field);
      const prepare=button("Подготовить запрос","dialog-save",null,"session-primary");
      prepare.addEventListener("click",()=>{
        const value=field.value.trim();
        if(!value){notify("Сначала введите текст или описание задачи.");field.focus();return}
        const input=$("#messageInput");
        if(input.value.trim()){notify("В поле сообщения есть черновик. Сначала отправьте или очистите его.");return}
        let prompt="";
        const ui=window.KazI18n?.language||"ru";
        if(kind===22){
          const target={
            ru:{ru:"русский",kk:"казахский",en:"английский"},
            en:{ru:"Russian",kk:"Kazakh",en:"English"},
            kk:{ru:"орыс",kk:"қазақ",en:"ағылшын"}
          }[ui][languageSelect.value];
          const prefix={
            ru:"Переведи следующий текст на "+target+" язык. Сохрани смысл, имена и форматирование. Выведи только перевод.\n\n",
            en:"Translate the following text into "+target+". Preserve meaning, names, and formatting. Return only the translation.\n\n",
            kk:"Келесі мәтінді "+target+" тіліне аудар. Мағынасын, есімдерді және пішімдеуді сақта. Тек аударманы бер.\n\n"
          }[ui];
          prompt=prefix+value;
        }else if(kind===23){
          prompt={
            ru:"Помоги с программированием. Если информации не хватает, уточни её. Объясняй простыми словами, а код приводи в удобном виде. Задача:\n\n",
            en:"Help with programming. Ask for missing details. Explain simply and format code clearly. Task:\n\n",
            kk:"Бағдарламалауға көмектес. Ақпарат жетіспесе, нақтылап сұра. Қарапайым тілмен түсіндіріп, кодты түсінікті түрде көрсет. Тапсырма:\n\n"
          }[ui]+value;
        }else{
          prompt={
            ru:"Подготовь текст документа по следующему описанию. Сделай его понятным и аккуратно структурированным. Не выдумывай неизвестные данные. Описание:\n\n",
            en:"Draft the document text described below. Organize it clearly and do not invent missing details. Description:\n\n",
            kk:"Төмендегі сипаттамаға сай құжат мәтінін дайында. Түсінікті әрі жүйелі жаз. Белгісіз мәліметтерді ойдан қоспа. Сипаттама:\n\n"
          }[ui]+value;
        }
        if(prompt.length>4000){notify("Текст слишком длинный. Сократите описание.");return}
        closeDialog();showScreen(selected()?"chat":"welcome");
        input.value=prompt;resizeInput();input.focus();
        notify("Запрос подготовлен. Проверьте текст и нажмите отправку.");
      });
      body.append(prepare);
    });
  }
  function showCalculator(){
    openDialog("Простой калькулятор","Поддерживает +, −, ×, ÷ и скобки. Не использует ИИ.",body=>{
      const field=make("input","session-input");field.type="text";field.inputMode="text";field.maxLength=150;
      field.value="(15 + 7) × 2";field.setAttribute("aria-label","Выражение");
      const output=make("output","session-calc-output","Результат появится здесь");output.setAttribute("aria-live","polite");
      const submit=button("Рассчитать","calc-run",null,"session-primary");
      submit.addEventListener("click",()=>{
        const lang=window.KazI18n?.language||"ru";
        const t={
          ru:{answer:"Ответ: ",zero:"На ноль делить нельзя.",invalid:"Проверьте математическое выражение.",unsafe:"Число слишком большое для точного расчёта."},
          en:{answer:"Result: ",zero:"Cannot divide by zero.",invalid:"Check the mathematical expression.",unsafe:"Number too large for accurate calculation."},
          kk:{answer:"Нәтиже: ",zero:"Нөлге бөлуге болмайды.",invalid:"Математикалық өрнекті тексеріңіз.",unsafe:"Дәл есептеу үшін сан тым үлкен."}
        }[lang];
        try{output.textContent=t.answer+window.KazCalculator.format(field.value)}
        catch(e){output.textContent=e.message==="ZERO"?t.zero:e.message==="UNSAFE"?t.unsafe:t.invalid}
      });
      field.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();submit.click()}});
      body.append(field,submit,output);
    });
  }
  function setup(){
    const historyInput=$("#historySearch");
    if(historyInput&&!$("#historySearchSummary")){
      const counter=make("p","session-history-summary");counter.id="historySearchSummary";
      counter.setAttribute("role","status");counter.setAttribute("aria-live","polite");
      historyInput.closest(".search-bar")?.insertAdjacentElement("afterend",counter);
      const clear=make("button","session-clear-search","Очистить");
      clear.type="button";clear.id="sessionClearSearch";
      clear.setAttribute("aria-label","Очистить поиск переписок");clear.hidden=true;
      historyInput.closest(".search-bar")?.append(clear);
      const updateSearch=()=>{clear.hidden=!historyInput.value};
      historyInput.addEventListener("input",updateSearch);
      historyInput.addEventListener("keydown",event=>{
        if(event.key!=="Escape"||!historyInput.value)return;
        event.preventDefault();event.stopPropagation();
        historyInput.value="";updateSearch();renderHistory();
      });
      clear.addEventListener("click",()=>{historyInput.value="";updateSearch();renderHistory();historyInput.focus()});
    }
    const projectsView=$("#view-projects");
    if(projectsView){
      const old=projectsView.querySelector(".empty-card");old?.remove();
      const workspace=make("div","session-projects");workspace.id="projectsWorkspace";projectsView.append(workspace);
    }
    const settings=$("#view-settings .settings-list");
    const tempRow=make("div","setting-item");tempRow.append(make("div","",undefined));
    tempRow.firstChild.append(make("h2","","Временный чат"),make("p","","Без добавления в историю текущей вкладки"));
    const label=make("label","session-checkbox-label");
    const checkbox=make("input","");checkbox.type="checkbox";checkbox.id="sessionTemporary";
    label.append(checkbox,make("span","","Включить"));tempRow.append(label);
    settings?.append(tempRow);
    const aiRow=make("div","setting-item"),info=make("div","");
    info.append(make("h2","","Доступ к текстовому ИИ"),make("p","","GPT-OSS 120B. Для личного тестирования на Cloudflare нужен защитный ключ."));
    aiRow.append(info,button("Настроить ключ","ai-access",null,"setting-control"));
    settings?.append(aiRow);
    const overlay=make("div","session-overlay");overlay.id="sessionOverlay";overlay.hidden=true;
    const dialog=make("section","session-dialog");dialog.setAttribute("role","dialog");dialog.setAttribute("aria-modal","true");dialog.setAttribute("aria-labelledby","sessionTitle");
    const close=button("×","dialog-close",null,"session-dialog-close");close.id="sessionClose";
    const title=make("h2","");title.id="sessionTitle";
    const body=make("div","session-dialog-body");body.id="sessionBody";
    dialog.append(close,title,body);overlay.append(dialog);document.body.append(overlay);
    const stop=button("Остановить","stop",null,"session-stop");
    stop.id="sessionStop";stop.hidden=true;
    $("#sendButton").parentElement.insertBefore(stop,$("#sendButton"));
    const retry=button("Повторить запрос","retry-request",null,"session-retry");
    retry.id="sessionRetry";retry.hidden=true;
    $("#statusBanner").insertAdjacentElement("afterend",retry);
    document.addEventListener("click",e=>{
      if(e.target.closest('[data-action="home"]'))sessionNewChat(false);
    },true);
    document.addEventListener("click",e=>{
      const target=e.target.closest("[data-session]");if(!target)return;
      const action=target.dataset.session;
      if(action==="dialog-close"){closeDialog();return}
      if(["dialog-save","dialog-confirm","calc-run"].includes(action))return;
      handle(action,target.dataset.id||null,target.dataset);
    },true);
    checkbox.addEventListener("change",()=>handle("temp-toggle"));
    // The shell already subscribed to the original resizeInput callback before
    // this module replaced it. Enforce the pending-request lock after that handler.
    $("#messageInput").addEventListener("input",()=>{if(abort)$("#sendButton").disabled=true});
    document.addEventListener("keydown",event=>{
      if((event.ctrlKey||event.metaKey)&&!event.altKey&&event.key.toLowerCase()==="k"
         &&$("#sessionOverlay").hidden&&$("#modalOverlay").hidden&&$("#googleOverlay").hidden){
        event.preventDefault();showScreen("history");
        const search=$("#historySearch");search.focus();search.select();
      }
    });
    overlay.addEventListener("click",e=>{if(e.target===overlay)closeDialog()});
    document.addEventListener("keydown",e=>{
      if(overlay.hidden)return;
      if(e.key==="Escape"){e.preventDefault();e.stopImmediatePropagation();closeDialog();return}
      if(e.key!=="Tab")return;
      const focusable=Array.from(dialog.querySelectorAll('button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),a[href]'))
        .filter(el=>!el.hidden&&el.getClientRects().length>0);
      if(!focusable.length){e.preventDefault();dialog.focus();return}
      const first=focusable[0],last=focusable[focusable.length-1];
      if(e.shiftKey&&(document.activeElement===first||!dialog.contains(document.activeElement))){
        e.preventDefault();last.focus();
      }else if(!e.shiftKey&&(document.activeElement===last||!dialog.contains(document.activeElement))){
        e.preventDefault();first.focus();
      }
    },true);
    window.addEventListener("beforeunload",()=>{abort?.abort()});
    renderHistory();renderSessionProjects();
  }
  renderHistory=renderSessionHistory;
  renderChat=renderSessionChat;
  renderTools=function(query=""){
    baseRenderTools(query);
    const language=window.KazI18n?.language||"ru";
    for(const heading of document.querySelectorAll("#toolGroups .tool-group-title small")){
      const count=Number.parseInt(heading.textContent,10);
      if(!Number.isSafeInteger(count))continue;
      if(language==="en")heading.textContent=count+" "+(count===1?"function":"functions");
      else if(language==="kk")heading.textContent=count+" функция";
      else {
        const last=count%10,lastTwo=count%100;
        const plural=last===1&&lastTwo!==11?"функция":last>=2&&last<=4&&(lastTwo<12||lastTwo>14)?"функции":"функций";
        heading.textContent=count+" "+plural;
      }
    }
    const working=new Set([1,2,3,4,5,6,7,13,25,40,41,42,44,45]);
    const partial=new Set([9,10,15,16,22,23,24,43]);
    for(const card of document.querySelectorAll("#toolGroups [data-feature^='tool-']")){
      const id=Number(card.dataset.feature.slice(5));
      const status=card.querySelector("small");
      const statusKey=working.has(id)?"Работает":partial.has(id)?"Частично":"В плане";
      if(status)status.textContent=uiText(statusKey);
      card.setAttribute("aria-label",uiText(card.querySelector("strong")?.textContent||"Инструмент")+", "+uiText(statusKey));
    }
  };
  showFeature=function(key){
    if(key.startsWith("tool-")){
      const number=Number(key.slice(5)),chat=selected();
      if(number===1){sessionNewChat();return}
      if(number===2||number===3){showScreen("history");if(number===3)$("#historySearch").focus();return}
      if([4,5,6,9,13].includes(number)){
        if(!chat){showScreen("history");notify("Сначала создайте чат.");return}
        const lastAssistant=[...chat.messages].reverse().find(m=>m.role==="assistant");
        if(number===4)return handle("rename-chat",chat.id);
        if(number===5)return handle("delete-chat",chat.id);
        if(number===6)return handle("pin-chat",chat.id);
        if(number===9){
          showScreen("chat");
          if(chat.messages.at(-1)?.role==="user")return handle("retry-request");
          if(lastAssistant)return handle("retry-answer",lastAssistant.id);
          notify("Сначала напишите сообщение.");return;
        }
        if(number===13){
          showScreen("chat");
          const up=Array.from(document.querySelectorAll('#chatMessages [data-session="rate-up"]')).at(-1);
          if(!up){
            const lang=window.KazI18n?.language||"ru";
            notify(lang==="en"?"There is no AI response to rate yet.":lang==="kk"?"Әзірге бағалайтын ЖИ жауабы жоқ.":"Пока нет ответа ИИ для оценки.");
            return;
          }
          up.scrollIntoView({block:"center",behavior:"instant"});
          up.focus();
          return;
        }
        notify("Сначала напишите сообщение.");return;
      }
      if(number===7){showScreen("projects");return}
      if(number===10){
        if(abort){
          // Reveal the conversation before cancelling so Retry and status are visible.
          showScreen(selected()?"chat":"welcome");
          stopActiveRequest();
        }else notify("Сейчас нет активного ответа.");
        return;
      }
      if(number===15){sessionNewChat(false);return}
      if(number===16){
        // The reasoning menu lives in the composer, hidden on the Tools screen.
        // Reveal the current conversation (or new-chat composer) before opening it.
        showScreen(selected()?"chat":"welcome");
        togglePopover("reason");
        $("#reasonToggle").focus();
        return;
      }
      if([22,23,24].includes(number)){openTextHelper(number);return}
      if(number===25){showCalculator();return}
      if(number===40)return handle("instructions");
      if(number===41){showScreen("settings");$("#sessionTemporary").focus();return}
      if(number===42){toggleTheme();return}
      if(number===43){togglePopover("language",$("#languageToggle"));return}
      if(number===44){showScreen("settings");togglePopover("font");return}
      if(number===45)return handle("export");
    }
    if(key==="tool-25"){showCalculator();return}
    if(key==="export"){handle("export");return}
    if(key==="instructions"){handle("instructions");return}
    if(key==="projects"){showScreen("projects");handle("new-project");return}
    baseShowFeature(key);
  };
  showScreen=function(name){
    baseShowScreen(name);
    // Status and Retry belong to the current conversation, not Settings or Projects.
    const banner=$("#statusBanner"),retry=$("#sessionRetry");
    // A pending request must remain visible when returning from History or Tools.
    if(name==="chat"&&(statusRetryable||(pending===current&&Boolean(banner.textContent))))banner.hidden=false;
    if(retry)retry.hidden=name!=="chat"||!statusRetryable;
    if(name==="projects")renderSessionProjects();
  };
  newChat=function(){sessionNewChat(false)};
  submitMessage=sendMessage;
  renderHistory();renderChat();renderTools();
  setup();
  window.KazSession={snapshot:()=>({
    threads:threads.map(c=>({id:c.id,title:c.title,messages:c.messages.length,pinned:c.pinned,temporary:c.temporary,projectId:c.projectId})),
    projects:projects.map(p=>({id:p.id,name:p.name})),active:current,draftCount:drafts.size
  }),compute,sendMessage,refreshLocale:()=>{
    renderHistory();
    renderSessionProjects();
    for(const [action,key] of [["rate-up","Положительная оценка ответа"],["rate-down","Отрицательная оценка ответа"]]){
      for(const control of document.querySelectorAll('#chatMessages [data-session="'+action+'"]')){
        control.setAttribute("aria-label",uiText(key));
      }
    }
  }};
})();
