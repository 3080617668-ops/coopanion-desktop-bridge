import { describe, it, expect, afterEach } from 'vitest';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { dryMountWorld, fakeWorldContext } from 'cortico/extensions/dry-mount.ts';
import { DESKTOP_BRIDGE } from '../src/definition.ts';
import { FakeHost } from './helpers/fake-host.ts';
let dir: string;
afterEach(() => { if (dir) rmSync(dir, { recursive: true, force: true }); });
describe('Desktop bridge official contract', () => {
  it('constructs with empty configuration without networking or secrets', async () => {
    dir = mkdtempSync(join(tmpdir(), 'desktop-bridge-world-'));
    const report = await dryMountWorld(DESKTOP_BRIDGE, { scratchDir: dir });
    expect(report.failures).toEqual([]);
  });
  it('starts and stops with no connector; declares all tools', async () => {
    dir = mkdtempSync(join(tmpdir(), 'desktop-bridge-world-'));
    const world = DESKTOP_BRIDGE.create(fakeWorldContext(DESKTOP_BRIDGE, { scratchDir: dir }));
    const host = new FakeHost(); await world.start(host);
    expect(host.events[0].type).toBe('desktop-bridge.started');
    expect(world.tools().map(t => t.name)).toEqual(['desktop_bridge_status', 'desktop_bridge_send']);
    await world.stop();
  });
  it('only forwards raw new operator bodies, never console PINs or pet messages', async () => {
    dir = mkdtempSync(join(tmpdir(), 'desktop-bridge-world-'));
    const world: any = DESKTOP_BRIDGE.create(fakeWorldContext(DESKTOP_BRIDGE, { scratchDir: dir }));
    const host = new FakeHost(); await world.start(host);
    const sent: string[] = [];
    world.client = { status: { selected: { id: 's1' } }, close() {} };
    world.send = async (text: string) => { sent.push(text); };
    host.store.latestCursor = () => 4;
    host.store.range = () => [
      { cursor: 2, type: 'console.message', origin: 'internal', text: 'PIN=SECRET raw', meta: { body: '用户输入' } },
      { cursor: 3, type: 'console.self', origin: 'internal', text: '桌宠回复' },
      { cursor: 4, type: 'console.message', origin: 'internal', text: 'PIN=SECRET no raw body' },
    ] as any;
    await world.scan(); expect(sent).toEqual(['用户输入']); await world.stop();
  });
});
