#!/usr/bin/env node
/**
 * Generates the bundled offline voice prompts (English + Hindi) from the i18n strings.
 * macOS only (uses `say` + `afconvert`). Re-run after changing any prompt text:
 *
 *   node --experimental-strip-types scripts/gen-audio.mjs
 *
 * Output: public/audio/{en,hi}/<message_key>.m4a — precached by the service worker.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const { en } = await import(join(root, 'src/i18n/en.ts'));
const { hi } = await import(join(root, 'src/i18n/hi.ts'));
const { BUNDLED_PROMPT_KEYS } = await import(join(root, 'src/voice/prompts.ts'));

const VOICES = { en: process.env.EN_VOICE || 'Tara', hi: process.env.HI_VOICE || 'Lekha' };
const tmp = join(root, 'node_modules/.cache/carelink-audio');
mkdirSync(tmp, { recursive: true });

let n = 0;
for (const [lang, dict] of [['en', en], ['hi', hi]]) {
  const outDir = join(root, 'public/audio', lang);
  mkdirSync(outDir, { recursive: true });
  for (const key of BUNDLED_PROMPT_KEYS) {
    const text = dict[key] ?? en[key];
    if (!text) throw new Error(`No text for ${key}`);
    const file = key.replace(/\./g, '_');
    const aiff = join(tmp, `${lang}_${file}.aiff`);
    const out = join(outDir, `${file}.m4a`);
    execFileSync('say', ['-v', VOICES[lang], '-r', lang === 'hi' ? '165' : '175', '-o', aiff, text]);
    if (existsSync(out)) rmSync(out);
    execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '32000', aiff, out]);
    rmSync(aiff);
    n++;
  }
}
console.log(`Generated ${n} clips in public/audio/ (voices: ${VOICES.en}, ${VOICES.hi})`);
