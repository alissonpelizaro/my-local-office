// Idiomas da interface. Sem biblioteca: um objeto tipado por idioma e o store diz qual está ativo.
import { type Dict, en } from './en';
import { es } from './es';
import { pt } from './pt';

export type { Dict };
export const LANGS = ['en', 'pt', 'es'] as const;
export type Lang = (typeof LANGS)[number];
export const LANG_LABEL: Record<Lang, string> = { en: 'English', pt: 'Português', es: 'Español' };
export const DICTS: Record<Lang, Dict> = { en, pt, es };
export const isLang = (v: unknown): v is Lang => LANGS.includes(v as Lang);
