import test from 'node:test';
import assert from 'node:assert/strict';
import {exactGridPolynomial,verifiedGridMathFacts} from '../src/exact-grid.mjs';

test('5x8 marked grid exact Kirchhoff polynomial matches independent integer computation',()=>{
  const out=exactGridPolynomial();
  assert.deepEqual(out.coefficients.map(String),[
    '0','85701353432805','381753556945200','530962920761724',
    '289818852017904','54184783956336'
  ]);
  assert.equal(String(out.countExactlyThree),'530962920761724');
  assert.equal(String(out.total),'1342421467113969');
});
test('exact grid verifier only gives numbers for explicit, unambiguous 5x8 marked cut',()=>{
  const q='Найди количество остовных деревьев сетки 5×8 c пятью выделенными рёбрами между 4-м и 5-м столбцами. Дай Python и полный многочлен.';
  const facts=verifiedGridMathFacts(q);
  assert.match(facts,/530962920761724/);
  assert.match(facts,/1342421467113969/);
  assert.equal(verifiedGridMathFacts('Сетка 5×8, пять выделенных рёбер. Найди число деревьев.'),'');
  assert.equal(verifiedGridMathFacts('Сетка 5×9, пять выделенных рёбер между 4-м и 5-м столбцами.'),'');
});
