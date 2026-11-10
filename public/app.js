"use strict";
/**
 * Kaz AI — interface-only prototype.
 * No AI/API/auth/database calls. No persistent chat or personal data.
 */
const FEATURE_GROUPS = [
  {title:"Чаты и переписки",items:[
    [1,"Новый чат","Начать новую переписку","chat"],
    [2,"История чатов","Вернуться к предыдущим разговорам","chat"],
    [3,"Поиск по перепискам","Найти разговор по словам","chat"],
    [4,"Переименовать чат","Изменить название переписки","chat"],
    [5,"Удалить чат","Убрать ненужную переписку","chat"],
    [6,"Закрепить чат","Держать важное наверху","chat"],
    [7,"Папки и проекты","Группировать разговоры","folder"],
    [9,"Повторить ответ","Попросить ответ заново","chat"],
    [10,"Остановить ответ","Прервать генерацию","chat"],
    [13,"Оценка ответа","Лайк или дизлайк","chat"]
  ]},
  {title:"Интеллектуальные возможности",items:[
    [15,"Обычный чат","Разговор с GPT-OSS 120B","brain"],
    [16,"Уровни рассуждения","Низкий, средний, высокий и углублённый","brain"],
    [17,"Поиск в интернете","Свежие сведения из интернета — в конце разработки","search"],
    [18,"Источники информации","Ссылки на проверенные страницы — в конце разработки","search"],
    [19,"Глубокое исследование","Большое исследование — позже","brain"],
    [20,"Выбор модели ИИ","Выбирать модель вручную","brain"],
    [21,"Автоматический выбор ИИ","Назначать модель по типу задачи","brain"],
    [22,"Переводчик","Переводить между языками","globe"],
    [23,"Программирование","Помощь с кодом и ошибками","file"],
    [24,"Работа с документами","Подготовка текстов и документов","file"],
    [25,"Анализ и расчёты","Сначала простые, позже сложные","brain"]
  ]},
  {title:"Изображения, файлы и голос",items:[
    [27,"Прикрепить файл","Передать PDF, Word или текст","file"],
    [28,"Прикрепить фотографию","Анализ изображения с Gemma 4","image"],
    [29,"Создать картинку","Генерация с FLUX","image"],
    [30,"Редактировать картинку","Изменения готового изображения с FLUX","image"],
    [31,"Скачать картинку","Сохранить результат на устройство","image"],
    [32,"Голосовой ввод","Надиктовать текст через Whisper","mic"],
    [33,"Озвучить ответ","Послушать ответ вслух","mic"],
    [34,"Голосовой разговор","Живой разговор с ИИ","mic"],
    [35,"Расшифровка аудио","Превратить запись в текст с Whisper","mic"],
    [36,"Анализ видео","Понимать содержимое видеороликов","image"],
    [37,"Создание файлов","Скачивать PDF, Word, Excel, TXT, CSV","file"],
    [38,"Редактор рядом с чатом","Править текст и код отдельно от переписки","edit"]
  ]},
  {title:"Настройки и дополнительные возможности",items:[
    [39,"Память ИИ","Запоминание предпочтений — позже","brain"],
    [40,"Личные инструкции","Правила общения с ИИ","settings"],
    [41,"Временный чат","Переписка без постоянной истории","chat"],
    [42,"Светлая и тёмная тема","Два варианта оформления","settings"],
    [43,"Язык интерфейса","Русский, казахский, английский","globe"],
    [44,"Размер текста","Удобное чтение","settings"],
    [45,"Экспорт истории","Скачать свои разговоры","file"],
    [46,"Подключение других сервисов","Интеграции — только по отдельному разрешению","grid"]
  ]}
];
const REASONS = Object.freeze({
  low:{name:"Низкий",hint:"Быстрые ответы"},
  medium:{name:"Средний",hint:"Баланс скорости и анализа"},
  high:{name:"Высокий",hint:"Подробные рассуждения"},
  deep:{name:"Углублённый",hint:"Максимально глубокий анализ"}
});
const state = {screen:"welcome",reason:"medium",chat:[],draftTitle:"Новый чат",light:false,dialogTrigger:null,toastTimer:null};
const $ = selector => document.querySelector(selector);
const $$ = selector => Array.from(document.querySelectorAll(selector));
const viewNames = ["welcome","chat","history","projects","tools","settings","about"];
const viewLabels = {welcome:"Kaz AI",chat:"Переписка",history:"Чаты",projects:"Проекты",tools:"Инструменты",settings:"Настройки",about:"О проекте"};
function icon(id){const svg = document.createElementNS("http://www.w3.org/2000/svg","svg");svg.setAttribute("class","icon");svg.setAttribute("aria-hidden","true");const use = document.createElementNS("http://www.w3.org/2000/svg","use");use.setAttribute("href","#ic-"+id);svg.append(use);return svg}
function node(tag,className,text){const e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=text;return e}
function notify(message){const toast=$("#toast");clearTimeout(state.toastTimer);toast.textContent=message;toast.hidden=false;state.toastTimer=setTimeout(()=>{toast.hidden=true},3800)}
function closePopovers(){
  for(const id of ["attachMenu","reasonMenu","languageMenu","settingsLanguageMenu","fontMenu"]){const panel=$("#"+id);if(panel)panel.hidden=true}
  for(const id of ["attachToggle","reasonToggle","languageToggle","settingsLanguageToggle","fontToggle"]){const button=$("#"+id);if(button)button.setAttribute("aria-expanded","false")}
}
function togglePopover(kind,trigger){
  let menuId,button;
  if(kind==="language"){button=trigger&&trigger.closest('[data-action="toggle-language"]')||$("#languageToggle");menuId=button.id==="settingsLanguageToggle"?"settingsLanguageMenu":"languageMenu"}
  else if(kind==="font"){button=$("#fontToggle");menuId="fontMenu"}
  else{menuId=kind+"Menu";button=$("#"+(kind==="attach"?"attachToggle":"reasonToggle"))}
  const menu=$("#"+menuId);if(!menu||!button)return;
  const opening=menu.hidden;closePopovers();
  if(opening){menu.hidden=false;button.setAttribute("aria-expanded","true")}
}
function setDrawer(open){const sidebar=$("#sidebar");const scrim=$("#drawerScrim");sidebar.classList.toggle("open",open);scrim.hidden=!open;const toggle=$('[data-action="toggle-sidebar"]');toggle.setAttribute("aria-expanded",String(open))}
function showScreen(screen){if(!viewNames.includes(screen))return;if(screen==="about"&&state.screen!=="about"){state.aboutReturnScreen=state.screen;state.aboutReturnScroll=$("#mainContent").scrollTop}state.screen=screen;document.body.classList.toggle("is-about-screen",screen==="about");viewNames.forEach(name=>{$("#view-"+name).hidden=name!==screen});$("#pageTitle").textContent=viewLabels[screen];$$(".primary-nav [data-screen]").forEach(button=>{
  const active=button.dataset.screen===screen;
  button.classList.toggle("active",active);
  if(active)button.setAttribute("aria-current","page");
  else button.removeAttribute("aria-current");
});closePopovers();setDrawer(false);if(screen!=="chat"&&screen!=="about")$("#statusBanner").hidden=true;$("#mainContent").scrollTop=0;window.KazI18n?.refresh()}
function newChat(){state.chat=[];state.draftTitle="Новый чат";$("#statusBanner").hidden=true;renderChat();renderHistory();showScreen("welcome");$("#messageInput").value="";resizeInput();$("#messageInput").focus()}
function resizeInput(){const input=$("#messageInput");input.style.height="auto";input.style.height=Math.min(input.scrollHeight,176)+"px";$("#sendButton").disabled=!input.value.trim()}
function addChatMessage(role,content){const item={role,content};state.chat.push(item);renderChat();renderHistory();return item}
function renderChat(){const target=$("#chatMessages");target.replaceChildren();for(const message of state.chat){const bubble=node("div","message message-"+message.role);if(message.role==="assistant"){const label=node("div","message-label");const mark=document.createElementNS("http://www.w3.org/2000/svg","svg");mark.setAttribute("class","brand-mark");mark.setAttribute("aria-hidden","true");const use=document.createElementNS("http://www.w3.org/2000/svg","use");use.setAttribute("href","#logo-mark");mark.append(use);label.append(mark,node("span","","Kaz AI"));bubble.append(label)}bubble.append(node("span","",message.content));target.append(bubble)}$("#mainContent").scrollTop=$("#mainContent").scrollHeight}
function submitMessage(){if(window.KazSession?.sendMessage){window.KazSession.sendMessage();return}const input=$("#messageInput");const value=input.value.trim();if(!value)return;if(state.chat.length===0)state.draftTitle=value.slice(0,52);addChatMessage("user",value);input.value="";resizeInput();showScreen("chat");const banner=$("#statusBanner");banner.textContent="Оболочка готова. Ответ нейросети пока недоступен: GPT-OSS 120B подключим на следующем этапе.";banner.hidden=false;notify("Сообщение показано только в демо. На сервер ничего не отправлено.");$("#mainContent").scrollTop=$("#mainContent").scrollHeight}
function renderHistory(){const target=$("#historyList"),recent=$("#recentChats");recent.replaceChildren();const search=($("#historySearch").value||"").trim().toLocaleLowerCase();const has=state.chat.some(m=>m.role==="user")&&state.draftTitle.toLocaleLowerCase().includes(search);if(!has){const empty=node("div","empty-card");empty.append(icon("chat"),node("h2","","Пока нет сохранённых переписок"),node("p","","На этом этапе разговоры существуют только в текущем открытом сеансе. Постоянное хранение подключим позже."));target.replaceChildren(empty);const hint=node("div","sidebar-empty","История пока не сохраняется");recent.append(hint);return}const card=node("button","history-card subtle-cta",state.draftTitle+" · демо-сеанс");card.type="button";card.addEventListener("click",()=>showScreen("chat"));target.replaceChildren(card);const entry=node("button","recent-item");entry.type="button";entry.append(icon("chat"),node("span","",state.draftTitle));entry.addEventListener("click",()=>showScreen("chat"));recent.append(entry)}
function renderTools(query=""){const target=$("#toolGroups");target.replaceChildren();const value=query.toLocaleLowerCase().trim();let total=0;for(const group of FEATURE_GROUPS){const list=group.items.filter(item=>{
  const translate=window.KazI18n?.translate;
  return [item[1],item[2],translate?.(item[1]),translate?.(item[2])]
    .filter(Boolean).join(" ").toLocaleLowerCase().includes(value);
});if(!list.length)continue;total+=list.length;const section=node("section","tool-group");const title=node("h2","tool-group-title");title.append(node("span","",group.title),node("small","",list.length+" функций"));section.append(title);const grid=node("div","tool-grid");for(const [number,name,description,iconName] of list){const card=node("button","tool-card");card.type="button";card.dataset.feature="tool-"+number;card.setAttribute("aria-label",name+", функция будет подключена позже");const head=node("div","tool-card-top");head.append(icon(iconName),node("small","","В плане"));card.append(head,node("strong","",name),node("p","",description));grid.append(card)}section.append(grid);target.append(section)}if(!total)target.append(node("p","","Ничего не найдено"))}
function selectReason(value){
  if(!Object.prototype.hasOwnProperty.call(REASONS,value)||value==="deep"){
    featureModal("Углублённый уровень","Кнопка предусмотрена. Дополнительные этапы анализа и проверки ответа будут разработаны только по вашему разрешению.");return;
  }
  state.reason=value;
  $("#currentReason").textContent=REASONS[value].name;
  $$("[data-reason]").forEach(btn=>{
    const active=btn.dataset.reason===value;
    btn.classList.toggle("selected",active);
    if(value!=="deep")btn.setAttribute("aria-pressed",String(active));
  });
  closePopovers();
  const lang=window.KazI18n?.language||"ru";
  const label=window.KazI18n?.translate?.(REASONS[value].name)||REASONS[value].name;
  if(lang==="en")notify('Reasoning level: '+label+'. This will apply when the AI is connected.');
  else if(lang==="kk")notify('Ойлау деңгейі: '+label+'. ЖИ қосылғанда қолданылады.');
  else notify("Выбран уровень «"+label+"». Подключение к модели — на следующем этапе.");
}
function toggleTheme(){
  state.light=!state.light;
  document.body.classList.toggle("light",state.light);
  $("#themeLabel").textContent=state.light?"Светлая":"Тёмная";
  $$('[data-action="toggle-theme"]').forEach(button=>button.setAttribute("aria-pressed",String(state.light)));
  $$(".icon-theme use").forEach(use=>use.setAttribute("href",state.light?"#ic-moon":"#ic-sun"));
}
const languages={ru:"Русский",kk:"Қазақша",en:"English"};
function selectLanguage(value){
  if(!Object.prototype.hasOwnProperty.call(languages,value))return;
  state.language=value;
  $$(".language-current").forEach(el=>{el.textContent=languages[value]});
  $$("[data-language]").forEach(el=>el.classList.toggle("selected",el.dataset.language===value));
  closePopovers();
  window.KazI18n?.set(value);
  renderHistory();
  renderTools($("#toolsSearch").value);
  notify("Язык интерфейса: "+languages[value]);
}
function selectFont(value){
  if(!["small","normal","large"].includes(value))return;
  document.body.classList.remove("font-small","font-large");
  if(value!=="normal")document.body.classList.add("font-"+value);
  $("#fontLabel").textContent={small:"Компактный",normal:"Обычный",large:"Крупный"}[value];
  $$("[data-font]").forEach(el=>{
    const active=el.dataset.font===value;
    el.classList.toggle("selected",active);
    el.setAttribute("aria-pressed",String(active));
  });
  closePopovers();
  notify("Выбран размер текста для предпросмотра.");
}
function openGoogle(){
  state.dialogTrigger=document.activeElement;
  closePopovers();
  $("#googleOverlay").hidden=false;
  $(".google-close").focus();
}
function closeGoogle(){
  $("#googleOverlay").hidden=true;
  if(state.dialogTrigger&&typeof state.dialogTrigger.focus==="function")state.dialogTrigger.focus();
  state.dialogTrigger=null;
}
const featureDescriptions={
  google:["Вход через Google","Здесь будет настоящая регистрация через Google. Пока авторизация не подключена: никакие данные аккаунта не запрашиваются."],
  languages:["Выбор языка","Интерфейс на русском, казахском и английском добавим после согласования текстов и навигации."],
  font:["Размер текста","Настройки размера шрифта будут подключены на этапе простых функций."],
  instructions:["Личные инструкции","Пользователь сможет указать, как Kaz AI должен отвечать. Пока эта функция не сохраняет данные."],
  memory:["Память ИИ","Вопрос хранения персональной памяти отложен до вашего отдельного решения."],
  export:["Экспорт истории","Кнопка готова в интерфейсе. Настоящий экспорт подключим после появления надёжной истории."],
  projects:["Папки и проекты","Обычные папки будут работать без общих файлов, памяти и сложных настроек. Сейчас показан только раздел."],
  file:["Прикрепить файл","Загрузку PDF, Word и других документов добавим после готовности текстовых возможностей."],
  photo:["Прикрепить фотографию","Позже здесь можно будет выбрать фото и передать его модели зрения Gemma 4."],
  "image-create":["Создать изображение","Генерацию изображений с FLUX подключим на отдельном, согласованном этапе."],
  audio:["Аудиозапись","Позже здесь появится загрузка или запись аудио с распознаванием через Whisper."],
  mic:["Голосовой ввод","Позже можно будет нажать микрофон, надиктовать сообщение, проверить текст и отправить его вручную."],
  "deep-reason":["Углублённый уровень","Четвёртый режим покажем в интерфейсе, но дополнительный многоэтапный анализ не включаем до вашего разрешения."]
};
function featureModal(title,description){state.dialogTrigger=document.activeElement;$("#modalTitle").textContent=title;$("#modalDescription").textContent=description;$("#modalOverlay").hidden=false;closePopovers();$(".modal-close").focus()}
function closeModal(){$("#modalOverlay").hidden=true;if(state.dialogTrigger&&typeof state.dialogTrigger.focus==="function")state.dialogTrigger.focus();state.dialogTrigger=null}
function showFeature(key){if(key==="google"){openGoogle();return}if(key==="languages"){togglePopover("language",$("#languageToggle"));return}const data=featureDescriptions[key];if(data)featureModal(...data);else if(key.startsWith("tool-")){const n=Number(key.slice(5));const item=FEATURE_GROUPS.flatMap(g=>g.items).find(i=>i[0]===n);if(item)featureModal(item[1],item[2]+". Сейчас подготовлена только кнопка и место в интерфейсе. Реализация — на согласованном этапе.")}else featureModal("Функция появится позже","Сейчас разрабатывается только оболочка сайта.")}
function handleAction(action,trigger){switch(action){
  case"home":showScreen("welcome");break;
  case"back-to-chat":showScreen(state.aboutReturnScreen||"welcome");$("#mainContent").scrollTop=state.aboutReturnScroll||0;break;
  case"new-chat":newChat();break;
  case"close-sidebar":setDrawer(false);break;
  case"toggle-sidebar":setDrawer(!$("#sidebar").classList.contains("open"));break;
  case"toggle-theme":toggleTheme();break;
  case"toggle-attach":togglePopover("attach",trigger);break;
  case"toggle-reason":togglePopover("reason",trigger);break;
  case"toggle-language":togglePopover("language",trigger);break;
  case"toggle-font":togglePopover("font",trigger);break;
  case"close-modal":closeModal();break;
  case"close-google":closeGoogle();break;
  case"google-demo":notify("Это демонстрация. Вход через Google пока не подключён.");break;
}}
document.addEventListener("click",event=>{
  const action=event.target.closest("[data-action]");const screen=event.target.closest("[data-screen]");const reason=event.target.closest("[data-reason]");const feature=event.target.closest("[data-feature]");
  const lang=event.target.closest("[data-language]");const font=event.target.closest("[data-font]");
  if(lang){selectLanguage(lang.dataset.language);return}
  if(font){selectFont(font.dataset.font);return}
  if(action){handleAction(action.dataset.action,action);return}
  if(screen){showScreen(screen.dataset.screen);return}
  if(reason){selectReason(reason.dataset.reason);return}
  if(feature){showFeature(feature.dataset.feature);return}
  if(event.target===$("#modalOverlay")){closeModal();return}
  if(event.target===$("#googleOverlay")){closeGoogle();return}
  if(!event.target.closest(".popover-anchor"))closePopovers();
});
document.addEventListener("keydown",event=>{
  if(event.key==="Escape"){if(!$("#googleOverlay").hidden){closeGoogle();return}if(!$("#modalOverlay").hidden){closeModal();return}closePopovers();setDrawer(false)}
  if(!$("#googleOverlay").hidden&&event.key==="Tab"){
    const controls=$$("#googleOverlay button:not([disabled])");const first=controls[0],last=controls[controls.length-1];
    if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}
    else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}
    return;
  }
  if(!$("#modalOverlay").hidden&&event.key==="Tab"){const controls=$$("#modalOverlay button:not([disabled])");const first=controls[0],last=controls[controls.length-1];if(event.shiftKey&&document.activeElement===first){event.preventDefault();last.focus()}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus()}}
});
$("#drawerScrim").addEventListener("click",()=>setDrawer(false));
$("#messageInput").addEventListener("input",resizeInput);
$("#messageInput").addEventListener("keydown",event=>{if(event.key==="Enter"&&!event.shiftKey&&!event.isComposing){event.preventDefault();submitMessage()}});
$("#sendButton").addEventListener("click",submitMessage);
$("#historySearch").addEventListener("input",()=>renderHistory());
$("#toolsSearch").addEventListener("input",event=>renderTools(event.target.value));
const banner=$("#statusBanner");
$("#messageInput").addEventListener("input",()=>{
  if($("#sessionStop")?.hidden===false||$("#sessionRetry")?.hidden===false)return;
  banner.hidden=true;
});
renderTools();renderHistory();renderChat();$("#currentReason").textContent="Средний";$$("[data-reason]").forEach(button=>{const selected=button.dataset.reason==="medium";button.classList.toggle("selected",selected);if(button.dataset.reason!=="deep")button.setAttribute("aria-pressed",String(selected))});resizeInput();showScreen("welcome");
