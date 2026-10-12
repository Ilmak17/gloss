/**
 * The edition's pages as HTML: a text with its highlights and notes, the
 * opening of each piece, and the front cover. One source for the book you
 * leaf through before ordering and for the press, so what you see is what
 * arrives. Every size is in em, so the same markup sets at any scale: the
 * press sets 10.5 point type on a 6 inch page, the preview whatever fits.
 *
 * Plain strings, no React: the server builds whole documents from these.
 */

import { blockText, isShouting, tidyTitle, titleCase, type Block, type Run } from "@/lib/article";
import { editionTitle, monthName, type PrintMark, type PrintText } from "@/lib/edition";
import { hostOf, TOPIC, type TopicKey } from "@/lib/library";
import { MARKERS, type Marker } from "@/lib/settings";

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Marker inks as they print: a wash light enough to read through. */
export const MARK_WASH: Record<Marker, string> = {
  yellow: "rgba(242, 196, 56, 0.42)",
  green: "rgba(124, 198, 111, 0.36)",
  blue: "rgba(106, 168, 240, 0.32)",
  pink: "rgba(240, 132, 172, 0.34)",
};
export const markerColor = (m?: Marker) => MARKERS.find((x) => x.key === m)?.color ?? MARKERS[0].color;

/** The cover's paper and ink: white, and nearly black. */
export const PAPER = "#fbfaf7";
export const INK = "#151412";

/** A piece's inks: its topic's shades, for the type inside. */
export function inksOf(topic: TopicKey) {
  const [base, light, deep, pale] = TOPIC[topic].shades;
  return { base, light, deep, pale };
}

/* ---------- a text, with your marks ---------- */

type Range = { s: number; e: number; color: Marker };
type Note = { note: string; color: Marker };

/** Each block's highlighted ranges, and the notes that end in it. A mark can run across blocks. */
export function placeMarks(blocks: Block[], marks: PrintMark[]) {
  const at = new Map(blocks.map((b, i) => [b.id, i]));
  const ranges = new Map<string, Range[]>();
  const notes = new Map<string, Note[]>();
  for (const m of marks) {
    let si = at.get(m.start.b);
    let ei = at.get(m.end.b);
    if (si === undefined || ei === undefined) continue;
    let start = m.start, end = m.end;
    if (si > ei || (si === ei && start.o > end.o)) {
      [si, ei] = [ei, si];
      [start, end] = [end, start];
    }
    const color = m.color ?? "yellow";
    for (let i = si; i <= ei; i++) {
      const b = blocks[i];
      const len = blockText(b).length;
      const s = Math.max(0, i === si ? start.o : 0);
      const e = Math.min(len, i === ei ? end.o : len);
      if (e > s) ranges.set(b.id, [...(ranges.get(b.id) ?? []), { s, e, color }]);
    }
    const note = m.note?.trim();
    if (note) notes.set(blocks[ei].id, [...(notes.get(blocks[ei].id) ?? []), { note, color }]);
  }
  return { ranges, notes };
}

export type Hyphenate = (s: string) => string;
const same: Hyphenate = (s) => s;

/**
 * Typographer's quotes for straight ones, and for TeX's `` and '' that old
 * pages still carry. One entry per character, so marks keep their offsets.
 */
function curl(text: string): (string | undefined)[] {
  const out: (string | undefined)[] = new Array(text.length);
  const opens = (i: number) => i === 0 || /[\s([{\u2014\u2013\u201C\u2018-]/.test(text[i - 1]);
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === "`" && text[i + 1] === "`") {
      out[i] = "\u201C";
      out[++i] = "";
    } else if (c === "'" && text[i + 1] === "'") {
      out[i] = "\u201D";
      out[++i] = "";
    } else if (c === '"') out[i] = opens(i) ? "\u201C" : "\u201D";
    else if (c === "'") out[i] = opens(i) && /\S/.test(text[i + 1] ?? "") ? "\u2018" : "\u2019";
    else if (c === "`") out[i] = "\u2018";
  }
  return out;
}

/** A block's runs as inline HTML, with highlights laid over them. */
function inline(runs: Run[], ranges: Range[] = [], hy: Hyphenate = same): string {
  const text = runs.map((r) => r.text).join("");
  const cuts = new Set([0, text.length]);
  let pos = 0;
  const starts: number[] = [];
  for (const r of runs) {
    starts.push(pos);
    pos += r.text.length;
    cuts.add(pos);
  }
  for (const r of ranges) cuts.add(r.s).add(r.e);
  const points = [...cuts].filter((c) => c >= 0 && c <= text.length).sort((a, b) => a - b);
  const typo = curl(text);
  let out = "";
  let ri = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i], b = points[i + 1];
    if (b <= a) continue;
    while (ri < runs.length - 1 && starts[ri + 1] <= a) ri++;
    const run = runs[ri];
    let piece = "";
    for (let j = a; j < b; j++) piece += run.code ? text[j] : (typo[j] ?? text[j]);
    let html = run.code ? esc(piece) : esc(hy(piece));
    if (run.code) html = `<code>${html}</code>`;
    if (run.strong) html = `<strong>${html}</strong>`;
    if (run.em) html = `<em>${html}</em>`;
    const on = ranges.filter((r) => r.s <= a && r.e >= b).at(-1);
    if (on) html = `<mark class="hl hl-${on.color}">${html}</mark>`;
    out += html;
  }
  return out;
}

/** Pictures that will print: the press passes a map of the ones it fetched. Unmapped, a picture keeps its address. */
export type ImageSource = (src: string) => string | null;
const asIs: ImageSource = (src) => src;

export type BodyOptions = {
  hyphenate?: Hyphenate;
  image?: ImageSource;
  /** Stop after about this many words: a page for the preview. */
  words?: number;
  /** False for a text's last page: no drop cap on what is not its first paragraph. */
  lede?: boolean;
};

/** A text's blocks as HTML: paragraphs, headings, lists, quotes, code, pictures and tables, with the reader's marks and notes. */
export function bodyHTML(t: Pick<PrintText, "blocks" | "marks">, opts: BodyOptions = {}): string {
  const { ranges, notes } = placeMarks(t.blocks, t.marks);
  const hy = opts.hyphenate ?? same;
  const image = opts.image ?? asIs;
  const out: string[] = [];
  let list: string[] = [];
  let first = opts.lede !== false;
  let words = 0;
  const flush = () => {
    if (list.length) out.push(`<ul>${list.join("")}</ul>`);
    list = [];
  };
  for (const b of t.blocks) {
    if (opts.words && words >= opts.words) break;
    const html = inline(b.runs, ranges.get(b.id), hy);
    const text = blockText(b);
    if (b.type !== "li") flush();
    switch (b.type) {
      case "p":
        if (!text.trim()) continue;
        // A drop cap opens a real paragraph, not a dateline or a one-line preface.
        out.push(first ? `<p class="${text.trim().length >= 160 && /^[A-Za-z]/.test(text.trim()) ? "lede" : "first"}">${html}</p>` : `<p>${html}</p>`);
        first = false;
        break;
      case "h2":
      case "h3":
        // Shouting headings come down to title case, which keeps their length, so marks stay put.
        out.push(`<${b.type}>${isShouting(text) ? inline(b.runs.map((r) => ({ ...r, text: titleCase(r.text) })), ranges.get(b.id)) : inline(b.runs, ranges.get(b.id))}</${b.type}>`);
        break;
      case "li":
        list.push(`<li>${html}</li>`);
        break;
      case "quote":
        out.push(`<blockquote><p>${html}</p></blockquote>`);
        break;
      case "pre":
        out.push(`<pre>${esc(text.replace(/\t/g, "  ").replace(/\n+$/, ""))}</pre>`);
        break;
      case "note":
        out.push(`<aside class="callout">${html}</aside>`);
        break;
      case "figure": {
        const src = b.src ? image(b.src) : null;
        if (!src) continue;
        out.push(`<figure><img src="${esc(src)}" alt="${esc(b.alt ?? "")}" referrerpolicy="no-referrer">${text.trim() ? `<figcaption>${html}</figcaption>` : ""}</figure>`);
        break;
      }
      case "table": {
        const rows = (b.rows ?? []).slice(0, 80);
        if (!rows.length) continue;
        const cells = (r: string[], tag: "th" | "td") => r.map((c) => `<${tag}>${esc(c)}</${tag}>`).join("");
        const [head, ...rest] = b.head ? rows : [null, ...rows];
        out.push(`<table class="data">${head ? `<thead><tr>${cells(head, "th")}</tr></thead>` : ""}<tbody>${rest.map((r) => `<tr>${cells(r as string[], "td")}</tr>`).join("")}</tbody></table>`);
        break;
      }
    }
    for (const n of notes.get(b.id) ?? []) out.push(`<p class="your-note" style="--mk:${markerColor(n.color)}"><span class="pen">Your note</span> ${esc(hy(n.note))}</p>`);
    words += text.split(/\s+/).length;
  }
  flush();
  return out.join("\n");
}

/* ---------- the opening of a piece ---------- */

export const minutesOf = (words: number) => Math.max(1, Math.round(words / 230));

/** Where a text came from, for its byline: the site, and the year when there is one. */
export function sourceLine(t: Pick<PrintText, "source" | "sourceUrl" | "published">): string {
  const host = hostOf(t.sourceUrl) ?? t.source?.split(",")[0].trim();
  const year = t.published?.match(/\b(1[5-9]\d\d|20\d\d)\b/)?.[1];
  return [host, year].filter(Boolean).join(" · ");
}

/** A short title for the running head. */
export function shortTitle(title: string, max = 52): string {
  const t = tidyTitle(title).replace(/\s*[:|–—-]\s+.*$/, (m) => (title.length > max ? "" : m));
  return t.length > max ? `${t.slice(0, max - 1).replace(/\s+\S*$/, "")}…` : t;
}

export function openerHTML(t: PrintText, opts: { no: number; words: number }): string {
  const topic = TOPIC[t.topic];
  const by = t.author?.trim();
  const src = sourceLine(t);
  return `<header class="opener">
  <p class="kicker"><span class="topic">${esc(topic.key === "unsorted" ? "Saved" : topic.name)}</span><span class="no">${String(opts.no).padStart(2, "0")}</span></p>
  <h1 class="title">${esc(tidyTitle(t.title))}</h1>
  <span class="rh">${esc(shortTitle(t.title))}</span>
  ${by ? `<p class="byline">${esc(by)}</p>` : ""}
  <p class="meta">${[src && esc(src), `${minutesOf(opts.words)} min`].filter(Boolean).join(" · ")}</p>
</header>`;
}

/* ---------- the front cover ---------- */

/** A piece as the cover draws it: a line as long as the piece, and a mark on it for each of your highlights. */
export type CoverRow = { id: string; words: number; marks: { color?: Marker; note?: boolean }[] };

export type CoverView = {
  name: string;
  month: string;
  theme: string;
  topic: TopicKey;
  count: number;
  rows: CoverRow[];
};

/** The cover's rows for texts as they go to press, in the book's order. */
export function coverRows(texts: Pick<PrintText, "id" | "blocks" | "marks">[]): CoverRow[] {
  return texts.map((t) => ({
    id: t.id,
    words: t.blocks.reduce((n, b) => n + blockText(b).split(/\s+/).filter(Boolean).length, 0),
    marks: t.marks.map((m) => ({ color: m.color, note: Boolean(m.note?.trim()) })),
  }));
}

/** The Gloss mark: lines of text with a note in the margin. */
export const MARK_SVG = (ink: string, dot: string) =>
  `<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 6.5h10.5M3 11.5h10.5M3 16.5h6.5" stroke="${ink}" stroke-width="1.8" stroke-linecap="round"/><path d="M18.5 3v18" stroke="${ink}" stroke-width="1.1" stroke-linecap="round" opacity="0.32"/><circle cx="18.5" cy="11.5" r="2.9" fill="${dot}"/></svg>`;

const RUBRIC = "#c1401b";

export function coverVars(): string {
  return `--paper:${PAPER};--ink:${INK};--ink-2:#55514a;--ink-3:#8d877c;--rule:rgba(21,20,18,0.16);--rubric:${RUBRIC}`;
}

/** A number in [0, 1) that a string always gives: where a mark sits, the same on every screen and on paper. */
function unit(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967296;
}

/** The width the cover's rows are drawn in, in em, and the most rows that fit. */
const MEASURE = 30;
export const MOST_ROWS = 24;

export type DrawnMark = { x: number; w: number; color: Marker; note: boolean };

/**
 * Where each row's line ends and its marks sit, as fractions of the measure:
 * a line as long as its piece on a log scale, a mark placed along it for each
 * highlight (up to eight), the same wherever it's drawn.
 */
export function drawRows(rows: CoverRow[]): { len: number; marks: DrawnMark[] }[] {
  const logs = rows.map((r) => Math.log(Math.max(150, r.words)));
  const lo = Math.min(...logs), hi = Math.max(...logs);
  return rows.map((r, i) => {
    const len = hi > lo ? 0.3 + 0.7 * ((logs[i] - lo) / (hi - lo)) : 0.72;
    const marks = r.marks.slice(0, 8).map((m, k) => {
      const w = Math.min(len * 0.5, 0.04 + 0.08 * unit(`${r.id}:w${k}`));
      return { x: (len - w) * (0.02 + 0.96 * unit(`${r.id}:x${k}`)), w, color: m.color ?? "yellow", note: Boolean(m.note) };
    });
    return { len, marks };
  });
}

/** One drawn mark, in whatever unit the drawing is set in. */
export const markHTML = (m: DrawnMark, at: (f: number) => string) =>
  `<i class="gc-hl hl-${m.color}" style="left:${at(m.x)};width:${at(m.w)}"></i>${m.note ? `<b class="gc-note" style="left:${at(m.x + m.w)}"></b>` : ""}`;

/** Marker inks for the drawing: stronger than the wash on a page, since nothing is read through them. */
const DRAWN_CSS = `
.gc-hl { position: absolute; top: -0.48em; height: 1.03em; border-radius: 0.1em; }
.gc-hl.hl-yellow { background: rgba(244, 192, 38, 0.82); }
.gc-hl.hl-green { background: rgba(108, 190, 96, 0.72); }
.gc-hl.hl-blue { background: rgba(92, 152, 236, 0.68); }
.gc-hl.hl-pink { background: rgba(240, 118, 166, 0.7); }
.gc-note { position: absolute; top: -1.02em; width: 0.46em; height: 0.46em; margin-left: -0.23em; border-radius: 50%; background: ${RUBRIC}; }
`;

/**
 * The front: white, and drawn from the month itself. Each piece is a fine line
 * as long as it is, each of your highlights a mark on it in its marker's
 * colour, each note a dot of red pen above its mark. Under that, whose edition
 * it is and what the month was about.
 */
export function frontHTML(c: CoverView): string {
  const head = editionTitle(c.name).replace(/ Edition$/, "");
  const size = Math.min(4.6, MEASURE / Math.max(6, head.length * 0.5));
  const rows = c.rows.slice(0, MOST_ROWS);
  const gap = rows.length > 1 ? Math.min(1.9, 21.5 / (rows.length - 1)) : 0;
  const top = (21.5 - gap * Math.max(0, rows.length - 1)) / 2;
  const em = (f: number) => `${(f * MEASURE).toFixed(2)}em`;
  const lines = drawRows(rows)
    .map((r, i) => `<div class="gc-row" style="top:${(top + i * gap).toFixed(2)}em;width:${em(r.len)}">${r.marks.map((m) => markHTML(m, em)).join("")}</div>`)
    .join("");
  const marks = c.rows.reduce((n, r) => n + r.marks.length, 0);
  const notes = c.rows.reduce((n, r) => n + r.marks.filter((m) => m.note).length, 0);
  const tally = [`${c.count} ${c.count === 1 ? "piece" : "pieces"}`, marks && `${marks} ${marks === 1 ? "highlight" : "highlights"}`, notes && `${notes} ${notes === 1 ? "note" : "notes"}`].filter(Boolean);
  return `<div class="gc-front" style="${coverVars()}">
  <header class="gc-top"><p class="gc-brand">${MARK_SVG(INK, RUBRIC)}Gloss</p><p class="gc-date">${esc(monthName(c.month))}</p></header>
  <div class="gc-rows">${lines}</div>
  <div class="gc-title">
    <p class="gc-name" style="font-size:${size.toFixed(2)}em">${esc(head)}<em>Edition</em></p>
    ${c.theme ? `<p class="gc-theme">${esc(c.theme)}</p>` : ""}
  </div>
  <footer class="gc-foot"><p>${tally.join(" · ")}</p></footer>
</div>`;
}

/** The cover's type, in em of a 36em-wide front. Shared by the preview and the press. */
export const COVER_CSS = `
.gc-front { position: relative; width: 36em; height: 54em; overflow: hidden; background: var(--paper); color: var(--ink); text-align: left; }
.gc-front p { margin: 0; }
.gc-top { position: absolute; left: 3em; right: 3em; top: 2.9em; height: 2em; }
.gc-brand { position: absolute; left: 0; top: 0; font-family: var(--gp-serif, "Newsreader"), serif; font-size: 1.7em; font-weight: 500; line-height: 1; letter-spacing: -0.02em; }
.gc-brand svg { display: inline-block; width: 0.95em; height: 0.95em; margin-right: 0.32em; vertical-align: -0.1em; }
.gc-date { position: absolute; right: 0; top: 0.62em; font-family: var(--gp-sans, "Schibsted Grotesk"), sans-serif; font-size: 0.74em; font-weight: 600; line-height: 1; letter-spacing: 0.24em; text-transform: uppercase; color: var(--ink-3); }
.gc-rows { position: absolute; left: 3em; right: 3em; top: 9em; height: 21.5em; }
.gc-row { position: absolute; left: 0; height: 0.07em; background: var(--ink); }
.gc-title { position: absolute; left: 3em; right: 3em; bottom: 6.4em; }
.gc-name { font-family: var(--gp-serif, "Newsreader"), serif; font-weight: 400; line-height: 0.95; letter-spacing: -0.035em; }
.gc-name em { display: block; font-style: italic; letter-spacing: -0.03em; }
.gc-theme { max-width: 21em; margin-top: 0.85em !important; font-family: var(--gp-serif, "Newsreader"), serif; font-size: 1.3em; line-height: 1.28; color: var(--ink-2); }
.gc-foot { position: absolute; left: 3em; right: 3em; bottom: 2.8em; padding-top: 1em; border-top: 0.06em solid var(--rule); }
.gc-foot p { font-family: var(--gp-sans, "Schibsted Grotesk"), sans-serif; font-size: 0.72em; font-weight: 600; line-height: 1; letter-spacing: 0.2em; text-transform: uppercase; color: var(--ink-3); }
${DRAWN_CSS}`;

/**
 * The interior's type, in em of the body size (10.5 point at the press). The
 * page itself, margins, running heads and folios, is the press's (lib/print/book.ts).
 */
export const BOOK_CSS = `
.gb { font-family: var(--gp-serif, "Newsreader"), Georgia, serif; font-size: 1em; line-height: 1.39; color: #1d1b18; font-kerning: normal; font-variant-ligatures: common-ligatures; font-variant-numeric: oldstyle-nums proportional-nums; -webkit-font-smoothing: antialiased; }
.gb p { margin: 0; text-align: justify; text-indent: 1.3em; hyphens: manual; -webkit-hyphens: manual; orphans: 2; widows: 2; }
.gb p.lede, .gb p.first, .gb h2 + p, .gb h3 + p, .gb blockquote + p, .gb figure + p, .gb ul + p, .gb pre + p, .gb table + p, .gb .callout + p { text-indent: 0; }
.gb p.lede::first-letter { float: left; margin: 0.07em 0.09em 0 0; font-size: 3.62em; line-height: 0.76; font-weight: 500; color: var(--ink, #1d1b18); }
.gb strong { font-weight: 600; }
.gb code { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: 0.86em; }
.gb h2 { margin: 1.5em 0 0.55em; font-family: var(--gp-sans, "Schibsted Grotesk"), sans-serif; font-size: 0.8em; font-weight: 700; line-height: 1.3; letter-spacing: 0.07em; text-transform: uppercase; color: var(--ink, #1d1b18); text-align: left; break-after: avoid; page-break-after: avoid; }
.gb h3 { margin: 1.2em 0 0.35em; font-size: 1.04em; font-style: italic; font-weight: 500; line-height: 1.25; text-align: left; break-after: avoid; page-break-after: avoid; }
.gb blockquote { margin: 0.75em 0 0.8em 1.3em; padding: 0; font-size: 0.94em; color: #3b3732; }
.gb blockquote p { text-indent: 0; }
.gb ul { margin: 0.5em 0 0.65em; padding-left: 1.3em; }
.gb li { margin: 0.18em 0; text-align: justify; hyphens: manual; }
.gb pre { margin: 0.7em 0 0.8em; padding: 0.6em 0.8em; background: #f2eee6; font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: 0.72em; line-height: 1.45; white-space: pre-wrap; word-break: break-word; break-inside: avoid; page-break-inside: avoid; }
.gb .callout { margin: 0.8em 0; padding: 0.55em 0.8em; border-left: 0.16em solid var(--ink, #1d1b18); background: #f5f1e9; font-size: 0.92em; }
.gb figure { margin: 1.1em 0 1em; padding: 0; text-align: center; break-inside: avoid; page-break-inside: avoid; }
.gb figure img { display: block; margin: 0 auto; max-width: 100%; max-height: 27em; }
.gb figcaption { margin-top: 0.55em; font-family: var(--gp-sans, "Schibsted Grotesk"), sans-serif; font-size: 0.7em; line-height: 1.4; color: #6b655b; text-align: left; }
.gb table.data { width: 100%; margin: 0.9em 0; border-collapse: collapse; font-family: var(--gp-sans, "Schibsted Grotesk"), sans-serif; font-size: 0.68em; line-height: 1.35; break-inside: avoid; page-break-inside: avoid; }
.gb table.data th, .gb table.data td { padding: 0.32em 0.45em; border-bottom: 0.06em solid #d3cab8; text-align: left; vertical-align: top; }
.gb table.data th { font-weight: 600; border-bottom-color: #857e72; }
.gb mark.hl { color: inherit; padding: 0.04em 0; -webkit-box-decoration-break: clone; box-decoration-break: clone; }
.gb mark.hl-yellow { background: ${MARK_WASH.yellow}; }
.gb mark.hl-green { background: ${MARK_WASH.green}; }
.gb mark.hl-blue { background: ${MARK_WASH.blue}; }
.gb mark.hl-pink { background: ${MARK_WASH.pink}; }
.gb p.your-note { margin: 0.55em 0 0.75em 1.3em; padding: 0.1em 0 0.1em 0.75em; border-left: 0.16em solid var(--mk); font-size: 0.9em; font-style: italic; line-height: 1.38; text-align: left; text-indent: 0; color: #4b463f; break-inside: avoid; page-break-inside: avoid; }
.gb .your-note .pen { margin-right: 0.45em; font-family: var(--gp-sans, "Schibsted Grotesk"), sans-serif; font-size: 0.7em; font-style: normal; font-weight: 700; letter-spacing: 0.09em; text-transform: uppercase; color: #857e72; }
.gb .opener { padding-top: 4.6em; margin-bottom: 2.1em; text-align: left; }
.gb .kicker { margin: 0; padding-top: 0.8em; border-top: 0.14em solid var(--ink, #1d1b18); font-family: var(--gp-sans, "Schibsted Grotesk"), sans-serif; font-size: 0.72em; font-weight: 700; line-height: 1; letter-spacing: 0.16em; text-transform: uppercase; color: var(--ink, #1d1b18); text-indent: 0; overflow: hidden; }
.gb .kicker .no { float: right; font-variant-numeric: lining-nums tabular-nums; }
.gb .title { margin: 0.5em 0 0; font-size: 2.5em; font-weight: 500; line-height: 1.04; letter-spacing: -0.016em; color: #1d1b18; }
.gb .rh { display: block; height: 0; overflow: hidden; visibility: hidden; }
.gb .byline { margin-top: 0.75em; font-size: 1.2em; font-style: italic; line-height: 1.2; text-align: left; text-indent: 0; }
.gb .meta { margin-top: 0.55em; font-family: var(--gp-sans, "Schibsted Grotesk"), sans-serif; font-size: 0.7em; line-height: 1.3; letter-spacing: 0.02em; color: #857e72; text-align: left; text-indent: 0; }
.gb .fin { display: block; width: 0.45em; height: 0.45em; margin: 1.3em auto 0; background: var(--ink, #1d1b18); transform: rotate(45deg); }
`;

/** Front and back matter: everything that is not a piece. In em of the body size, like the rest. */
export const MATTER_CSS = `
.gb .half { padding-top: 15.086em; text-align: center; }
.gb .half-word { margin: 0; font-size: 2.3em; font-weight: 500; letter-spacing: -0.02em; text-indent: 0; text-align: center; }
.gb .half-ed { margin: 0.35em 0 0; font-size: 1.15em; font-style: italic; text-indent: 0; text-align: center; color: #4b463f; }
.gb .frontis { padding-top: 1.6em; }
.gb .fx-kicker { margin: 0 0 1.4em; padding-top: 0.8em; border-top: 0.14em solid #1d1b18; font-family: var(--gp-sans, "Schibsted Grotesk"), sans-serif; font-size: 0.72em; font-weight: 700; line-height: 1; letter-spacing: 0.16em; text-transform: uppercase; text-align: left; text-indent: 0; }
.gb .fx-row { position: relative; }
.gb .fx-t { display: block; overflow: hidden; font-family: var(--gp-sans, "Schibsted Grotesk"), sans-serif; font-size: 0.64em; line-height: 1.2; color: #6b655b; white-space: nowrap; text-overflow: ellipsis; text-align: left; text-indent: 0; }
.gb .fx-t b { margin-right: 0.7em; font-weight: 600; color: #1d1b18; }
.gb .fx-line { position: relative; height: 0.07em; margin-top: 1.3em; background: #1d1b18; }
.gb .frontis-cap { margin: 1.6em 0 0; font-family: var(--gp-sans, "Schibsted Grotesk"), sans-serif; font-size: 0.68em; line-height: 1.45; color: #6b655b; text-align: left; text-indent: 0; }
${DRAWN_CSS.replace(/^\./gm, ".gb .")}
.gb .titlepage { padding-top: 7.886em; }
.gb .tp-month { margin: 0; padding-bottom: 0.7em; border-bottom: 0.08em solid var(--ink); font-family: var(--gp-sans, "Schibsted Grotesk"), sans-serif; font-size: 0.72em; font-weight: 700; letter-spacing: 0.17em; text-transform: uppercase; color: var(--ink); text-indent: 0; text-align: left; }
.gb .tp-word { margin: 0.12em 0 0 -0.04em; font-size: 6.2em; font-weight: 500; line-height: 1; letter-spacing: -0.035em; color: var(--ink); text-indent: 0; text-align: left; }
.gb .tp-ed { margin: 0.1em 0 0; font-size: 1.75em; font-style: italic; line-height: 1.1; text-indent: 0; text-align: left; }
.gb .tp-theme { margin: 1.1em 0 0; max-width: 20em; font-size: 1.15em; line-height: 1.35; color: #4b463f; text-indent: 0; text-align: left; hyphens: none; }
.gb .tp-foot { margin: 31.347em 0 0; font-family: var(--gp-sans, "Schibsted Grotesk"), sans-serif; font-size: 0.7em; line-height: 1.5; color: #6b655b; text-indent: 0; text-align: left; }
.gb .colophon { padding-top: 30.171em; }
.gb .colophon p { margin: 0 0 0.85em; font-size: 0.82em; line-height: 1.5; color: #4b463f; text-indent: 0; text-align: left; hyphens: none; }
.gb .colophon .mark { display: block; width: 1.6em; height: 1.6em; margin-bottom: 1em; }
.gb .contents h2, .gb .sources h2 { margin: 0.816em 0 1.1em; font-family: var(--gp-serif, "Newsreader"), serif; font-size: 2.1em; font-weight: 500; letter-spacing: -0.015em; text-transform: none; color: #1d1b18; }
.gb .toc-topic { margin: 1.25em 0 0.3em; font-family: var(--gp-sans, "Schibsted Grotesk"), sans-serif; font-size: 0.66em; font-weight: 700; letter-spacing: 0.17em; text-transform: uppercase; text-indent: 0; text-align: left; }
.gb .toc-row { margin: 0; padding: 0.22em 0 0.22em 2.3em; text-indent: -2.3em; text-align: left; line-height: 1.28; }
.gb .toc-no { display: inline-block; width: 2.3em; text-indent: 0; font-family: var(--gp-sans, "Schibsted Grotesk"), sans-serif; font-size: 0.72em; font-weight: 600; color: #8a8378; font-variant-numeric: lining-nums tabular-nums; }
.gb .toc-t { color: #1d1b18; text-decoration: none; }
.gb .toc-by { font-size: 0.9em; font-style: italic; color: #6b655b; }
.gb .toc-pg { float: right; margin-left: 1em; font-family: var(--gp-sans, "Schibsted Grotesk"), sans-serif; font-size: 0.8em; color: #1d1b18; text-decoration: none; font-variant-numeric: lining-nums tabular-nums; }
.toc-pg::after { content: target-counter(attr(href), page); }
.gb .plate-page { padding-top: 7.543em; text-align: center; }
.gb .plate-page img { display: block; width: 28.114em; height: 28.114em; margin: 0 auto; object-fit: cover; }
.gb .plate-cap { margin: 1.4em 0 0; font-family: var(--gp-sans, "Schibsted Grotesk"), sans-serif; font-size: 0.66em; font-weight: 700; letter-spacing: 0.17em; text-transform: uppercase; color: var(--ink); text-indent: 0; text-align: center; }
.gb .sources ol { margin: 0; padding: 0; list-style: none; }
.gb .sources li { margin: 0 0 0.95em; font-size: 0.8em; line-height: 1.38; }
.gb .sources .s-no { display: inline-block; width: 2.2em; font-family: var(--gp-sans, "Schibsted Grotesk"), sans-serif; font-size: 0.85em; font-weight: 600; color: #8a8378; }
.gb .sources .s-url { display: block; padding-left: 2.2em; font-family: var(--gp-sans, "Schibsted Grotesk"), sans-serif; font-size: 0.82em; color: #6b655b; word-break: break-all; }
.gb .np-head { margin: 0.98em 0 1.2em; font-size: 2.1em; font-weight: 500; letter-spacing: -0.015em; text-indent: 0; text-align: left; }
.gb .np-lines { height: 42.171em; background-image: repeating-linear-gradient(to bottom, transparent 0, transparent 2.057em, #d9d1c1 2.057em, #d9d1c1 2.139em); }
.gb .np-head + .np-lines { height: 36.686em; }
`;
