import { mkdtempSync, rmSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { exportDescribe, checkDescribe } from 'cortico/extensions/describe-export.ts';
import { parseExtensionManifest } from 'cortico/extensions/manifest.ts';
import { dryMountWorld } from 'cortico/extensions/dry-mount.ts';
import definition from '../src/index.ts';
const packageDir = resolve(fileURLToPath(new URL('../', import.meta.url)));
const scratchDir = mkdtempSync(join(tmpdir(), 'desktop-bridge-check-'));
try {
  const opts = { packageDir, scratchDir };
  const manifest = parseExtensionManifest(JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8')));
  if (!manifest.ok) throw new Error(JSON.stringify(manifest.reasons));
  if (!existsSync(join(packageDir, manifest.manifest.webUiClient!))) throw new Error('面板产物不存在，请先 pnpm build。');
  if (process.argv.includes('--write')) {
    writeFileSync(join(packageDir, 'describe.json'), JSON.stringify(await exportDescribe('world', definition, opts), null, 2) + '\n');
  }
  const dry = await dryMountWorld(definition, { ...opts, hasWebUiClient: true });
  const description = await checkDescribe('world', definition, 'describe.json', opts);
  const failures = [...dry.failures, ...description.failures];
  console.log(JSON.stringify({ manifest, dryMount: dry, describe: description }, null, 2));
  if (failures.length) process.exitCode = 1;
} finally { rmSync(scratchDir, { recursive: true, force: true }); }
