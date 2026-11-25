"use strict";
/* Kaz AI rich-answer parser. Build DOM nodes, never execute model-provided HTML. */
(function(){
  const bt=String.fromCharCode(96);
  const node=(tag,css="")=>{const el=document.createElement(tag);if(css)el.className=css;return el};
  const text=(p,v)=>p.append(document.createTextNode(v));
  function safeUrl(href){
    try{
      const url=new URL(href,location.href);
      return href.startsWith("//")||!["https:","http:"].includes(url.protocol)?null:url.href;
    }catch{return null}
  }
  function mathValue(input){
    const map={cdot:"·",times:"×",div:"÷",leq:"≤",geq:"≥",neq:"≠",approx:"≈",
      infty:"∞",pi:"π",alpha:"α",beta:"β",theta:"θ",sum:"∑",prod:"∏",
      to:"→",Rightarrow:"⇒",ldots:"…",in:"∈"};
    const sup={"0":"⁰","1":"¹","2":"²","3":"³","4":"⁴","5":"⁵","6":"⁶","7":"⁷","8":"⁸","9":"⁹","n":"ⁿ","i":"ⁱ","+":"⁺","-":"⁻"};
    const sub={"0":"₀","1":"₁","2":"₂","3":"₃","4":"₄","5":"₅","6":"₆","7":"₇","8":"₈","9":"₉","i":"ᵢ","n":"ₙ"};
    return String(input).trim().replace(/\\frac\s*\{([^{}]{1,100})\}\s*\{([^{}]{1,100})\}/g,"($1) ⁄ ($2)")
      .replace(/\\sqrt\s*\{([^{}]{1,100})\}/g,"√($1)")
      .replace(/\\([A-Za-z]+)/g,(v,k)=>map[k]||v)
      .replace(/\^\{([0-9+ni-]{1,12})\}|\^([0-9+ni-])/g,(m,a,b)=>[...(a||b)].map(x=>sup[x]||x).join(""))
      .replace(/_\{([0-9in]{1,12})\}|_([0-9in])/g,(m,a,b)=>[...(a||b)].map(x=>sub[x]||x).join(""))
      .replace(/\\[,;!]/g," ");
  }
  function math(s,display=false){const el=node(display?"div":"span",display?"answer-math answer-math-block":"answer-math");el.textContent=mathValue(s);el.title=s;return el}
  function inline(p,s,depth=0){
    s=String(s);let i=0,plain="";
    const flush=()=>{if(plain){text(p,plain);plain=""}};
    function pair(open,close,tag){
      if(!s.startsWith(open,i))return false;
      const end=s.indexOf(close,i+open.length);
      if(end<0||end===i+open.length)return false;
      flush();const el=node(tag);
      if(depth<3)inline(el,s.slice(i+open.length,end),depth+1);
      else el.textContent=s.slice(i+open.length,end);
      p.append(el);i=end+close.length;return true;
    }
    while(i<s.length){
      if(s.startsWith("\\(",i)){
        const end=s.indexOf("\\)",i+2);
        if(end>i+2){flush();p.append(math(s.slice(i+2,end)));i=end+2;continue}
      }
      if(s[i]==="$"&&s[i+1]!=="$"){
        const end=s.indexOf("$",i+1);
        if(end>i+1&&end-i<1600){flush();p.append(math(s.slice(i+1,end)));i=end+1;continue}
      }
      if(s[i]===bt){
        const end=s.indexOf(bt,i+1);
        if(end>i+1){flush();const c=node("code","answer-inline-code");c.textContent=s.slice(i+1,end);p.append(c);i=end+1;continue}
      }
      if(s[i]==="["&&depth<3){
        const m=s.indexOf("](",i+1),end=m>=0?s.indexOf(")",m+2):-1;
        if(m>i+1&&end>m+2&&end-i<700){
          const url=safeUrl(s.slice(m+2,end).trim());
          if(url){flush();const a=node("a");a.href=url;a.target="_blank";a.rel="noopener noreferrer nofollow";inline(a,s.slice(i+1,m),depth+1);p.append(a);i=end+1;continue}
        }
      }
      if(pair("**","**","strong")||pair("~~","~~","del")||pair("*","*","em"))continue;
      if(s[i]==="\\"&&i+1<s.length&&"*_[]()\\".includes(s[i+1])){plain+=s[i+1];i+=2;continue}
      plain+=s[i++];
    }
    flush();
  }
  const head=l=>/^\s{0,3}(#{1,4})\s+(.+?)\s*#*\s*$/.exec(l);
  const fence=l=>new RegExp("^\\s{0,3}("+bt+"{3,}|~{3,})(.*)$").exec(l);
  const rule=l=>/^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(l);
  const item=l=>/^\s{0,6}(?:[-*+]\s+|\d+[.)]\s+)/.test(l);
  function cells(l){
    let x=l.trim();if(x.startsWith("|"))x=x.slice(1);if(x.endsWith("|"))x=x.slice(0,-1);
    return x.split(/(?<!\\)\|/).map(v=>v.replace(/\\\|/g,"|").trim());
  }
  function separator(l){const c=cells(l);return c.length>=2&&c.every(x=>/^:?-{3,}:?$/.test(x))}
  function code(lang,value){
    const section=node("section","answer-code-block"),bar=node("div","answer-code-toolbar"),title=node("span"),button=node("button","answer-code-copy");
    title.textContent=lang||"Код";button.type="button";
    const copyLabels=()=>({
      en:["Copy code","Copied","Unavailable","Copy failed"],
      kk:["Кодты көшіру","Көшірілді","Қолжетімсіз","Көшіру қатесі"],
      ru:["Копировать код","Скопировано","Недоступно","Ошибка копирования"],
      pt:["Copiar código","Copiado","Indisponível","Falha ao copiar"],
      es:["Copiar código","Copiado","No disponible","Error al copiar"],
      fr:["Copier le code","Copié","Indisponible","Échec de la copie"],
      ar:["نسخ الرمز","تم النسخ","غير متاح","فشل النسخ"],
      zh:["复制代码","已复制","不可用","复制失败"],
      ko:["코드 복사","복사됨","사용할 수 없음","복사 실패"],
      ja:["コードをコピー","コピーしました","利用不可","コピー失敗"],
      de:["Code kopieren","Kopiert","Nicht verfügbar","Kopieren fehlgeschlagen"],
      it:["Copia codice","Copiato","Non disponibile","Copia non riuscita"],
      tr:["Kodu kopyala","Kopyalandı","Kullanılamıyor","Kopyalama başarısız"],
      pl:["Kopiuj kod","Skopiowano","Niedostępne","Błąd kopiowania"],
      hi:["कोड कॉपी करें","कॉपी हुआ","उपलब्ध नहीं","कॉपी विफल"],
      vi:["Sao chép mã","Đã sao chép","Không khả dụng","Sao chép thất bại"],
      id:["Salin kode","Disalin","Tidak tersedia","Gagal menyalin"]
    })[window.KazI18n?.language||"ru"]||["Copy code","Copied","Unavailable","Copy failed"];
    let copyState=0;
    const refreshCopy=()=>{button.textContent=copyLabels()[copyState]};
    button.refreshCopyLabel=refreshCopy;
    refreshCopy();
    button.addEventListener("click",async()=>{
      if(!navigator.clipboard?.writeText){copyState=2;refreshCopy();return}
      try{await navigator.clipboard.writeText(value);copyState=1}
      catch{copyState=3}
      refreshCopy();
    });
    bar.append(title,button);section.append(bar);
    const pre=node("pre"),inside=node("code");inside.textContent=value;pre.append(inside);section.append(pre);return section;
  }
  function table(lines){
    const scroll=node("div","answer-table-scroll");scroll.tabIndex=0;scroll.setAttribute("aria-label","Прокручиваемая таблица");
    const t=node("table","answer-table"),thead=node("thead"),tbody=node("tbody"),row=node("tr"),headers=cells(lines[0]),aligns=cells(lines[1]);
    headers.forEach((h,i)=>{const th=node("th");th.scope="col";
      if(aligns[i]?.startsWith(":")&&aligns[i]?.endsWith(":"))th.style.textAlign="center";
      else if(aligns[i]?.endsWith(":"))th.style.textAlign="right";
      inline(th,h);row.append(th);
    });
    thead.append(row);t.append(thead);
    for(const line of lines.slice(2)){
      const r=node("tr"),values=cells(line);
      for(let i=0;i<headers.length;i++){const td=node("td");inline(td,values[i]||"");r.append(td)}tbody.append(r);
    }
    t.append(tbody);scroll.append(t);return scroll;
  }
  function blocks(root,body,depth=0){
    const ls=String(body).replace(/\r\n?/g,"\n").split("\n");
    if(ls.length>4500){root.textContent=body;return}
    let i=0;
    const special=l=>!l.trim()||head(l)||fence(l)||rule(l)||item(l)||/^\s*>/.test(l)||/^\s*(?:\$\$|\\\[)/.test(l);
    while(i<ls.length){
      const line=ls[i];if(!line.trim()){i++;continue}
      const f=fence(line);
      if(f){
        const marker=f[1],label=f[2].trim().split(/\s/)[0].slice(0,32),body=[];
        i++;
        while(i<ls.length&&!(ls[i].trim().startsWith(marker[0].repeat(marker.length))&&[...ls[i].trim()].every(c=>c===marker[0])))body.push(ls[i++]);
        if(i<ls.length)i++;
        root.append(code(label,body.join("\n")));continue;
      }
      const trimmed=line.trim();
      if(trimmed.startsWith("$$")||trimmed.startsWith("\\[")){
        const start=trimmed.startsWith("$$")?"$$":"\\[",end=start==="$$"?"$$":"\\]",body=[];
        let part=trimmed.slice(start.length);i++;
        while(!part.includes(end)&&i<ls.length){body.push(part);part=ls[i++]}
        const closeAt=part.indexOf(end);
        if(closeAt<0){
          // A missing closing delimiter is text, not an excuse to swallow
          // everything after the formula.
          const paragraph=node("p","answer-paragraph");
          inline(paragraph,start+[...body,part].join(" "));
          root.append(paragraph);continue;
        }
        body.push(part.slice(0,closeAt));root.append(math(body.join(" "),true));
        // Keep ALL text following a closed block formula on the same line.
        const remainder=part.slice(closeAt+end.length);
        if(remainder.trim())ls.splice(i,0,remainder);
        continue;
      }
      const h=head(line);
      if(h){const title=node("h"+Math.min(4,h[1].length),"answer-heading");inline(title,h[2]);root.append(title);i++;continue}
      if(rule(line)){root.append(node("hr","answer-divider"));i++;continue}
      if(/^\s*>/.test(line)){
        const group=[];while(i<ls.length&&/^\s*>/.test(ls[i]))group.push(ls[i++].replace(/^\s*>\s?/,""));
        const quote=node("blockquote","answer-quote");
        if(depth<2)blocks(quote,group.join("\n"),depth+1);
        else{const p=node("p");inline(p,group.join(" "));quote.append(p)}
        root.append(quote);continue;
      }
      if(line.includes("|")&&ls[i+1]&&separator(ls[i+1])){
        const rows=[line,ls[i+1]];i+=2;
        while(i<ls.length&&ls[i].trim().includes("|")&&rows.length<102)rows.push(ls[i++]);
        root.append(table(rows));continue;
      }
      if(item(line)){
        const ordered=/^\s{0,6}\d+[.)]\s+/.test(line),list=node(ordered?"ol":"ul","answer-list");
        let expected=null;
        while(i<ls.length&&item(ls[i])&&(/^\s{0,6}\d+[.)]\s+/.test(ls[i])===ordered)){
          const source=ls[i++];
          const li=node("li");
          if(ordered){
            const number=Number(source.match(/^\s{0,6}(\d+)[.)]\s+/)?.[1]);
            // HTML ordered-list values are signed 32-bit integers.
            // Preserve nonsequential source numbering for documents and code steps.
            if(Number.isSafeInteger(number)&&number>=0&&number<=2147483647){
              if(expected===null)list.start=number;
              else if(number!==expected)li.value=number;
              expected=number+1;
            }
          }
          inline(li,source.replace(/^\s{0,6}(?:[-*+]\s+|\d+[.)]\s+)/,""));list.append(li);
        }
        root.append(list);continue;
      }
      const para=[line];i++;
      while(i<ls.length&&!special(ls[i])&&!(ls[i].includes("|")&&ls[i+1]&&separator(ls[i+1])))para.push(ls[i++]);
      const p=node("p","answer-paragraph");inline(p,para.join(" "));root.append(p);
    }
  }
  function render(value){
    const result=node("div","rich-answer"),input=String(value??"");
    if(input.length>240000){result.classList.add("answer-plain-fallback");result.textContent=input;return result}
    try{blocks(result,input)}catch{result.classList.add("answer-plain-fallback");result.replaceChildren(document.createTextNode(input))}
    return result;
  }
  window.KazFormat={render};
})();