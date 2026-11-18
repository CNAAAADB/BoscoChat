// Dependency-minimal React/CSS bundling without Vite, picomatch or globs.
// AWS Amplify provides the VITE_* variables at build time.
import { build, context } from 'esbuild';
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const root = new URL('../', import.meta.url);
const folder = (relative) => new URL(relative, root);
const serve = process.argv.includes('--serve');

const publicEnv = {
  MODE: serve ? 'development' : 'production',
  DEV: serve,
  PROD: !serve,
};
for (const [name, value] of Object.entries(process.env)) {
  if (name.startsWith('VITE_')) publicEnv[name] = value;
}

await rm(folder('dist/'), { recursive: true, force: true });
await mkdir(folder('dist/assets/'), { recursive: true });
await cp(folder('public/'), folder('dist/'), { recursive: true });

const html = await readFile(folder('index.html'), 'utf8');
if (!html.includes('<script type="module" src="/src/main.jsx"></script>')) {
  throw new Error('Unexpected HTML entry point: update the esbuild HTML template.');
}
const output = html.replace(
  '<script type="module" src="/src/main.jsx"></script>',
  '<link rel="stylesheet" href="/assets/app.css" />\n    <script type="module" src="/assets/app.js"></script>',
);
await writeFile(folder('dist/index.html'), output);

const options = {
  absWorkingDir: new URL('.', root).pathname,
  entryPoints: ['src/main.jsx'],
  outfile: 'dist/assets/app.js',
  bundle: true,
  format: 'esm',
  platform: 'browser',
  target: 'es2020',
  jsx: 'automatic',
  sourcemap: serve,
  minify: !serve,
  legalComments: 'none',
  define: { 'import.meta.env': JSON.stringify(publicEnv) },
  loader: { '.svg': 'file', '.png': 'file', '.jpg': 'file', '.webp': 'file' },
  assetNames: 'assets/[name]-[hash]',
  publicPath: '/',
  logLevel: 'info',
};

if (serve) {
  const ctx = await context(options);
  await ctx.watch();
  const { host, port } = await ctx.serve({ servedir: 'dist', host: '127.0.0.1', port: 5173 });
  process.stdout.write(`BoscoChat development server: http://${host}:${port}\n`);
} else {
  await build(options);
}
