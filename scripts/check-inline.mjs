import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const html = await readFile('index.html', 'utf8');
const markup = html.replace(/<!--[\s\S]*?-->/g, '');
const scripts = [...markup.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)]
  .filter((match) => !/\bsrc\s*=/.test(match[1]))
  .filter((match) => !/\btype\s*=\s*["'](?:application\/json|application\/ld\+json)["']/.test(match[1]));

let failed = false;
scripts.forEach((match, index) => {
  try {
    new vm.Script(match[2], { filename: `index.html#script-${index + 1}` });
  } catch (error) {
    failed = true;
    const id = /\bid\s*=\s*["']([^"']+)["']/.exec(match[1]);
    console.error(`Inline block ${index + 1}${id ? ` (${id[1]})` : ''}: ${error.message}`);
    console.error(error.stack);
  }
});

if (failed) process.exit(1);
console.log(`Inline JavaScript syntax OK: ${scripts.length} block(s)`);
