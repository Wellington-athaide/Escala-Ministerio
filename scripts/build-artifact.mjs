// Gera um único arquivo HTML (dist/escalas-da-igreja.html) que roda sem servidor.
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { outputFiles } = await build({
  entryPoints: [join(root, 'src', 'browser.js')],
  bundle: true,
  format: 'iife',
  minify: true,
  write: false,
  target: 'es2022',
});
const code = outputFiles[0].text.replaceAll('</script', '<\\/script');

const html = await readFile(join(root, 'public', 'index.html'), 'utf8');
if (!html.includes('<!--BUNDLE-->')) throw new Error('marcador <!--BUNDLE--> ausente em public/index.html');

await mkdir(join(root, 'dist'), { recursive: true });
await writeFile(join(root, 'dist', 'escalas-da-igreja.html'), html.replace('<!--BUNDLE-->', () => `<script>${code}</script>`));
console.log('dist/escalas-da-igreja.html gerado');
