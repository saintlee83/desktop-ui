// Interface language. Text is written in English in the code and looked up by that same
// English text in the other language's dictionary, falling back to English for anything
// not translated. Placeholders are {name}: t("Deleted “{title}”", { title }).
//
// Components call `useT()` so they redraw when the language changes; code outside React
// (toasts, the terminal transcript) calls `t()` directly.

import { create } from "zustand";
import { ko } from "./i18n/ko";

export type Lang = "en" | "ko";
type Vars = Record<string, string | number>;

const DICTIONARIES: Record<Lang, Record<string, string>> = { en: {}, ko };

/** The language the system asks for, when it is one the app has. */
function systemLang(): Lang {
  const langs = typeof navigator === "undefined" ? [] : (navigator.languages ?? [navigator.language]);
  return langs.some((l) => l?.toLowerCase().startsWith("ko")) ? "ko" : "en";
}

const useLang = create<{ lang: Lang }>(() => ({ lang: systemLang() }));

/** Follows the Language setting: "system", or a language picked outright. */
export function setLanguage(pref: "system" | Lang | undefined) {
  const lang = !pref || pref === "system" ? systemLang() : pref;
  if (useLang.getState().lang !== lang) useLang.setState({ lang });
  if (typeof document !== "undefined") document.documentElement.lang = lang;
}

export const currentLang = () => useLang.getState().lang;

/** `text` in the current language, with {placeholders} filled in from `vars`. */
export function t(text: string, vars?: Vars): string {
  const lang = useLang.getState().lang;
  const out = (lang === "en" ? undefined : DICTIONARIES[lang][text]) ?? text;
  return vars ? out.replace(/\{(\w+)\}/g, (whole, key: string) => (key in vars ? String(vars[key]) : whole)) : out;
}

/**
 * English needs one form for 1 and another for the rest; the other language may not.
 * Both forms are looked up as written, with {n} filled in.
 */
export function tn(n: number, one: string, other: string, vars?: Vars): string {
  return t(n === 1 ? one : other, { n, ...vars });
}

/** `t` for components: using it redraws the component when the language changes. */
export function useT() {
  useLang((s) => s.lang);
  return t;
}
