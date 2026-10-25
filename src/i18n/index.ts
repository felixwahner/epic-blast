// Translations for every text the game shows. English is the fallback; the
// language follows the browser unless `?lang=xx` in the URL picks one.
import de from './locales/de.json' with { type: 'json' };
import en from './locales/en.json' with { type: 'json' };
import es from './locales/es.json' with { type: 'json' };

export type MessageKey = keyof typeof en;
/** A plain text, or one form per plural category (`one`, `other`, ...) chosen by `count`. */
export type Message = string | Readonly<Partial<Record<Intl.LDMLPluralRule, string>>>;
export type Messages = Readonly<Partial<Record<MessageKey, Message>>>;
export type Params = Readonly<Record<string, string | number>>;

export const LOCALES = { en, de, es } as const satisfies Record<string, Messages>;
export type Locale = keyof typeof LOCALES;
export const FALLBACK_LOCALE: Locale = 'en';

const isLocale = (value: string): value is Locale => Object.hasOwn(LOCALES, value);

/** The first supported language in the browser's preference list, matched by its base language. */
export function detectLocale(languages: readonly string[]): Locale {
  for (const language of languages) {
    const base = language.toLowerCase().split(/[-_]/)[0];
    if (isLocale(base)) return base;
  }
  return FALLBACK_LOCALE;
}

function browserLanguages(): string[] {
  const nav = globalThis.navigator;
  const languages = nav?.languages?.length ? [...nav.languages] : nav?.language ? [nav.language] : [];
  const override = globalThis.location ? new URLSearchParams(globalThis.location.search).get('lang') : null;
  return override ? [override, ...languages] : languages;
}

let locale: Locale = detectLocale(browserLanguages());
let plurals = new Intl.PluralRules(locale);
let numbers = new Intl.NumberFormat(locale);

export function currentLocale(): Locale {
  return locale;
}

export function setLocale(next: Locale): void {
  locale = next;
  plurals = new Intl.PluralRules(next);
  numbers = new Intl.NumberFormat(next);
}

export function formatNumber(value: number): string {
  return numbers.format(value);
}

/** Looks `key` up in the current language, falls back to English and fills in `{name}` placeholders. */
export function t(key: MessageKey, params: Params = {}): string {
  const message: Message = (LOCALES[locale] as Messages)[key] ?? en[key];
  let text: string;
  if (typeof message === 'string') text = message;
  else {
    const count = Number(params.count ?? 0);
    text = message[plurals.select(count)] ?? message.other ?? '';
  }
  return text.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = params[name];
    if (value === undefined) return match;
    return typeof value === 'number' ? formatNumber(value) : value;
  });
}

const TRANSLATED_ATTRIBUTES = ['aria-label', 'title'] as const;

/**
 * Translates the static page: `data-i18n` sets an element's text,
 * `data-i18n-aria-label` and `data-i18n-title` set those attributes.
 */
export function translatePage(root: Document = document): void {
  root.documentElement.lang = locale;
  for (const element of root.querySelectorAll<HTMLElement>('[data-i18n]'))
    element.textContent = t(element.dataset.i18n as MessageKey);
  for (const attribute of TRANSLATED_ATTRIBUTES)
    for (const element of root.querySelectorAll(`[data-i18n-${attribute}]`))
      element.setAttribute(attribute, t(element.getAttribute(`data-i18n-${attribute}`) as MessageKey));
}
