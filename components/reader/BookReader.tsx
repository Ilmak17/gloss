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
  PenLine,
} from "lucide-react";
import { blockText, type Article } from "@/lib/article";
import { readingLang } from "@/lib/typeset";
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
  uid,
} from "@/lib/store";
import { studyBlock } from "@/lib/study";
import { useListen, startListening, pauseListening, resumeAfterStudy, listeningSessionId } from "@/lib/listening";
import { SettingsMenu } from "@/components/ui/SettingsMenu";
import { barBtn } from "@/components/ui/Popover";
import { Block, type Mark } from "./Block";
import { BookNavigation, type BookMark } from "./BookNavigation";
import { ReaderContext, type ReaderApi } from "./context";
import { BookPlayer, ListenButton } from "./Listen";
import { discussionQuestion } from "@/lib/discussion-options";
import { StudyPanel } from "./StudyPanel";
import { Notebook } from "./Notebook";
import { MarginNote } from "./MarginNote";
import { marginNoteLayout } from "@/lib/margin-note-layout";
import { BookPagination } from "./BookPagination";
import { BookFootnote } from "./BookFootnote";
import { locateBookPage } from "@/lib/book-pagination";
import { createPageSwipe } from "@/lib/page-swipe";
import { resolveReaderMark } from "@/lib/reader-mark";
import { Popover } from "@/components/ui/Popover";
import { listeningWordStart } from "@/lib/listen-start";
import { Lens, type OpenHighlight } from "./Lens";
import { Peek } from "./Overlays";
import { pageDots, type ChallengeDot } from "@/lib/challenge-dots";

export function BookReader({ article }: { article: Article }) {
  const ix = useMemo(() => indexArticle(article), [article]);
  const chapters = useMemo(() => bookChapters(article), [article]);
  const lang = useMemo(() => readingLang(article), [article]);
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
  const [pinnedNoteId, setPinnedNoteId] = useState<string | null>(null);
  const [noteFocus, setNoteFocus] = useState(0);
  const [noteOnPage, setNoteOnPage] = useState(false);
  const [marginRoom, setMarginRoom] = useState(0);
  const [noteOpen, setNoteOpen] = useState(false);
  const [challengeDots, setChallengeDots] = useState<ChallengeDot[]>([]);
  const dotLayer = useRef<HTMLDivElement>(null);
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
  // The free space right of the page decides where a pinned note sits. The page never moves for a note.
  const measureMargin = useCallback(() => {
    const stage = viewport.current?.closest(".book-stage");
    const reader = stage?.closest(".book-reader");
    if (stage && reader) setMarginRoom(reader.getBoundingClientRect().right - stage.getBoundingClientRect().right);
  }, []);
  useEffect(() => {
    window.addEventListener("resize", measureMargin);
    return () => window.removeEventListener("resize", measureMargin);
  }, [measureMargin]);
  // The page window clips its margins, so a challenged passage's dot is drawn beside
  // it, where Block placed it in the text. Measured against the page window, which
  // slides with its text during a page turn.
  const measureDots = useCallback(() => {
    const vp = viewport.current;
    if (!vp || !root) return;
    setChallengeDots(prev => {
      const next = pageDots(vp.getBoundingClientRect(), [...root.querySelectorAll<HTMLElement>(".challenge-dot")].map(d => {
        const r = d.getBoundingClientRect();
        return { id: d.dataset.g ?? "", left: r.left, right: r.right, top: r.top, open: d.classList.contains("is-open") };
      }));
      return JSON.stringify(prev) === JSON.stringify(next) ? prev : next;
    });
  }, [root]);
  const setUI = useStore((s) => s.setUI),
    setProgress = useStore((s) => s.setProgress);
  const audioBlock = useListen((s) => s.block),
    audioOffset = useListen((s) => s.offset),
    status = useListen((s) => s.status),
    follow = useListen((s) => s.follow);
  const blocks = chapters[chapter]?.blocks ?? [];
  const bookmarkKey = `gloss:bookmarks:${article.id}`;
  const pinnedNoteKey = `gloss:pinned-note:${article.id}`;
  useEffect(() => {
    try { setPinnedNoteId(localStorage.getItem(pinnedNoteKey)); } catch { setPinnedNoteId(null); }
  }, [pinnedNoteKey]);
  const pinNote = useCallback((id: string | null) => {
    setRevision(r => r + 1);
    setPinnedNoteId(id);
    setNoteOpen(!!id);
    try {
      if (id) localStorage.setItem(pinnedNoteKey, id);
      else localStorage.removeItem(pinnedNoteKey);
    } catch { /* The note still saves through the regular notebook store. */ }
    if (id) {
      setUI({ activeGloss: null, notebookOpen: false, pending: null });
      setNoteFocus(n => n + 1);
    }
  }, [pinnedNoteKey, setUI]);

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
      // A note shows only on its source page. Leaving that page folds an opened note away,
      // and coming back shows it without taking the keyboard, so arrow keys still turn pages.
      const note = useStore.getState().highlights[article.id]?.find(h => h.id === pinnedNoteId);
      const onPage = !!note && chapterForPoint(chapters, note.anchor.start) === chapter && pageForPoint(vp, note.anchor.start) === next;
      setNoteOnPage(onPage);
      if (!onPage) { setNoteOpen(false); setNoteFocus(0); }
      measureMargin();
      measureDots();
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
  }, [root, chapter, revision, settings, blocks, persist, pinnedNoteId, article.id, chapters, measureMargin, measureDots]);
  useLayoutEffect(() => {
    const direction = turnDirection.current;
    turnDirection.current = 0;
    if (!direction || !viewport.current) return;
    pageAnimation.current?.cancel();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // Move the viewport and its contents together: text-to-page measurements stay stable.
    // The margin dots ride along, so they never sit still while the text slides.
    dotLayer.current?.animate(
      [
        { transform: `translateX(${direction * 24}px)`, opacity: 0.4 },
        { transform: "translateX(0)", opacity: 1 },
      ],
      { duration: 240, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
    );
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
        setRevision(r => r + 1);
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
        e.defaultPrevented || e.buttons !== 0 || choosingStart ||
        useStore.getState().activeGloss || useStore.getState().notebookOpen ||
        document.querySelector('[role=dialog],dialog[open],[role=menu],.lens') ||
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
      challenge?: boolean,
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
              challenge: challenge ? (b.id === a.start.b ? "start" : "rest") : undefined,
            },
          ]);
      }
    };
    for (const h of highlights)
      place(h.anchor, "hl", h.id, h.color, Boolean(h.note));
    for (const g of glosses) if (g.anchor) place(g.anchor, "gloss", g.id, undefined, undefined, discussionQuestion(g.question ?? "").mode === "challenge");
    if (pending) place(pending, "pending", "pending");
    return map;
  }, [blocks, ix, highlights, glosses, pending]);
  // A new challenge adds a dot; opening or closing one hides or shows it.
  useLayoutEffect(measureDots, [marks, activeGloss, measureDots]);
  // The notebook writes a page note through the reader; the note's state lives below.
  const pageNote = useRef<() => void>(() => {});
  const api = useMemo<ReaderApi>(
    () => ({
      ix,
      paged: true,
      openNote: pinNote,
      writePageNote: () => { setUI({ notebookOpen: false }); pageNote.current(); },
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
    [ix, go, explore, setUI, blocks, pinNote],
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
  const pagesLeft = page >= pages - 1 ? "last page" : `${pages - page - 1} ${pages - page - 1 === 1 ? "page" : "pages"} left`;
  const noteTarget = footnote ? article.epub?.targets[footnote] : null;
  const noteStart = noteTarget ? article.blocks.findIndex(b=>b.id===noteTarget.block) : -1;
  const explicitEnd = noteTarget?.endBlock ? article.blocks.findIndex(b=>b.id===noteTarget.endBlock) : -1;
  const noteEnd = explicitEnd >= noteStart && explicitEnd >= 0 ? explicitEnd + 1 : noteStart < 0 ? -1 : Math.min(article.blocks.length, ...Object.values(article.epub?.targets ?? {}).map(t=>article.blocks.findIndex(b=>b.id===t.block)).filter(i=>i>noteStart));
  const noteBlocks = noteStart < 0 ? [] : article.blocks.slice(noteStart, noteEnd);
  const closeNote = () => { setFootnote(null); resumeAfterStudy(); };
  const pinnedNote = highlights.find(h => h.id === pinnedNoteId);
  const noteHere = !!pinnedNote && noteOnPage && !activeGloss && !notebookOpen;
  const notePlace = marginNoteLayout(marginRoom);
  // Beside the page when it fits; otherwise only when asked for, so it never covers the text by itself.
  const showMarginNote = noteHere && (notePlace.mode === "margin" || noteOpen);
  const openPageNote = () => {
    if (pinnedNote && noteOnPage) { pinNote(pinnedNote.id); return; }
    const b = studyBlock(ix, point.current.b);
    if (!b) return;
    const existing = [...highlights].reverse().find(h => h.anchor.start.b === b && h.note);
    if (existing) { pinNote(existing.id); return; }
    const quote = ix.texts.get(b) ?? "";
    const id = uid();
    useStore.getState().addHighlight({ id, articleId: article.id, anchor: { start: { b, o: 0 }, end: { b, o: quote.length }, quote }, createdAt: Date.now(), color: settings.marker });
    pauseListening(true);
    pinNote(id);
  };
  useLayoutEffect(() => { pageNote.current = openPageNote; });
  return (
    <ReaderContext.Provider value={api}>
      <title>{article.title}</title>
      <div
        className={`book-reader study-reader hide-nums ${quiet ? "is-quiet" : ""} ${activeGloss && !notebookOpen && discussionQuestion(glosses.find(g => g.id === activeGloss)?.question ?? "").mode !== "challenge" ? "is-studying" : ""} ${notebookOpen ? "nb-open" : ""} ${choosingStart ? "is-picking-start" : ""}`}
      >
        <button type="button" className="book-controls-reveal" aria-label="Show reading controls" aria-controls="book-reading-controls" onPointerEnter={awaken} onFocus={awaken} onClick={awaken}><span aria-hidden>···</span></button>
        <header id="book-reading-controls" className="book-toolbar">
          <nav aria-label="Book navigation">
            <Link href="/" aria-label="Library" data-tip="Library" className={barBtn}>
              <ArrowLeft size={18} strokeWidth={1.75} />
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
          <BookPlayer title={article.title} from={() => point.current.b} />
          <nav aria-label="Reading tools">
            <ListenButton from={() => point.current.b} />
            <SettingsMenu readingOnly book />
            <button type="button" className={barBtn} aria-label="Notebook" aria-pressed={notebookOpen} aria-keyshortcuts="N" data-tip="Notebook" data-tip-kbd="N"
              onClick={() => setUI({ notebookOpen: !notebookOpen })}>
              <NotebookPen size={18} strokeWidth={1.75} />
            </button>
            <button type="button" className={`${barBtn} book-bookmark`} aria-label={currentMark ? "Remove bookmark" : "Bookmark this page"} data-tip={currentMark ? "Remove bookmark" : "Bookmark this page"} aria-pressed={!!currentMark}
              onClick={() => {
                if (currentMark) removeMark(currentMark.point);
                else saveMarks([...bookmarks, {
                  point: { ...point.current },
                  excerpt: (ix.texts.get(point.current.b) ?? chapters[chapter]?.title ?? "Page").slice(point.current.o, point.current.o + 90),
                }]);
              }}>
              <Bookmark size={18} strokeWidth={1.75} fill={currentMark ? "currentColor" : "none"} />
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
              lang={lang}
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
                const action = resolveReaderMark(h?.dataset.h, g?.dataset.g, highlights, glosses);
                if (action?.kind === "highlight") {
                  const mark = highlights.find((x) => x.id === action.id);
                  if (mark) {
                    setUI({ activeGloss: null });
                    setOpenHl({
                      id: mark.id,
                      ids: action.ids,
                      anchor: mark.anchor,
                      at: Date.now(),
                    });
                  }
                } else if (action?.kind === "gloss") setUI({ activeGloss: action.id });
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
          <div ref={dotLayer} className="challenge-dots">
            {challengeDots.map(d => <button key={d.id} type="button" className={`challenge-dot-mark${d.open ? " is-open" : ""}`}
              style={{ left: d.left, top: d.top }} aria-label="Reopen your challenge" title="Your challenge"
              onClick={() => setUI({ activeGloss: d.id, activeHighlight: null })} />)}
          </div>
        </main>
        {root && viewport.current && <BookPagination chapters={chapters} lang={lang} viewport={viewport.current} layoutKey={JSON.stringify(settings)} onCounts={setPageCounts} />}
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
          {/* Pages left in the chapter stay true across font and window changes; book page numbers do not. */}
          <Popover label="Reading progress" description={`${chapters[chapter]?.title}, ${pagesLeft}`} triggerClass="book-page-trigger" width={280}
            trigger={<><span className="book-page-title">{chapters[chapter]?.title}</span><span>&nbsp;· {pagesLeft}</span></>}>
            {(close) => <div className="book-progress-panel">
              <p>{pct > 0 && pct < .01 ? "Less than 1" : Math.round(pct*100)}% into the book{globalPage ? ` · page ${globalPage} of ${totalPages}` : ""}</p>
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
        {showMarginNote && <MarginNote key={pinnedNote.id} highlight={pinnedNote}
          chapter={chapters[chapterForPoint(chapters, pinnedNote.anchor.start)]?.title ?? "Passage"}
          focusRequest={noteFocus} onClose={() => pinNote(null)}
          width={notePlace.mode === "margin" ? notePlace.width : undefined} />}
        {noteHere && !showMarginNote && <button type="button" className="margin-note-chip" aria-label="Your note" onClick={() => setNoteOpen(true)}>
          <PenLine size={14} aria-hidden /><span className="margin-note-chip-label">Your note</span>
        </button>}
        <StudyPanel />
        <Notebook />
        <Peek peek={peek} />
      </div>
    </ReaderContext.Provider>
  );
}
