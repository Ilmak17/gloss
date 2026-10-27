"use client";

import { memo, useRef, useState, type ReactNode } from "react";
import { ImageViewer } from "./ImageViewer";
import { MessageCirclePlus } from "lucide-react";
import type { Block as BlockT, Run } from "@/lib/article";
import { typesetDashes } from "@/lib/typeset";

/**
 * `note`: a highlight with the reader's note, set only in the block where it ends.
 * `challenge`: a passage the reader challenged; "start" is the block where it begins, which carries its margin dot.
 */
export type Mark = { from: number; to: number; kind: "gloss" | "hl" | "pending"; id: string; color?: string; note?: boolean; challenge?: "start" | "rest" };

type Props = {
  block: BlockT;
  n?: number;
  measuring?: boolean;
  first?: boolean;
  marks: Mark[];
  activeGloss: string | null;
  hoverGloss: string | null;
  activeHighlight: string | null;
  /** A gloss or highlight created a moment ago, whose mark is drawn on. */
  fresh: string | null;
  cursor: boolean;
  /** A whole-text question was asked from here. */
  hasAt: boolean;
  onAsk: (blockId: string) => void;
};

function wrapRun(run: Run, text: string, key: string): ReactNode {
  if (run.noteLabel) return <a key={key} href={run.href} className="book-note-ref" data-note-label={run.noteLabel} aria-label={`Footnote ${run.noteLabel}`} />;
  let node: ReactNode = text;
  if (run.code) node = <code>{node}</code>;
  if (run.strong) node = <strong>{node}</strong>;
  if (run.em) node = <em>{node}</em>;
  if (run.href)
    node = (
      <a href={run.href} target={run.href.startsWith("#epub-") ? undefined : "_blank"} rel="noopener noreferrer">
        {node}
      </a>
    );
  return <span key={key}>{node}</span>;
}

/**
 * Splits a block's runs at every mark boundary and wraps each piece in the
 * marks that cover it. Offsets are over the block's plain text, the same
 * coordinates anchors use, so highlights never drift.
 */
function segments(block: BlockT, marks: Mark[], activeGloss: string | null, hoverGloss: string | null, activeHighlight: string | null, fresh: string | null) {
  const runs = block.type === "pre" ? block.runs : block.runs.map((r) => (r.code ? r : { ...r, text: typesetDashes(r.text) }));
  if (!marks.length) return runs.map((r, i) => wrapRun(r, r.text, String(i)));

  const bounds: number[] = [];
  let acc = 0;
  for (const r of runs) {
    bounds.push(acc);
    acc += r.text.length;
  }
  const len = acc;
  const cuts = new Set<number>([0, len, ...bounds]);
  for (const m of marks) {
    cuts.add(Math.max(0, Math.min(len, m.from)));
    cuts.add(Math.max(0, Math.min(len, m.to)));
  }
  const sorted = [...cuts].sort((a, b) => a - b);
  const out: ReactNode[] = [];
  let ri = 0;
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i];
    const b = sorted[i + 1];
    for (let r = 0; r < runs.length; r++) if (runs[r].noteLabel && bounds[r] === a) out.push(wrapRun(runs[r], "", `note-${r}`));
    // Empty and drawn in the margin by CSS, level with the passage's first line.
    for (const m of marks) if (m.challenge === "start" && m.from === a)
      out.push(<span key={`${a}c${m.id}`} className={`challenge-dot${m.id === activeGloss ? " is-open" : ""}`} data-g={m.id} aria-hidden />);
    if (b <= a) continue;
    while (ri < runs.length - 1 && bounds[ri + 1] <= a) ri++;
    const run = runs[ri];
    const text = run.text.slice(a - bounds[ri], b - bounds[ri]);
    const covering = marks.filter((m) => m.from <= a && m.to >= b);
    const key = `${a}`;
    if (!covering.length) {
      out.push(wrapRun(run, text, key));
      continue;
    }
    const g = covering.filter((m) => m.kind === "gloss").map((m) => m.id);
    const hls = covering.filter((m) => m.kind === "hl");
    const h = hls.map((m) => m.id);
    const color = hls[hls.length - 1]?.color;
    const pending = covering.some((m) => m.kind === "pending");
    const cls = [
      h.length ? "m-hl" : "",
      h.length && activeHighlight && h.includes(activeHighlight) ? "is-active" : "",
      fresh && (g.includes(fresh) || h.includes(fresh)) ? "is-new" : "",
      g.length ? "m-gloss" : "",
      covering.some((m) => m.challenge) ? "is-challenge" : "",
      // Its own name: an open highlight must not also light up a discussion on the same words.
      g.length && activeGloss && g.includes(activeGloss) ? "is-gloss-active" : "",
      g.length && hoverGloss && g.includes(hoverGloss) ? "is-hover" : "",
      pending ? "m-pending" : "",
    ]
      .filter(Boolean)
      .join(" ");
    out.push(
      <span key={key} className={cls} data-g={g.length ? g.join(" ") : undefined} data-h={h.length ? h.join(" ") : undefined} data-c={color && color !== "yellow" ? color : undefined}>
        {wrapRun(run, text, "r")}
      </span>
    );
    // Empty and drawn by CSS, so it adds no characters and offsets stay true.
    const noted = hls.find((m) => m.note && m.to === b);
    if (noted) out.push(<span key={`${key}n`} className="note-dot" data-h={noted.id} aria-hidden />);
  }
  for (let r = 0; r < runs.length; r++) if (runs[r].noteLabel && bounds[r] === len) out.push(wrapRun(runs[r], "", `note-${r}`));
  return out;
}

/** A picture from the source page, loaded from where it lives. One that fails to load folds away. */
/**
 * Texts imported before the srcset fix (2026-10-09) stored Substack images as
 * "https://site/p/fl_progressive:steep/https%3A%2F%2F...": the end of a CDN
 * URL that was cut at its commas. That end is the original image, URL-encoded,
 * so decoding it recovers a picture that loads. Older copies live in browsers
 * and in synced accounts, so they are repaired where they are shown.
 */
function repairSrc(src: string): string {
  const m = src.match(/\/[a-z_]+:[^/]*\/(https?%3A%2F%2F[^/?#\s]+)$/i);
  if (!m) return src;
  try {
    return decodeURIComponent(m[1]);
  } catch {
    return src;
  }
}

function Picture({ src, alt, eager }: { src: string; alt?: string; eager?: boolean }) {
  const [state, setState] = useState<"loading" | "ok" | "gone">("loading");
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const source = repairSrc(src);
  if (state === "gone") return <span className="fig-unavailable">Image unavailable{alt && alt !== "image" ? `: ${alt}` : ""}</span>;
  const picture = <img
    src={source} alt={alt ?? ""} loading={eager ? "eager" : "lazy"} decoding="async"
    referrerPolicy="no-referrer" draggable={false}
    className={`fig-img${state === "ok" ? " is-loaded" : ""}`}
    onLoad={() => setState("ok")} onError={() => setState("gone")}
  />;
  // Measurement must have exactly the same box geometry, but no focusable controls.
  return <>
    {eager ? <span className="fig-trigger">{picture}</span> :
      <button ref={trigger} type="button" className="fig-trigger" aria-label={alt && alt !== "image" ? `Enlarge image: ${alt}` : "Enlarge illustration"}
        onClick={e => { e.stopPropagation(); setOpen(true); }}>{picture}</button>}
    {open && <ImageViewer src={source} alt={alt ?? ""} onClose={() => { setOpen(false); requestAnimationFrame(() => trigger.current?.focus({ preventScroll: true })); }} />}
  </>;
}

function Table({ rows, head }: { rows: string[][]; head?: boolean }) {
  const body = head ? rows.slice(1) : rows;
  return (
    <div className="tbl scroll-thin" tabIndex={0} role="region" aria-label="Table">
      <table>
        {head && (
          <thead>
            <tr>
              {rows[0].map((c, i) => (
                <th key={i} scope="col">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
        )}
        <tbody>
          {body.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (
                <td key={j}>{c}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function BlockImpl({ block, n, measuring, first, marks, activeGloss, hoverGloss, activeHighlight, fresh, cursor, hasAt, onAsk }: Props) {
  const Tag = block.type === "h2" ? "h2" : block.type === "h3" ? "h3" : block.type === "figure" ? "figure" : "div";
  const content = segments(block, marks, activeGloss, hoverGloss, activeHighlight, fresh);
  return (
    <Tag
      className={`blk${first ? " is-first" : ""}${cursor ? " is-cursor" : ""}`}
      data-block={measuring ? undefined : block.id}
      data-type={block.type}
      data-n={n}
    >
      {n !== undefined && (
        <button
          type="button"
          className="pnum"
          onClick={() => onAsk(block.id)}
          aria-label={`Ask about paragraph ${n}`}
          data-tip={`Ask about \u00b6${n}`}
          data-tip-side="left"
        >
          {hasAt && <span className="pnum-dot" aria-hidden />}
          <span className="pnum-ask" aria-hidden>
            <MessageCirclePlus size={12} strokeWidth={2} />
          </span>
          {n}
        </button>
      )}
      {block.type === "figure" && block.src && <Picture src={block.src} alt={block.alt} eager={measuring} />}
      {block.type === "table" && block.rows ? (
        <Table rows={block.rows} head={block.head} />
      ) : block.type === "figure" ? (
        block.runs.length > 0 && <figcaption className="blk-text">{content}</figcaption>
      ) : (
        <span className="blk-text">{content}</span>
      )}
    </Tag>
  );
}

export const Block = memo(BlockImpl, (a, b) => {
  if (a.measuring !== b.measuring || a.block !== b.block || a.n !== b.n || a.first !== b.first || a.cursor !== b.cursor || a.hasAt !== b.hasAt) return false;
  if (a.onAsk !== b.onAsk) return false;
  if (a.marks.length !== b.marks.length) return false;
  for (let i = 0; i < a.marks.length; i++) {
    const x = a.marks[i];
    const y = b.marks[i];
    if (x.from !== y.from || x.to !== y.to || x.id !== y.id || x.kind !== y.kind || x.color !== y.color || x.note !== y.note || x.challenge !== y.challenge) return false;
  }
  if (!a.marks.length) return true;
  // Only re-render for active or hover changes that touch this block's marks.
  const ids = new Set(a.marks.map((m) => m.id));
  const touches = (p: string | null, q: string | null) => p !== q && ((p && ids.has(p)) || (q && ids.has(q)));
  return !(
    touches(a.activeGloss, b.activeGloss) ||
    touches(a.hoverGloss, b.hoverGloss) ||
    touches(a.activeHighlight, b.activeHighlight) ||
    touches(a.fresh, b.fresh)
  );
});
