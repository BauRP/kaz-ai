"use strict";
/* Kaz AI internal settings shell. Payment, identity and security are UI-only.
   Never manufacture account details, token balances or payment-card digits. */
(function(){
  const qs=(s,root=document)=>root.querySelector(s);
  const qa=(s,root=document)=>Array.from(root.querySelectorAll(s));
  const languages=[
    ["en","English"],["ru","Русский"],["kk","Қазақ тілі"],["pt","Português"],
    ["es","Español"],["fr","Français"],["ar","العربية"],["zh","中文"],
    ["ko","한국어"],["ja","日本語"],["de","Deutsch"],["it","Italiano"],
    ["tr","Türkçe"],["pl","Polski"],["hi","हिन्दी"],["vi","Tiếng Việt"],
    ["id","Bahasa Indonesia"]
  ];
  const languageNames=Object.fromEntries(languages);
  const codes=new Set(Object.keys(languageNames));
  const labels={
    ru:["внутренности настроек","Общие","Учётная запись","Безопасность и вход","Использование","Оплата","Внешний вид","Уведомления","Автоматически"],
    en:["Internal settings","General","Account","Security & sign-in","Usage","Billing","Appearance","Notifications","Automatic"],
    kk:["Ішкі параметрлер","Жалпы","Есептік жазба","Қауіпсіздік және кіру","Пайдалану","Төлем","Сыртқы көрініс","Хабарландырулар","Автоматты"],
    pt:["Configurações internas","Geral","Conta","Segurança e login","Uso","Pagamentos","Aparência","Notificações","Automático"],
    es:["Configuración interna","General","Cuenta","Seguridad e inicio de sesión","Uso","Facturación","Apariencia","Notificaciones","Automático"],
    fr:["Paramètres internes","Général","Compte","Sécurité et connexion","Utilisation","Facturation","Apparence","Notifications","Automatique"],
    ar:["الإعدادات الداخلية","عام","الحساب","الأمان وتسجيل الدخول","الاستخدام","الفوترة","المظهر","الإشعارات","تلقائي"],
    zh:["内部设置","常规","账户","安全与登录","使用情况","账单","外观","通知","自动"],
    ko:["내부 설정","일반","계정","보안 및 로그인","사용량","결제","모양","알림","자동"],
    ja:["内部設定","一般","アカウント","セキュリティとログイン","使用状況","請求","外観","通知","自動"],
    de:["Interne Einstellungen","Allgemein","Konto","Sicherheit und Anmeldung","Nutzung","Abrechnung","Aussehen","Benachrichtigungen","Automatisch"],
    it:["Impostazioni interne","Generale","Account","Sicurezza e accesso","Utilizzo","Fatturazione","Aspetto","Notifiche","Automatico"],
    tr:["Dahili ayarlar","Genel","Hesap","Güvenlik ve giriş","Kullanım","Ödeme","Görünüm","Bildirimler","Otomatik"],
    pl:["Ustawienia wewnętrzne","Ogólne","Konto","Bezpieczeństwo i logowanie","Wykorzystanie","Płatności","Wygląd","Powiadomienia","Automatycznie"],
    hi:["आंतरिक सेटिंग्स","सामान्य","खाता","सुरक्षा और साइन-इन","उपयोग","बिलिंग","दिखावट","सूचनाएँ","स्वचालित"],
    vi:["Cài đặt nội bộ","Chung","Tài khoản","Bảo mật và đăng nhập","Sử dụng","Thanh toán","Giao diện","Thông báo","Tự động"],
    id:["Pengaturan internal","Umum","Akun","Keamanan & masuk","Penggunaan","Penagihan","Tampilan","Notifikasi","Otomatis"]
  };

  // Translate authored UI strings, never user data or account information.
  // EN is a readable fallback until all 17 locale dictionaries are complete.
  const copy={
    "Параметры интерфейса работают в этом браузере. Аккаунт, платежи и безопасность подключим позже.":["Interface preferences work in this browser. Accounts, payments and security will be connected later.","Интерфейс баптаулары осы браузерде жұмыс істейді. Аккаунт, төлемдер және қауіпсіздік кейін қосылады."],
    "Язык интерфейса":["Interface language","Интерфейс тілі"],
    "Автоматически по языку браузера или выбранный вручную. Полный перевод остальных экранов добавляется постепенно.":["Use your browser language or choose manually. Other screens are being translated gradually.","Браузер тілін автоматты түрде пайдаланыңыз немесе қолмен таңдаңыз. Қалған экрандар біртіндеп аударылады."],
    "Арабский язык включает направление справа налево. Для остальных экранов пока используется английский перевод там, где нет перевода выбранного языка.":["Arabic enables right-to-left layout. Other screens use English where a translation is not yet available.","Араб тілі оңнан солға қарай көрсетіледі. Аударма жоқ экрандарда ағылшын тілі пайдаланылады."],
    "Google-вход пока не подключён. Не показываем личные данные со скриншотов как данные действующего аккаунта.":["Google sign-in is not connected. No account information is being simulated.","Google арқылы кіру әлі қосылмаған. Аккаунттың жеке деректері ойдан көрсетілмейді."],
    "Имя":["Name","Аты"],
    "Имя владельца аккаунта":["Account holder's name","Аккаунт иесінің аты"],
    "Имя пользователя":["Username","Пайдаланушы аты"],
    "Уникальное имя в Kaz AI":["Unique Kaz AI username","Kaz AI жүйесіндегі бірегей пайдаланушы аты"],
    "Электронная почта":["Email address","Электрондық пошта"],
    "Адрес подтверждённого аккаунта":["Verified account email","Расталған аккаунттың поштасы"],
    "План":["Plan","Жоспар"],
    "Действующий тариф":["Current subscription plan","Ағымдағы жазылым"],
    "Возраст":["Age","Жас"],
    "Возрастная категория после регистрации":["Age category after registration","Тіркелгеннен кейінгі жас санаты"],
    "Профиль создателя GPT":["GPT creator profile","GPT жасаушысының профилі"],
    "Будущая функция аккаунта":["Future account feature","Аккаунттың болашақ мүмкіндігі"],
    "Удалить учётную запись":["Delete account","Аккаунтты жою"],
    "Появится после подключения аккаунтов":["Available after accounts are enabled","Аккаунттар қосылғаннан кейін қолжетімді"],
    "Удалить":["Delete","Жою"],
    "Не подключено":["Not connected","Қосылмаған"],
    "Без подписки":["No subscription","Жазылым жоқ"],
    "Не указано":["Not provided","Көрсетілмеген"],
    "Данные о входах и устройствах будут доступны только после настоящей авторизации.":["Sign-in and device details will only be available after real account authorization.","Кірулер мен құрылғылар туралы деректер аккаунтқа шынайы кіргеннен кейін қолжетімді болады."],
    "Пароль":["Password","Құпиясөз"],
    "Управление паролем аккаунта":["Manage your account password","Аккаунт құпиясөзін басқару"],
    "Управлять":["Manage","Басқару"],
    "Активные сеансы":["Active sessions","Белсенді сеанстар"],
    "Устройства, на которых открыт аккаунт":["Devices signed in to this account","Аккаунт ашылған құрылғылар"],
    "Просмотреть":["View","Қарау"],
    "История безопасности":["Security history","Қауіпсіздік тарихы"],
    "Входы и выходы с датой и временем":["Sign-ins and sign-outs with date and time","Күні мен уақыты көрсетілген кірулер мен шығулар"],
    "Открыть":["Open","Ашу"],
    "Текущий план":["Current plan","Ағымдағы жоспар"],
    "Бесплатная версия, платные тарифы пока не действуют":["Free version. Paid subscriptions are not yet available.","Тегін нұсқа. Ақылы жазылымдар әзірге қолжетімсіз."],
    "Подключить тариф":["Choose a plan","Жоспарды таңдау"],
    "Использовано токенов":["Tokens used","Пайдаланылған токендер"],
    "Осталось токенов":["Tokens remaining","Қалған токендер"],
    "Запросов за период":["Requests this period","Осы кезеңдегі сұраулар"],
    "Попыток запросов ИИ в этой вкладке":["AI request attempts in this tab","Осы қойындыдағы ЖИ сұрауларының әрекеттері"],
    "Успешных ответов":["Completed responses","Аяқталған жауаптар"],
    "Ошибок запросов":["Failed requests","Қате сұраулар"],
    "Остановлено вручную":["Stopped manually","Қолмен тоқтатылды"],
    "Статистика относится только к этой вкладке и сбрасывается после обновления страницы.":["These counters apply only to this tab and reset on page reload.","Бұл есеп тек осы қойындыға қатысты және бетті жаңартқанда нөлге түседі."],
    "Точная статистика появится после подключения серверного учёта. Сейчас показаны прочерки, а не выдуманные цифры.":["Accurate usage statistics require server-side accounting. Dashes are shown instead of invented numbers.","Нақты статистика серверлік есеп іске қосылғаннан кейін көрсетіледі. Ойдан шығарылған сандардың орнына сызықша көрсетілген."],
    "Оплата и подписки отключены. Никакие деньги не списываются через эти настройки.":["Payments and subscriptions are disabled. These settings cannot charge money.","Төлемдер мен жазылымдар өшірілген. Бұл баптаулар ақша алмайды."],
    "История транзакций":["Transaction history","Төлемдер тарихы"],
    "Платежи и возвраты":["Payments and refunds","Төлемдер мен қайтарымдар"],
    "Информация для выставления счетов":["Billing information","Төлем деректемелері"],
    "Платёжные реквизиты":["Billing details","Төлем деректемелері"],
    "Подключённая карта":["Linked card","Қосылған карта"],
    "Последние 4 цифры будут показаны только для настоящей карты":["Only a real linked card can show its last four digits","Тек шынайы қосылған картаның соңғы төрт саны көрсетіледі"],
    "Отменить подписку":["Cancel subscription","Жазылымды тоқтату"],
    "Доступно только при активной подписке":["Available only with an active subscription","Тек белсенді жазылым болса қолжетімді"],
    "Режим":["Mode","Режим"],
    "Системный, светлый или тёмный":["System, light or dark","Жүйелік, ашық немесе күңгірт"],
    "Авто":["Auto","Авто"],
    "Светлый":["Light","Ашық"],
    "Тёмный":["Dark","Күңгірт"],
    "Тема":["Theme","Тақырып"],
    "10 вариантов цветов и стиля":["10 color and style presets","10 түс пен стиль нұсқасы"],
    "Акцентный цвет":["Accent color","Ерекшелеу түсі"],
    "Фон":["Background","Фон"],
    "Цвет переднего плана":["Foreground color","Алдыңғы жоспар түсі"],
    "Сбросить оформление":["Reset appearance","Көріністі қалпына келтіру"],
    "О выполненных задачах ИИ":["AI tasks completed","ЖИ тапсырмалары аяқталғаны туралы"],
    "О завершении ответа в открытой вкладке":["When an answer finishes in the open tab","Ашық қойындыдағы жауап аяқталғанда"],
    "Об ошибках ИИ":["AI errors","ЖИ қателері"],
    "Уведомления о неудачных запросах":["Notifications for failed requests","Орындалмаған сұраулар туралы хабарламалар"],
    "О новых возможностях":["New features","Жаңа мүмкіндіктер"],
    "Будущие обновления Kaz AI":["Future Kaz AI updates","Kaz AI жүйесінің болашақ жаңартулары"],
    "О событиях безопасности":["Security events","Қауіпсіздік оқиғалары"],
    "После подключения аккаунтов":["After accounts are connected","Аккаунттар қосылғаннан кейін"],
    "Параметры сохраняются только в этом браузере. Push и электронные письма не подключены.":["Preferences are saved only in this browser. Push and email notifications are not connected.","Баптаулар тек осы браузерде сақталады. Push және электрондық пошта хабарламалары қосылмаған."],
    "Тарифы Kaz AI":["Kaz AI plans","Kaz AI тарифтері"],
    "Тарифы показаны для ознакомления. Цены не установлены, оформление и оплата отключены.":["Plans are for preview only. Prices are not set, and checkout and payments are disabled.","Тарифтер тек танысу үшін көрсетіледі. Бағалар белгіленбеген, рәсімдеу мен төлем өшірілген."],
    "Бесплатный":["Free","Тегін"],
    "Расширенный":["Extended","Кеңейтілген"],
    "Максимальный":["Maximum","Максималды"],
    "Текущий доступ к сайту, в пределах лимитов провайдера ИИ":["Current access, subject to AI provider limits","ЖИ провайдерінің лимиттері шегіндегі ағымдағы қолжетімділік"],
    "Будущий тариф. Цена и условия пока не утверждены":["Future plan. Pricing and terms are not yet approved","Болашақ тариф. Баға мен шарттар әлі бекітілмеген"],
    "Бесплатно":["Free","Тегін"],
    "Недоступно":["Unavailable","Қолжетімсіз"],
    "Если вход выполняется через Google, пароль меняется только в настройках Google. Kaz AI не получает и не хранит пароль. Отдельный пароль появится только при создании собственной системы аккаунтов.":["Google passwords are managed by Google, not Kaz AI. Kaz AI cannot access or store them. A separate password would require its own account system.","Google құпиясөзі тек Google баптауларында өзгертіледі. Kaz AI оны алмайды және сақтамайды. Жеке құпиясөз үшін бөлек аккаунт жүйесі қажет."],
    "Список устройств и активных входов появится после подключения авторизации. Сейчас нет достоверной истории сеансов.":["Device and active session lists will be available after sign-in is implemented. No real session history is available yet.","Құрылғылар мен белсенді сеанстар тізімі кіру жүйесі қосылғаннан кейін көрсетіледі. Әзірге нақты тарих жоқ."],
    "После подключения аккаунтов здесь будут даты, время и устройства входов и выходов. Пока записи недоступны.":["Sign-in and sign-out dates, times and devices will appear after accounts are connected. No records are available yet.","Аккаунттар қосылғаннан кейін кіру мен шығудың күні, уақыты және құрылғылар көрсетіледі. Әзірге жазбалар жоқ."],
    "Платёжная система не подключена. Достоверной истории платежей нет.":["Payment processing is not connected. There is no genuine transaction history.","Төлем жүйесі қосылмаған. Нақты төлемдер тарихы жоқ."],
    "Платёжные данные появятся после подключения настоящего платёжного сервиса. Сейчас ввод данных отключён.":["Billing details will appear after a real payment service is connected. Entering payment information is disabled.","Төлем деректері нақты төлем қызметі қосылғаннан кейін көрсетіледі. Деректерді енгізу өшірілген."],
    "Активной подписки Kaz AI нет. Кнопка подготовлена для будущей системы оплаты, отменять пока нечего.":["There is no active Kaz AI subscription. Cancellation is only a placeholder.","Белсенді Kaz AI жазылымы жоқ. Жазылымды тоқтату батырмасы әзірге үлгі ғана."],
    "Сервис аккаунтов ещё не подключён. Поэтому удалять нечего. Мы не выдаём демонстрацию за настоящее удаление.":["Accounts are not connected. This is only a preview, not actual account deletion.","Аккаунттар әлі қосылмаған. Бұл тек үлгі, нақты аккаунт жойылмайды."],
    "Ответ ИИ готов.":["AI response is ready.","ЖИ жауабы дайын."],
    "Не удалось выполнить запрос ИИ.":["AI request failed.","ЖИ сұрауын орындау мүмкін болмады."],
    "Оформление сброшено":["Appearance reset.","Көрініс қалпына келтірілді."],
    "Закрыть":["Close","Жабу"],
    "Закрыть окно":["Close dialog","Терезені жабу"]
  };
  const authoredText=new WeakMap();
  const t=value=>{
    const entry=copy[value];
    if(!entry)return window.KazI18n?.translate?.(value)||value;
    if(resolveLanguage()==="ru")return value;
    return entry[resolveLanguage()==="kk"?1:0];
  };
  function refreshBodyCopy(){
    const root=qs("#internalSettingsRoot");
    if(!root)return;
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
    let part;
    while((part=walker.nextNode())){
      const parent=part.parentElement;
      if(!parent||parent.closest("h3,#innerSettingsTitle,[data-is-tab],script,style,option"))continue;
      const original=authoredText.get(part)||part.nodeValue.trim();
      if(parent.closest(".merged-settings-list"))continue;
      if(!copy[original])continue;
      if(!authoredText.has(part))authoredText.set(part,original);
      const wanted=t(original);
      if(part.nodeValue!==wanted)part.nodeValue=wanted;
    }
    for(const el of root.querySelectorAll("[aria-label]")){
      if(el.closest(".merged-settings-list"))continue;
      if(!el.dataset.isOriginalAria)el.dataset.isOriginalAria=el.getAttribute("aria-label");
      const result=t(el.dataset.isOriginalAria);
      if(el.getAttribute("aria-label")!==result)el.setAttribute("aria-label",result);
    }
  }

  const themePresets=[
    ["kaz","Kaz AI","#42e2fa","#030c1e","#eaf7ff"],
    ["ocean","Океан","#38bdf8","#071e30","#ecfeff"],
    ["aurora","Северное сияние","#3ddc97","#081c20","#e8fff4"],
    ["sapphire","Сапфир","#6289ff","#0c1230","#ebf0ff"],
    ["forest","Лес","#9aca59","#102018","#f2fbea"],
    ["sunset","Закат","#ff9263","#2b1516","#fff1e5"],
    ["violet","Фиолетовый","#b78aff","#1e1631","#f7efff"],
    ["rose","Розовое золото","#ec83b9","#2a1827","#ffebf5"],
    ["sand","Песчаный","#cc9960","#292018","#fff3df"],
    ["graphite","Графит","#acb8cb","#171b23","#f1f4fa"]
  ];
  const themeNames={
    kaz:["Kaz AI","Kaz AI"],ocean:["Ocean","Мұхит"],aurora:["Aurora","Шұғыла"],
    sapphire:["Sapphire","Сапфир"],forest:["Forest","Орман"],sunset:["Sunset","Күн батуы"],
    violet:["Violet","Күлгін"],rose:["Rose gold","Қызғылт алтын"],
    sand:["Sand","Құм"],graphite:["Graphite","Графит"]
  };
  const preset=Object.fromEntries(themePresets.map(([key,name,accent,bg,fg])=>[key,{name,accent,bg,fg}]));
  const defaultPrefs=()=>({language:"auto",mode:"dark",theme:"kaz",accent:null,bg:null,fg:null,
    notifications:{completed:false,failed:false,news:false,security:false}});
  let prefs=defaultPrefs(),themeWatch=null,dialogOpener=null,active="general",languageChangeInside=false;
  try{
    const stored=JSON.parse(localStorage.getItem("kaz-ai-internal-settings-v1")||"null");
    if(stored&&typeof stored==="object"){
      if(stored.language==="auto"||codes.has(stored.language))prefs.language=stored.language;
      if(["system","light","dark"].includes(stored.mode))prefs.mode=stored.mode;
      if(typeof stored.theme==="string"&&Object.prototype.hasOwnProperty.call(preset,stored.theme))prefs.theme=stored.theme;
      for(const k of ["accent","bg","fg"])if(typeof stored[k]==="string"&&/^#[0-9a-fA-F]{6}$/.test(stored[k]))prefs[k]=stored[k];
      if(stored.notifications&&typeof stored.notifications==="object")
        for(const key of Object.keys(prefs.notifications))
          prefs.notifications[key]=stored.notifications[key]===true;
    }
  }catch{}
  const save=()=>{try{localStorage.setItem("kaz-ai-internal-settings-v1",JSON.stringify(prefs))}catch{}};
  const resolveLanguage=()=>{
    if(prefs.language!=="auto")return prefs.language;
    // Follow the first supported browser preference, not just its first entry.
    for(const locale of [...(navigator.languages||[]),navigator.language||"ru"]){
      const browser=String(locale).toLowerCase().split(/[-_]/)[0];
      if(codes.has(browser))return browser;
    }
    return "en";
  };
  const extraLabels={
    ru:["Личные инструкции","Экспорт истории"],en:["Personal instructions","Export history"],kk:["Жеке нұсқаулар","Тарихты экспорттау"],
    pt:["Instruções pessoais","Exportar histórico"],es:["Instrucciones personales","Exportar historial"],fr:["Instructions personnelles","Exporter l’historique"],
    ar:["التعليمات الشخصية","تصدير السجل"],zh:["个人指令","导出历史"],ko:["개인 지침","기록 내보내기"],ja:["個人用指示","履歴のエクスポート"],
    de:["Persönliche Anweisungen","Verlauf exportieren"],it:["Istruzioni personali","Esporta cronologia"],tr:["Kişisel talimatlar","Geçmişi dışa aktar"],
    pl:["Instrukcje osobiste","Eksport historii"],hi:["व्यक्तिगत निर्देश","इतिहास निर्यात"],vi:["Hướng dẫn cá nhân","Xuất lịch sử"],id:["Instruksi pribadi","Ekspor riwayat"]
  };
  const tabIcons={general:"settings",account:"chat",security:"lock",usage:"clock",billing:"file",appearance:"sun",notifications:"spark",personal:"edit",export:"file"};
  const tabOrder=["general","account","security","usage","billing","appearance","notifications","personal","export"];
  const tabName=(name,lang)=>{
    const extra=extraLabels[lang]||extraLabels.en;
    if(name==="personal")return extra[0];
    if(name==="export")return extra[1];
    return (labels[lang]||labels.en)[tabOrder.indexOf(name)+1];
  };
  const rootTemplate=String.raw`

    <div class="is-workspace">
      <div class="is-panels">
        <section data-is-panel="general">
          <h3>Общие</h3>
          <div class="is-row">
            <div><strong>Язык интерфейса</strong><p>Автоматически по языку браузера или выбранный вручную. Полный перевод остальных экранов добавляется постепенно.</p></div>
            <div class="language-select-shell"><select id="innerLanguage" aria-label="Язык интерфейса"></select><span class="language-select-arrow" aria-hidden="true"><svg class="icon"><use href="#ic-chevron"/></svg></span></div>
          </div>
          <p class="is-footnote">Арабский язык включает направление справа налево. Для остальных экранов пока используется английский перевод там, где нет перевода выбранного языка.</p>
        </section>
        <section data-is-panel="account" hidden>
          <h3>Учётная запись</h3><p class="is-notice">Google-вход пока не подключён. Не показываем личные данные со скриншотов как данные действующего аккаунта.</p>
          <div class="is-row"><div><strong>Имя</strong><p>Имя владельца аккаунта</p></div><span class="is-dash">Не подключено</span></div>
          <div class="is-row"><div><strong>Имя пользователя</strong><p>Уникальное имя в Kaz AI</p></div><span class="is-dash">Не подключено</span></div>
          <div class="is-row"><div><strong>Электронная почта</strong><p>Адрес подтверждённого аккаунта</p></div><span class="is-dash">Не подключено</span></div>
          <div class="is-row"><div><strong>План</strong><p>Действующий тариф</p></div><span class="is-dash">Без подписки</span></div>
          <div class="is-row"><div><strong>Возраст</strong><p>Возрастная категория после регистрации</p></div><span class="is-dash">Не указано</span></div>
          <div class="is-row"><div><strong>Профиль создателя GPT</strong><p>Будущая функция аккаунта</p></div><span class="is-dash">Не подключено</span></div>
          <div class="is-row"><div><strong>Удалить учётную запись</strong><p>Появится после подключения аккаунтов</p></div><button type="button" data-is-dialog="delete">Удалить</button></div>
        </section>
        <section data-is-panel="security" hidden>
          <h3>Безопасность и вход</h3><p class="is-notice">Данные о входах и устройствах будут доступны только после настоящей авторизации.</p>
          <div class="is-row"><div><strong>Пароль</strong><p>Управление паролем аккаунта</p></div><button type="button" data-is-dialog="password">Управлять</button></div>
          <div class="is-row"><div><strong>Активные сеансы</strong><p>Устройства, на которых открыт аккаунт</p></div><button type="button" data-is-dialog="sessions">Просмотреть</button></div>
          <div class="is-row"><div><strong>История безопасности</strong><p>Входы и выходы с датой и временем</p></div><button type="button" data-is-dialog="securityHistory">Открыть</button></div>
        </section>
        <section data-is-panel="usage" hidden>
          <h3>Использование</h3>
          <div class="is-row"><div><strong>Текущий план</strong><p>Бесплатная версия, платные тарифы пока не действуют</p></div><button type="button" data-is-dialog="plans">Подключить тариф</button></div>
          <div class="is-meters"><div><span>Использовано токенов</span><strong>—</strong></div><div><span>Осталось токенов</span><strong>—</strong></div><div><span>Попыток запросов ИИ в этой вкладке</span><strong id="innerRequestsAttempted">0</strong></div><div><span>Успешных ответов</span><strong id="innerRequestsSucceeded">0</strong></div><div><span>Ошибок запросов</span><strong id="innerRequestsFailed">0</strong></div><div><span>Остановлено вручную</span><strong id="innerRequestsStopped">0</strong></div></div>
          <p class="is-footnote">Статистика относится только к этой вкладке и сбрасывается после обновления страницы.</p>
          <p class="is-footnote">Точная статистика появится после подключения серверного учёта. Сейчас показаны прочерки, а не выдуманные цифры.</p>
        </section>
        <section data-is-panel="billing" hidden>
          <h3>Оплата</h3><p class="is-notice">Оплата и подписки отключены. Никакие деньги не списываются через эти настройки.</p>
          <div class="is-row"><div><strong>История транзакций</strong><p>Платежи и возвраты</p></div><button type="button" data-is-dialog="transactions">Открыть</button></div>
          <div class="is-row"><div><strong>Информация для выставления счетов</strong><p>Платёжные реквизиты</p></div><button type="button" data-is-dialog="invoice">Просмотреть</button></div>
          <div class="is-row"><div><strong>Подключённая карта</strong><p>Последние 4 цифры будут показаны только для настоящей карты</p></div><span class="is-dash" aria-label="Карта не подключена">•••• •••• •••• ••••</span></div>
          <div class="is-row"><div><strong>Отменить подписку</strong><p>Доступно только при активной подписке</p></div><button type="button" data-is-dialog="cancel">Отменить подписку</button></div>
        </section>
        <section data-is-panel="appearance" hidden>
          <h3>Внешний вид</h3>
          <div class="is-row"><div><strong>Режим</strong><p>Системный, светлый или тёмный</p></div>
            <fieldset class="is-mode" aria-label="Режим">
              <label class="is-mode-choice"><input type="radio" name="innerMode" value="system"><span class="is-mini-preview is-mini-system" aria-hidden="true"><i></i><i></i></span><span>Авто</span></label>
              <label class="is-mode-choice"><input type="radio" name="innerMode" value="light"><span class="is-mini-preview is-mini-light" aria-hidden="true"><i></i><i></i></span><span>Светлый</span></label>
              <label class="is-mode-choice"><input type="radio" name="innerMode" value="dark"><span class="is-mini-preview is-mini-dark" aria-hidden="true"><i></i><i></i></span><span>Тёмный</span></label>
            </fieldset></div>
          <div class="is-row"><div><strong>Тема</strong><p>10 вариантов цветов и стиля</p></div><select id="innerTheme" aria-label="Тема"></select></div>
          <div class="is-colors">
            <label>Акцентный цвет<input type="color" id="innerAccent" aria-label="Акцентный цвет"></label>
            <label>Фон<input type="color" id="innerBg" aria-label="Фон"></label>
            <label>Цвет переднего плана<input type="color" id="innerFg" aria-label="Цвет переднего плана"></label>
          </div>
          <button type="button" data-is-action="reset-appearance" class="is-reset">Сбросить оформление</button>
        </section>
        <section data-is-panel="personal" hidden><h3>Личные инструкции</h3></section>
        <section data-is-panel="export" hidden><h3>Экспорт истории</h3></section>
        <section data-is-panel="notifications" hidden>
          <h3>Уведомления</h3>
          <label class="is-row is-check"><span><strong>О выполненных задачах ИИ</strong><small>О завершении ответа в открытой вкладке</small></span><input type="checkbox" data-is-notify="completed"></label>
          <label class="is-row is-check"><span><strong>Об ошибках ИИ</strong><small>Уведомления о неудачных запросах</small></span><input type="checkbox" data-is-notify="failed"></label>
          <label class="is-row is-check"><span><strong>О новых возможностях</strong><small>Будущие обновления Kaz AI</small></span><input type="checkbox" data-is-notify="news"></label>
          <label class="is-row is-check"><span><strong>О событиях безопасности</strong><small>После подключения аккаунтов</small></span><input type="checkbox" data-is-notify="security"></label>
          <p class="is-footnote">Параметры сохраняются только в этом браузере. Push и электронные письма не подключены.</p>
        </section>
      </div>
    </div>
  `;
  const modalMarkup=String.raw`
    <div class="is-modal-head"><h2 id="innerDialogTitle"></h2><button type="button" aria-label="Закрыть окно" data-is-dialog-close>×</button></div>
    <div class="is-modal-body" id="innerDialogBody"></div>
    <div class="is-modal-foot"><button type="button" data-is-dialog-close>Закрыть</button></div>
  `;
  const dialogContent={
    password:["Пароль","Если вход выполняется через Google, пароль меняется только в настройках Google. Kaz AI не получает и не хранит пароль. Отдельный пароль появится только при создании собственной системы аккаунтов."],
    sessions:["Активные сеансы","Список устройств и активных входов появится после подключения авторизации. Сейчас нет достоверной истории сеансов."],
    securityHistory:["История безопасности","После подключения аккаунтов здесь будут даты, время и устройства входов и выходов. Пока записи недоступны."],
    transactions:["История транзакций","Платёжная система не подключена. Достоверной истории платежей нет."],
    invoice:["Информация для выставления счетов","Платёжные данные появятся после подключения настоящего платёжного сервиса. Сейчас ввод данных отключён."],
    cancel:["Отменить подписку","Активной подписки Kaz AI нет. Кнопка подготовлена для будущей системы оплаты, отменять пока нечего."],
    delete:["Удалить учётную запись","Сервис аккаунтов ещё не подключён. Поэтому удалять нечего. Мы не выдаём демонстрацию за настоящее удаление."]
  };
  const applyAppearance=()=>{
    const isLight=prefs.mode==="light"||(prefs.mode==="system"&&typeof matchMedia==="function"&&matchMedia("(prefers-color-scheme: light)").matches);
    if(typeof state!=="undefined"&&state.light!==isLight&&typeof toggleTheme==="function")toggleTheme(true);
    const color=preset[prefs.theme],bg=prefs.bg||(isLight?"#edf4fb":color.bg),fg=prefs.fg||(isLight?"#11273d":color.fg);
    document.body.dataset.kazTheme=prefs.theme;
    if(prefs.theme!=="kaz"){
      document.body.style.setProperty("--panel",`color-mix(in srgb, ${bg} 90%, ${fg})`);
      document.body.style.setProperty("--panel2",`color-mix(in srgb, ${bg} 78%, ${fg})`);
    }else{
      document.body.style.removeProperty("--panel");
      document.body.style.removeProperty("--panel2");
    }
    document.body.style.setProperty("--accent",prefs.accent||color.accent);
    document.body.style.setProperty("--accent2",prefs.accent||color.accent);
    document.body.style.setProperty("--bg",bg);
    document.body.style.setProperty("--text",fg);
    qs("#innerAccent").value=prefs.accent||color.accent;
    qs("#innerBg").value=bg;
    qs("#innerFg").value=fg;
    qs("#innerTheme").value=prefs.theme;
    const radio=qs('input[name="innerMode"][value="'+prefs.mode+'"]');
    if(radio)radio.checked=true;
    save();
  };
  const refreshLabels=()=>{
    const lang=resolveLanguage(),translated=labels[lang]||labels.en;
    for(const tab of qa("[data-is-tab]")){
      const name=tabName(tab.dataset.isTab,lang);
      qs("span",tab).textContent=name;tab.title=name;tab.setAttribute("aria-label",name);
    }
    qs("#innerLanguage").options[0].textContent=translated[8];
    const themes=qs("#innerTheme");
    for(const option of themes.options){
      const key=option.value,source=preset[key];
      if(source)option.textContent=lang==="ru"?source.name:(themeNames[key]?.[lang==="kk"?1:0]||source.name);
    }
    qa("[data-is-panel]").forEach(panel=>{
      const heading=qs("h3",panel);
      if(heading)heading.textContent=tabName(panel.dataset.isPanel,lang);
    });
    const auto=qs('#languageMenu [data-language="auto"] strong');
    if(auto)auto.textContent=translated[8];
    for(const choice of qa("#languageMenu [data-language]")){
      const selected=choice.dataset.language===prefs.language;
      choice.classList.toggle("selected",selected);choice.setAttribute("aria-pressed",String(selected));
    }
    document.documentElement.dir=lang==="ar"?"rtl":"ltr";
    qs("#internalSettingsRoot").dir=lang==="ar"?"rtl":"ltr";
    refreshBodyCopy();
  };
  const chooseLanguage=(v,quiet=false)=>{
    prefs.language=v;save();
    const value=resolveLanguage();
    if(typeof selectLanguage==="function"){
      languageChangeInside=true;
      selectLanguage(value,quiet);
      languageChangeInside=false;
    }
    refreshLabels();
    qs("#innerLanguage").value=prefs.language;
  };
  const refreshUsage=()=>{
    const usage=window.KazSession?.usageSnapshot?.();
    for(const [id,key] of [["innerRequestsAttempted","requestsAttempted"],["innerRequestsSucceeded","requestsSucceeded"],["innerRequestsFailed","requestsFailed"],["innerRequestsStopped","requestsStopped"]]){
      const el=qs("#"+id);
      if(!el)continue;
      const count=usage?.[key];
      el.textContent=Number.isSafeInteger(count)&&count>=0?String(count):"—";
    }
  };
  const showTab=(name)=>{
    if(!qs('[data-is-panel="'+name+'"]'))return;
    active=name;
    if(name==="usage")refreshUsage();
    qa("[data-is-panel]").forEach(p=>p.hidden=p.dataset.isPanel!==name);
    qa("[data-is-tab]").forEach(b=>{
      const picked=b.dataset.isTab===name;
      b.classList.toggle("selected",picked);
      b.classList.toggle("active",picked);
      if(picked)b.setAttribute("aria-current","page");else b.removeAttribute("aria-current");
    });
  };
  const showDialog=(kind)=>{
    const modal=qs("#innerSettingsDialog");
    dialogOpener=document.activeElement;
    const title=qs("#innerDialogTitle"),body=qs("#innerDialogBody");
    body.replaceChildren();
    if(kind==="plans"){
      title.textContent=t("Тарифы Kaz AI");
      const info=document.createElement("p");
      info.textContent=t("Тарифы показаны для ознакомления. Цены не установлены, оформление и оплата отключены.");
      body.append(info);
      for(const [name,details] of [
        ["Бесплатный","Текущий доступ к сайту, в пределах лимитов провайдера ИИ"],
        ["Расширенный","Будущий тариф. Цена и условия пока не утверждены"],
        ["Максимальный","Будущий тариф. Цена и условия пока не утверждены"]
      ]){
        const el=document.createElement("div");el.className="is-plan";
        const strong=document.createElement("strong");strong.textContent=t(name);
        const desc=document.createElement("p");desc.textContent=t(details);
        const status=document.createElement("span");status.textContent=t(name==="Бесплатный"?"Бесплатно":"Недоступно");
        el.append(strong,desc,status);body.append(el);
      }
    }else{
      const data=dialogContent[kind];if(!data)return;
      title.textContent=t(data[0]);
      const p=document.createElement("p");p.textContent=t(data[1]);body.append(p);
    }
    if(typeof modal.showModal==="function")modal.showModal();else modal.hidden=false;
    for(const close of qa("[data-is-dialog-close]",modal)){
      if(close.textContent.trim()==="Закрыть"||close.dataset.isDialogOriginal==="Закрыть"){
        close.dataset.isDialogOriginal="Закрыть";close.textContent=t("Закрыть");
      }
      if(close.hasAttribute("aria-label"))close.setAttribute("aria-label",t("Закрыть окно"));
    }
    qs("[data-is-dialog-close]",modal).focus();
  };
  const closeDialog=()=>{
    const dialog=qs("#innerSettingsDialog");
    if(dialog.open)dialog.close();else dialog.hidden=true;
    if(dialogOpener?.isConnected)dialogOpener.focus();
  };
  const showToast=(message)=>{
    if(typeof notify==="function")notify(message);
  };
  function setup(){
    const root=qs("#internalSettingsRoot");
    if(!root)return;
    root.innerHTML=rootTemplate; // Constant authored markup; never interpolate user or account data.
    const nav=qs("#settingsNavigation");
    for(const name of tabOrder){
      const btn=document.createElement("button");btn.type="button";btn.className="nav-item";btn.dataset.isTab=name;
      btn.append(icon(tabIcons[name]),document.createElement("span"));nav.append(btn);
    }
    nav.addEventListener("click",event=>{
      const tab=event.target.closest("[data-is-tab]");if(!tab)return;
      showTab(tab.dataset.isTab);setDrawer(false);qs("#mainContent").scrollTop=0;
    });
    // Move existing controls, rather than clone or rebind them. All prior actions stay intact.
    const legacy=qs("#view-settings > .settings-list");
    for(const row of qa("[data-settings-destination]",legacy)){
      const panel=qs('[data-is-panel="'+row.dataset.settingsDestination+'"]',root);
      if(panel){let list=qs(".settings-list",panel);if(!list){list=document.createElement("div");list.className="settings-list merged-settings-list";panel.append(list)}list.append(row)}
    }
    legacy.remove();
    // The top-bar shortcut uses the same language preference, with all 17 languages and Auto.
    const menu=qs("#languageMenu"),hint=qs(".popover-hint",menu);
    for(const [key,name] of [["auto","Автоматически"],...languages]){
      if(qs('[data-language="'+key+'"]',menu))continue;
      const btn=document.createElement("button");btn.type="button";btn.className="language-option";btn.dataset.language=key;
      const code=document.createElement("span");code.className="language-code";code.textContent=key==="auto"?"A":key.toUpperCase();
      const desc=document.createElement("span"),strong=document.createElement("strong");strong.textContent=name;desc.append(strong);
      const check=icon("check");check.classList.add("language-check");btn.append(code,desc,check);menu.insertBefore(btn,hint);
    }
    const dialog=document.createElement("dialog");
    dialog.className="is-modal";dialog.id="innerSettingsDialog";dialog.setAttribute("aria-labelledby","innerDialogTitle");
    dialog.innerHTML=modalMarkup;
    document.body.append(dialog);
    dialog.addEventListener("click",event=>{if(event.target===dialog)closeDialog()});
    dialog.addEventListener("cancel",event=>{event.preventDefault();closeDialog()});
    dialog.addEventListener("click",event=>{if(event.target.closest("[data-is-dialog-close]"))closeDialog()});
    const language=qs("#innerLanguage");
    language.append(new Option(labels.ru[8],"auto"));
    for(const [key,name] of languages)language.append(new Option(name,key));
    language.value=prefs.language;
    for(const [key,info] of Object.entries(preset))
      qs("#innerTheme").append(new Option(info.name,key));
    root.addEventListener("click",event=>{
      const tab=event.target.closest("[data-is-tab]");
      if(tab){showTab(tab.dataset.isTab);return}
      const command=event.target.closest("[data-is-dialog]");
      if(command){showDialog(command.dataset.isDialog);return}
      if(event.target.closest('[data-is-action="reset-appearance"]')){
        prefs.theme="kaz";prefs.mode="dark";prefs.accent=null;prefs.bg=null;prefs.fg=null;
        applyAppearance();showToast(t("Оформление сброшено"));return;
      }
    });
    language.addEventListener("change",()=>chooseLanguage(language.value));
    qs("#innerTheme").addEventListener("change",event=>{
      if(!Object.prototype.hasOwnProperty.call(preset,event.target.value))return;
      prefs.theme=event.target.value;prefs.accent=null;prefs.bg=null;prefs.fg=null;applyAppearance();
    });
    for(const [key,id] of [["accent","innerAccent"],["bg","innerBg"],["fg","innerFg"]])
      qs("#"+id).addEventListener("input",event=>{prefs[key]=event.target.value;applyAppearance()});
    qa('input[name="innerMode"]').forEach(el=>el.addEventListener("change",()=>{
      if(el.checked){prefs.mode=el.value;applyAppearance()}
    }));
    qa("[data-is-notify]").forEach(el=>{
      el.checked=prefs.notifications[el.dataset.isNotify];
      el.addEventListener("change",()=>{prefs.notifications[el.dataset.isNotify]=el.checked;save()});
    });
    if(typeof matchMedia==="function"){
      themeWatch=matchMedia("(prefers-color-scheme: light)");
      themeWatch.addEventListener?.("change",()=>{
        if(prefs.mode==="system")applyAppearance();
      });
    }
    showTab(active);
    refreshUsage();
    applyAppearance();
    refreshLabels();
    // Preserve existing default site language until the visitor explicitly
    // selects an option, so original chat behaviour is not silently rewritten.
    chooseLanguage(prefs.language,true);
    window.addEventListener("languagechange",()=>{
      if(prefs.language==="auto")chooseLanguage("auto",true);
    });
  }
  window.KazInternalSettings={
    refreshUsage,
    chooseLanguage,
    open:(panel="general")=>{
      if(typeof showScreen==="function")showScreen("settings");
      showTab(panel);
      qs('[data-is-tab="'+panel+'"]')?.focus();
    },
    syncLanguage:value=>{
      if(!languageChangeInside){prefs.language=value;save()}
      const control=qs("#innerLanguage");
      if(control)control.value=prefs.language;
      // A top-bar language change is an explicit language selection.
      // Keep both menus and the 17-language workspace in sync.
      refreshLabels();
    },
    onLegacyThemeToggle:isLight=>{
      if(!qs("#innerSettingsRoot .is-workspace"))return;
      // A click on the old theme toggle becomes an explicit light/dark choice.
      prefs.mode=isLight?"light":"dark";
      const control=qs('input[name="innerMode"][value="'+prefs.mode+'"]');
      if(control)control.checked=true;
      applyAppearance();
    },
    notify:type=>{
      if(prefs.notifications[type])showToast(t(type==="completed"?"Ответ ИИ готов.":"Не удалось выполнить запрос ИИ."));
    },
    get selectedLanguage(){return prefs.language},
    get currentTheme(){return prefs.theme}
  };
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",setup,{once:true});
  else setup();
})();