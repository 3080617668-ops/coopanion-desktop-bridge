import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
const root = fileURLToPath(new URL('../', import.meta.url));
await build({ entryPoints: [root + 'packages/world/src/webui/client.ts'], outfile: root + 'packages/world/dist/webui.js', bundle: true, format: 'esm', target: 'es2022' });
await build({ entryPoints: [root + 'packages/world/src/index.ts'], outfile: root + 'packages/world/dist/index.js', bundle: true, platform: 'node', format: 'esm', target: 'node22', external: ['cortico/*', 'bufferutil', 'utf-8-validate'], banner: { js: "import { createRequire as bridgeCreateRequire } from 'node:module'; const require = bridgeCreateRequire(import.meta.url);" } });
await copyFile(root + 'packages/world/src/ENV_PROMPT.md', root + 'packages/world/dist/ENV_PROMPT.md');
const output = root + 'install/world/';
await mkdir(output + 'dist', { recursive: true });
for (const name of ['package.json', 'describe.json', 'LICENSE', 'THIRD_PARTY_NOTICES.md', 'README.md', 'CHANGELOG.md']) {
  await copyFile(root + 'packages/world/' + name, output + name);
}
for (const name of ['index.js', 'webui.js', 'ENV_PROMPT.md']) await copyFile(root + 'packages/world/dist/' + name, output + 'dist/' + name);
await copyFile(root + 'node_modules/ws/LICENSE', root + 'packages/world/LICENSE.ws');
await copyFile(root + 'node_modules/ws/LICENSE', output + 'LICENSE.ws');
const manifest = JSON.parse(await readFile(output + 'package.json', 'utf8'));
delete manifest.devDependencies;
delete manifest.scripts;
delete manifest.packageManager;
manifest.files = ['dist', 'describe.json', 'LICENSE', 'LICENSE.ws', 'THIRD_PARTY_NOTICES.md', 'README.md', 'CHANGELOG.md'];
await writeFile(output + 'package.json', JSON.stringify(manifest, null, 2) + '\n');
console.log('已构建独立 World 安装包：install/world（不需要工作区或 node_modules）。');
