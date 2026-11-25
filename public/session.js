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
  const readingPositions=new WeakMap();
  let welcomeDraft="";
  // Unsaved text-tool drafts belong to the current conversation, not to storage.
  const helperDrafts=new WeakMap();
  const welcomeHelperDrafts=new Map();
  let requestsAttempted=0; // Per-tab attempts only; never claim this is token usage.
  let requestsSucceeded=0,requestsFailed=0,requestsStopped=0;
  let activitySerial=0;
  const touchChat=chat=>{chat.activity=++activitySerial};
  const newestFirst=(a,b)=>(b.activity||0)-(a.activity||0);
  const projectCountLabel=count=>{
    const lang=window.KazI18n?.language||"ru";
    if(lang==="kk")return count+" чат";
    if(lang!=="ru"){
      const unit={
        en:["chat","chats"],pt:["conversa","conversas"],es:["chat","chats"],
        fr:["discussion","discussions"],ar:["محادثة","محادثات"],
        zh:["聊天","聊天"],ko:["채팅","채팅"],ja:["チャット","チャット"],
        de:["Chat","Chats"],it:["chat","chat"],tr:["sohbet","sohbet"],
        pl:["czat","czatów"],hi:["चैट","चैट"],vi:["cuộc trò chuyện","cuộc trò chuyện"],
        id:["obrolan","obrolan"]
      }[lang]||["chat","chats"];
      if(lang==="ar"&&count===2)return count+" محادثتان";
      if(lang==="pl"&&count%10>=2&&count%10<=4&&(count%100<12||count%100>14))
        return count+" czaty";
      return count+" "+unit[count===1?0:1];
    }
    const last=count%10,lastTwo=count%100;
    const suffix=last===1&&lastTwo!==11?"чат":last>=2&&last<=4&&(lastTwo<12||lastTwo>14)?"чата":"чатов";
    return count+" "+suffix;
  };
  let current=null,serial=0,modalReturn=null,abort=null,pending=null,pendingReplaceId=null,personalInstructions="",retryAnswerId=null;
  let instructionsDraft=null;
  let activeStreamingBubble=null;
  let incompleteBubble=null; // Only transient UI; an interrupted draft never enters chat history.
  // In-memory UI state only: do not collapse opened questions when answers arrive.
  const expandedPrompts=new Set();
  const forgetExpandedPrompts=chat=>{for(const message of chat.messages)expandedPrompts.delete(message.id)};
  let statusRetryable=false;
  const nextId=()=>String(++serial);
  const uiText=value=>window.KazI18n?.translate?.(value)||value;
  const selected=()=>threads.find(c=>c.id===current)||null;
  function rememberReadingPosition(){
    const chat=selected(),area=$("#mainContent");
    if(!chat||state.screen!=="chat"||$("#chatMessages").dataset.renderedThread!==chat.id)return;
    readingPositions.set(chat,{top:area.scrollTop,following:area.scrollHeight-area.scrollTop-area.clientHeight<130});
  }
  function restoreReadingPosition(){
    const chat=selected(),area=$("#mainContent");
    const position=chat&&readingPositions.get(chat);
    if(position)area.scrollTop=position.following?area.scrollHeight:position.top;
  }
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
  // A message may start with indentation or end with an intentional newline.
  // Reject whitespace-only input, but do not silently rewrite valid code/text.
  const composeText=()=>$("#messageInput").value;
  const requestEncoder=new TextEncoder();
  const requestBytes=payload=>requestEncoder.encode(JSON.stringify(payload)).length;
  const latestFits=text=>requestBytes({messages:[{role:"user",content:text}],effort:state.reason,instructions:personalInstructions})<=50000;
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
  // A name containing only default-ignorable Unicode controls looks empty.
  // Validate its visible portion, but keep the original user text unchanged.
  const hasVisibleName=value=>Boolean(value.normalize("NFKC")
    .replace(/\p{Default_Ignorable_Code_Point}/gu,"").trim());
  // Count whole visible symbols including emoji sequences in older browsers.
  const shortText=(value,max)=>{
    // Stop scanning the input after the title limit, rather than collecting
    // thousands of Unicode segments for a 55-symbol chat name.
    let title="",count=0;
    for(const {segment} of textSegments(value)){
      if(count>=max)break;
      title+=segment;count++;
    }
    return title;
  };
  const safeExportName=name=>{
    const cleaned=name.normalize("NFKC")
      // Remove filename controls only, never edit the exported conversation.
      .replace(/[\\/:*?"<>|\x00-\x1f\x7f-\x9f\u00ad\u034f\u061c\u180e\u200b\u200e\u200f\u2028\u2029\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/gi,"")
      .trim().replace(/^\.+/,"");
    // Filesystems often limit names to 255 UTF-8 bytes. Leave room for both
    // "Kaz-AI-project-" and ".txt", without splitting emoji or accents.
    const encoder=new TextEncoder();
    let result="",bytes=0,count=0;
    for(const {segment} of textSegments(cleaned)){
      const size=encoder.encode(segment).length;
      if(bytes+size>180||count>=70)break;
      result+=segment;bytes+=size;count++;
    }
    return result.replace(/[. ]+$/u,"")||"chat";
  };
  // Build each transcript as Blob parts. Even one huge conversation no longer
  // needs a second complete JavaScript string or a mapped array of all messages.
  const exportParts=c=>{
    const lang=window.KazI18n?.language||"ru";
    const labels={
      ru:{note:"Экспорт текущей переписки (без сохранения в облаке)",user:"Вы: "},
      en:{note:"Current conversation export (not saved to the cloud)",user:"You: "},
      kk:{note:"Ағымдағы әңгіме экспорты (бұлтта сақталмайды)",user:"Сіз: "},
      pt:{note:"Exportação da conversa atual (não salva na nuvem)",user:"Você: "},
      es:{note:"Exportación de la conversación actual (no guardada en la nube)",user:"Tú: "},
      fr:{note:"Export de la conversation actuelle (non enregistré dans le cloud)",user:"Vous : "},
      ar:{note:"تصدير المحادثة الحالية (غير محفوظة في السحابة)",user:"أنت: "},
      zh:{note:"当前对话导出（未保存到云端）",user:"你："},
      ko:{note:"현재 대화 내보내기 (클라우드에 저장되지 않음)",user:"사용자: "},
      ja:{note:"現在の会話をエクスポート（クラウドには保存されません）",user:"あなた: "},
      de:{note:"Export der aktuellen Unterhaltung (nicht in der Cloud gespeichert)",user:"Sie: "},
      it:{note:"Esportazione della conversazione attuale (non salvata nel cloud)",user:"Tu: "},
      tr:{note:"Mevcut sohbet dışa aktarımı (buluta kaydedilmez)",user:"Siz: "},
      pl:{note:"Eksport bieżącej rozmowy (nie zapisano w chmurze)",user:"Ty: "},
      hi:{note:"वर्तमान बातचीत निर्यात (क्लाउड में सहेजी नहीं गई)",user:"आप: "},
      vi:{note:"Xuất cuộc trò chuyện hiện tại (không lưu trên đám mây)",user:"Bạn: "},
      id:{note:"Ekspor percakapan saat ini (tidak disimpan di cloud)",user:"Anda: "}
    }[lang]||{note:"Current conversation export (not saved to the cloud)",user:"You: "};
    const parts=["Kaz AI — ",c.title,"\n",labels.note,"\n"];
    for(const m of c.messages){
      parts.push("\n",m.role==="assistant"?"Kaz AI: ":labels.user,m.content,"\n");
    }
    return parts;
  };
  function download(name,body,mime){
    // Blob accepts parts directly. Keep the original transcript unmodified.
    // A blocked download must not be reported as successfully saved.
    let url=null,link=null;
    try{
      const blob=new Blob([mime.startsWith("text/plain")?"\uFEFF":"",...(Array.isArray(body)?body:[body])],{type:mime});
      url=URL.createObjectURL(blob);
      link=document.createElement("a");link.href=url;link.download=name;
      document.body.append(link);link.click();
      setTimeout(()=>{try{URL.revokeObjectURL(url)}catch{}},30000);
      return true;
    }catch{
      if(url)try{URL.revokeObjectURL(url)}catch{}
      notify("Не удалось подготовить файл для скачивания. Попробуйте ещё раз.");
      return false;
    }finally{link?.remove()}
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
    // Editing chats/projects rebuilds their buttons. Restore focus to the same
    // action and item when it still exists, rather than jumping to the page top.
    const scope=state.screen==="projects"?"#projectsWorkspace"
      :state.screen==="history"?"#historyList":null;
    const action=previous?.dataset?.session;
    const id=previous?.dataset?.id;
    const matching=scope&&action?Array.from(document.querySelectorAll(scope+" [data-session]"))
      .find(el=>el.dataset.session===action&&el.dataset.id===id):null;
    const fallback=state.screen==="projects"
      ?$("#projectsWorkspace [data-session='new-project']")
      :state.screen==="history" ?$("#historySearch"):$("#messageInput");
    const visible=element=>element?.isConnected&&!element.disabled&&!element.closest("[hidden]")
      &&element.getClientRects().length>0&&typeof element.focus==="function";
    if(visible(previous))previous.focus();
    else if(visible(matching))matching.focus();
    else if(visible(fallback))fallback.focus();
    else $("#messageInput")?.focus();
    modalReturn=null;
  }
  const addButtons=(target,items)=>{
    const actions=make("div","session-actions");
    for(const item of items){
      const label=item.label.startsWith("＋ ")?"＋ "+uiText(item.label.slice(2)):uiText(item.label);
      actions.append(button(label,item.action,item.id,item.className||"session-button"));
    }
    target.append(actions);
  };
  function sessionNewChat(temporary=false,allowDiscard=false){
    // An accidental New Chat click must not destroy an unsent welcome or
    // temporary conversation draft. Saved-chat drafts are kept separately.
    const input=$("#messageInput");
    if(!allowDiscard&&input?.value.length&&(!selected()||selected().temporary)){
      notify("В поле сообщения есть черновик. Сначала отправьте или очистите его.");
      // Reveal the unsent draft when New Chat was pressed from another screen.
      const destination=selected()?"chat":"welcome";
      if(state.screen!==destination)showScreen(destination);
      input.focus();
      return;
    }
    rememberReadingPosition();
    if(abort)abort.abort("navigation");
    abort=null;pending=null;pendingReplaceId=null;
    activeStreamingBubble?.remove();activeStreamingBubble=null;
    incompleteBubble?.remove();incompleteBubble=null;
    $("#sessionStop").hidden=true;
    for(let i=threads.length-1;i>=0;i--)if(threads[i].temporary){forgetExpandedPrompts(threads[i]);helperDrafts.delete(threads[i]);drafts.delete(threads[i].id);threads.splice(i,1)}
    if(current&&threads.some(thread=>thread.id===current)){
      if($("#messageInput").value)drafts.set(current,$("#messageInput").value);
      else drafts.delete(current);
    }
    welcomeDraft="";welcomeHelperDrafts.clear();
    current=null;
    state.chat=[];state.draftTitle="Новый чат";
    $("#messageInput").value="";
    $("#sendButton").disabled=true;
    const temp=$("#sessionTemporary");if(temp)temp.checked=temporary;
    showStatus("");
    renderHistory();renderChat();showScreen("welcome");
    resizeInput();$("#messageInput").focus();
    if(temporary)notify("Временный чат не будет добавлен в историю.");
  }
  function newThread(firstMessage){
    const initialHelpers=new Map(welcomeHelperDrafts);
    welcomeHelperDrafts.clear();
    const temporary=Boolean($("#sessionTemporary")?.checked);
    // Never cut a surrogate pair in half when the first message contains emoji.
    const candidate=shortText(firstMessage.trimStart(),55);
    const title=hasVisibleName(candidate)?candidate:"Новый чат";
    const chat={id:nextId(),title,
      messages:[],pinned:false,projectId:null,temporary};
    if(initialHelpers.size)helperDrafts.set(chat,initialHelpers);
    touchChat(chat);threads.unshift(chat);displayThread(chat);
    return chat;
  }
  // Match equivalent Unicode spellings while highlighting the exact original text.
  // Cache the grapheme segmenter so repeated searches don't rebuild it for every match.
  const graphemes=typeof Intl.Segmenter==="function"
    ?new Intl.Segmenter(undefined,{granularity:"grapheme"}):null;
  function* textSegments(value){
    if(graphemes){yield* graphemes.segment(value);return}
    // Conservative fallback, not a complete Unicode segmentation algorithm.
    let combined="",startIndex=0,offset=0,regionalCount=0;
    for(const symbol of value){
      const extender=/\p{M}|\p{Emoji_Modifier}/u.test(symbol)||symbol==="\u200d";
      const regional=/\p{Regional_Indicator}/u.test(symbol);
      const attaches=combined&&(extender||combined.endsWith("\u200d")||(regional&&regionalCount===1));
      if(combined&&!attaches){
        yield {segment:combined,index:startIndex};
        combined="";regionalCount=0;
      }
      if(!combined)startIndex=offset;
      combined+=symbol;offset+=symbol.length;
      if(regional)regionalCount++;
      else if(!extender)regionalCount=0;
    }
    if(combined)yield {segment:combined,index:startIndex};
  }
  function findTextMatch(text,query){
    const fold=value=>value.normalize("NFKC").toLocaleLowerCase()
      .replace(/\u0307/g,"").replace(/\u03c2/g,"\u03c3").replace(/ё/g,"е");
    const needle=fold(query);
    if(!needle)return null;
    const folded=fold(text);
    const start=folded.indexOf(needle);
    if(start<0)return null;
    // Equal lengths can still hide an expansion and contraction at different
    // offsets; joined emoji also must be highlighted as whole visible symbols.
    const complex=text.normalize("NFKC")!==text
      || /[\u200d\uFE0E\uFE0F]|\p{M}|\p{Emoji_Modifier}|\p{Regional_Indicator}/u.test(text);
    if(!complex&&folded.length===text.length)return {start,end:start+needle.length};
    const starts=[],ends=[];
    const append=(symbol,offset)=>{
      const end=offset+symbol.length;
      const normalized=fold(symbol);
      for(let n=0;n<normalized.length;n++){starts.push(offset);ends.push(end)}
      if(!normalized&&ends.length)ends[ends.length-1]=end;
    };
    for(const {segment,index} of textSegments(text)){
      append(segment,index);
      if(ends.length>=start+needle.length)break;
    }
    if(start+needle.length>ends.length)return null;
    return {start:starts[start],end:ends[start+needle.length-1]};
  }
  // Assistant Markdown markers are not visible to users. Search the same
  // words they read, while mapping matches back to the original export text.
  function findMessageMatch(message,query){
    const direct=findTextMatch(message.content,query);
    if(direct||message.role!=="assistant")return direct;
    const source=message.content;
    // Avoid creating one large offset array per character of an AI reply.
    if(!/[*_~\x60]/u.test(source))return null;
    const markerSize=i=>{
      if(source.startsWith("**",i)||source.startsWith("__",i)
        ||source.startsWith("~~",i))return 2;
      if(source.charCodeAt(i)===96)return 1;
      if(source[i]==="*"||source[i]==="_"){
        const before=source[i-1]||"",after=source[i+1]||"";
        const opening=(!before||/[\s([{]/u.test(before))&&!!after&&!/\s/u.test(after);
        const closing=!!before&&!/\s/u.test(before)
          &&(!after||/[\s.,!?)}\]]/u.test(after));
        if(opening||closing)return 1;
      }
      return 0;
    };
    let visible="";
    for(let i=0;i<source.length;){
      const skip=markerSize(i);
      if(skip){i+=skip;continue}
      visible+=source[i++];
    }
    const found=findTextMatch(visible,query);
    if(!found)return null;
    // Map only the matched range back to original UTF-16 indices.
    let position=0,start=-1,end=-1;
    for(let i=0;i<source.length&&position<found.end;){
      const skip=markerSize(i);
      if(skip){i+=skip;continue}
      if(position===found.start)start=i;
      i++;position++;
      if(position===found.end)end=i;
    }
    return start>=0&&end>start?{start,end}:null;
  }
  function searchExcerptBounds(text,range){
    let from=Math.max(0,range.start-38),to=Math.min(text.length,range.end+46);
    for(const {segment,index} of textSegments(text)){
      const end=index+segment.length;
      if(index<from&&from<end)from=index;
      if(index<to&&to<end)to=end;
      if(index>=to)break;
    }
    return {from,to};
  }
  // Rebuilding lists must not drop keyboard focus when a reply arrives.
  function captureListFocus(...roots){
    const focused=document.activeElement;
    const root=roots.find(node=>node?.contains(focused));
    if(!root||!focused?.dataset.session)return ()=>{};
    const {session,id}=focused.dataset;
    return ()=>{
      const replacement=Array.from(root.querySelectorAll("[data-session]"))
        .find(el=>el.dataset.session===session&&el.dataset.id===id);
      if(replacement?.getClientRects().length&&!replacement.disabled)
        replacement.focus({preventScroll:true});
    };
  }
  function renderSessionHistory(){
    const list=$("#historyList"),recent=$("#recentChats"),summary=$("#historySearchSummary");
    const restoreFocus=captureListFocus(list,recent);
    list.replaceChildren();recent.replaceChildren();
    const query=($("#historySearch").value||"").trim();
    const value=query.toLocaleLowerCase();
    const saved=threads.filter(c=>!c.temporary)
      .sort((a,b)=>Number(b.pinned)-Number(a.pinned)||newestFirst(a,b));
    // Cache the matching message index for this render. Previously every
    // message was searched once for filtering and again for the snippet.
    const matchingMessage=new Map();
    const matchingTitle=new Map();
    const shown=saved.filter(c=>{
      if(!value)return true;
      const titleMatch=findTextMatch(c.title,query);
      matchingTitle.set(c.id,titleMatch);
      let index=-1,range=null;
      for(let i=0;i<c.messages.length;i++){
        const found=findMessageMatch(c.messages[i],query);
        if(found){index=i;range=found;break}
      }
      matchingMessage.set(c.id,{index,range});
      return Boolean(titleMatch)||index>=0;
    });
    if(summary){
      const lang=window.KazI18n?.language||"ru";
      const separator=lang==="ru"?" из ":lang==="en"?" of ":" / ";
      summary.textContent=value
        ?uiText("Найдено переписок:")+" "+shown.length+separator+saved.length
        :uiText("Переписок в текущей вкладке:")+" "+saved.length;
    }
    const clearButton=$("#sessionClearSearch");
    if(clearButton){
      clearButton.textContent=uiText("Очистить");
      clearButton.setAttribute("aria-label",uiText("Очистить поиск переписок"));
    }
    if(!shown.length){
      const empty=make("div","empty-card");
      empty.append(make("h2","",uiText(value?"Совпадений не найдено":"Пока нет чатов")),
        make("p","",uiText(value?"Попробуйте другое слово. Недавние чаты слева остаются доступны.":"История доступна, пока открыта эта вкладка. После обновления страницы разговоры исчезнут.")));
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
      const matchIndex=value?(matchingMessage.get(c.id)?.index??-1):-1;
      if(matchIndex>=0)name.dataset.matchIndex=String(matchIndex);
      name.setAttribute("aria-label",uiText(c.pinned?"Закреплённый чат":"Открыть чат")+": "+c.title);
      if(c.id===current)name.setAttribute("aria-current","true");
      if(c.pinned)name.append(make("span","session-pin","📌 "));
      const label=make("span","session-chat-label");
      label.dir="auto";
      highlighted(label,c.title,value?matchingTitle.get(c.id):null);
      name.append(label);
      card.append(name);
      if(value){
        const matched=matchIndex>=0?c.messages[matchIndex]:null;
        if(matched){
          const range=matchingMessage.get(c.id).range;
          const {from,to}=searchExcerptBounds(matched.content,range);
          const snippet=make("div","session-search-snippet");
          snippet.dir="auto";
          if(from)snippet.append(document.createTextNode("…"));
          highlighted(snippet,matched.content.slice(from,to),
            {start:range.start-from,end:range.end-from});
          if(to<matched.content.length)snippet.append(document.createTextNode("…"));
          card.append(snippet);
        }
      }
      const ops=make("div","session-chat-ops");
      const chatAction=(label,action,css)=>{
        const control=button(uiText(label),action,c.id,css||"session-button");
        control.setAttribute("aria-label",uiText(label)+": "+c.title);
        return control;
      };
      const pin=chatAction(c.pinned?"Открепить":"Закрепить","pin-chat");
      pin.setAttribute("aria-pressed",String(Boolean(c.pinned)));
      ops.append(pin,
        chatAction("Название","rename-chat"),
        chatAction("Проект","assign-chat"),
        chatAction("Скачать","export-chat"),
        chatAction("Удалить","delete-chat","session-button session-danger")
      );
      card.append(ops);list.append(card);
    }
    for(const c of saved.slice(0,6)){
      const entry=button((c.pinned?"📌 ":"")+c.title,"open-chat",c.id,"recent-item session-recent");
      entry.dir="auto";
      if(c.id===current)entry.setAttribute("aria-current","true");
      entry.setAttribute("aria-label",uiText(c.pinned?"Закреплённый чат":"Открыть чат")+": "+c.title);
      recent.append(entry);
    }
    if(!saved.length)recent.append(make("div","sidebar-empty",uiText("Нет переписок")));
    restoreFocus();
  }
  // Keep long user prompts compact without changing their saved or submitted text.
  // Measure the real rendered lines, not a character count (works on narrow screens).
  // Use the same 17-language UI dictionary as other chat controls.
  // This also avoids showing English buttons in an otherwise localized session.
  const promptLabel=expanded=>uiText(expanded?"Свернуть":"Показать полностью");
  function updateLongPromptButtons(){
    if(state.screen!=="chat")return;
    for(const bubble of document.querySelectorAll("#chatMessages .message-user")){
      const text=bubble.querySelector(":scope > .session-user-text");
      const toggle=bubble.querySelector(":scope > .session-message-expand");
      if(!text||!toggle)continue;
      // Updating labels must not collapse an already expanded prompt.
      const expanded=toggle.getAttribute("aria-expanded")==="true";
      const label=promptLabel(expanded);
      toggle.querySelector("span").textContent=label;
      toggle.setAttribute("aria-label",label);
      if(expanded)continue;
      // scrollHeight is the uncropped text height. Hidden pages have no dimensions.
      toggle.hidden=!(text.scrollHeight>text.clientHeight+2);
    }
  }
  const measureLongPrompts=()=>requestAnimationFrame(updateLongPromptButtons);
  window.addEventListener("resize",measureLongPrompts);
  function scrollChatToBottom(){
    const area=$("#mainContent");
    if(!area||state.screen!=="chat")return;
    area.scrollTop=area.scrollHeight;
    // Ensure screen visibility, bubble layout and expanding text are finalized.
    const thread=current;
    requestAnimationFrame(()=>{
      if(state.screen==="chat"&&current===thread)area.scrollTop=area.scrollHeight;
    });
  }
  function renderSessionChat(){
    // A completed/retried answer redraws the transcript. Preserve the reader's
    // position when they deliberately scrolled up in this SAME conversation;
    // otherwise follow the newest answer as before.
    const viewport=$("#mainContent"),transcript=$("#chatMessages");
    const chat=selected(),sameThread=chat&&transcript.dataset.renderedThread===chat.id;
    const distance=viewport.scrollHeight-viewport.scrollTop-viewport.clientHeight;
    const preserveScroll=state.screen==="chat"&&sameThread&&distance>140;
    const previousTop=viewport.scrollTop;
    const restoreFocus=sameThread?captureListFocus(transcript):()=>{};
    baseRenderChat();
    transcript.dataset.renderedThread=chat?.id||"";
    if(!chat)return;
    const bubbles=Array.from(transcript.children);
    chat.messages.forEach((message,i)=>{
      const bubble=bubbles[i];if(!bubble)return;
      message.id||=nextId();
      if(message.role==="user"){
        const plain=bubble.querySelector(":scope > span");
        if(plain){
          const expanded=expandedPrompts.has(message.id);
          plain.classList.add("session-user-text");
          // Keep each message's original writing direction even when the
          // interface language is Arabic or the conversation mixes scripts.
          plain.dir="auto";
          plain.classList.toggle("is-collapsed",!expanded);
          const toggle=make("button","session-message-expand");
          toggle.type="button";
          toggle.hidden=!expanded;
          toggle.setAttribute("aria-expanded",String(expanded));
          toggle.setAttribute("aria-label",promptLabel(expanded));
          toggle.append(make("span","",promptLabel(expanded)));
          const arrow=document.createElementNS("http://www.w3.org/2000/svg","svg");
          arrow.setAttribute("class","icon");
          arrow.setAttribute("aria-hidden","true");
          const use=document.createElementNS("http://www.w3.org/2000/svg","use");
          use.setAttribute("href","#ic-chevron");
          arrow.append(use);toggle.append(arrow);
          toggle.addEventListener("click",()=>{
            const expanded=toggle.getAttribute("aria-expanded")!=="true";
            if(expanded)expandedPrompts.add(message.id);
            else expandedPrompts.delete(message.id);
            plain.classList.toggle("is-collapsed",!expanded);
            toggle.setAttribute("aria-expanded",String(expanded));
            toggle.setAttribute("aria-label",promptLabel(expanded));
            toggle.querySelector("span").textContent=promptLabel(expanded);
          });
          bubble.append(toggle);
        }
      }
      if(message.role==="assistant"){
        const plain=bubble.querySelector(":scope > span");
        if(plain&&window.KazFormat?.render){
          const formatted=window.KazFormat.render(message.content);
          formatted.dir="auto";
          plain.replaceWith(formatted);
        }
        // Local greetings are not AI answers and cannot be rated.
        if(message.localGreeting)return;
        const actions=make("div","session-message-actions");
        const up=button("👍","rate-up",message.id),down=button("👎","rate-down",message.id);
        if(message.rating==="up")up.classList.add("selected");
        if(message.rating==="down")down.classList.add("selected");
        up.setAttribute("aria-label",uiText("Положительная оценка ответа"));
        down.setAttribute("aria-label",uiText("Отрицательная оценка ответа"));
        up.setAttribute("aria-pressed",String(message.rating==="up"));
        down.setAttribute("aria-pressed",String(message.rating==="down"));
        actions.append(up,down);
        const copy=button(uiText("Скопировать текст"),"copy-answer",message.id);
        actions.append(copy);
        const retry=button(uiText("Повторить ответ"),"retry-answer",message.id);
        // Keep the existing control but clearly disable actions that cannot run.
        // Older answers cannot be regenerated without discarding later turns.
        const canRetry=i===chat.messages.length-1&&chat.messages[i-1]?.role==="user";
        retry.disabled=!canRetry;
        if(!canRetry)retry.title=uiText("Повторить можно только последний ответ.");
        actions.append(retry);
        bubble.append(actions);
      }
    });
    // Reopening the same chat must not detach its live response or its
    // unsaved interrupted preview. Neither belongs to saved chat.messages.
    if(activeStreamingBubble&&pending===chat.id)transcript.append(activeStreamingBubble);
    if(incompleteBubble?.dataset.thread===chat.id&&incompleteBubble!==activeStreamingBubble)
      transcript.append(incompleteBubble);
    if(preserveScroll)viewport.scrollTop=previousTop;
    restoreFocus();
    measureLongPrompts();
  }
  function renderSessionProjects(){
    const target=$("#projectsWorkspace");if(!target)return;
    const restoreFocus=captureListFocus(target);
    target.replaceChildren();
    // Group saved chats once per render instead of scanning all threads twice
    // for every folder. Unknown/removed folder IDs fall back to "Без проекта".
    const grouped=new Map(projects.map(project=>[project.id,[]]));
    const ungrouped=[];
    for(const chat of threads){
      if(chat.temporary)continue;
      const bucket=grouped.get(chat.projectId);
      if(bucket)bucket.push(chat);
      else ungrouped.push(chat);
    }
    const top=make("div","session-project-header");
    top.append(make("p","session-help",uiText("Папки группируют чаты. Общей памяти, файлов и облачного хранения у них пока нет.")));
    top.append(button("＋ "+uiText("Новый проект"),"new-project",null,"session-primary"));
    target.append(top);
    if(!projects.length){
      const empty=make("div","empty-card");
      empty.append(make("h2","",uiText("Пока нет проектов")),make("p","",uiText("Создайте папку, чтобы сгруппировать переписки текущего сеанса.")));
      target.append(empty);
    }
    for(const project of projects){
      const card=make("section","session-project-card");
      const header=make("div","session-project-title");
      const chats=grouped.get(project.id).sort(newestFirst);
      const projectName=make("h2","",project.name);projectName.dir="auto";
      header.append(projectName,make("small","",projectCountLabel(chats.length)));
      card.append(header);
      if(!chats.length)card.append(make("p","session-help",uiText("Пока нет чатов в этом проекте.")));
      for(const c of chats){
        const row=make("div","session-project-chat-row");
        const open=button("↳ "+c.title,"open-chat",c.id,"session-project-chat");
        open.dir="auto";
        open.setAttribute("aria-label",uiText("Открыть чат")+": "+c.title);
        const remove=button(uiText("Убрать"),"remove-chat-from-project",c.id,"session-button");
        remove.setAttribute("aria-label",uiText("Убрать из проекта")+": "+c.title);
        row.append(open,remove);
        card.append(row);
      }
      addButtons(card,[{label:"＋ Добавить чат",action:"add-chat-to-project",id:project.id},
        ...(chats.some(c=>c.messages.length)?[{label:"Скачать чаты",action:"export-project",id:project.id}]:[]),
        {label:"Переименовать",action:"rename-project",id:project.id},
        {label:"Удалить проект",action:"delete-project",id:project.id,className:"session-button session-danger"}]);
      for(const control of card.querySelectorAll(".session-actions [data-session]")){
        control.setAttribute("aria-label",uiText(control.textContent)+": "+project.name);
      }
      target.append(card);
    }
    ungrouped.sort(newestFirst);
    if(ungrouped.length){
      const box=make("section","session-project-card");
      box.append(make("h2","",uiText("Без проекта")));
      for(const c of ungrouped){
        const open=button("↳ "+c.title,"open-chat",c.id,"session-project-chat");
        open.dir="auto";
        open.setAttribute("aria-label",uiText("Открыть чат")+": "+c.title);
        box.append(open);
      }
      target.append(box);
    }
    restoreFocus();
  }
  const allowRemote=()=>{
    const hostname=location.hostname;
    return (location.protocol==="https:"||hostname==="localhost"||hostname==="127.0.0.1")
      && !/raw\.githack\.com|github\.io|htmlpreview\.github\.io|github\.com|raw\.githubusercontent\.com/.test(hostname)
      && !location.pathname.endsWith("/preview.html");
  };

  // Handle native Cloudflare Workers AI Server-Sent Events (SSE).
  async function readAIStream(response,onText){
    const reader=response.body?.getReader();
    if(!reader)throw new Error("STREAM_UNAVAILABLE");
    let buffer="",output="",preview="",finished=false,ended=false;
    const decoder=new TextDecoder("utf-8");
    try{
      while(true){
        const {value,done}=await reader.read();
        // Decode the final bytes and process all complete frames before EOF.
        // A CRLF may be split across reader.read() calls: keep a trailing CR
        // until the following chunk is available.
        if(done)buffer+=decoder.decode();
        else buffer+=decoder.decode(value,{stream:true});

        buffer=done?buffer.replace(/\r\n?/g,"\n")
          :buffer.replace(/\r\n/g,"\n").replace(/\r(?!$)/g,"\n");
        let boundary;
        while((boundary=buffer.indexOf("\n\n"))>=0){
          if(boundary>1_000_000){const error=new Error("STREAM_INVALID");error.code="STREAM_INVALID";throw error}
          const frame=buffer.slice(0,boundary);buffer=buffer.slice(boundary+2);
          const lines=frame.split("\n");
          const event=lines.find(line=>line.startsWith("event:"))?.slice(6).trim()||"message";
          const data=lines.filter(line=>line.startsWith("data:")).map(line=>line.slice(5).trimStart()).join("\n");
          if(event==="done"){
            if(data!=="{}"){const error=new Error("STREAM_INVALID");error.code="STREAM_INVALID";throw error}
            finished=true;continue;
          }
          if(data==="[DONE]")continue; // upstream completion is not the server's final acknowledgement
          if(!data)continue;
          if(finished){const error=new Error("STREAM_INVALID");error.code="STREAM_INVALID";throw error}
          let packet;
          try{packet=JSON.parse(data)}
          catch{const error=new Error("STREAM_INVALID");error.code="STREAM_INVALID";throw error}
          if(event==="progress"){
            onText(preview||output,packet?.message||"Проверяю доказательство…");
            continue;
          }
          if(event==="preview"){
            // Preliminary model work remains visible while the optional audit
            // runs. The final event replaces this preview in the saved chat.
            if(typeof packet?.text==="string"&&packet.text.trim()){
              preview=packet.text;
              onText(preview,packet?.message||"Проверяю решение…");
            }
            continue;
          }
          if(event==="final"){
            if(typeof packet?.text!=="string"||!packet.text.trim())throw new Error("EMPTY_RESPONSE");
            if(packet.text.length>500000){const error=new Error("STREAM_TOO_LONG");error.code="STREAM_TOO_LONG";throw error}
            output=packet.text;preview="";
            onText(output);
            continue;
          }
          if(event==="review"){
            const review=typeof packet?.text==="string"?packet.text.slice(0,4500):"";
            if(review){output+="\n\n---\n\n### Независимая проверка доказательства\n\n"+review;onText(output)}
            continue;
          }
          if(event==="error"||packet?.error){
            const error=new Error(packet.message||packet?.error?.message||"Ошибка ответа");
            error.code=packet.code||"AI_UNAVAILABLE";
            if(typeof packet.incidentId==="string"&&/^[a-f0-9]{12}$/.test(packet.incidentId))
              error.incidentId=packet.incidentId;
            throw error;
          }
          const delta=typeof packet?.response==="string"?packet.response:
            typeof packet?.choices?.[0]?.delta?.content==="string"?packet.choices[0].delta.content:
            packet?.type==="response.output_text.delta"&&typeof packet.delta==="string"?packet.delta:"";
          if(delta){
            output+=delta;
            if(output.length>500000)throw new Error("STREAM_TOO_LONG");
            onText(output);
          }
        }
        if(buffer.length>1_000_000){const error=new Error("STREAM_INVALID");error.code="STREAM_INVALID";throw error}
        if(done){ended=true;break}
      }
      if(buffer.trim()){const error=new Error("STREAM_INVALID");error.code="STREAM_INVALID";throw error;}
      if(!finished){const error=new Error("STREAM_INTERRUPTED");error.code="STREAM_INTERRUPTED";throw error;}
      if(!output.trim())throw new Error("EMPTY_RESPONSE");
      return output;
    }finally{
      if(!ended)void reader.cancel("invalid or interrupted response").catch(()=>{});
      try{reader.releaseLock()}catch{}
    }
  }

  async function runAI(chat,replaceId=null){
    // Never submit an old conversation when the user is now in another chat.
    if(!threads.includes(chat)||current!==chat.id)return;
    if(!allowRemote()){
      showStatus("Предпросмотр: настоящий GPT-OSS 120B ещё не подключён. Сообщения никуда не отправляются.");
      return;
    }
    if(abort){notify("Завершите предыдущий запрос.");return}
    // A manual retry or a new request replaces the old temporary preview.
    incompleteBubble?.remove();incompleteBubble=null;
    const previousFocus=document.activeElement;
    const controller=new AbortController();abort=controller;pending=chat.id;pendingReplaceId=replaceId;retryAnswerId=null;
    // Do not stop complex inference after an arbitrary 45 seconds.
    // The user retains the explicit Stop button.
    const stop=$("#sessionStop");stop.hidden=false;$("#sendButton").disabled=true;
    showStatus("Анализирую запрос…");
    // Retry hides its own button; focus the visible Stop control, not a hidden element.
    if(previousFocus?.id==="sessionRetry"||previousFocus?.closest("#view-tools"))stop.focus();
    const entireHistory=chat.messages.filter(m=>(m.role==="user"||m.role==="assistant")&&!m.localGreeting&&m.id!==replaceId);
    const candidates=entireHistory.slice(-15).map(m=>({role:m.role,content:m.content}));
    // Keep the original task when the conversation becomes long. Never cut
    // assistant code or mathematical derivations at an arbitrary 4,000 chars.
    if(entireHistory.length>15&&entireHistory[0]?.role==="user")
      candidates.unshift({role:"user",content:entireHistory[0].content});
    // Preserve full recent messages, but do not exceed the server's 50 KB payload cap.
    // Account for JSON encoding, user instructions and non-ASCII characters.
    // Count the actual UTF-8 JSON payload, including escaped instructions.
    // Always reserve space for the newest user question before older context.
    let budget=50000-requestBytes({messages:[],effort:state.reason,instructions:personalInstructions});
    const history=[];
    const messageBytes=item=>requestBytes(item)+1;
    const latest=candidates.at(-1);
    if(!latest||latest.role!=="user"||latest.content.length>20000||
        !latestFits(latest.content)){
      retryAnswerId=replaceId;
      showStatus("Запрос слишком большой. Сократите последнее сообщение.",false,true);
      abort=null;pending=null;pendingReplaceId=null;stop.hidden=true;resizeInput();
      return;
    }
    // Preserve the full answer in the chat. Only the next AI request uses
    // an explicitly abbreviated context when an older reply is too large.
    function fitAssistantContext(item,limitBytes){
      const source=item.content;
      const marker="\n\n[... середина предыдущего ответа сокращена для контекста ...]\n\n";
      if(limitBytes<500||source.length<200)return null;
      let low=0,high=Math.min(8000,source.length-1),best=null;
      while(low<=high){
        const keep=Math.floor((low+high)/2);
        const first=Math.ceil(keep*.35),last=keep-first;
        const prefix=source.slice(0,first).replace(/[\uD800-\uDBFF]$/u,"");
        const suffix=last?source.slice(-last).replace(/^[\uDC00-\uDFFF]/u,""):"";
        const compact={role:"assistant",content:prefix+marker+suffix};
        if(compact.content.length<=20000&&messageBytes(compact)<=limitBytes){
          best=compact;low=keep+1;
        }else high=keep-1;
      }
      return best?.content.length>=200?best:null;
    }
    for(let i=candidates.length-1;i>=0;i--){
      let item={role:candidates[i].role,content:candidates[i].content};
      let bytes=messageBytes(item);
      if((bytes>budget||item.content.length>20000)&&item.role==="assistant"){
        const compact=fitAssistantContext(item,Math.min(budget,12000));
        if(compact){item=compact;bytes=messageBytes(item)}
      }
      // The first message needs no comma in the JSON array.
      const cost=bytes-(history.length===0?1:0);
      if(cost>budget||item.content.length>20000)continue;
      history.unshift(item);budget-=cost;
    }
    while(history.length>1&&history[0].role!=="user")history.shift();
    if(!history.length||history.at(-1).role!=="user"||history.at(-1).content!==latest.content){
      retryAnswerId=replaceId;
      showStatus("Запрос слишком большой. Сократите последнее сообщение.",false,true);
      abort=null;pending=null;pendingReplaceId=null;stop.hidden=true;resizeInput();
      return;
    }
    let streamingBubble=null,streamedPartial="",keepIncomplete=false;
    try{
      requestsAttempted++;
      window.KazInternalSettings?.refreshUsage?.();
      const response=await fetch("/api/chat",{
        method:"POST",headers:{"content-type":"application/json","accept":"text/event-stream"},
        credentials:"same-origin",signal:controller.signal,
        body:JSON.stringify({messages:history,effort:state.reason,instructions:personalInstructions})
      });
      // An aborted transport may still resolve its fetch. Do not attach
      // even a temporary response to a different conversation.
      if(abort!==controller||controller.signal.aborted||current!==chat.id||!threads.includes(chat)){
        if(response.body&&!response.body.locked)void response.body.cancel().catch(()=>{});
        return;
      }
      let data=null;
      if(response.ok&&/text\/event-stream/i.test(response.headers.get("content-type")||"")){
        streamingBubble=make("div","message message-assistant");
        activeStreamingBubble=streamingBubble;
        streamingBubble.dataset.thread=chat.id;
        streamingBubble.append(make("div","message-label","Kaz AI"));
        const answerSpan=make("div","session-stream-answer");
        answerSpan.dir="auto";
        streamingBubble.append(answerSpan);
        $("#chatMessages").append(streamingBubble);
        scrollChatToBottom();
        let lastPaint=0;
        const streamed=await readAIStream(response,(value,status)=>{
          if(abort!==controller||controller.signal.aborted||current!==chat.id)return;
          if(value)streamedPartial=value;
          // Avoid parsing huge Markdown replies every 100 ms; long answers
          // update less often, keeping scrolling and Stop responsive.
          const minInterval=Math.min(1200,120+Math.floor(value.length/40));
          if(!status&&Date.now()-lastPaint<minInterval)return;
          lastPaint=Date.now();
          const area=$("#mainContent");
          const following=area.scrollHeight-area.scrollTop-area.clientHeight<130;
          if(value&&window.KazFormat?.render){
            answerSpan.replaceChildren(window.KazFormat.render(value));
          }else answerSpan.textContent=value;
          if(following)area.scrollTop=area.scrollHeight;
          showStatus(status||"ИИ отвечает…");
        });
        if(abort!==controller||controller.signal.aborted)return;
        if(window.KazFormat?.render)answerSpan.replaceChildren(window.KazFormat.render(streamed));
        else answerSpan.textContent=streamed;
        data={text:streamed};
      }else{
        try{data=await response.json()}catch{}
      }
      // An outdated answer cannot change the status of a different chat.
      if(abort!==controller||controller.signal.aborted||!threads.includes(chat)||current!==chat.id)return;
      if(!response.ok){
        requestsFailed++;
        window.KazInternalSettings?.refreshUsage?.();
        if(data?.code==="AI_QUOTA_EXHAUSTED"){
          // A quota reset must not require resending and duplicating a question.
          // Retrying remains manual: never spend the user's quota automatically.
          retryAnswerId=replaceId;
          const mayRetry=replaceId
            ? chat.messages.at(-1)?.id===replaceId
            : chat.messages.at(-1)?.role==="user";
          showStatus("Дневной лимит ИИ исчерпан. Попробуйте после его обновления.",true,Boolean(mayRetry));
        }
        else if(data?.code==="AI_RATE_LIMITED"){
          retryAnswerId=replaceId;
          showStatus("Слишком много запросов за короткое время. Попробуйте позднее.",false,true);
        }else if(data?.code==="ACCESS_REQUIRED"){
          retryAnswerId=replaceId;
          const mayRetry=replaceId
            ? chat.messages.at(-1)?.id===replaceId
            : chat.messages.at(-1)?.role==="user";
          showStatus("Серверный ИИ ещё не настроен. Повторите запрос после настройки сервера.",false,Boolean(mayRetry));
        }
        else{
          retryAnswerId=replaceId;
          showStatus(data?.message||"Ответ ИИ сейчас недоступен. Попробуйте позже.",false,true);
        }
        window.KazInternalSettings?.notify("failed");
        return;
      }
      if(abort!==controller||controller.signal.aborted||!threads.includes(chat))return;
      if(!data||typeof data.text!=="string"||!data.text.trim())throw new Error("EMPTY_RESPONSE");
      if(data.incomplete===true){
        // The JSON fallback must never silently save an unfinished AI answer.
        streamingBubble=make("div","message message-assistant");
        streamingBubble.append(make("div","message-label","Kaz AI"));
        const partial=make("div","session-stream-answer");
        partial.dir="auto";
        if(window.KazFormat?.render)partial.append(window.KazFormat.render(data.text));
        else partial.textContent=data.text;
        streamingBubble.append(partial);
        $("#chatMessages").append(streamingBubble);
        streamedPartial=data.text;
        const error=new Error("AI_OUTPUT_INCOMPLETE");error.code="AI_OUTPUT_INCOMPLETE";
        throw error;
      }
      if(replaceId){
        const existing=chat.messages.find(m=>m.id===replaceId && m.role==="assistant");
        if(existing){existing.content=data.text;existing.rating=null}
      }else{
        if(threads.includes(chat))chat.messages.push({id:nextId(),role:"assistant",content:data.text});
      }
      if(activeStreamingBubble===streamingBubble)activeStreamingBubble=null;
      if(current===chat.id){touchChat(chat);displayThread(chat);renderChat();renderHistory()}
      showStatus("");
      requestsSucceeded++;
      window.KazInternalSettings?.refreshUsage?.();
      window.KazInternalSettings?.notify("completed");
    }catch(e){
      if(abort!==controller)return;
      if(controller.signal.aborted){
        const canRetry=replaceId
          ? chat.messages.at(-1)?.id===replaceId
          : chat.messages.at(-1)?.role==="user";
        if(controller.signal.reason==="manual"){
          retryAnswerId=replaceId;
          showStatus("Генерация ответа остановлена.",false,Boolean(canRetry));
        }
        // Navigation and deletion must not display stale status messages.
      }else{
        requestsFailed++;
        window.KazInternalSettings?.refreshUsage?.();
        retryAnswerId=replaceId;
        const quota=e?.code==="AI_QUOTA_EXHAUSTED";
        const offline=typeof navigator!=="undefined"&&navigator.onLine===false;
        const message=quota?"Дневной лимит ИИ исчерпан. Попробуйте после его обновления."
          :e?.code==="AI_RATE_LIMITED"?"Слишком много запросов за короткое время. Попробуйте позднее."
          :e?.code==="AI_RESPONSE_INTERRUPTED"?"Сервис ИИ прервал обработку ответа. Можно повторить запрос."
          :e?.code==="AI_PROVIDER_TIMEOUT"||e?.code==="AI_STAGE_TIMEOUT"?"Cloudflare превысил время обработки ответа. Можно повторить запрос."
          :e?.code==="AI_PROVIDER_ABORTED"?"Cloudflare прервал запрос. Можно повторить его позже."
          :e?.code==="AI_CAPACITY_UNAVAILABLE"?"Cloudflare сейчас перегружен. Попробуйте позже."
          :e?.code==="AI_PROVIDER_REQUEST_TOO_LARGE"?"Cloudflare отклонил слишком большой запрос."
          :e?.code==="AI_MODEL_EMPTY"||e?.code==="AI_EMPTY"?"Нейросеть не вернула текст решения."
          :e?.code==="STREAM_TOO_LONG"?"Решение слишком длинное для проверки. Попробуйте уточнить задание."
          :e?.code==="AI_REVIEW_OUTPUT_LIMIT"?"Решение слишком длинное для проверки. Попробуйте уточнить задание."
          :e?.code==="AI_STREAM_FRAME_LIMIT"?"Нейросеть вернула повреждённые данные. Попробуйте снова."
          :e?.code==="AI_UNAVAILABLE"?"Сервис ИИ временно недоступен. Это не обязательно проблема вашего интернета."
          :e?.code==="STREAM_INTERRUPTED"?"Ответ от сервера оборвался до завершения. Попробуйте повторить запрос."
          :e?.code==="STREAM_INVALID"||e?.code==="AI_STREAM_INVALID"?"Получены повреждённые данные ответа. Часть текста могла не дойти."
          :e?.code==="AI_OUTPUT_INCOMPLETE"?"Нейросеть остановилась до завершения ответа. Неполный текст не сохранён, запрос можно повторить."
          :e instanceof TypeError&&offline?"Ваше устройство сейчас не подключено к сети. Проверьте подключение."
          :e instanceof TypeError?"Не удалось связаться с сайтом. Интернет на других сайтах может работать."
          :"Не удалось завершить ответ ИИ. Попробуйте повторить запрос.";
        // Keep genuinely received user-visible output on screen as a temporary,
        // explicitly incomplete preview. Do not commit an unfinished or unaudited
        // answer into conversation history; manual Retry starts a fresh request.
        if(streamingBubble&&streamedPartial.trim()&&current===chat.id){
          keepIncomplete=true;
          incompleteBubble=streamingBubble;
          incompleteBubble.dataset.thread=chat.id;
          // The last network chunk may have arrived during the paint throttle.
          // Show every received character before adding the interruption notice.
          const answer=streamingBubble.querySelector(".session-stream-answer");
          if(answer){
            if(window.KazFormat?.render)answer.replaceChildren(window.KazFormat.render(streamedPartial));
            else answer.textContent=streamedPartial;
          }
          const warning=make("div","session-stream-interrupted",
            "⚠️ Ответ прервался. Текст выше неполный и не сохранён. Нажмите «Повторить запрос».");
          streamingBubble.append(warning);
        }
        const incident=typeof e?.incidentId==="string"&&/^[a-f0-9]{12}$/.test(e.incidentId)
          ?" Код ошибки: "+e.incidentId:"";
        showStatus(message+incident,quota,true);
        window.KazInternalSettings?.notify("failed");
      }
    }finally{
      if(!keepIncomplete)streamingBubble?.remove();
      if(activeStreamingBubble===streamingBubble)activeStreamingBubble=null;
      if(abort===controller){abort=null;pending=null;pendingReplaceId=null;stop.hidden=true;resizeInput()}
    }
  }
  function stopActiveRequest(reason="manual"){
    const controller=abort;
    if(!controller)return;
    const chat=selected(),replaceId=pendingReplaceId;
    const canRetry=Boolean(chat&&chat.id===pending&&(
      replaceId ? chat.messages.at(-1)?.id===replaceId
        : chat.messages.at(-1)?.role==="user"
    ));
    // Detach before signalling cancellation: even if the transport ignores Abort,
    // a late answer is rejected by the active-controller identity checks.
    if(reason==="manual"){
      requestsStopped++;
      window.KazInternalSettings?.refreshUsage?.();
    }
    abort=null;pending=null;pendingReplaceId=null;
    activeStreamingBubble?.remove();activeStreamingBubble=null;
    controller.abort(reason);
    $("#sessionStop").hidden=true;
    retryAnswerId=replaceId;
    const message="Генерация ответа остановлена.";
    showStatus(message,false,canRetry);
    resizeInput();
    // Only an explicit manual Stop action changes focus.
    if(reason==="manual"){
      if(canRetry&&!$("#sessionRetry").hidden)$("#sessionRetry").focus();
      else $("#messageInput").focus();
    }
  }
  // This fixed family surprise never calls a model or changes real account limits.
  const isMotherName=value=>/^(муханова айслу|муханова айсулу)$/u.test(
    value.normalize("NFKC").trim().replace(/\s+/gu," ").toLocaleLowerCase("ru"));
  const motherGreeting="Здравствуйте, мама создателя. ❤️\n\nДля вас все ограничения платных систем выключены.";
  function sendMessage(){
    const text=composeText();if(!text.trim()||abort)return;
    if(text.length>8000){notify("Сообщение длиннее 8000 символов. Сократите его перед отправкой.");return}
    if(!isMotherName(text)&&!latestFits(text)){
      notify("Запрос слишком большой. Сократите последнее сообщение.");return;
    }
    const chat=(state.screen==="welcome"?newThread(text):selected()||newThread(text));
    const familyGreeting=isMotherName(text);
    chat.messages.push({id:nextId(),role:"user",content:text});
    if(familyGreeting)chat.messages.push({id:nextId(),role:"assistant",content:motherGreeting,localGreeting:true});
    touchChat(chat);displayThread(chat);
    $("#messageInput").value="";drafts.delete(chat.id);welcomeDraft="";resizeInput();
    renderChat();renderHistory();showScreen("chat");scrollChatToBottom();
    if(familyGreeting)showStatus("");
    else runAI(chat);
  }
  // Use the actual UTF-16 input limit (the same one enforced by the browser).
  // Numeric counts work in every interface language without changing the draft.
  function appendLengthCounter(body,field){
    const count=make("output","session-length-count");
    count.dir="ltr";count.setAttribute("aria-live","off");
    const update=()=>{count.textContent=field.value.length+" / "+field.maxLength};
    field.addEventListener("input",update);update();body.append(count);
  }
  function textDialog(title,label,value,onSave){
    openDialog(title,"",body=>{
      const field=make("input","session-input");field.type="text";field.dir="auto";field.maxLength=100;
      field.value=value;field.setAttribute("aria-label",label);
      body.append(field);appendLengthCounter(body,field);
      const save=button("Сохранить","dialog-save",null,"session-primary");
      save.addEventListener("click",()=>{if(!field.isConnected)return;const next=field.value.trim();if(!hasVisibleName(next)){notify("Введите название.");field.focus();return}if(onSave(next)===false)return;closeDialog()});
      // IME confirmation must not save a half-composed Kazakh or other name.
      field.addEventListener("keydown",e=>{
        if(e.key==="Enter"&&!e.isComposing&&e.keyCode!==229){
          e.preventDefault();save.click();
        }
      });
      body.append(save);
    });
  }
  function confirmDialog(title,explanation,onYes){
    openDialog(title,explanation,body=>{
      const yes=button("Удалить","dialog-confirm",null,"session-danger-button");
      // Make destructive confirmations single-use even if the button receives
      // multiple queued clicks or keyboard activations.
      let confirmed=false;
      yes.addEventListener("click",()=>{
        if(confirmed||!yes.isConnected)return;
        confirmed=true;
        yes.disabled=true;
        try{onYes()}finally{closeDialog()}
      });
      body.append(yes);
    });
  }
  function handle(action,id,details={}){
    const chat=threads.find(c=>c.id===id);
    const project=projects.find(p=>p.id===id);
    if(action==="open-chat"&&chat){
      if(current!==chat.id){
        const old=selected();
        // Do not discard an unsent private draft when opening a saved chat.
        const privateWelcome=!old&&Boolean($("#sessionTemporary")?.checked);
        if((old?.temporary||privateWelcome)&&$("#messageInput").value.length){
          notify("В поле сообщения есть черновик. Сначала отправьте или очистите его.");
          showScreen(old?"chat":"welcome");
          $("#messageInput").focus();
          return;
        }
        rememberReadingPosition();
        if(abort)abort.abort("navigation");
        abort=null;pending=null;pendingReplaceId=null;$("#sessionStop").hidden=true;
        activeStreamingBubble?.remove();activeStreamingBubble=null;
        incompleteBubble?.remove();incompleteBubble=null;
        showStatus("");
        if(privateWelcome){welcomeDraft="";welcomeHelperDrafts.clear();$("#messageInput").value=""}
        if(old?.temporary){
          const i=threads.indexOf(old);
          if(i>=0){forgetExpandedPrompts(old);helperDrafts.delete(old);threads.splice(i,1);drafts.delete(old.id)}
          // Temporary drafts must not leak into the welcome composer during navigation.
          welcomeDraft="";
          $("#messageInput").value="";
        }
      }
      // Same-chat reopen also retains the current reading position.
      if(current===chat.id)rememberReadingPosition();
      displayThread(chat);renderChat();renderHistory();showScreen("chat");
      if(details.matchIndex!==undefined){
        const index=Number(details.matchIndex);
        const bubble=Number.isSafeInteger(index)?$("#chatMessages").children[index]:null;
        if(bubble){
          bubble.classList.add("session-jump-hit");
          const phrase=$("#historySearch").value.trim();
          // Rich Markdown replies use nested elements instead of a plain span.
          // Highlight inside text nodes without destroying links or code blocks.
          const content=bubble.querySelector(":scope > .rich-answer")
            ||bubble.querySelector(":scope > span");
          if(phrase&&content){
            // Search matches can cross Markdown elements (e.g. bold + plain).
            const walker=document.createTreeWalker(content,NodeFilter.SHOW_TEXT);
            const parts=[];let whole="",node;
            while((node=walker.nextNode())){
              const start=whole.length;whole+=node.nodeValue||"";
              parts.push({node,start,end:whole.length});
            }
            const match=findTextMatch(whole,phrase);
            if(match){
              const first=parts.find(p=>p.end>match.start);
              const last=parts.find(p=>p.end>=match.end&&p.start<match.end);
              if(first&&last){
                const range=document.createRange();
                range.setStart(first.node,match.start-first.start);
                range.setEnd(last.node,match.end-last.start);
                const wrappers=[first.node.parentElement,last.node.parentElement];
                const highlighted=make("mark","session-search-hit");
                highlighted.append(range.extractContents());
                range.insertNode(highlighted);
                // Range extraction can leave an empty <strong>/<em> element.
                // Remove only empty formatting shells, never actual text.
                for(const wrapper of wrappers){
                  if(wrapper?.isConnected&&/^(STRONG|EM|B|I)$/u.test(wrapper.tagName)
                    &&!wrapper.textContent&&!wrapper.children.length)wrapper.remove();
                }
              }
            }
          }
          bubble.scrollIntoView({block:"center"});
        }
      }
      return
    }
    if(action==="rename-chat"&&chat){textDialog("Переименовать чат","Название",chat.title,v=>{
      if(!threads.includes(chat))return false;
      chat.title=v;
      if(current===chat.id)state.draftTitle=v;
      renderHistory();renderSessionProjects();
    });return}
    if(action==="pin-chat"&&chat){
      if(chat.temporary){notify("Временные чаты нельзя закреплять в истории.");return}
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
      if(download("Kaz-AI-"+safeExportName(chat.title)+".txt",exportParts(chat),"text/plain;charset=utf-8"))
        notify("Переписка скачана в текстовый файл.");return
    }
    if(action==="remove-chat-from-project"&&chat&&!chat.temporary&&chat.projectId&&projects.some(p=>p.id===chat.projectId)){
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
      if(pending===chat.id){abort?.abort("navigation");abort=null;pending=null;pendingReplaceId=null;$("#sessionStop").hidden=true;showStatus("")}
      const i=threads.indexOf(chat);
      // A detached confirmation can fire twice. Never delete a different chat
      // when its original target has already been removed.
      if(i<0)return;
      forgetExpandedPrompts(chat);helperDrafts.delete(chat);
      threads.splice(i,1);drafts.delete(chat.id);
      if(current===chat.id)sessionNewChat(false,true);
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
        save.addEventListener("click",()=>{
          if(!select.isConnected)return;
          const target=select.value;
          if(!threads.includes(chat)||chat.temporary){notify("Чат больше недоступен для проекта.");closeDialog();return}
          if(target&&!projects.some(p=>p.id===target)){
            notify("Проект больше не существует. Выберите другой проект.");return;
          }
          chat.projectId=target||null;
          // Rebuild first so closing the dialog can return keyboard focus to
          // the current history action, not a detached old button.
          renderSessionProjects();renderHistory();closeDialog();
          notify("Проект чата изменён.");
        });
        body.append(save);
        if(!projects.length)body.append(make("p","session-help","Сначала создайте проект в разделе «Проекты»."));
      });return}
    if(action==="export-project"&&project){
      const saved=threads.filter(c=>c.projectId===project.id&&!c.temporary&&c.messages.length).sort(newestFirst);
      if(!saved.length){notify("В этом проекте пока нет переписок для скачивания.");return}
      const separator="\n\n"+"=".repeat(45)+"\n\n";
      const parts=[];
      saved.forEach((chat,index)=>{
        if(index)parts.push(separator);
        for(const segment of exportParts(chat))parts.push(segment);
      });
      if(download("Kaz-AI-project-"+safeExportName(project.name)+".txt",
        parts,"text/plain;charset=utf-8"))
        notify("Переписки проекта скачаны. Временные чаты не включены.");return
    }
    if(action==="add-chat-to-project"&&project){
      const available=threads.filter(c=>!c.temporary&&c.projectId!==project.id);
      if(!available.length){notify("Нет других чатов для добавления.");return}
      // Keep the user-written project name unchanged across interface languages.
      const lang=window.KazI18n?.language||"ru";
      const title=lang==="en"?"Add chat to “"+project.name+"”"
        :lang==="kk"?"«"+project.name+"» жобасына чат қосу"
          :"Добавить чат в «"+project.name+"»";
      openDialog(title,"Можно выбрать чат без проекта или перенести из другого проекта.",body=>{
        const select=make("select","session-input");
        select.setAttribute("aria-label","Выберите чат для проекта");
        for(const candidate of available){
          const option=make("option","",candidate.title);option.value=candidate.id;select.append(option);
        }
        body.append(select);
        const save=button("Добавить","dialog-save",null,"session-primary");
        save.addEventListener("click",()=>{
          if(!select.isConnected)return;
          const chosen=threads.find(c=>c.id===select.value);
          if(!chosen||chosen.temporary||!projects.includes(project)){
            notify("Чат или проект уже недоступен.");return;
          }
          chosen.projectId=project.id;renderSessionProjects();renderHistory();closeDialog();
          notify("Чат добавлен в проект.");
        });
        body.append(save);
      });return
    }
    // NFKC also treats visually equivalent Unicode forms as one project name.
    // Compare visually identical project names as one, without rewriting
    // the user's original label shown in Projects or exported transcripts.
    const projectKey=name=>name.normalize("NFKC")
      .replace(/[\u00ad\u034f\u061c\u180e\u200b\u200e\u200f\u202a-\u202e\u2060-\u2064\u2066-\u2069\ufeff]/gu,"")
      .trim().replace(/\s+/gu," ").toLocaleLowerCase();
    const duplicateProject=(name,except=null)=>projects.some(p=>p.id!==except&&projectKey(p.name)===projectKey(name));
    if(action==="new-project"){textDialog("Новый проект","Название проекта","",name=>{
      if(!projectKey(name)){notify(uiText("Введите название."));return false}
      if(duplicateProject(name)){notify(uiText("Проект с таким названием уже существует."));return false}
      projects.push({id:nextId(),name});renderSessionProjects();
    });return}
    if(action==="rename-project"&&project){textDialog("Название проекта","Название",project.name,name=>{
      if(!projectKey(name)){notify(uiText("Введите название."));return false}
      if(duplicateProject(name,project.id)){notify(uiText("Проект с таким названием уже существует."));return false}
      project.name=name;renderSessionProjects();
    });return}
    if(action==="delete-project"&&project){confirmDialog("Удалить проект?","Чаты не удалятся, они перейдут в раздел «Без проекта».",()=>{
      const i=projects.indexOf(project);
      // Prevent a stale confirmation from accidentally deleting the last project.
      if(i<0)return;
      projects.splice(i,1);
      for(const c of threads)if(c.projectId===project.id)c.projectId=null;
      renderSessionProjects();renderHistory();
    });return}
    if(action==="copy-answer"){
      const message=selected()?.messages.find(m=>m.id===id&&m.role==="assistant"&&!m.localGreeting);
      if(!message)return;
      const text=message.content;
      // Copy the exact original, not the visually transformed Markdown.
      (async()=>{
        try{
          if(!navigator.clipboard?.writeText)throw new Error("Clipboard unavailable");
          await navigator.clipboard.writeText(text);
          notify(uiText("Текст скопирован."));
        }catch{
          // A denied clipboard permission must not be reported as success.
          notify(uiText("Не удалось скопировать текст."));
        }
      })();
      return;
    }
    if(action==="rate-up"||action==="rate-down"||action==="retry-answer"){
      const c=selected(),index=c?.messages.findIndex(m=>m.id===id)??-1;
      if(index<0)return;
      const m=c.messages[index];
      if(action==="retry-answer"){
        if(m.localGreeting)return;
        if(abort){notify("Дождитесь завершения предыдущего запроса.");return}
        if(m.role!=="assistant"||index!==c.messages.length-1){notify("Повторить можно только последний ответ.");return}
        if(c.messages[index-1]?.role==="user")runAI(c,m.id);
        else showStatus("Не удалось определить вопрос для повторного ответа.");
        return;
      }
      if(action==="rate-up"||action==="rate-down"){
        if(m.role!=="assistant"||m.localGreeting)return;
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
      const checkbox=$("#sessionTemporary"),requested=Boolean(checkbox.checked);
      const active=selected(),unsent=$("#messageInput").value;
      // A saved chat keeps its own draft when starting a new session. But the
      // welcome draft or an active temporary draft would otherwise be erased.
      if(unsent.length&&(!active||active.temporary)){
        checkbox.checked=!requested;
        notify("В поле сообщения есть черновик. Сначала отправьте или очистите его.");
        // Settings hides the composer. Show the draft before asking to clear it.
        showScreen(active?"chat":"welcome");
        $("#messageInput").focus();
        return;
      }
      sessionNewChat(requested);return;
    }
    if(action==="export"){
      const saved=threads.filter(c=>!c.temporary&&c.messages.length).sort(newestFirst);
      if(!saved.length){notify("Для экспорта пока нет переписок.");return}
      const separator="\n\n"+"=".repeat(45)+"\n\n";
      const parts=[];
      saved.forEach((chat,index)=>{
        if(index)parts.push(separator);
        for(const segment of exportParts(chat))parts.push(segment);
      });
      if(download("Kaz-AI-history.txt",parts,"text/plain;charset=utf-8"))
        notify("История текущей вкладки скачана. Временные чаты не включены.");return;
    }
    if(action==="instructions"){
      openDialog("Личные инструкции","Правила действуют только в этой вкладке. Они передаются модели вместе с вашим запросом при подключённом ИИ.",body=>{
        const area=make("textarea","session-textarea");area.dir="auto";area.value=instructionsDraft??personalInstructions;area.maxLength=2000;
        area.addEventListener("input",()=>{instructionsDraft=area.value});
        area.setAttribute("aria-label",uiText("Личные инструкции"));
        area.placeholder="Например: отвечай кратко, на русском языке";
        body.append(area);appendLengthCounter(body,area);
        const save=button("Применить","dialog-save",null,"session-primary");
        save.addEventListener("click",()=>{
          if(!area.isConnected)return;
          personalInstructions=area.value.slice(0,2000);
          instructionsDraft=null;
          closeDialog();notify("Инструкции применены на текущий сеанс.");
        });
        area.addEventListener("keydown",event=>{
          if(!event.isComposing&&event.keyCode!==229&&event.key==="Enter"&&(event.ctrlKey||event.metaKey)&&!event.altKey){event.preventDefault();save.click()}
        });
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
    const owner=selected();
    let saved=owner?helperDrafts.get(owner):welcomeHelperDrafts;
    if(!saved){saved=new Map();helperDrafts.set(owner,saved)}
    const prior=saved.get(kind);
    openDialog(definition[0],definition[1],body=>{
      let languageSelect=null;
      if(kind===22){
        languageSelect=make("select","session-input");
        languageSelect.setAttribute("aria-label","Язык перевода");
        for(const [value,label] of [
          ["ru","Русский"],["kk","Қазақ тілі"],["en","English"],["pt","Português"],
          ["es","Español"],["fr","Français"],["ar","العربية"],["zh","中文"],
          ["ko","한국어"],["ja","日本語"],["de","Deutsch"],["it","Italiano"],
          ["tr","Türkçe"],["pl","Polski"],["hi","हिन्दी"],["vi","Tiếng Việt"],
          ["id","Bahasa Indonesia"]
        ]){
          const option=make("option","",label);option.value=value;languageSelect.append(option);
        }
        const selectedLanguage=window.KazI18n?.language||"ru";
        const preferred=prior?.language||selectedLanguage;
        languageSelect.value=Array.from(languageSelect.options).some(option=>option.value===preferred)
          ?preferred:"en";
        body.append(languageSelect);
      }
      const field=make("textarea","session-textarea");field.dir="auto";field.rows=6;field.maxLength=7800;
      field.setAttribute("aria-label",kind===22?"Текст для перевода":kind===23?"Задача по программированию":"Описание документа");
      field.placeholder=kind===22?"Введите текст для перевода":kind===23?"Что нужно исправить или написать?":"Например: деловое письмо о встрече";
      field.value=prior?.text||"";
      body.append(field);appendLengthCounter(body,field);
      const remember=()=>saved.set(kind,{text:field.value,language:languageSelect?.value});
      field.addEventListener("input",remember);
      languageSelect?.addEventListener("change",remember);
      const prepare=button("Подготовить запрос","dialog-save",null,"session-primary");
      // Ctrl/Cmd+Enter prepares text without sending it to GPT-OSS.
      field.addEventListener("keydown",event=>{
        if(event.isComposing||event.keyCode===229)return;
        if(event.key==="Enter"&&(event.ctrlKey||event.metaKey)&&!event.altKey){
          event.preventDefault();prepare.click();
        }
      });
      prepare.addEventListener("click",()=>{
        // Leading whitespace and final newlines can be meaningful in code or
        // source text. Validate using trim, but preserve the original payload.
        if(!field.isConnected)return;
        const value=field.value;
        if(!value.trim()){notify("Сначала введите текст или описание задачи.");field.focus();return}
        const input=$("#messageInput");
        if(input.value.length){notify("В поле сообщения есть черновик. Сначала отправьте или очистите его.");return}
        let prompt="";
        const ui=window.KazI18n?.language||"ru";
        // Every supported interface locale can use these tools. Their existing
        // Russian, Kazakh and English prompt wording is retained.
        const promptLocale=["ru","kk","en"].includes(ui)?ui:"en";
        if(kind===22){
          const targetCode=languageSelect.value;
          const englishNames={
            en:"English",ru:"Russian",kk:"Kazakh",pt:"Portuguese",es:"Spanish",
            fr:"French",ar:"Arabic",zh:"Chinese",ko:"Korean",ja:"Japanese",
            de:"German",it:"Italian",tr:"Turkish",pl:"Polish",
            hi:"Hindi",vi:"Vietnamese",id:"Indonesian"
          };
          const localNames={
            ru:{ru:"русский",kk:"казахский",en:"английский",pt:"португальский",es:"испанский",
              fr:"французский",ar:"арабский",zh:"китайский",ko:"корейский",ja:"японский",
              de:"немецкий",it:"итальянский",tr:"турецкий",pl:"польский",
              hi:"хинди",vi:"вьетнамский",id:"индонезийский"},
            kk:{ru:"орыс",kk:"қазақ",en:"ағылшын",pt:"португал",es:"испан",
              fr:"француз",ar:"араб",zh:"қытай",ko:"корей",ja:"жапон",
              de:"неміс",it:"итальян",tr:"түрік",pl:"поляк",
              hi:"хинди",vi:"вьетнам",id:"индонезия"}
          };
          const target=(promptLocale==="en"?englishNames:localNames[promptLocale])?.[targetCode];
          if(!target){notify("Выберите язык перевода.");languageSelect.focus();return}
          const prefix={
            ru:"Переведи следующий текст на "+target+" язык. Сохрани смысл, имена и форматирование. Выведи только перевод.\n\n",
            en:"Translate the following text into "+target+". Preserve meaning, names, and formatting. Return only the translation.\n\n",
            kk:"Келесі мәтінді "+target+" тіліне аудар. Мағынасын, есімдерді және пішімдеуді сақта. Тек аударманы бер.\n\n"
          }[promptLocale];
          prompt=prefix+value;
        }else if(kind===23){
          prompt={
            ru:"Помоги с программированием. Если информации не хватает, уточни её. Объясняй простыми словами, а код приводи в удобном виде. Задача:\n\n",
            en:"Help with programming. Ask for missing details. Explain simply and format code clearly. Task:\n\n",
            kk:"Бағдарламалауға көмектес. Ақпарат жетіспесе, нақтылап сұра. Қарапайым тілмен түсіндіріп, кодты түсінікті түрде көрсет. Тапсырма:\n\n"
          }[promptLocale]+value;
        }else{
          // The English fallback is only an instruction language, not the
          // requested output language. Keep the user's document language.
          prompt={
            ru:"Подготовь текст документа по описанию. Структурируй его. Язык описания, если не указан другой. Не выдумывай реквизиты: оставь места для заполнения. Выведи только документ. Описание:\n\n",
            en:"Draft the document text. Structure it. Use the description language unless specified otherwise. Leave placeholders for unknown details. Return only the document. Description:\n\n",
            kk:"Сипаттамаға сай құжат мәтінін дайында. Жүйелі жаз. Басқа тіл сұралмаса, сипаттама тілін қолдан. Белгісіз деректерге толтырылатын орын қалдыр. Тек құжат мәтінін бер. Сипаттама:\n\n"
          }[promptLocale]+value;
        }
        if(prompt.length>8000){notify("Текст слишком длинный. Сократите описание.");field.focus();return}
        if(!latestFits(prompt)){notify("Запрос слишком большой. Сократите последнее сообщение.");field.focus();return}
        // Never move a prepared draft into a different conversation.
        if(selected()!==owner){closeDialog();return}
        saved.delete(kind);
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
        }[["ru","kk","en"].includes(lang)?lang:"en"];
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
        // Escape during keyboard composition rejects a candidate, not the search.
        if(event.isComposing||event.keyCode===229)return;
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
    const tempRow=make("div","setting-item");tempRow.dataset.settingsDestination="general";tempRow.append(make("div","",undefined));
    tempRow.firstChild.append(make("h2","","Временный чат"),make("p","","Без добавления в историю текущей вкладки"));
    const label=make("label","session-checkbox-label");
    const checkbox=make("input","");checkbox.type="checkbox";checkbox.id="sessionTemporary";
    label.append(checkbox,make("span","","Включить"));tempRow.append(label);
    settings?.append(tempRow);
    const overlay=make("div","session-overlay");overlay.id="sessionOverlay";overlay.hidden=true;
    const dialog=make("section","session-dialog");dialog.setAttribute("role","dialog");dialog.setAttribute("aria-modal","true");dialog.setAttribute("aria-labelledby","sessionTitle");
    const close=button("×","dialog-close",null,"session-dialog-close");close.id="sessionClose";
    close.setAttribute("aria-label",uiText("Закрыть окно"));
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
      // Shortcuts must not interrupt conversion in a language input method.
      if(event.isComposing||event.keyCode===229)return;
      if((event.ctrlKey||event.metaKey)&&!event.altKey&&event.key.toLowerCase()==="k"
         &&$("#sessionOverlay").hidden&&$("#modalOverlay").hidden&&$("#googleOverlay").hidden){
        event.preventDefault();showScreen("history");
        const search=$("#historySearch");search.focus();search.select();
      }
    });
    overlay.addEventListener("click",e=>{if(e.target===overlay)closeDialog()});
    document.addEventListener("keydown",e=>{
      if(overlay.hidden)return;
      if(e.isComposing||e.keyCode===229)return;
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
      if(language==="ru"){
        const last=count%10,lastTwo=count%100;
        const plural=last===1&&lastTwo!==11?"функция":last>=2&&last<=4&&(lastTwo<12||lastTwo>14)?"функции":"функций";
        heading.textContent=count+" "+plural;
      }else{
        const units={
          en:["function","functions"],kk:["функция","функция"],
          pt:["função","funções"],es:["función","funciones"],fr:["fonction","fonctions"],
          ar:["وظيفة","وظائف"],zh:["项功能","项功能"],ko:["개 기능","개 기능"],
          ja:["機能","機能"],de:["Funktion","Funktionen"],it:["funzione","funzioni"],
          tr:["işlev","işlev"],pl:["funkcja","funkcji"],hi:["सुविधा","सुविधाएँ"],
          vi:["chức năng","chức năng"],id:["fungsi","fungsi"]
        }[language]||["function","functions"];
        heading.textContent=count+" "+units[count===1?0:1];
      }
    }
    // Ratings and instruction input are available, but their real effect still
    // depends on a connected AI answer; do not label them fully working.
    const working=new Set([1,2,3,4,5,6,7,25,41,42,44,45]);
    const partial=new Set([9,10,13,15,16,22,23,24,40,43]);
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
        if(number===6){
          if(chat.temporary){notify("Временные чаты нельзя закреплять в истории.");return}
          // A Tools card must show the result of its action: the pin changes
          // inside History, which was otherwise hidden behind Tools.
          showScreen("history");
          handle("pin-chat",chat.id);
          const pin=Array.from(document.querySelectorAll('#historyList [data-session="pin-chat"]'))
            .find(control=>control.dataset.id===chat.id);
          pin?.focus();
          return;
        }
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
      if(number===41){window.KazInternalSettings?.open("general");$("#sessionTemporary").focus();return}
      if(number===42){toggleTheme();return}
      if(number===43){
        // The tool card becomes hidden behind a menu. Focus the visible trigger.
        togglePopover("language",$("#languageToggle"));
        $("#languageToggle").focus();
        return;
      }
      if(number===44){
        window.KazInternalSettings?.open("appearance");
        togglePopover("font");
        $("#fontToggle").focus();
        return;
      }
      if(number===45)return handle("export");
    }
    if(key==="tool-25"){showCalculator();return}
    if(key==="export"){handle("export");return}
    if(key==="instructions"){handle("instructions");return}
    if(key==="projects"){showScreen("projects");handle("new-project");return}
    baseShowFeature(key);
  };
  showScreen=function(name){
    if(name!=="chat")rememberReadingPosition();
    baseShowScreen(name);
    if(name==="chat")restoreReadingPosition();
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
  window.KazSession={usageSnapshot:()=>({requestsAttempted,requestsSucceeded,requestsFailed,requestsStopped}),snapshot:()=>({
    threads:threads.map(c=>({id:c.id,title:c.title,messages:c.messages.length,pinned:c.pinned,temporary:c.temporary,projectId:c.projectId})),
    projects:projects.map(p=>({id:p.id,name:p.name})),active:current,draftCount:drafts.size
  }),compute,sendMessage,refreshLocale:()=>{
    renderHistory();
    renderSessionProjects();
    // The Stop/Retry and temporary-chat controls are created after the
    // initial i18n pass. Update them in place, never rerender the AI stream.
    for(const [selector,key] of [["#sessionStop","Остановить"],["#sessionRetry","Повторить запрос"]]){
      const control=$(selector);if(control)control.textContent=uiText(key);
    }
    const temporary=$("#sessionTemporary");
    const row=temporary?.closest(".setting-item");
    if(row){
      const title=row.querySelector("h2"),description=row.querySelector("p");
      const caption=temporary.closest("label")?.querySelector("span");
      if(title)title.textContent=uiText("Временный чат");
      if(description)description.textContent=uiText("Без добавления в историю текущей вкладки");
      if(caption)caption.textContent=uiText("Включить");
    }
    for(const [action,key] of [["rate-up","Положительная оценка ответа"],["rate-down","Отрицательная оценка ответа"]]){
      for(const control of document.querySelectorAll('#chatMessages [data-session="'+action+'"]')){
        control.setAttribute("aria-label",uiText(key));
      }
    }
    for(const control of document.querySelectorAll('#chatMessages [data-session="retry-answer"]')){
      control.textContent=uiText("Повторить ответ");
      if(control.disabled)control.title=uiText("Повторить можно только последний ответ.");
    }
    for(const control of document.querySelectorAll('#chatMessages [data-session="copy-answer"]'))control.textContent=uiText("Скопировать текст");
    // Existing long prompts retain their expansion and original text while
    // Show more / Show less follows the newly selected interface language.
    updateLongPromptButtons();
    for(const control of document.querySelectorAll("#chatMessages .answer-code-copy"))control.refreshCopyLabel?.();
  }};
})();
