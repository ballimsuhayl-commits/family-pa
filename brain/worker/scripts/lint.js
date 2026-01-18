import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.cwd());
const files = [
  path.join(root, 'worker.js'),
];

let ok = true;
for(const f of files){
  const s = fs.readFileSync(f,'utf8');
  if(/\beval\s*\(/.test(s) || /new\s+Function\b/.test(s)){
    console.error('lint: disallowed dynamic code in', f);
    ok = false;
  }
  if(s.includes('TODO_PLACEHOLDER')){
    console.error('lint: placeholder marker found in', f);
    ok = false;
  }
}
if(!ok) process.exit(1);
console.log('lint: ok');
