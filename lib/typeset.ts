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
