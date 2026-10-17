/**
 * Language detection for consumer-facing AI features.
 *
 * The complaint form is used by Spanish speakers, English-speaking visitors
 * (tourism, expats) and - less often - Quechua speakers. The model can answer in
 * any language, but it must be told which one: left alone it mirrors whatever
 * the prompt is written in (Spanish), which is the wrong answer for an English
 * complaint. This module keeps the detection deterministic and testable, and
 * the server passes the language name into the prompt.
 *
 * The heuristic is intentionally small: a complaint is long enough for common
 * function words to be decisive, and the default remains Spanish (the legal
 * language of the Libro de Reclamaciones) when no signal is strong.
 */

export type SupportedLanguage = 'es' | 'en' | 'qu';

const LANGUAGE_NAMES: Record<SupportedLanguage, string> = {
  es: 'español',
  en: 'inglés',
  qu: 'quechua',
};

/** The language name to put in a prompt ("Redacta en inglés"). */
export function languageName(language: SupportedLanguage): string {
  return LANGUAGE_NAMES[language];
}

const SPANISH_WORDS = new Set([
  'el', 'la', 'los', 'las', 'un', 'una', 'de', 'del', 'que', 'y', 'en', 'con',
  'por', 'para', 'mi', 'mis', 'me', 'se', 'su', 'sus', 'es', 'fue', 'pero',
  'como', 'más', 'no', 'si', 'al', 'lo', 'le', 'les', 'este', 'esta', 'esto',
  'compré', 'producto', 'servicio', 'reclamo', 'queja', 'pido', 'solicito',
  'devolución', 'reembolso', 'tienda', 'días', 'después', 'cuando', 'porque',
]);

const ENGLISH_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'of', 'to', 'in', 'on', 'at', 'for',
  'with', 'from', 'by', 'is', 'was', 'were', 'are', 'be', 'been', 'not', 'no',
  'my', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'this', 'that', 'these',
  'those', 'bought', 'purchased', 'product', 'service', 'store', 'shop',
  'refund', 'return', 'complaint', 'claim', 'days', 'after', 'when', 'because',
  'would', 'should', 'could', 'have', 'has', 'had', 'do', 'did', 'does',
]);

const QUECHUA_WORDS = new Set([
  'ñuqa', 'qam', 'pay', 'ñuqanchik', 'ñuqayku', 'kay', 'chay', 'mana', 'ari',
  'rimay', 'willakuy', 'rantiy', 'rantisqa', 'llamkay', 'wasi', 'punchaw',
  'kunan', 'paqarin', 'qayna', 'allin', 'huk', 'iskay', 'kimsa', 'tawa',
  'mikhuy', 'yaku', 'ñan', 'suti', 'runakuna', 'wawakuna', 'taki',
]);

function countMatches(words: string[], dictionary: Set<string>): number {
  let matches = 0;
  for (const word of words) {
    if (dictionary.has(word)) {
      matches += 1;
    }
  }
  return matches;
}

/**
 * Detects the language of a consumer draft.
 *
 * Returns `es` unless English or Quechua clearly wins (at least two matches and
 * strictly more than Spanish), so a single borrowed word ("delivery", "stock")
 * cannot flip the answer.
 */
export function detectLanguage(text: string): SupportedLanguage {
  const words = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .match(/[a-z]+/g) ?? [];

  const spanish = countMatches(words, new Set([...SPANISH_WORDS].map(normalize)));
  const english = countMatches(words, ENGLISH_WORDS);
  const quechua = countMatches(words, new Set([...QUECHUA_WORDS].map(normalize)));

  if (quechua >= 2 && quechua > spanish && quechua >= english) {
    return 'qu';
  }
  if (english >= 2 && english > spanish) {
    return 'en';
  }
  return 'es';
}

function normalize(word: string): string {
  return word.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}
