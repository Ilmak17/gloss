"use client";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ArrowLeft,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Check,
  NotebookPen,
} from "lucide-react";
import { blockText, type Article } from "@/lib/article";
import { bookChapters, bookProgress, chapterForPoint, isCoverChapter } from "@/lib/books";
import {
  firstPointOnPage,
  pageCount,
  pageForPoint,
  pageStride,
} from "@/lib/book-pages";
import { indexArticle } from "@/lib/doc";
import { selectBlock, spanIn, pointFromClick } from "@/lib/anchor";
import {
  useGlosses,
  useHighlights,
  useStore,
  type Anchor,
  type Point,
} from "@/lib/store";
import { useListen, startListening, pauseListening, resumeAfterStudy, listeningSessionId } from "@/lib/listening";
import { SettingsMenu } from "@/components/ui/SettingsMenu";
import { barBtn } from "@/components/ui/Popover";
import { Block, type Mark } from "./Block";
import { BookNavigation, type BookMark } from "./BookNavigation";
import { ReaderContext, type ReaderApi } from "./context";
import { ListenBar } from "./Listen";
import { discussionQuestion } from "@/lib/discussion-options";
import { StudyPanel } from "./StudyPanel";
import { Notebook } from "./Notebook";
import { BookPagination } from "./BookPagination";
import { BookFootnote } from "./BookFootnote";
import { locateBookPage } from "@/lib/book-pagination";
import { createPageSwipe } from "@/lib/page-swipe";
import { Popover } from "@/components/ui/Popover";
import { listeningWordStart } from "@/lib/listen-start";
import { Lens, type OpenHighlight } from "./Lens";
import { Peek } from "./Overlays";

export function BookReader({ article }: { article: Article }) {
  const ix = useMemo(() => indexArticle(article), [article]);
  const chapters = useMemo(() => bookChapters(article), [article]);
  const saved = useRef(useStore.getState().progress[article.id]);
  const point = useRef<Point>({
    b: saved.current?.block ?? article.blocks[0]?.id ?? "",
    o: saved.current?.offset ?? 0,
  });
  const [chapter, setChapter] = useState(() =>
    chapterForPoint(chapters, point.current),
  );
  const [page, setPage] = useState(0),
    [pages, setPages] = useState(1);
  const [pct, setPct] = useState(() => bookProgress(article, point.current));
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const [revision, setRevision] = useState(0);
  const [bookmarks, setBookmarks] = useState<BookMark[]>([]);
  const [pageCounts, setPageCounts] = useState<number[] | null>(null);
  const [returnPoint, setReturnPoint] = useState<Point | null>(null);
  const [footnote, setFootnote] = useState<string | null>(null);
  const [pageInput, setPageInput] = useState("");
  const returnAudio = useRef<{session:number;follow:boolean} | null>(null);
  const pendingPage = useRef<number | null>(null);
  const [saveError, setSaveError] = useState("");
  const [openHl, setOpenHl] = useState<OpenHighlight | null>(null);
  const [peek, setPeek] = useState<{ n: number; rect: DOMRect } | null>(null);
  const [quiet, setQuiet] = useState(true);
  const [choosingStart, setChoosingStart] = useState(false);
  const quietTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPage = useRef(false);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const pageSwipe = useRef(createPageSwipe());
  const turnDirection = useRef(0);
  const pageAnimation = useRef<Animation | null>(null);
  const glosses = useGlosses(article.id),
    highlights = useHighlights(article.id);
  const activeGloss = useStore((s) => s.activeGloss),
    notebookOpen = useStore((s) => s.notebookOpen);
  const pending = useStore((s) => s.pending),
    activeHighlight = useStore((s) => s.activeHighlight);
  const settings = useStore((s) => s.settings);
  const setUI = useStore((s) => s.setUI),
    setProgress = useStore((s) => s.setProgress);
  const audioBlock = useListen((s) => s.block),
    audioOffset = useListen((s) => s.offset),
    status = useListen((s) => s.status),
    follow = useListen((s) => s.follow);
  const blocks = chapters[chapter]?.blocks ?? [];
  const bookmarkKey = `gloss:bookmarks:${article.id}`;

  useEffect(() => {
    setUI({
      activeGloss: null,
      notebookOpen: false,
      pending: null,
      cursor: null,
      activeHighlight: null,
    });
    try {
      const data = JSON.parse(localStorage.getItem(bookmarkKey) ?? "[]");
      if (Array.isArray(data))
        setBookmarks(
          data.filter(
            (m) =>
              m &&
              typeof m.excerpt === "string" &&
              typeof m.point?.b === "string" &&
              Number.isFinite(m.point?.o),
          ),
        );
    } catch {
      setSaveError("Bookmarks could not be loaded.");
    }
    return () => {
      if (quietTimer.current) clearTimeout(quietTimer.current);
    };
  }, [bookmarkKey, setUI]);
  const awaken = useCallback(() => {
    setQuiet(false);
    if (quietTimer.current) clearTimeout(quietTimer.current);
    quietTimer.current = setTimeout(() => setQuiet(true), 900);
  }, []);
  const persist = useCallback(() => {
    setPct(bookProgress(article, point.current));
    setProgress(article.id, {
      block: point.current.b,
      offset: point.current.o,
      pct: bookProgress(article, point.current),
      at: Date.now(),
    });
  }, [article, setProgress]);
  const go = useCallback(
    (target: Point, manual = true) => {
      if (manual && useListen.getState().status !== "idle")
        useListen.setState({ follow: false });
      point.current = target;
      lastPage.current = false;
      setChapter(chapterForPoint(chapters, target));
      setRevision((r) => r + 1);
    },
    [chapters],
  );
  const explore = useCallback((target: Point) => {
    const origin = { ...point.current };
    setReturnPoint(previous => previous ?? origin);
    returnAudio.current ??= {session:listeningSessionId(),follow:useListen.getState().follow};
    pauseListening(true);
    go(target);
  }, [go]);
  const backToReading = () => {
    if (!returnPoint) return;
    go(returnPoint, false);
    setReturnPoint(null);
    if (returnAudio.current?.session === listeningSessionId()) {
      useListen.setState({follow:returnAudio.current.follow});
      resumeAfterStudy();
    }
    returnAudio.current = null;
  };
  useLayoutEffect(() => {
    if (!viewport.current || !root) return;
    const vp = viewport.current;
    const layout = () => {
      const count = pageCount(vp);
      const next = pendingPage.current !== null ? Math.min(count - 1, pendingPage.current) : lastPage.current
        ? count - 1
        : Math.min(count - 1, pageForPoint(vp, point.current));
      vp.scrollLeft = next * pageStride(vp);
      setPages(count);
      setPage(next);
      if (lastPage.current || pendingPage.current !== null) {
        point.current = firstPointOnPage(vp, blocks, next);
        lastPage.current = false;
        pendingPage.current = null;
      }
      persist();
    };
    layout();
    const observer = new ResizeObserver(layout);
    observer.observe(vp);
    observer.observe(root);
    root.addEventListener("load", layout, true);
    let mounted = true;
    void document.fonts.ready.then(() => {
      if (mounted) layout();
    });
    return () => {
      mounted = false;
      observer.disconnect();
      root.removeEventListener("load", layout, true);
    };
  }, [root, chapter, revision, settings, blocks, persist]);
  useLayoutEffect(() => {
    const direction = turnDirection.current;
    turnDirection.current = 0;
    if (!direction || !viewport.current) return;
    pageAnimation.current?.cancel();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Move the viewport and its contents together: text-to-page measurements stay stable.
    pageAnimation.current = viewport.current.animate(
      [
        { transform: `translateX(${direction * 24}px)`, opacity: 0.4 },
        { transform: "translateX(0)", opacity: 1 },
      ],
      { duration: 240, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    );
  }, [page, chapter]);
  useEffect(() => () => pageAnimation.current?.cancel(), []);
  useEffect(() => {
    if (audioBlock && follow && status === "playing")
      go({ b: audioBlock, o: audioOffset }, false);
  }, [audioBlock, audioOffset, follow, status, go]);
  const turn = useCallback(
    (direction: number) => {
      const vp = viewport.current;
      if (!vp || !blocks.length) return;
      if (useListen.getState().status !== "idle")
        useListen.setState({ follow: false });
      const next = page + direction;
      if (next >= 0 && next < pages) {
        turnDirection.current = direction;
        point.current = firstPointOnPage(vp, blocks, next);
        vp.scrollLeft = next * pageStride(vp);
        setPage(next);
        persist();
      } else {
        const nextChapter = chapter + direction;
        if (nextChapter < 0 || nextChapter >= chapters.length) return;
        turnDirection.current = direction;
        point.current = { b: chapters[nextChapter].blocks[0].id, o: 0 };
        lastPage.current = direction < 0;
        setChapter(nextChapter);
      }
    },
    [page, pages, chapter, chapters, blocks, persist],
  );
  useEffect(() => {
    const vp = viewport.current;
    if (!vp) return;
    const wheel = (e: WheelEvent) => {
      const blocked = !!(
        e.defaultPrevented || choosingStart ||
        useStore.getState().activeGloss || useStore.getState().notebookOpen ||
        document.querySelector('[role=dialog],dialog[open],[role=menu]') ||
        window.getSelection()?.toString() ||
        (e.target as Element).closest('input,textarea,select,[contenteditable=true]')
      );
      const result = pageSwipe.current(e, performance.now(), blocked);
      if (result.handled) e.preventDefault();
      if (result.direction) turn(result.direction);
    };
    // React's passive wheel listener cannot suppress native horizontal scrolling.
    vp.addEventListener("wheel", wheel, { passive: false });
    return () => vp.removeEventListener("wheel", wheel);
  }, [turn, choosingStart]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.defaultPrevented ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey ||
        (e.target as HTMLElement).closest(
          "input,textarea,select,[contenteditable=true],[role=dialog]",
        ) ||
        useStore.getState().activeGloss ||
        useStore.getState().notebookOpen ||
        document.querySelector("[role=dialog],dialog[open]") ||
        window.getSelection()?.toString()
      )
        return;
      if (["ArrowRight", "PageDown", "ArrowLeft", "PageUp"].includes(e.key)) {
        e.preventDefault();
        turn(e.key === "ArrowRight" || e.key === "PageDown" ? 1 : -1);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [turn]);
  useEffect(() => {
    if (!choosingStart) return;
    const cancel = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); setChoosingStart(false); } };
    window.addEventListener("keydown", cancel);
    return () => window.removeEventListener("keydown", cancel);
  }, [choosingStart]);
  const marks = useMemo(() => {
    const map = new Map<string, Mark[]>();
    const place = (
      a: Anchor,
      kind: Mark["kind"],
      id: string,
      color?: string,
      note?: boolean,
    ) => {
      for (const b of blocks) {
        const span = spanIn(a, b.id, blockText(b).length, ix.order);
        if (span)
          map.set(b.id, [
            ...(map.get(b.id) ?? []),
            {
              from: span[0],
              to: span[1],
              kind,
              id,
              color,
              note: note && b.id === a.end.b,
            },
          ]);
      }
    };
    for (const h of highlights)
      place(h.anchor, "hl", h.id, h.color, Boolean(h.note));
    for (const g of glosses) if (g.anchor) place(g.anchor, "gloss", g.id);
    if (pending) place(pending, "pending", "pending");
    return map;
  }, [blocks, ix, highlights, glosses, pending]);
  const api = useMemo<ReaderApi>(
    () => ({
      ix,
      paged: true,
      chooseListeningStart: () => {
        pauseListening();
        setUI({ activeGloss: null, notebookOpen: false, pending: null });
        window.getSelection()?.removeAllRanges();
        setChoosingStart(true);
      },
      cancelListeningStart: () => setChoosingStart(false),
      readingPoint: () => point.current,
      readingPage: () => {
        const vp = viewport.current, last = blocks.at(-1);
        if (!vp || !last) return null;
        const current = Math.round(vp.scrollLeft / pageStride(vp));
        return {
          start: firstPointOnPage(vp, blocks, current),
          end: current + 1 < pageCount(vp) ? firstPointOnPage(vp, blocks, current + 1) : { b: last.id, o: blockText(last).length },
        };
      },
      goToPoint: (target) => go(target, false),
      jumpToBlock: (b) => explore({ b, o: 0 }),
      jumpTo: (n) => {
        const b = ix.byNumber.get(n);
        if (b) explore({ b, o: 0 });
      },
      peek: (n, rect) => setPeek(n !== null && rect ? { n, rect } : null),
    }),
    [ix, go, explore, setUI, blocks],
  );
  const saveMarks = (next: BookMark[]) => {
    try {
      localStorage.setItem(bookmarkKey, JSON.stringify(next));
      setBookmarks(next);
      setSaveError("");
    } catch {
      setSaveError(
        "Bookmark could not be saved. Browser storage is full or unavailable.",
      );
    }
  };
  const removeMark = (target: Point) =>
    saveMarks(
      bookmarks.filter((m) => m.point.b !== target.b || m.point.o !== target.o),
    );
  const currentMark = bookmarks.find(
    (m) =>
      chapterForPoint(chapters, m.point) === chapter &&
      viewport.current &&
      pageForPoint(viewport.current, m.point) === page,
  );
  const totalPages = pageCounts?.reduce((sum,n) => sum+n,0);
  const globalPage = pageCounts ? pageCounts.slice(0,chapter).reduce((sum,n)=>sum+n,0) + page + 1 : null;
  const noteTarget = footnote ? article.epub?.targets[footnote] : null;
  const noteStart = noteTarget ? article.blocks.findIndex(b=>b.id===noteTarget.block) : -1;
  const explicitEnd = noteTarget?.endBlock ? article.blocks.findIndex(b=>b.id===noteTarget.endBlock) : -1;
  const noteEnd = explicitEnd >= noteStart && explicitEnd >= 0 ? explicitEnd + 1 : noteStart < 0 ? -1 : Math.min(article.blocks.length, ...Object.values(article.epub?.targets ?? {}).map(t=>article.blocks.findIndex(b=>b.id===t.block)).filter(i=>i>noteStart));
  const noteBlocks = noteStart < 0 ? [] : article.blocks.slice(noteStart, noteEnd);
  const closeNote = () => { setFootnote(null); resumeAfterStudy(); };
  return (
    <ReaderContext.Provider value={api}>
      <title>{article.title}</title>
      <div
        className={`book-reader study-reader hide-nums ${quiet ? "is-quiet" : ""} ${activeGloss && !notebookOpen && discussionQuestion(glosses.find(g => g.id === activeGloss)?.question ?? "").mode !== "challenge" ? "is-studying" : ""} ${notebookOpen ? "nb-open" : ""} ${choosingStart ? "is-picking-start" : ""}`}
      >
        <button type="button" className="book-controls-reveal" aria-label="Show reading controls" aria-controls="book-reading-controls" onPointerEnter={awaken} onFocus={awaken} onClick={awaken}><span aria-hidden>···</span></button>
        <header id="book-reading-controls" className="book-toolbar">
          <nav aria-label="Book navigation">
            <Link href="/" aria-label="Library" className={barBtn}>
              <ArrowLeft size={18} />
            </Link>
            <BookNavigation
              article={article}
              chapters={chapters}
              current={chapter}
              bookmarks={bookmarks}
              go={explore}
              remove={removeMark}
            />
          </nav>
          <div className="book-toolbar-center">
            <h1 className="sr-only">{article.title}</h1>
            <ListenBar from={() => point.current.b} />
          </div>
          <nav aria-label="Reading tools">
            <SettingsMenu readingOnly book />
            <button
              className={barBtn}
              aria-label="Notebook"
              onClick={() => setUI({ notebookOpen: !notebookOpen })}
            >
              <NotebookPen size={18} />
            </button>
            <button
              className={barBtn}
              aria-label={
                currentMark ? "Remove bookmark" : "Bookmark this page"
              }
              aria-pressed={!!currentMark}
              onClick={() => {
                if (currentMark) removeMark(currentMark.point);
                else
                  saveMarks([
                    ...bookmarks,
                    {
                      point: { ...point.current },
                      excerpt: (
                        ix.texts.get(point.current.b) ??
                        chapters[chapter]?.title ??
                        "Page"
                      ).slice(point.current.o, point.current.o + 90),
                    },
                  ]);
              }}
            >
              <Bookmark
                size={18}
                fill={currentMark ? "currentColor" : "none"}
              />
            </button>
          </nav>
        </header>
        <main className="book-stage">
          <div
            className="book-viewport"
            ref={viewport}
            onTouchStart={(e) => {
              const t = e.touches[0];
              touch.current = { x: t.clientX, y: t.clientY };
            }}
            onTouchEnd={(e) => {
              const start = touch.current;
              touch.current = null;
              const t = e.changedTouches[0];
              if (
                start &&
                !window.getSelection()?.toString() &&
                Math.abs(t.clientX - start.x) > 65 &&
                Math.abs(t.clientY - start.y) < 60
              )
                turn(t.clientX < start.x ? 1 : -1);
            }}
          >
            <div
              ref={setRoot}
              className={`book-pages prose-read${isCoverChapter(chapters[chapter]) ? " is-cover-page" : ""}`}
              onClickCapture={(e) => {
                if (!choosingStart || !root) return;
                e.preventDefault(); e.stopPropagation();
                const picked = pointFromClick(root, e.target as Element, e.clientX, e.clientY);
                if (!picked) return;
                const offset = listeningWordStart(ix.texts.get(picked.b) ?? "", picked.o);
                if (offset === null) return;
                window.getSelection()?.removeAllRanges();
                setChoosingStart(false);
                setUI({ activeGloss: null, notebookOpen: false, pending: null });
                useListen.setState({ follow: true });
                startListening(ix, picked.b, offset);
              }}
              onClick={(e) => {
                const link = (e.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#epub-"]');
                if (link) {
                  e.preventDefault();
                  const key = decodeURIComponent(link.getAttribute("href")!.slice(6));
                  const ref = article.epub?.targets[key];
                  if (ref) {
                    pauseListening(true);
                    if (ref.note) setFootnote(key);
                    else explore({b:ref.block,o:0});
                  }
                  return;
                }
                if (window.getSelection()?.toString()) return;
                const target = e.target as HTMLElement,
                  g = target.closest<HTMLElement>("[data-g]"),
                  h = target.closest<HTMLElement>("[data-h]");
                if (g) setUI({ activeGloss: g.dataset.g });
                if (h) {
                  const mark = highlights.find((x) => x.id === h.dataset.h);
                  if (mark)
                    setOpenHl({
                      id: mark.id,
                      anchor: mark.anchor,
                      at: Date.now(),
                    });
                }
              }}
            >
              {blocks.map((b) => (
                <Block
                  key={b.id}
                  block={b}
                  n={ix.numbers.get(b.id)}
                  first={false}
                  marks={marks.get(b.id) ?? []}
                  activeGloss={activeGloss}
                  hoverGloss={null}
                  activeHighlight={activeHighlight}
                  fresh={null}
                  cursor={false}
                  hasAt={false}
                  onAsk={selectBlock}
                />
              ))}
            </div>
          </div>
        </main>
        {root && viewport.current && <BookPagination chapters={chapters} viewport={viewport.current} layoutKey={JSON.stringify(settings)} onCounts={setPageCounts} />}
        {noteTarget && <BookFootnote blocks={noteBlocks} onClose={closeNote} onLink={key=>{
          const ref=article.epub?.targets[key];
          if (!ref) return;
          if (ref.note) setFootnote(key);
          else { setFootnote(null); if (chapterForPoint(chapters,{b:ref.block,o:0})===chapter) resumeAfterStudy(); else explore({b:ref.block,o:0}); }
        }} onOpen={()=>{explore({b:noteTarget.block,o:0});setFootnote(null);}} />}
        <footer className="book-footer">
          <button
            aria-label="Previous page"
            disabled={chapter === 0 && page === 0}
            onClick={() => turn(-1)}
          >
            <ChevronLeft size={20} />
          </button>
          <div className="book-footer-return">{returnPoint && <button onClick={backToReading}><ArrowLeft size={13}/> Back to reading</button>}</div>
          <Popover label="Reading progress" description={globalPage ? `Page ${globalPage} of ${totalPages}` : `${chapters[chapter]?.title}, page ${page+1} of ${pages}`} triggerClass="book-page-trigger" width={280} trigger={globalPage ? `Page ${globalPage} of ${totalPages}` : `${chapters[chapter]?.title} · Page ${page+1}`}>
            {(close) => <div className="book-progress-panel">
              <p>{pct > 0 && pct < .01 ? "Less than 1" : Math.round(pct*100)}% into the book</p>
              <p>{chapters[chapter]?.title} · Page {page+1} of {pages}</p>
              {pageCounts ? <form onSubmit={e=>{
                e.preventDefault();
                const at=locateBookPage(pageCounts,Number(pageInput));
                if (!at) return;
                explore({b:chapters[at.chapter].blocks[0].id,o:0});
                pendingPage.current=at.page;
                setPageInput(""); close();
              }}><label htmlFor="book-go-page">Go to page</label><div><input id="book-go-page" type="number" min={1} max={totalPages} required value={pageInput} onChange={e=>setPageInput(e.target.value)} /><button type="submit">Go</button></div></form> : <p role="status">Calculating pages for your reading settings…</p>}
            </div>}
          </Popover>
          <span className="book-remaining">{pages-page-1 === 0 ? "Last page in section" : `${pages-page-1} ${pages-page-1 === 1 ? "page" : "pages"} left in ${/^introduction$/i.test(chapters[chapter]?.title ?? "") ? "introduction" : "section"}`}</span>
          <button
            aria-label={
              chapter === chapters.length - 1 && page === pages - 1
                ? "Finish book"
                : "Next page"
            }
            disabled={
              chapter === chapters.length - 1 && page === pages - 1 && pct === 1
            }
            onClick={() => {
              if (chapter === chapters.length - 1 && page === pages - 1) {
                const last = article.blocks.at(-1);
                if (last) {
                  point.current = { b: last.id, o: blockText(last).length };
                  persist();
                }
              } else turn(1);
            }}
          >
            {chapter === chapters.length - 1 && page === pages - 1 ? (
              <Check size={18} />
            ) : (
              <ChevronRight size={20} />
            )}
          </button>
        </footer>
        {choosingStart && <div className="listen-start-hint" role="status">
          <span>Click the word to start listening</span>
          <button onClick={() => setChoosingStart(false)}>Cancel <kbd>Esc</kbd></button>
        </div>}
        {saveError && (
          <p role="alert" className="book-save-error">
            {saveError}
          </p>
        )}
        <Lens rootEl={root} openHighlight={openHl} />
        <StudyPanel />
        <Notebook />
        <Peek peek={peek} />
      </div>
    </ReaderContext.Provider>
  );
}
