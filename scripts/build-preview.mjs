import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const path=name=>resolve(root,'public',name);
const read=name=>readFileSync(path(name),'utf8');
const once=(text,find,replacement,name)=>{
  if(text.split(find).length!==2)throw new Error('Expected exactly one '+name);
  return text.replace(find,()=>replacement);
};
export function buildPreview(){
  const html=read('index.html');
  const css=read('styles.css');
  const scripts=['app.js','calculator.js','session.js','i18n.js'].map(read);
  if(css.includes('</style')||scripts.some(s=>s.includes('</script'))){
    throw new Error('Unsafe closing tag in embeddable source');
  }
  let preview=once(html,'<head>','<head>\n<meta name="robots" content="noindex,follow">','preview robots policy');
  preview=once(preview,
    '<link rel="stylesheet" href="./styles.css">',
    '<style>\n'+css+'\n</style>','stylesheet');
  for(const name of ['app.js','calculator.js','session.js','i18n.js']){
    preview=once(preview,'<script src="./'+name+'" defer></script>','','external script '+name);
  }
  const inline=scripts.map(code=>'<script>\n'+code+'\n</script>').join('\n');
  preview=once(preview,'</body>',inline+'\n</body>','body');
  // Preview HTML is served from third-party static mirrors. Embed the real PNG
  // so tab icons work even if a mirror does not serve neighboring image assets.
  const favicon=readFileSync(path('favicon.png')).toString('base64');
  preview=once(preview,'href="./favicon.png?v=20261114"',
    'href="data:image/png;base64,'+favicon+'"','self-contained browser tab icon');
  if(![css,...scripts].every(source=>preview.includes(source))){
    throw new Error('Preview content changed unexpectedly during generation');
  }
  return preview;
}
const mode=process.argv[2];
if(mode==='--check'){
  if(read('preview.html')!==buildPreview()){
    console.error('The static preview is stale. Run npm run preview:build before committing.');
    process.exitCode=1;
  }else console.log('Static preview is identical to current app sources.');
}else if(mode==='--write'){
  writeFileSync(path('preview.html'),buildPreview(),'utf8');
  console.log('Updated public/preview.html');
}else{
  console.error('Usage: node scripts/build-preview.mjs --write | --check');
  process.exitCode=2;
}
