import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { after, describe, it } from 'node:test';
import {
  FALLBACK_LOCALE,
  LOCALES,
  currentLocale,
  detectLocale,
  formatNumber,
  setLocale,
  t,
  type Message,
  type MessageKey,
} from '../../src/i18n/index.ts';

const initial = currentLocale();
after(() => setLocale(initial));

const placeholders = (message: Message): string[] =>
  (typeof message === 'string' ? [message] : Object.values(message))
    .flatMap(text => text.match(/\{\w+\}/g) ?? [])
    .filter((name, index, all) => all.indexOf(name) === index)
    .sort();

describe('locale detection', () => {
  it('picks the first supported language by its base language', () => {
    assert.equal(detectLocale(['de-AT', 'en-US']), 'de');
    assert.equal(detectLocale(['fr-FR', 'es-MX', 'de']), 'es');
    assert.equal(detectLocale(['EN_gb']), 'en');
  });

  it('falls back to English', () => {
    assert.equal(detectLocale(['fr-FR', 'it']), FALLBACK_LOCALE);
    assert.equal(detectLocale([]), FALLBACK_LOCALE);
  });
});

describe('translation files', () => {
  const english = LOCALES.en;
  const keys = Object.keys(english) as MessageKey[];

  for (const [locale, messages] of Object.entries(LOCALES)) {
    it(`${locale} translates every key with the same placeholders`, () => {
      assert.deepEqual(Object.keys(messages).sort(), [...keys].sort());
      for (const key of keys) {
        const message: Message = messages[key];
        assert.deepEqual(placeholders(message), placeholders(english[key]), `${locale}: ${key}`);
        if (typeof message !== 'string') assert.ok(message.other, `${locale}: ${key} needs an "other" form`);
      }
    });
  }

  it('covers every data-i18n key used in index.html', () => {
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
    const used = [...html.matchAll(/data-i18n(?:-[\w-]+)?="([^"]+)"/g)].map(match => match[1]);
    assert.ok(used.length > 20);
    for (const key of used) assert.ok(Object.hasOwn(english, key), `unknown key ${key}`);
  });
});

describe('t', () => {
  it('fills in placeholders and formats numbers for the language', () => {
    setLocale('en');
    assert.equal(t('gameOver.recordHint', { points: 12345 }), 'Only 12,345 points to your record!');
    setLocale('de');
    assert.equal(t('gameOver.recordHint', { points: 12345 }), 'Nur 12.345 Punkte bis zum Rekord!');
    assert.equal(formatNumber(1000), '1.000');
  });

  it('chooses the plural form from count', () => {
    setLocale('de');
    assert.equal(t('gameOver.worldHint', { count: 1, world: 'TOY BOX' }), 'Noch 1 Linie bis TOY BOX');
    assert.equal(t('gameOver.worldHint', { count: 3, world: 'TOY BOX' }), 'Noch 3 Linien bis TOY BOX');
    setLocale('es');
    assert.equal(t('combo.piecesLeft', { count: 2 }), 'Te quedan 2 piezas para mantener el combo');
  });
});
