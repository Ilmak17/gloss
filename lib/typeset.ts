import { blockText, type Article } from "./article";

/**
 * Display-only typography for book text. Some EPUBs use a spaced hyphen
 * where print uses a dash. The swap is one character for one, so anchors,
 * search offsets and narration timings, which all count characters in the
 * stored text, still land on the same words. Stored text is never changed:
 * narration and its audio cache keep reading the original.
 */
export function typesetDashes(text: string): string {
  return text.includes(" - ") ? text.replaceAll(" - ", " – ") : text;
}

/** Two or more capitals standing as a word, allowing a plural or possessive "s" after them. */
const ABBREVIATION = /(?<![\p{L}\p{N}])\p{Lu}{2,}(?=s?(?![\p{L}\p{N}]))/gu;

/** Roman numerals (World War II, Louis XIV) read as numbers, not abbreviations. */
const ROMAN = /^[IVX]+$/;

/**
 * Abbreviations to set in small capitals, as [from, to) offsets into the text.
 * Capitals that run on as words ("STOP IT NOW") are emphasis, and text with no
 * lowercase at all is set in capitals on purpose: both keep their full height.
 * Display-only: the letters are not changed, only how they are drawn.
 */
export function abbreviations(text: string): [number, number][] {
  if (!/\p{Ll}/u.test(text)) return [];
  const found = [...text.matchAll(ABBREVIATION)].map(m => [m.index, m.index + m[0].length] as [number, number]);
  const runsOn = (a: [number, number], b: [number, number]) => /^\s+$/u.test(text.slice(a[1], b[0]));
  return found.filter((m, i) =>
    !ROMAN.test(text.slice(m[0], m[1])) &&
    !(i > 0 && runsOn(found[i - 1], m)) &&
    !(i < found.length - 1 && runsOn(m, found[i + 1])));
}

/**
 * The language to set a text in, so the browser hyphenates its words. Texts
 * saved before languages were kept have none: one written mostly in Cyrillic
 * is taken as Russian; anything else keeps the page's English.
 */
export function readingLang(article: Article): string | undefined {
  if (article.lang) return article.lang;
  let cyrillic = 0, letters = 0;
  for (const b of article.blocks) {
    for (const ch of blockText(b)) {
      if (!/\p{L}/u.test(ch)) continue;
      letters++;
      if (/\p{Script=Cyrillic}/u.test(ch)) cyrillic++;
    }
    if (letters > 4000) break;
  }
  return letters && cyrillic / letters > 0.5 ? "ru" : undefined;
}
