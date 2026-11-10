import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

// Load only the independent calculation engine: no browser, network or AI is required.
const window={};
runInNewContext(readFileSync('public/calculator.js','utf8'),{window},{timeout:1000});
const {compute,format}=window.KazCalculator;
test('basic arithmetic, precedence, parentheses and unary operations are correct',()=>{
  for(const [input,expected] of [
    ['25+15','40'],['50-20','30'],['12*5','60'],['100/4','25'],
    ['3+4*2','11'],['(3+4)*2','14'],['(15+7)×2','44'],
    ['100÷4','25'],['(8-10)*(-3)','6'],['5--2','7'],
    ['2*-3','-6'],['-(2+3)','-5'],['++--3','3'],
    ['7/2*4','14'],['2*(3+(4*5))','46'],
    ['1 - (2 - 3)','2'],['0-0','0'],['-0','0'],
    ['2/2/2','0.5'],['9-4-3','2']
  ])assert.equal(format(input),expected,input);
});
test('decimal math is exact for terminating fractions instead of floating-point noise',()=>{
  for(const [input,expected] of [
    ['0.1+0.2','0.3'],['0,1+0,2','0.3'],
    ['0.3-0.2','0.1'],['0.7*0.1','0.07'],
    ['1/8','0.125'],['0.0001*0.00001','0.000000001'],
    ['.5+5.','5.5'],['2,5×4','10'],[' 1 000 / 4 ','250'],
    ['−2+5','3'],['0.1+0.2-0.3','0'],
    ['0.0000000000000000000001*0.1','0.00000000000000000000001'],
    ['9007199254740990.999','9007199254740990.999'],
    ['(1/3)*3','1'],['1/10+2/10','0.3']
  ])assert.equal(format(input),expected,input);
});
test('repeating fractions are explicitly approximate, without pretending to be exact',()=>{
  assert.equal(format('1/3'),'≈ 0.333333333333333');
  assert.equal(format('-1/3'),'≈ -0.333333333333333');
  assert.equal(format('1/6'),'≈ 0.166666666666667');
  assert.equal(format('1/7'),'≈ 0.142857142857143');
  assert.equal(format('0/3'),'0');
});
test('division by zero, too-large numbers and invalid syntax are controlled',()=>{
  for(const input of ['1/0','0/0','(5-5)/(3-3)','1/(1-1)'])
    assert.throws(()=>format(input),e=>e.message==='ZERO',input);
  for(const input of ['9007199254740992','9007199254740991+1',
    '9007199254740991*2','9007199254740991+0.01','-9007199254740992'])
    assert.throws(()=>format(input),e=>e.message==='UNSAFE',input);
  for(const input of ['','   ','5+','(2+3','2+3)','2(3)','3..4','2**3',
    '1e3','0x10','2^3','1/Infinity','Math.random()','alert(1)','NaN',
    '1;window.bad=true','100%2','.'.repeat(151)])
    assert.throws(()=>format(input),e=>e.message==='INVALID',input);
  assert.throws(()=>format(null),e=>e.message==='INVALID');
  assert.throws(()=>format(100),e=>e.message==='INVALID');
});
test('boundary cases and internal legacy numeric API remain stable',()=>{
  assert.equal(format('9007199254740991'),'9007199254740991');
  assert.equal(format('9007199254740990+1'),'9007199254740991');
  assert.equal(compute('9007199254740991'),9007199254740991);
  assert.equal(compute('3+4*2'),11);
  assert.equal(compute('0,1+0,2'),0.3);
  assert.equal(compute('1/10000000000'),1e-10);
  assert.equal(format('1/'+('0'.repeat(60)+'1')),'1');
  const nested='('.repeat(60)+'4'+')'.repeat(60);
  assert.equal(format(nested),'4');
});
test('200 deterministic precedence, decimal and sign cases match independent integer arithmetic',()=>{
  let seed=0xC0FFEE;
  const next=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%10000};
  for(let i=0;i<200;i++){
    const a=next(),b=next(),c=next()||1;
    assert.equal(format(a+'+'+b+'*'+c),String(a+b*c));
    assert.equal(format('('+a+'-'+b+')*'+c),String((a-b)*c));
    assert.equal(format(a+'/10+'+b+'/10'),String((a+b)/10));
  }
});
