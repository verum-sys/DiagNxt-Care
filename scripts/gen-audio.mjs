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

// Bundled clinical dictation voice samples for offline Speak button
const dictDir = join(root, 'public/audio/dictation');
mkdirSync(dictDir, { recursive: true });
const { EXAMPLES } = await import(join(root, 'src/intelligence/parser.ts'));
const DICTATION_CONFIGS = {
  en: { voice: VOICES.en, rate: '175', text: EXAMPLES.en.replace(/'/g, '') },
  hinglish: { voice: VOICES.en, rate: '165', text: EXAMPLES.hinglish.replace(/[—–]/g, ',') },
  hindi: {
    voice: VOICES.hi,
    rate: '160',
    text: 'सुनीता देवी, 42 साल, महिला, रामपुर गांव मकान 12, फोन 9876543210। सर्वाइकल स्क्रीनिंग पूरी हुई, मुख्य निष्कर्ष नेगेटिव, रेफरल आवश्यक नहीं। वह जाएगी, लेकिन अस्पताल से अभी कोई जवाब नहीं आया।',
  },
};

for (const [key, cfg] of Object.entries(DICTATION_CONFIGS)) {
  const aiff = join(tmp, `dict_${key}.aiff`);
  const out = join(dictDir, `${key}.m4a`);
  execFileSync('say', ['-v', cfg.voice, '-r', cfg.rate, '-o', aiff, cfg.text]);
  if (existsSync(out)) rmSync(out);
  execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '32000', aiff, out]);
  rmSync(aiff);
  console.log(`Generated dictation clip: public/audio/dictation/${key}.m4a`);
}

