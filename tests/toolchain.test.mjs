import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const pkg=JSON.parse(readFileSync('package.json','utf8'));
const workflow=readFileSync('.github/workflows/shell-check.yml','utf8');
const preview=readFileSync('public/preview.html','utf8');
const main=readFileSync('public/index.html','utf8');

test('modern LTS runtime and direct tools are pinned',()=>{
  assert.equal(pkg.engines.node,'>=26 <27');
  assert.match(pkg.devDependencies.wrangler,/^\d+\.\d+\.\d+$/);
  assert.match(pkg.devDependencies['playwright-core'],/^\d+\.\d+\.\d+$/);
  assert.equal(pkg.devDependencies.wrangler,'4.158.0');
  assert.equal(pkg.devDependencies['playwright-core'],'1.65.0');
  assert.match(workflow,/node-version: '26'/);
  assert.match(workflow,/npm install --ignore-scripts/);
});
test('modern source remains vanilla HTML/CSS/JS without CDN code injection',()=>{
  assert.match(main,/^<!doctype html>/i);
  for(const script of ['app.js','session.js','i18n.js'])assert.ok(main.includes('src="./'+script+'" defer'));
  assert.ok(main.includes('href="./styles.css"'));
  assert.doesNotMatch(main,/<script[^>]+src="https?:/i);
  assert.doesNotMatch(main,/<link[^>]+href="https?:/i);
});
test('standalone preview is reproducible from version-controlled source',()=>{
  const before=preview;
  const output=execFileSync(process.execPath,['scripts/build-preview.mjs','--check'],{encoding:'utf8'});
  assert.match(output,/identical to current app sources/);
  assert.equal(readFileSync('public/preview.html','utf8'),before);
});
test('CI validates syntax, preview, actual browser and Worker compilation',()=>{
  for(const command of ['npm run lint','npm run preview:check','npm run test:unit','npm run test:browser','wrangler deploy --dry-run']){
    assert.ok(workflow.includes(command),'Missing CI stage '+command);
  }
  assert.doesNotMatch(workflow,/wrangler deploy\s*$/m);
});
