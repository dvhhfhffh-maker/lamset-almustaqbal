import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import ejs from 'ejs';
async function walk(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) result.push(...await walk(path));
    else result.push(path);
  }
  return result;
}
let errors = 0;
for (const dir of ['src','scripts','public','tests','views']) {
  for (const file of await walk(dir)) {
    if (/\.(mjs|js)$/.test(file)) {
      const r = spawnSync(process.execPath, ['--check',file], { encoding: 'utf8' });
      if (r.status) { console.error(file, r.stderr); errors++; }
    }
    if (file.endsWith('.ejs')) {
      try { ejs.compile(await readFile(file,'utf8'), { filename:file }); }
      catch(error) { console.error(file,error.message); errors++; }
    }
  }
}
if (errors) process.exit(1);
console.log('JavaScript syntax and EJS templates checked.');
