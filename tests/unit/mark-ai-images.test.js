import { beforeAll, afterEach, describe, expect, test } from 'vitest';
import { createRequire } from 'node:module';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { createCanvas, loadImage } = require('canvas');
const { setup, mark } = require('../../scripts-dev/mark-ai-images.cjs');
const directories = [];
async function fixture(extension) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'gm-mark-'));
  directories.push(dir);
  const file = path.join(dir, `fixture.${extension}`);
  const canvas = createCanvas(512, 384);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#a6adbb'; ctx.fillRect(0, 0, 512, 384);
  await fs.writeFile(file, canvas.toBuffer(extension === 'png' ? 'image/png' : 'image/jpeg'));
  return file;
}
beforeAll(setup);
afterEach(async () => { for (const dir of directories.splice(0)) await fs.rm(dir, { recursive: true, force: true }); });
describe('visible AI fixture marking', () => {
  test.each(['jpeg', 'png'])('marks %s once and skips even with a different requested size', async extension => {
    const file = await fixture(extension);
    const original = await fs.readFile(file);
    expect(await mark(file, '15%', false)).toMatch(/^MARKED/);
    const marked = await fs.readFile(file);
    expect(marked.equals(original)).toBe(false);
    const decoded = await loadImage(marked);
    expect([decoded.width, decoded.height]).toEqual([512, 384]);
    expect(await mark(file, '120', false)).toMatch(/^SKIP/);
    expect((await fs.readFile(file)).equals(marked)).toBe(true);
  });
  test('dry-run and invalid sizes leave original bytes intact', async () => {
    const file = await fixture('png');
    const original = await fs.readFile(file);
    expect(await mark(file, '100', true)).toMatch(/^WOULD MARK/);
    await expect(mark(file, '2000', false)).rejects.toThrow('does not fit');
    expect((await fs.readFile(file)).equals(original)).toBe(true);
  });
  test('corrupt input is not overwritten', async () => {
    const file = await fixture('jpeg');
    const broken = Buffer.from('not an image');
    await fs.writeFile(file, broken);
    await expect(mark(file, '100', false)).rejects.toThrow('Only JPEG and PNG');
    expect((await fs.readFile(file)).equals(broken)).toBe(true);
  });
});
