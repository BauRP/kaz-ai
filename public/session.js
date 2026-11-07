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
  let current=null,serial=0,modalReturn=null,abort=null,pending=null,personalInstructions="";
  const nextId=()=>String(++serial);
  const selected=()=>threads.find(c=>c.id===current)||null;
  const displayThread=c=>{
    current=c?.id||null;
    state.chat=c?c.messages:[];
    state.draftTitle=c?c.title:"Новый чат";
  };
  const composeText=()=>$("#messageInput").value.trim();
  function showStatus(text,quota=false){
    const banner=$("#statusBanner");
    banner.textContent=text;
    banner.classList.toggle("is-quota",quota);
    banner.hidden=!text;
  }
  const baseRenderChat=renderChat;
  const baseRenderTools=renderTools;
  const baseShowScreen=showScreen;
  const baseShowFeature=showFeature;
  const baseToggleTheme=toggleTheme;
  const exportText=c=>[
    "Kaz AI — "+c.title,
    "Экспорт текущей переписки (без сохранения в облаке)",
    "",
    ...c.messages.map(m=>(m.role==="assistant"?"Kaz AI: ":"Вы: ")+m.content+"\n")
  ].join("\n");
  function download(name,body,mime){
    const blob=new Blob([body],{type:mime});
    const url=URL.createObjectURL(blob);
    const link=document.createElement("a");link.href=url;link.download=name;document.body.append(link);link.click();link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),500);
  }
  function openDialog(title,paragraph="",build){
    modalReturn=document.activeElement;
    const overlay=$("#sessionOverlay");const titleEl=$("#sessionTitle"),body=$("#sessionBody");
    titleEl.textContent=title;body.replaceChildren();
    if(paragraph)body.append(make("p","session-help",paragraph));
    if(build)build(body);
    overlay.hidden=false;
    const focus=body.querySelector("input,textarea,button")||$("#sessionClose");
    focus.focus();
  }
  function closeDialog(){
    $("#sessionOverlay").hidden=true;
    if(modalReturn&&typeof modalReturn.focus==="function")modalReturn.focus();
    modalReturn=null;
  }
  const addButtons=(target,items)=>{
    const actions=make("div","session-actions");
    for(const item of items)actions.append(button(item.label,item.action,item.id,item.className||"session-button"));
    target.append(actions);
  };
  function sessionNewChat(temporary=false){
    if(abort)abort.abort();
    abort=null;pending=null;current=null;
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
    const chat={id:nextId(),title:firstMessage.slice(0,55)||"Новый чат",
      messages:[],pinned:false,projectId:null,temporary};
    threads.unshift(chat);displayThread(chat);
    return chat;
  }
  function renderSessionHistory(){
    const list=$("#historyList"),recent=$("#recentChats");
    list.replaceChildren();recent.replaceChildren();
    const search=($("#historySearch").value||"").trim().toLocaleLowerCase();
    const shown=threads.filter(c=>!c.temporary && (
      c.title.toLocaleLowerCase().includes(search) ||
      c.messages.some(m=>m.content.toLocaleLowerCase().includes(search))
    )).sort((a,b)=>Number(b.pinned)-Number(a.pinned));
    if(!shown.length){
      const empty=make("div","empty-card");
      empty.append(make("h2","","Нет чатов"),make("p","","Разговоры хранятся только пока открыта эта вкладка. После перезагрузки они исчезнут."));
      list.append(empty);recent.append(make("div","sidebar-empty","Нет временной истории"));
      return;
    }
    for(const c of shown){
      const card=make("div","session-chat-row"+(c.id===current?" active":""));
      const name=button((c.pinned?"📌 ":"")+c.title,"open-chat",c.id,"session-chat-name");
      card.append(name);
      const ops=make("div","session-chat-ops");
      ops.append(
        button(c.pinned?"Открепить":"Закрепить","pin-chat",c.id),
        button("Название","rename-chat",c.id),
        button("Проект","assign-chat",c.id),
        button("Удалить","delete-chat",c.id,"session-button session-danger")
      );
      card.append(ops);list.append(card);
    }
    for(const c of shown.slice(0,6)){
      const entry=button((c.pinned?"📌 ":"")+c.title,"open-chat",c.id,"recent-item session-recent");
      recent.append(entry);
    }
  }
  function renderSessionChat(){
    baseRenderChat();
    const chat=selected();
    if(!chat)return;
    const bubbles=Array.from($("#chatMessages").children);
    chat.messages.forEach((message,i)=>{
      const bubble=bubbles[i];if(!bubble)return;
      message.id||=nextId();
      const actions=make("div","session-message-actions");
      const copy=button("Копировать","copy-message",message.id);
      actions.append(copy);
      if(message.role==="user")actions.append(button("Изменить","edit-message",message.id));
      if(message.role==="assistant"){
        const up=button("👍","rate-up",message.id),down=button("👎","rate-down",message.id);
        if(message.rating==="up")up.classList.add("selected");
        if(message.rating==="down")down.classList.add("selected");
        actions.append(up,down);
      }
      actions.append(button("Ответвить","branch-message",message.id));
      bubble.append(actions);
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
      target.append(empty);return;
    }
    for(const project of projects){
      const card=make("section","session-project-card");
      const header=make("div","session-project-title");
      header.append(make("h2","",project.name),make("small","",threads.filter(c=>c.projectId===project.id).length+" чатов"));
      card.append(header);
      const chats=threads.filter(c=>c.projectId===project.id&&!c.temporary);
      if(!chats.length)card.append(make("p","session-help","Пока нет чатов в этом проекте."));
      for(const c of chats)card.append(button("↳ "+c.title,"open-chat",c.id,"session-project-chat"));
      addButtons(card,[{label:"Переименовать",action:"rename-project",id:project.id},
        {label:"Удалить проект",action:"delete-project",id:project.id,className:"session-button session-danger"}]);
      target.append(card);
    }
    const ungrouped=threads.filter(c=>!c.projectId&&!c.temporary);
    if(ungrouped.length){
      const box=make("section","session-project-card");
      box.append(make("h2","","Без проекта"));
      for(const c of ungrouped)box.append(button("↳ "+c.title,"open-chat",c.id,"session-project-chat"));
      target.append(box);
    }
  }
  async function copyValue(value){
    try{
      await navigator.clipboard.writeText(value);
      notify("Текст скопирован.");
    }catch{
      openDialog("Скопировать текст","Выдели текст ниже и скопируй его.",body=>{
        const area=make("textarea","session-textarea");area.value=value;area.readOnly=true;
        body.append(area);area.select();
      });
    }
  }
  const allowRemote=()=>{
    const hostname=location.hostname;
    return (location.protocol==="https:"||hostname==="localhost"||hostname==="127.0.0.1")
      && !/raw\.githack\.com|github\.io|htmlpreview\.github\.io|github\.com|raw\.githubusercontent\.com/.test(hostname)
      && !location.pathname.endsWith("/preview.html");
  };
  async function runAI(chat){
    if(!allowRemote()){
      showStatus("Предпросмотр: настоящий GPT-OSS 120B ещё не подключён. Сообщения никуда не отправляются.");
      return;
    }
    if(abort){notify("Завершите предыдущий запрос.");return}
    const controller=new AbortController();abort=controller;pending=chat.id;
    const stop=$("#sessionStop");stop.hidden=false;$("#sendButton").disabled=true;
    showStatus("Анализирую запрос…");
    const history=chat.messages.filter(m=>m.role==="user"||m.role==="assistant").slice(-16)
      .map(m=>({role:m.role,content:m.content.slice(0,4000)}));
    try{
      const response=await fetch("/api/chat",{
        method:"POST",headers:{"content-type":"application/json"},
        credentials:"same-origin",signal:controller.signal,
        body:JSON.stringify({messages:history,effort:state.reason,instructions:personalInstructions})
      });
      let data=null;try{data=await response.json()}catch{}
      if(!response.ok){
        if(data?.code==="AI_QUOTA_EXHAUSTED")showStatus("Лимит ИИ исчерпан. Бесплатный дневной лимит закончился. Попробуйте позже, когда он обновится.",true);
        else if(data?.code==="ACCESS_REQUIRED")showStatus("Для настоящего ИИ необходим защищённый доступ. Сейчас модель недоступна.");
        else showStatus(data?.message||"Ответ ИИ сейчас недоступен. Попробуйте позже.");
        return;
      }
      if(!data||typeof data.text!=="string"||!data.text.trim())throw new Error("EMPTY_RESPONSE");
      chat.messages.push({id:nextId(),role:"assistant",content:data.text.trim()});
      if(current===chat.id){displayThread(chat);renderChat()}
      showStatus("");
    }catch(e){
      if(e?.name==="AbortError")showStatus("Генерация ответа остановлена.");
      else showStatus("Не удалось получить ответ ИИ. Проверьте подключение или повторите позже.");
    }finally{
      if(abort===controller){abort=null;pending=null;stop.hidden=true;resizeInput()}
    }
  }
  function sendMessage(){
    const text=composeText();if(!text||abort)return;
    const chat=selected()||newThread(text);
    chat.messages.push({id:nextId(),role:"user",content:text});
    displayThread(chat);
    $("#messageInput").value="";resizeInput();
    renderChat();renderHistory();showScreen("chat");runAI(chat);
  }
  function textDialog(title,label,value,onSave){
    openDialog(title,"",body=>{
      const field=make("input","session-input");field.type="text";field.maxLength=100;
      field.value=value;field.setAttribute("aria-label",label);
      body.append(field);
      const save=button("Сохранить","dialog-save",null,"session-primary");
      save.addEventListener("click",()=>{const next=field.value.trim();if(!next){notify("Введите название.");return}onSave(next);closeDialog()});
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
  function handle(action,id){
    const chat=threads.find(c=>c.id===id);
    const project=projects.find(p=>p.id===id);
    if(action==="open-chat"&&chat){displayThread(chat);renderChat();renderHistory();showScreen("chat");return}
    if(action==="rename-chat"&&chat){textDialog("Переименовать чат","Название",chat.title,v=>{chat.title=v;renderHistory();renderSessionProjects()});return}
    if(action==="pin-chat"&&chat){chat.pinned=!chat.pinned;renderHistory();return}
    if(action==="delete-chat"&&chat){confirmDialog("Удалить чат?","Сообщения будут удалены из текущей вкладки.",()=>{
      const i=threads.indexOf(chat);threads.splice(i,1);
      if(current===chat.id){displayThread(null);showScreen("welcome");renderChat()}
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
    if(action==="new-project"){textDialog("Новый проект","Название проекта","",name=>{
      projects.push({id:nextId(),name});renderSessionProjects();
    });return}
    if(action==="rename-project"&&project){textDialog("Название проекта","Название",project.name,name=>{
      project.name=name;renderSessionProjects();
    });return}
    if(action==="delete-project"&&project){confirmDialog("Удалить проект?","Чаты не удалятся, они перейдут в раздел «Без проекта».",()=>{
      const i=projects.indexOf(project);projects.splice(i,1);
      for(const c of threads)if(c.projectId===project.id)c.projectId=null;
      renderSessionProjects();renderHistory();
    });return}
    if(action==="copy-message"||action==="edit-message"||action==="rate-up"||action==="rate-down"||action==="branch-message"){
      const c=selected(),index=c?.messages.findIndex(m=>m.id===id)??-1;
      if(index<0)return;
      const m=c.messages[index];
      if(action==="copy-message"){copyValue(m.content);return}
      if(action==="edit-message"&&m.role==="user"){
        openDialog("Изменить сообщение","Ответы, отправленные после этого сообщения, будут удалены из текущей ветки.",body=>{
          const area=make("textarea","session-textarea");area.value=m.content;area.maxLength=4000;
          body.append(area);
          const save=button("Сохранить","dialog-save",null,"session-primary");
          save.addEventListener("click",()=>{
            const value=area.value.trim();if(!value){notify("Сообщение не может быть пустым.");return}
            m.content=value;c.messages.splice(index+1);closeDialog();renderChat();renderHistory();
            showStatus("Сообщение изменено. Отправьте новый запрос, чтобы получить новый ответ.");
          });body.append(save);
        });return;
      }
      if(action==="rate-up"||action==="rate-down"){
        m.rating=m.rating===(action==="rate-up"?"up":"down")?null:(action==="rate-up"?"up":"down");renderChat();return
      }
      if(action==="branch-message"){
        const copy=c.messages.slice(0,index+1).map(v=>({...v,id:nextId()}));
        const branch={id:nextId(),title:"Ветка: "+c.title.slice(0,45),messages:copy,
          pinned:false,projectId:c.projectId,temporary:false};
        threads.unshift(branch);displayThread(branch);renderChat();renderHistory();showScreen("chat");
        notify("Создана независимая ветка переписки.");return;
      }
    }
    if(action==="stop"){abort?.abort();return}
    if(action==="temp-toggle"){
      sessionNewChat(Boolean($("#sessionTemporary").checked));return;
    }
    if(action==="export"){
      const c=selected();
      if(!c||!c.messages.length){notify("Для экспорта сначала добавьте сообщения.");return}
      download("Kaz-AI-chat.txt",exportText(c),"text/plain;charset=utf-8");notify("Переписка скачана.");return;
    }
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
  function compute(expression){
    const input=expression.replaceAll(",",".").replace(/\s/g,"");
    if(input.length>150||!input)throw Error("INVALID");
    const matches=input.match(/(?:\d+(?:\.\d+)?|\.\d+|[()+*/-])/g);
    if(!matches||matches.join("")!==input)throw Error("INVALID");
    let i=0;
    const factor=()=>{
      if(matches[i]==="-"){i++;return -factor()}
      if(matches[i]==="+"){i++;return factor()}
      if(matches[i]==="("){i++;const result=sum();if(matches[i++]!==")")throw Error("BRACKETS");return result}
      const token=matches[i++];if(!token||!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(token))throw Error("INVALID");
      return Number(token);
    };
    const product=()=>{
      let v=factor();
      while(matches[i]==="*"||matches[i]==="/"){
        const op=matches[i++],right=factor();
        if(op==="/"&&right===0)throw Error("ZERO");
        v=op==="*"?v*right:v/right;
      }return v;
    };
    const sum=()=>{
      let v=product();
      while(matches[i]==="+"||matches[i]==="-"){
        const op=matches[i++],right=product();v=op==="+"?v+right:v-right
      }return v;
    };
    const answer=sum();
    if(i!==matches.length||!Number.isFinite(answer))throw Error("INVALID");
    return Math.round((answer+Number.EPSILON)*1e9)/1e9;
  }
  function showCalculator(){
    openDialog("Простой калькулятор","Поддерживает +, −, ×, ÷ и скобки. Не использует ИИ.",body=>{
      const field=make("input","session-input");field.type="text";field.inputMode="decimal";
      field.value="(15 + 7) × 2";field.setAttribute("aria-label","Выражение");
      const output=make("output","session-calc-output","Результат появится здесь");
      const submit=button("Рассчитать","calc-run",null,"session-primary");
      submit.addEventListener("click",()=>{
        try{output.textContent="Ответ: "+compute(field.value.replaceAll("×","*").replaceAll("÷","/"))}
        catch(e){output.textContent=e.message==="ZERO"?"На ноль делить нельзя.":"Проверьте математическое выражение."}
      });
      field.addEventListener("keydown",e=>{if(e.key==="Enter"){e.preventDefault();submit.click()}});
      body.append(field,submit,output);
    });
  }
  function setup(){
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
    const overlay=make("div","session-overlay");overlay.id="sessionOverlay";overlay.hidden=true;
    const dialog=make("section","session-dialog");dialog.setAttribute("role","dialog");dialog.setAttribute("aria-modal","true");dialog.setAttribute("aria-labelledby","sessionTitle");
    const close=button("×","dialog-close",null,"session-dialog-close");close.id="sessionClose";
    const title=make("h2","");title.id="sessionTitle";
    const body=make("div","session-dialog-body");body.id="sessionBody";
    dialog.append(close,title,body);overlay.append(dialog);document.body.append(overlay);
    const stop=button("Остановить","stop",null,"session-stop");
    stop.id="sessionStop";stop.hidden=true;
    $("#sendButton").parentElement.insertBefore(stop,$("#sendButton"));
    document.addEventListener("click",e=>{
      const target=e.target.closest("[data-session]");if(!target)return;
      const action=target.dataset.session;
      if(action==="dialog-close"){closeDialog();return}
      if(["dialog-save","dialog-confirm","calc-run"].includes(action))return;
      handle(action,target.dataset.id||null);
    },true);
    checkbox.addEventListener("change",()=>handle("temp-toggle"));
    overlay.addEventListener("click",e=>{if(e.target===overlay)closeDialog()});
    document.addEventListener("keydown",e=>{
      if(e.key==="Escape"&&!overlay.hidden){e.preventDefault();e.stopImmediatePropagation();closeDialog()}
    },true);
    window.addEventListener("beforeunload",()=>{abort?.abort()});
    renderHistory();renderSessionProjects();
  }
  renderHistory=renderSessionHistory;
  renderChat=renderSessionChat;
  renderTools=function(query=""){
    baseRenderTools(query);
    const calc=$("#toolGroups [data-feature='tool-25']");if(calc){
      calc.setAttribute("aria-label","Простой калькулятор, работает без ИИ");
      const status=calc.querySelector("small");if(status)status.textContent="Работает";
    }
  };
  showFeature=function(key){
    if(key==="tool-25"){showCalculator();return}
    if(key==="export"){handle("export");return}
    if(key==="instructions"){handle("instructions");return}
    if(key==="projects"){showScreen("projects");handle("new-project");return}
    baseShowFeature(key);
  };
  showScreen=function(name){
    baseShowScreen(name);
    if(name==="projects")renderSessionProjects();
  };
  newChat=function(){sessionNewChat(false)};
  submitMessage=sendMessage;
  renderHistory();renderChat();renderTools();
  setup();
  window.KazSession={snapshot:()=>({
    threads:threads.map(c=>({id:c.id,title:c.title,messages:c.messages.length,pinned:c.pinned,temporary:c.temporary,projectId:c.projectId})),
    projects:projects.map(p=>({id:p.id,name:p.name})),active:current
  }),compute};
})();
