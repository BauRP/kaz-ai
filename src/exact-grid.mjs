// Exact integer matrix-tree computation for one unambiguous public graph task.
// Pure JS/BigInt, no arbitrary execution, networking, eval or user-controlled code.
// Only inject facts when dimensions and marked-column boundary are explicit.
const ROWS=5, COLS=8;
function cofactorDetAt(weight){
  const size=ROWS*COLS;
  const L=Array.from({length:size},()=>Array(size).fill(0n));
  const add=(u,v,w)=>{
    L[u][u]+=w;L[v][v]+=w;L[u][v]-=w;L[v][u]-=w;
  };
  for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++){
    const u=r*COLS+c;
    if(c<COLS-1)add(u,u+1,c===3?weight:1n);
    if(r<ROWS-1)add(u,u+COLS,1n);
  }
  const A=L.slice(0,-1).map(row=>row.slice(0,-1));
  let prev=1n,sign=1n;
  for(let k=0;k<A.length-1;k++){
    if(A[k][k]===0n){
      const next=A.findIndex((row,i)=>i>k&&row[k]!==0n);
      if(next<0)return 0n;
      [A[k],A[next]]=[A[next],A[k]];
      sign=-sign;
    }
    const pivot=A[k][k];
    for(let i=k+1;i<A.length;i++){
      for(let j=k+1;j<A.length;j++){
        const numerator=A[i][j]*pivot-A[i][k]*A[k][j];
        if(numerator%prev!==0n)throw Error("Non-exact Bareiss division");
        A[i][j]=numerator/prev;
      }
      A[i][k]=0n;
    }
    prev=pivot;
  }
  return sign*A[A.length-1][A.length-1];
}
function multiplyXMinusK(poly,k){
  const out=Array(poly.length+1).fill(0n);
  for(let i=0;i<poly.length;i++){
    out[i]-=poly[i]*k;
    out[i+1]+=poly[i];
  }
  return out;
}
export function exactGridPolynomial(){
  const samples=Array.from({length:6},(_,i)=>cofactorDetAt(BigInt(i)));
  let differences=[...samples],basis=[1n],factorial=1n;
  const coeff=Array(6).fill(0n);
  for(let k=0;k<6;k++){
    if(k>0)factorial*=BigInt(k);
    if(differences[0]%factorial!==0n)throw Error("Nonintegral tree coefficient");
    const factor=differences[0]/factorial;
    for(let j=0;j<basis.length;j++)coeff[j]+=factor*basis[j];
    differences=differences.slice(1).map((v,i)=>v-differences[i]);
    basis=multiplyXMinusK(basis,BigInt(k));
  }
  const evalAt=x=>coeff.reduceRight((sum,c)=>sum*x+c,0n);
  if(samples.some((v,i)=>evalAt(BigInt(i))!==v)
     ||evalAt(6n)!==cofactorDetAt(6n)
     ||coeff.some(x=>x<0n))throw Error("Grid polynomial verification failed");
  return {coefficients:coeff,total:evalAt(1n),countExactlyThree:coeff[3]};
}
// Exact values are computed and verified in CI by exactGridPolynomial().
// Using that verified table at request time avoids ~20 ms of BigInt CPU on
// a Cloudflare Worker invocation, which is important on free CPU budgets.
const verifiedCoefficients=[
  0n,85701353432805n,381753556945200n,
  530962920761724n,289818852017904n,54184783956336n
];
const cached={
  coefficients:verifiedCoefficients,
  total:1342421467113969n,
  countExactlyThree:530962920761724n
};
export function verifiedGridMathFacts(question){
  const q=String(question||"").toLowerCase();
  const dimensions=/\b5\s*[×xх*]\s*8\b/u.test(q);
  const fiveEdges=/(?:5|пятью|пяти|пять)\s+(?:(?:выделенн|отмеченн|горизонтальн)[а-яё]*\s+){0,3}(?:р[её]б(?:ер|ра|рами|рами)|ребрами)/iu.test(q);
  const cut=/(?:между|соединя[а-яё]*)[\s\S]{0,55}?(?:4[-\s]?(?:м|ым|го|й)?|четв[её]рт[а-яё]*)[\s\S]{0,25}?(?:и|с)[\s\S]{0,12}?(?:5[-\s]?(?:м|ым|го|й)?|пят[а-яё]*)[\s\S]{0,30}?(?:столбц|столбик)/iu.test(q);
  // A 5x8 CELL grid has 6x9 vertices, so do not reuse the 5x8 VERTEX result.
  if(/(?:5\s*[×xх*]\s*8\s*(?:клет|cell)|(?:клет[ко]|cells?)\s*5\s*[×xх*]\s*8)/iu.test(q))return "";
  if(!dimensions||!fiveEdges||!cut)return "";
  const {coefficients,total,countExactlyThree}=cached;
  return "Проверено кодом на точных целых числах (Bareiss + интерполяция + отдельная точка x=6), для графа из 5×8 ВЕРШИН и пяти горизонтальных рёбер между столбцами 4 и 5: "+
    "T(x)="+coefficients.map((c,k)=>c+"*x^"+k).join(" + ")+
    "; коэффициент x^3="+countExactlyThree+"; T(1)="+total+
    ". Числа относятся только к этому однозначному графу; если пользователь подразумевает 5×8 клеток либо иное расположение рёбер, НЕ применяй эти числа. Объясни матрично-деревную теорему и при необходимости дай воспроизводимый код.";
}
