#!/usr/bin/env node
/**
 * Generates the PWA PNG icons from public/favicon.svg.
 * Runs before dev and build. Skips work if outputs already up to date.
 */
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/(\w:)/, '$1')), '..');
const svgPath = path.join(root, 'public', 'favicon.svg');
const outDir = path.join(root, 'public', 'icons');

const targets = [
  { name: 'icon-192.png',      size: 192, padding: 0,  bg: 'transparent' },
  { name: 'icon-512.png',      size: 512, padding: 0,  bg: 'transparent' },
  { name: 'icon-mask-192.png', size: 192, padding: 24, bg: '#0f766e'     },
  { name: 'icon-mask-512.png', size: 512, padding: 64, bg: '#0f766e'     },
  { name: 'scan-96.png',       size: 96,  padding: 0,  bg: 'transparent' },
  { name: 'move-96.png',       size: 96,  padding: 0,  bg: 'transparent' },
  { name: 'count-96.png',      size: 96,  padding: 0,  bg: 'transparent' },
];

async function isUpToDate() {
  if (!existsSync(outDir)) return false;
  const svgStat = await stat(svgPath);
  for (const t of targets) {
    const p = path.join(outDir, t.name);
    if (!existsSync(p)) return false;
    const s = await stat(p);
    if (s.mtimeMs < svgStat.mtimeMs) return false;
  }
  return true;
}

async function main() {
  if (await isUpToDate()) {
    console.log('[gen-icons] all icons up to date, skipping.');
    return;
  }
  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch (e) {
    console.warn('[gen-icons] sharp not installed yet. Run `npm install` first.');
    return;
  }
  await mkdir(outDir, { recursive: true });
  const svgBuf = await readFile(svgPath);

  for (const t of targets) {
    const inner = t.size - t.padding * 2;
    let img = sharp(svgBuf, { density: 384 }).resize(inner, inner, { fit: 'contain' });
    if (t.padding > 0 || t.bg !== 'transparent') {
      img = img.extend({
        top: t.padding,
        bottom: t.padding,
        left: t.padding,
        right: t.padding,
        background: t.bg === 'transparent' ? { r: 0, g: 0, b: 0, alpha: 0 } : t.bg,
      });
    }
    const out = await img.png().toBuffer();
    await writeFile(path.join(outDir, t.name), out);
    console.log(`[gen-icons] wrote ${t.name} (${t.size}x${t.size})`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
