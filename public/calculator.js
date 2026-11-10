"use strict";
/* Exact, bounded arithmetic for the independent Kaz AI BASIC calculator.
 * Supports only + - * /, parentheses, unary signs and decimal dot/comma.
 * Never evaluates arbitrary JavaScript and never sends data to a server.
 */
(function(){
  const MAX=9007199254740991n;
  function fail(code){throw Error(code)}
  function gcd(a,b){
    if(a<0n)a=-a;
    if(b<0n)b=-b;
    while(b!==0n){const r=a%b;a=b;b=r}
    return a;
  }
  function fraction(n,d=1n){
    if(d===0n)fail("ZERO");
    if(d<0n){n=-n;d=-d}
    if(n===0n)return {n:0n,d:1n};
    const div=gcd(n,d);
    n/=div;d/=div;
    if((n<0n?-n:n)>MAX*d)fail("UNSAFE");
    return {n,d};
  }
  function decimal(token){
    const [whole,part=""]=token.split(".");
    const digits=(whole||"0")+part;
    return fraction(BigInt(digits),10n**BigInt(part.length));
  }
  function evaluate(expression){
    if(typeof expression!=="string")fail("INVALID");
    const source=expression.replace(/\s/g,"").replaceAll("−","-")
      .replaceAll("×","*").replaceAll("÷","/").replaceAll(",",".");
    if(!source||source.length>150)fail("INVALID");
    const tokens=source.match(/(?:\d+(?:\.\d*)?|\.\d+|[()+*/-])/g);
    if(!tokens||tokens.join("")!==source)fail("INVALID");
    let index=0;
    const factor=()=>{
      const token=tokens[index];
      if(token==="+"||token==="-"){
        index++;
        const value=factor();
        return token==="-"?fraction(-value.n,value.d):value;
      }
      if(token==="("){
        index++;
        const value=sum();
        if(tokens[index]!==")")fail("INVALID");
        index++;
        return value;
      }
      if(!token||!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(token))fail("INVALID");
      index++;
      return decimal(token);
    };
    const product=()=>{
      let value=factor();
      while(tokens[index]==="*"||tokens[index]==="/"){
        const operation=tokens[index++];
        const right=factor();
        value=operation==="*"
          ?fraction(value.n*right.n,value.d*right.d)
          :fraction(value.n*right.d,value.d*right.n);
      }
      return value;
    };
    const sum=()=>{
      let value=product();
      while(tokens[index]==="+"||tokens[index]==="-"){
        const operation=tokens[index++];
        const right=product();
        value=operation==="+"
          ?fraction(value.n*right.d+right.n*value.d,value.d*right.d)
          :fraction(value.n*right.d-right.n*value.d,value.d*right.d);
      }
      return value;
    };
    const result=sum();
    if(index!==tokens.length)fail("INVALID");
    return result;
  }
  function formatFraction(value){
    if(value.n===0n)return "0";
    const negative=value.n<0n;
    const numerator=negative?-value.n:value.n;
    let denominator=value.d,two=0,five=0;
    while(denominator%2n===0n){denominator/=2n;two++}
    while(denominator%5n===0n){denominator/=5n;five++}
    if(denominator===1n){
      const places=Math.max(two,five);
      const scaled=numerator*(10n**BigInt(places))/value.d;
      const digits=scaled.toString().padStart(places+1,"0");
      const integer=places?digits.slice(0,-places):digits;
      const decimals=places?digits.slice(-places).replace(/0+$/,""):"";
      return (negative?"-":"")+integer+(decimals?"."+decimals:"");
    }
    // Repeating decimals cannot be expressed exactly with finite digits.
    const approximate=Number(value.n)/Number(value.d);
    if(!Number.isFinite(approximate)||approximate===0)fail("UNSAFE");
    return "≈ "+String(Number(approximate.toPrecision(15)));
  }
  const format=expression=>formatFraction(evaluate(expression));
  // Legacy numeric API used by the existing session tests and integrations.
  const compute=expression=>{
    const result=evaluate(expression);
    return Number(result.n)/Number(result.d);
  };
  window.KazCalculator=Object.freeze({compute,format});
})();
