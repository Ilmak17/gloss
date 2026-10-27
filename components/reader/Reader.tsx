"use client";

import Link from "next/link";
import { isPagedBook } from "@/lib/books";
import { BookReader } from "./BookReader";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { blockEl, selectBlock, spanIn } from "@/lib/anchor";
import { displayArticle, readingMinutes, type Article } from "@/lib/article";
import { ARTICLE_QUESTIONS } from "@/lib/actions";
import { SAMPLE_QUESTIONS } from "@/lib/samples";
import { startStudy } from "@/lib/study-draft";
import { indexArticle } from "@/lib/doc";
import { fetchText } from "@/lib/sync";
import { loadDoc, useGlosses, useHighlights, useStore, type Anchor } from "@/lib/store";
import { applySettings } from "@/lib/settings";
import { GlossWordmark } from "@/components/brand/Gloss";
import { Block, type Mark } from "./Block";
import { Composer, type ComposerHandle } from "./Composer";
import { ReaderContext, type ReaderApi } from "./context";
import { Lens, type OpenHighlight } from "./Lens";
import { resolveReaderMark } from "@/lib/reader-mark";
import { ListenBar } from "./Listen";
import { SignInNudge } from "@/components/account/SignInNudge";
import { discussionQuestion } from "@/lib/discussion-options";
import { StudyPanel } from "./StudyPanel";
import { StudyContents } from "./StudyContents";
import { Notebook } from "./Notebook";
import { Peek, Shortcuts, Toast } from "./Overlays";
import { TopBar } from "./TopBar";

export function Reader({ id, initial }: { id: string; initial: Article | null }) {
  const [article, setArticle] = useState<Article | null>(initial);
  const [missing, setMissing] = useState(false);
  const hydrate = useStore((s) => s.hydrate);
  // A text renamed on the shelf keeps its new name here too.
  const renamed = useStore((s) => s.library.find((x) => x.id === id)?.title);
  const shown = useMemo(() => (article ? displayArticle(renamed && renamed !== article.title ? { ...article, title: renamed } : article) : null), [article, renamed]);

  useEffect(() => {
    hydrate();
    applySettings(useStore.getState().settings);
    if (!initial) {
      // Not on this device: it may be in the reader's account, fetched now that it is opened.
      void loadDoc(id)
        .then((a) => a ?? fetchText(id))
        .then((a) => (a ? setArticle(a) : setMissing(true)));
    }
  }, [hydrate, id, initial]);

  // The text was read again (more carefully, or a page in the background): show the new reading in
  // place. Scroll anchoring alone did not hold when a page above the reader was swapped, so the
  // first block on screen that survives the swap is kept exactly where it was.
  const keep = useRef<{ id: string; top: number } | null>(null);
  useEffect(() => {
    const replaced = (e: Event) => {
      const next = (e as CustomEvent<Article>).detail;
      if (next?.id !== id) return;
      const survives = new Set(next.blocks.map((b) => b.id));
      const el = Array.from(document.querySelectorAll<HTMLElement>(".prose-read [data-block]")).find(
        (x) => x.getBoundingClientRect().bottom > 0 && survives.has(x.dataset.block ?? "")
      );
      keep.current = el ? { id: el.dataset.block!, top: el.getBoundingClientRect().top } : null;
      setArticle(next);
    };
    window.addEventListener("gloss:text-replaced", replaced);
    return () => window.removeEventListener("gloss:text-replaced", replaced);
  }, [id]);
  useLayoutEffect(() => {
    const k = keep.current;
    keep.current = null;
    if (!k) return;
    const el = document.querySelector<HTMLElement>(`.prose-read [data-block="${CSS.escape(k.id)}"]`);
    if (el) window.scrollBy({ top: el.getBoundingClientRect().top - k.top, behavior: "instant" });
  }, [article]);

  if (missing)
    return (
      <main className="grid min-h-dvh place-items-center px-6 text-center">
        <div>
          <GlossWordmark />
          <p className="mt-6 font-serif text-[26px] text-ink">This text is not on this device.</p>
          <p className="mt-2 text-[14px] text-ink-3">Imported texts live in the browser that imported them, or in your account when you are signed in.</p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link href="/" className="inline-flex h-10 items-center rounded-full bg-ink px-5 text-[14px] font-medium text-bg">
              Back to the library
            </Link>
            <Link href="/backups" className="inline-flex h-10 items-center rounded-full border border-rule px-5 text-[14px] font-medium text-ink-2 hover:text-ink">
              Restore from a backup
            </Link>
          </div>
        </div>
      </main>
    );
  if (!shown)
    return (
      <main aria-busy className="mx-auto max-w-[44rem] px-6 pt-[calc(var(--topbar-h)+64px)]" style={{ animation: "fade 0.4s 0.15s var(--ease-out) both" }}>
        <div className="shimmer h-12 w-[78%] rounded-[10px]" />
        <div className="shimmer mt-4 h-12 w-[46%] rounded-[10px]" />
        <div className="shimmer mt-8 h-4 w-[60%]" />
        <div className="mt-14 space-y-3">
          {[96, 92, 98, 88, 94, 60].map((w, i) => (
            <div key={i} className="shimmer h-4" style={{ width: `${w}%`, animationDelay: `${i * 0.06}s` }} />
          ))}
        </div>
      </main>
    );
  return isPagedBook(shown) ? <BookReader key={shown.id} article={shown} /> : <ReaderInner key={shown.id} article={shown} />;
}


function ReaderInner({ article }: { article: Article }) {
  const ix = useMemo(() => indexArticle(article), [article]);
  const articleId = article.id;
  const [articleEl, setArticleEl] = useState<HTMLDivElement | null>(null);
  const composerRef = useRef<ComposerHandle>(null);
  const [peek, setPeekState] = useState<{ n: number; rect: DOMRect } | null>(null);
  const peekTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [pastTitle, setPastTitle] = useState(false);
  const [openHl, setOpenHl] = useState<OpenHighlight | null>(null);
  const [toast, setToast] = useState<null | { kind: "resume"; n: number } | { kind: "hint" }>(null);

  const glosses = useGlosses(articleId);
  const highlights = useHighlights(articleId);
  const activeGloss = useStore((s) => s.activeGloss);
  const hoverGloss = useStore((s) => s.hoverGloss);
  const activeHighlight = useStore((s) => s.activeHighlight);
  const enteringGloss = useStore((s) => s.enteringGloss);
  const enteringHighlight = useStore((s) => s.enteringHighlight);
  const pending = useStore((s) => s.pending);
  const cursor = useStore((s) => s.cursor);
  const focusMode = useStore((s) => s.focusMode);
  const notebookOpen = useStore((s) => s.notebookOpen);
  const showNumbers = useStore((s) => s.settings.numbers);
  const hydrated = useStore((s) => s.hydrated);
  const setUI = useStore((s) => s.setUI);
  const setProgress = useStore((s) => s.setProgress);


  // Reset per-article UI when the article changes.
  useEffect(() => {
    setUI({ activeGloss: null, hoverGloss: null, activeHighlight: null, pending: null, cursor: null, notebookOpen: false });
  }, [articleId, setUI]);

  /* ---------------- navigation ---------------- */

  const jumpToBlock = useCallback((blockId: string, opts?: { flash?: boolean; instant?: boolean }) => {
    const el = blockEl(blockId);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.28;
    window.scrollTo({ top: Math.max(0, top), behavior: opts?.instant ? "instant" : "smooth" });
    if (opts?.flash !== false) {
      el.classList.remove("is-flash");
      void el.offsetWidth;
      el.classList.add("is-flash");
      setTimeout(() => el.classList.remove("is-flash"), 1900);
    }
  }, []);

  const api = useMemo<ReaderApi>(
    () => ({
      ix,
      jumpToBlock,
      jumpTo: (n, opts) => {
        const id = ix.byNumber.get(n);
        if (id) jumpToBlock(id, opts);
      },
      peek: (n, rect) => {
        if (peekTimer.current) clearTimeout(peekTimer.current);
        if (n === null || !rect) {
          setPeekState(null);
          return;
        }
        peekTimer.current = setTimeout(() => setPeekState({ n, rect }), 220);
      },
    }),
    [ix, jumpToBlock]
  );

  /* ---------------- marks per block ---------------- */

  const marksByBlock = useMemo(() => {
    const map = new Map<string, Mark[]>();
    const add = (blockId: string, m: Mark) => {
      const list = map.get(blockId) ?? [];
      list.push(m);
      map.set(blockId, list);
    };
    const place = (a: Anchor, kind: Mark["kind"], id: string, color?: string, note?: boolean) => {
      const si = ix.order.get(a.start.b) ?? 0;
      const ei = ix.order.get(a.end.b) ?? si;
      for (let i = si; i <= ei; i++) {
        const b = article.blocks[i];
        const span = spanIn(a, b.id, ix.texts.get(b.id)?.length ?? 0, ix.order);
        if (span) add(b.id, { from: span[0], to: span[1], kind, id, color, ...(note && b.id === a.end.b ? { note } : {}) });
      }
    };
    for (const h of highlights) place(h.anchor, "hl", h.id, h.color, Boolean(h.note));
    for (const g of glosses) if (g.anchor) place(g.anchor, "gloss", g.id);
    if (pending) place(pending, "pending", "pending");
    return map;
  }, [glosses, highlights, pending, ix, article.blocks]);

  const atBlocks = useMemo(() => new Set(glosses.filter((g) => !g.anchor && g.at).map((g) => g.at!)), [glosses]);
  // The drop cap goes on the first real paragraph, not a one-line caption or credit.
  const firstPara = useMemo(() => article.blocks.find((b) => b.type === "p" && (ix.texts.get(b.id)?.length ?? 0) >= 180)?.id, [article.blocks, ix]);

  const onAskBlock = useCallback(
    (blockId: string) => {
      setUI({ cursor: blockId });
      selectBlock(blockId);
    },
    [setUI]
  );

  /* ---------------- reading position ---------------- */

  const currentRef = useRef<string | null>(null);
  // Whole-text answers sit beside the first paragraph that starts on screen, so they open in view.
  const askAnchor = useCallback(() => {
    if (articleEl) {
      for (const el of Array.from(articleEl.querySelectorAll<HTMLElement>("[data-block]:not([data-type=h2]):not([data-type=h3])"))) {
        const top = el.getBoundingClientRect().top;
        if (top >= 72 && top < window.innerHeight * 0.7) return el.dataset.block ?? null;
      }
    }
    return currentRef.current;
  }, [articleEl]);

  useEffect(() => {
    if (!articleEl) return;
    let raf = 0;
    let saveT: ReturnType<typeof setTimeout> | null = null;
    const blocks = () => Array.from(articleEl.querySelectorAll<HTMLElement>("[data-block]"));
    const measure = () => {
      raf = 0;
      const line = window.innerHeight * 0.32;
      // Focus mode keeps the whole screen in full ink and lets a paragraph recede once it is
      // read: once its last line has scrolled up into the top fifth of the window.
      const readLine = focusMode ? window.innerHeight * 0.2 : -Infinity;
      const all = blocks();
      let cur: HTMLElement | null = null;
      for (const el of all) {
        const r = el.getBoundingClientRect();
        if (r.top <= line) cur = el;
        // A data attribute rather than a class, so a re-render of the block leaves it alone.
        if (r.bottom < readLine) el.dataset.read = "";
        else delete el.dataset.read;
        if (r.top > window.innerHeight) {
          if (focusMode) continue;
          break;
        }
      }
      const id = (cur ?? all[0])?.dataset.block ?? null;
      setPastTitle(articleEl.getBoundingClientRect().top < 120);
      if (id !== currentRef.current) {
        currentRef.current = id;
        setCurrent(id);
        if (useStore.getState().focusMode && id) setUI({ cursor: id });
      }
      if (saveT) clearTimeout(saveT);
      saveT = setTimeout(() => {
        const id2 = currentRef.current;
        if (!id2) return;
        const atEnd = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 40;
        const pct = window.scrollY < 160 ? 0 : atEnd ? 1 : ((ix.order.get(id2) ?? 0) + 1) / article.blocks.length;
        setProgress(articleId, { block: id2, pct, at: Date.now() });
      }, 800);
    };
    const on = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => {
      window.removeEventListener("scroll", on);
      window.removeEventListener("resize", on);
      if (raf) cancelAnimationFrame(raf);
      if (saveT) clearTimeout(saveT);
    };
  }, [articleEl, articleId, setProgress, setUI, ix, article.blocks.length, focusMode]);

  // Pick up where you left off, once, after hydration.
  const resumed = useRef(false);
  useEffect(() => {
    if (!hydrated || !articleEl || resumed.current) return;
    resumed.current = true;
    // Opened from a link to one highlight (the home page's daily one): go there, not to where you left off.
    const hlId = new URLSearchParams(window.location.search).get("hl");
    const hl = hlId ? (useStore.getState().highlights[articleId] ?? []).find((h) => h.id === hlId) : undefined;
    if (hlId) window.history.replaceState(null, "", window.location.pathname);
    if (hl) {
      requestAnimationFrame(() => {
        jumpToBlock(hl.anchor.start.b, { flash: false });
        setUI({ activeHighlight: hl.id });
      });
      return;
    }
    const p = useStore.getState().progress[articleId];
    const n = p ? ix.numbers.get(p.block) : undefined;
    if (p && (ix.article.chapters ? ix.article.blocks.some(b => b.id === p.block) : n && n > 2 && p.pct < 0.98)) {
      requestAnimationFrame(() => {
        const el = blockEl(p.block);
        if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - window.innerHeight * 0.28, behavior: "instant" });
        if (n) setToast({ kind: "resume", n });
      });
    } else {
      try {
        // Wide screens already carry the hint in the empty margin.
        if (!localStorage.getItem("gloss:hinted") && !window.matchMedia("(min-width: 1080px)").matches)
          setTimeout(() => setToast((t) => t ?? { kind: "hint" }), 1400);
      } catch {}
    }
  }, [hydrated, articleEl, articleId, ix, jumpToBlock, setUI]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.kind === "hint" ? 9000 : 6000);
    return () => clearTimeout(t);
  }, [toast]);

  const dismissHint = () => {
    try {
      localStorage.setItem("gloss:hinted", "1");
    } catch {}
    setToast(null);
  };

  /* ---------------- pointer: marks in the text ---------------- */

  const onTextClick = (e: React.MouseEvent) => {
    const sel = window.getSelection();
    if (sel && !sel.isCollapsed) return;
    const t = e.target as HTMLElement;
    const g = t.closest<HTMLElement>("[data-g]");
    const h = t.closest<HTMLElement>("[data-h]");
    const action = resolveReaderMark(h?.dataset.h, g?.dataset.g, highlights, glosses);
    if (action?.kind === "highlight") {
      const hl = highlights.find((x) => x.id === action.id);
      if (hl) {
        setUI({ activeGloss: null });
        setOpenHl({ id: hl.id, ids: action.ids, anchor: hl.anchor, at: Date.now() });
      }
    } else if (action?.kind === "gloss") setUI({ activeGloss: action.id, activeHighlight: null });
  };

  const onTextOver = (e: React.MouseEvent) => {
    const g = (e.target as HTMLElement).closest<HTMLElement>("[data-g]");
    const id = g?.dataset.g?.split(" ").pop() ?? null;
    if (id !== useStore.getState().hoverGloss) setUI({ hoverGloss: id });
  };

  /* ---------------- keyboard ---------------- */

  useEffect(() => {
    const paraIds = article.blocks.filter((b) => ix.numbers.has(b.id)).map((b) => b.id);
    const orderedGlosses = () =>
      [...useStore.getState().glosses[articleId] ?? []].sort((a, b) => {
        const pa = ix.order.get(a.anchor?.start.b ?? a.at ?? "") ?? 0;
        const pb = ix.order.get(b.anchor?.start.b ?? b.at ?? "") ?? 0;
        return pa - pb || (a.anchor?.start.o ?? 0) - (b.anchor?.start.o ?? 0);
      });

    const moveCursor = (dir: 1 | -1) => {
      const st = useStore.getState();
      const from = st.cursor ?? currentRef.current;
      let i = from ? paraIds.indexOf(from) : -1;
      if (i < 0) i = dir === 1 ? -1 : paraIds.length;
      const next = paraIds[Math.max(0, Math.min(paraIds.length - 1, i + dir))];
      setUI({ cursor: next });
      const el = blockEl(next);
      if (el) {
        const r = el.getBoundingClientRect();
        if (r.top < 90 || r.bottom > window.innerHeight - 110) jumpToBlock(next, { flash: false });
      }
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
          e.preventDefault();
          composerRef.current?.focus();
        }
        return;
      }
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea, select, [contenteditable]")) return;
      const sel = window.getSelection();
      const hasSel = sel && !sel.isCollapsed;
      const st = useStore.getState();
      switch (e.key) {
        case "j":
          e.preventDefault();
          moveCursor(1);
          break;
        case "k":
          e.preventDefault();
          moveCursor(-1);
          break;
        case "Enter":
          if (!hasSel && st.cursor) {
            e.preventDefault();
            selectBlock(st.cursor);
          }
          break;
        case "/":
          e.preventDefault();
          composerRef.current?.focus();
          break;
        case "b":
        case "B": {
          startStudy(ix, { action: "ask", question: "Help me understand the main idea and the evidence behind it." });
          break;
        }
        case "n":
          setUI({ notebookOpen: !st.notebookOpen });
          break;
        case "f":
          setUI({ focusMode: !st.focusMode, cursor: st.cursor ?? currentRef.current });
          break;
        case "?":
          setUI({ shortcutsOpen: true });
          break;
        case "[":
        case "]": {
          const list = orderedGlosses();
          if (!list.length) break;
          const i = list.findIndex((g) => g.id === st.activeGloss);
          const next = e.key === "]" ? list[i < 0 ? 0 : Math.min(list.length - 1, i + 1)] : list[i < 0 ? list.length - 1 : Math.max(0, i - 1)];
          setUI({ activeGloss: next.id });
          const bid = next.anchor?.start.b ?? next.at;
          if (bid) jumpToBlock(bid, { flash: false });
          break;
        }
        case "Escape":
          if (st.shortcutsOpen) setUI({ shortcutsOpen: false });
          else if (st.activeGloss) setUI({ activeGloss: null });
          else if (st.notebookOpen) setUI({ notebookOpen: false });
          else if (st.focusMode) setUI({ focusMode: false });
          else if (st.cursor) setUI({ cursor: null });
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [article.blocks, articleId, ix, jumpToBlock, setUI]);

  /* ---------------- layout ---------------- */

  const studying = !!activeGloss && !notebookOpen && discussionQuestion(glosses.find(g => g.id === activeGloss)?.question ?? "").mode !== "challenge";

  // A short line above the title: where this came from.
  const kicker = article.source ? article.source.split(/,|\(/)[0].trim() : article.origin === "paste" ? "Pasted text" : undefined;

  return (
    <ReaderContext.Provider value={api}>
      <title>{`${article.title}, glossed`}</title>
      <div className={`study-reader ${studying ? "is-studying" : ""} ${focusMode ? "focus-mode" : ""} ${showNumbers ? "" : "hide-nums"} ${notebookOpen ? "nb-open" : ""}`}>
        <TopBar currentN={current ? ix.numbers.get(current) ?? null : null} pastTitle={pastTitle} />

        <StudyContents current={current} />
        <main className="study-main relative z-[1] px-4 pt-[calc(var(--topbar-h)+48px)] sm:px-6">
          <div className="reader-grid">
            <div className="min-w-0">
              <header className="mb-14">
                {kicker && (
                  <p className="focus-hide rise mb-6 flex items-center gap-2 text-[13px] font-medium text-ink-3">
                    <span aria-hidden className="size-1.5 rounded-full bg-[var(--rubric)]" />
                    <span className="truncate">{kicker}</span>
                  </p>
                )}
                <h1 className={`rise font-serif font-[380] tracking-[-0.022em] text-ink text-balance [font-variation-settings:'opsz'_72] text-[clamp(2rem,4vw,3.25rem)] leading-[1.1]`} style={{ animationDelay: "40ms" }}>
                  {article.title}
                </h1>
                {article.dek && (
                  <p className="focus-hide rise mt-5 max-w-[38rem] text-[clamp(1.05rem,1.7vw,1.19rem)] leading-[1.55] text-ink-2 text-pretty" style={{ animationDelay: "90ms" }}>
                    {article.dek}
                  </p>
                )}

                {/* Byline: who and when on one line, how long underneath, the original on the right. */}
                <div className="focus-hide rise mt-8 flex items-center gap-4 border-t border-rule pt-5" style={{ animationDelay: "140ms" }}>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14.5px] leading-snug text-ink">
                      {article.author ? <span className="font-medium">{article.author}</span> : <span className="font-medium">{kicker ?? "Untitled source"}</span>}
                      {article.published && <span className="text-ink-3">{`  \u00b7  ${article.published}`}</span>}
                    </p>
                    <p className="mt-1 text-[13px] leading-snug text-ink-3">
                      {readingMinutes(ix.words)} min read
                    </p>
                  </div>
                  {article.sourceUrl && (
                    <a
                      href={article.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-rule px-3.5 text-[13px] font-medium text-ink-2 transition-[border-color,color,transform] hover:border-rule-strong hover:text-ink active:scale-[0.97]"
                    >
                      Original <ArrowUpRight size={14} strokeWidth={2} />
                    </a>
                  )}
                </div>
              </header>

              <div ref={setArticleEl} className="prose-read" onClick={onTextClick} onMouseOver={onTextOver} onMouseLeave={() => setUI({ hoverGloss: null })}>
                {article.blocks.map((b) => (
                  <Block
                    key={b.id}
                    block={b}
                    n={ix.numbers.get(b.id)}
                    first={b.id === firstPara}
                    marks={marksByBlock.get(b.id) ?? EMPTY}
                    activeGloss={activeGloss}
                    hoverGloss={hoverGloss}
                    activeHighlight={activeHighlight}
                    fresh={enteringHighlight ?? enteringGloss}
                    cursor={cursor === b.id}
                    hasAt={atBlocks.has(b.id)}
                    onAsk={onAskBlock}
                  />
                ))}
              </div>

              <footer className="focus-hide mt-16 border-t border-rule pt-10 text-[13.5px] leading-relaxed text-ink-3">
                <p aria-hidden className="mb-8 text-center font-serif text-[26px] leading-none text-[var(--rubric)]">
                  ❦
                </p>
                {article.source && <p>From {article.source}.</p>}
                <div className="mt-6 flex flex-wrap gap-2">
                  <button type="button" onClick={() => setUI({ notebookOpen: true })} className="h-9 rounded-full border border-rule px-4 text-[13px] font-medium text-ink-2 hover:border-rule-strong hover:text-ink">
                    Open your notebook
                  </button>
                  <Link href="/" className="inline-flex h-9 items-center rounded-full border border-rule px-4 text-[13px] font-medium text-ink-2 hover:border-rule-strong hover:text-ink">
                    Back to the library
                  </Link>
                </div>
              </footer>

              <Composer ref={composerRef} currentBlock={askAnchor} suggestions={SAMPLE_QUESTIONS[article.id] ?? ARTICLE_QUESTIONS} />
            </div>

          </div>
        </main>

        {focusMode && (
          <p
            role="status"
            className="focus-hint pointer-events-none fixed bottom-[calc(env(safe-area-inset-bottom)+32px)] left-1/2 z-40 whitespace-nowrap rounded-full bg-lens px-4 py-2 text-[13px] text-lens-fg shadow-pop"
          >
            {window.matchMedia("(pointer: coarse)").matches ? "Focus mode. Scroll up for the menu." : "Focus mode. Press F or Esc to leave."}
          </p>
        )}

        <Lens rootEl={articleEl} openHighlight={openHl} />
        <ListenBar from={askAnchor} />
        <StudyPanel />
        <SignInNudge />
        <Notebook />
        <Peek peek={peek} />
        <Shortcuts />

        {toast?.kind === "resume" && (
          <Toast onClose={() => setToast(null)}>
            <span>Picked up where you left off, at ¶{toast.n}.</span>
            <button
              type="button"
              onClick={() => {
                window.scrollTo({ top: 0, behavior: "smooth" });
                setToast(null);
              }}
              className="font-medium underline decoration-lens-mute underline-offset-4"
            >
              Start over
            </button>
          </Toast>
        )}
        {toast?.kind === "hint" && (
          <Toast onClose={dismissHint}>
            {window.matchMedia("(pointer: coarse)").matches ? (
              <span>Select any passage to ask about it, explain it or highlight it.</span>
            ) : (
              <span>
                Select any passage, then <span className="font-medium">just start typing</span> to ask about it.
              </span>
            )}
          </Toast>
        )}
      </div>
    </ReaderContext.Provider>
  );
}

const EMPTY: Mark[] = [];

