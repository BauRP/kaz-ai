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
  const preset=Object.fromEntries(themePresets.map(([key,name,accent,bg,fg])=>[key,{name,accent,bg,fg}]));
  const defaultPrefs=()=>({language:"auto",mode:"system",theme:"kaz",accent:null,bg:null,fg:null,
    notifications:{completed:false,failed:false,news:false,security:false}});
  let prefs=defaultPrefs(),themeWatch=null,dialogOpener=null,active="general",languageChangeInside=false;
  try{
    const stored=JSON.parse(localStorage.getItem("kaz-ai-internal-settings-v1")||"null");
    if(stored&&typeof stored==="object"){
      if(stored.language==="auto"||codes.has(stored.language))prefs.language=stored.language;
      if(["system","light","dark"].includes(stored.mode))prefs.mode=stored.mode;
      if(preset[stored.theme])prefs.theme=stored.theme;
      for(const k of ["accent","bg","fg"])if(typeof stored[k]==="string"&&/^#[0-9a-fA-F]{6}$/.test(stored[k]))prefs[k]=stored[k];
      if(stored.notifications&&typeof stored.notifications==="object")
        for(const key of Object.keys(prefs.notifications))
          prefs.notifications[key]=stored.notifications[key]===true;
    }
  }catch{}
  const save=()=>{try{localStorage.setItem("kaz-ai-internal-settings-v1",JSON.stringify(prefs))}catch{}};
  const resolveLanguage=()=>{
    if(prefs.language!=="auto")return prefs.language;
    const browser=(navigator.languages?.[0]||navigator.language||"ru").toLowerCase().split("-")[0];
    return codes.has(browser)?browser:"en";
  };
  const rootTemplate=String.raw`
    <div class="is-head">
      <h2 id="innerSettingsTitle">внутренности настроек</h2>
      <p>Параметры интерфейса работают в этом браузере. Аккаунт, платежи и безопасность подключим позже.</p>
    </div>
    <div class="is-workspace">
      <nav class="is-nav" aria-label="Разделы внутренних настроек">
        <button type="button" data-is-tab="general" aria-current="page">Общие</button>
        <button type="button" data-is-tab="account">Учётная запись</button>
        <button type="button" data-is-tab="security">Безопасность и вход</button>
        <button type="button" data-is-tab="usage">Использование</button>
        <button type="button" data-is-tab="billing">Оплата</button>
        <button type="button" data-is-tab="appearance">Внешний вид</button>
        <button type="button" data-is-tab="notifications">Уведомления</button>
      </nav>
      <div class="is-panels">
        <section data-is-panel="general">
          <h3>Общие</h3>
          <div class="is-row">
            <div><strong>Язык интерфейса</strong><p>Автоматически по языку браузера или выбранный вручную. Полный перевод остальных экранов добавляется постепенно.</p></div>
            <select id="innerLanguage" aria-label="Язык интерфейса"></select>
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
          <div class="is-meters"><div><span>Использовано токенов</span><strong>—</strong></div><div><span>Осталось токенов</span><strong>—</strong></div><div><span>Запросов за период</span><strong>—</strong></div></div>
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
    const isLight=prefs.mode==="light"||(prefs.mode==="system"&&matchMedia("(prefers-color-scheme: light)").matches);
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
    qs("#innerSettingsTitle").textContent=translated[0];
    const tabs=qa("[data-is-tab]");
    tabs.forEach((tab,i)=>{tab.textContent=translated[i+1]});
    qs("#innerLanguage").options[0].textContent=translated[8];
    qa("[data-is-panel]").forEach((panel,i)=>{
      const heading=qs("h3",panel);
      if(heading)heading.textContent=translated[i+1];
    });
    document.documentElement.dir=lang==="ar"?"rtl":"ltr";
    qs("#internalSettingsRoot").dir=lang==="ar"?"rtl":"ltr";
  };
  const chooseLanguage=(v)=>{
    prefs.language=v;save();
    const value=resolveLanguage();
    if(typeof selectLanguage==="function"){
      languageChangeInside=true;
      selectLanguage(value);
      languageChangeInside=false;
    }
    refreshLabels();
    qs("#innerLanguage").value=prefs.language;
  };
  const showTab=(name)=>{
    if(!qs('[data-is-panel="'+name+'"]'))return;
    active=name;
    qa("[data-is-panel]").forEach(p=>p.hidden=p.dataset.isPanel!==name);
    qa("[data-is-tab]").forEach(b=>{
      const picked=b.dataset.isTab===name;
      b.classList.toggle("selected",picked);
      if(picked)b.setAttribute("aria-current","page");else b.removeAttribute("aria-current");
    });
  };
  const showDialog=(kind)=>{
    const modal=qs("#innerSettingsDialog");
    dialogOpener=document.activeElement;
    const title=qs("#innerDialogTitle"),body=qs("#innerDialogBody");
    body.replaceChildren();
    if(kind==="plans"){
      title.textContent="Тарифы Kaz AI";
      const info=document.createElement("p");
      info.textContent="Тарифы показаны для ознакомления. Цены не установлены, оформление и оплата отключены.";
      body.append(info);
      for(const [name,details] of [
        ["Бесплатный","Текущий доступ к сайту, в пределах лимитов провайдера ИИ"],
        ["Расширенный","Будущий тариф. Цена и условия пока не утверждены"],
        ["Максимальный","Будущий тариф. Цена и условия пока не утверждены"]
      ]){
        const el=document.createElement("div");el.className="is-plan";
        const strong=document.createElement("strong");strong.textContent=name;
        const desc=document.createElement("p");desc.textContent=details;
        const status=document.createElement("span");status.textContent=name==="Бесплатный"?"Бесплатно":"Недоступно";
        el.append(strong,desc,status);body.append(el);
      }
    }else{
      const data=dialogContent[kind];if(!data)return;
      title.textContent=data[0];
      const p=document.createElement("p");p.textContent=data[1];body.append(p);
    }
    if(typeof modal.showModal==="function")modal.showModal();else modal.hidden=false;
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
        prefs.theme="kaz";prefs.accent=null;prefs.bg=null;prefs.fg=null;
        applyAppearance();showToast("Оформление сброшено");return;
      }
    });
    language.addEventListener("change",()=>chooseLanguage(language.value));
    qs("#innerTheme").addEventListener("change",event=>{
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
    applyAppearance();
    refreshLabels();
    // Preserve existing default site language until the visitor explicitly
    // selects an option, so original chat behaviour is not silently rewritten.
    chooseLanguage(prefs.language);
  }
  window.KazInternalSettings={
    open:(panel="general")=>{
      if(typeof showScreen==="function")showScreen("settings");
      showTab(panel);
      qs('[data-is-tab="'+panel+'"]')?.focus();
    },
    syncLanguage:value=>{
      if(!languageChangeInside){prefs.language=value;save()}
      const control=qs("#innerLanguage");
      if(control)control.value=prefs.language;
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
      if(prefs.notifications[type])showToast(type==="completed"?"Ответ ИИ готов.":"Не удалось выполнить запрос ИИ.");
    },
    get selectedLanguage(){return prefs.language},
    get currentTheme(){return prefs.theme}
  };
  if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",setup,{once:true});
  else setup();
})();