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
import { bookChapters, bookProgress, chapterForPoint } from "@/lib/books";
import {
  firstPointOnPage,
  pageCount,
  pageForPoint,
  pageStride,
} from "@/lib/book-pages";
import { indexArticle } from "@/lib/doc";
import { selectBlock, spanIn } from "@/lib/anchor";
import {
  useGlosses,
  useHighlights,
  useStore,
  type Anchor,
  type Point,
} from "@/lib/store";
import { useListen } from "@/lib/listening";
import { SettingsMenu } from "@/components/ui/SettingsMenu";
import { barBtn } from "@/components/ui/Popover";
import { Block, type Mark } from "./Block";
import { BookNavigation, type BookMark } from "./BookNavigation";
import { ReaderContext, type ReaderApi } from "./context";
import { ListenBar } from "./Listen";
import { StudyPanel } from "./StudyPanel";
import { Notebook } from "./Notebook";
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
  const [saveError, setSaveError] = useState("");
  const [openHl, setOpenHl] = useState<OpenHighlight | null>(null);
  const [peek, setPeek] = useState<{ n: number; rect: DOMRect } | null>(null);
  const [quiet, setQuiet] = useState(false);
  const quietTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPage = useRef(false);
  const touch = useRef<{ x: number; y: number } | null>(null);
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
    quietTimer.current = setTimeout(() => setQuiet(true), 2800);
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
      if (manual) awaken();
    },
    [chapters, awaken],
  );
  useLayoutEffect(() => {
    if (!viewport.current || !root) return;
    const vp = viewport.current;
    const layout = () => {
      const count = pageCount(vp);
      const next = lastPage.current
        ? count - 1
        : Math.min(count - 1, pageForPoint(vp, point.current));
      vp.scrollLeft = next * pageStride(vp);
      setPages(count);
      setPage(next);
      if (lastPage.current) {
        point.current = firstPointOnPage(vp, blocks, next);
        lastPage.current = false;
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
        point.current = firstPointOnPage(vp, blocks, next);
        vp.scrollLeft = next * pageStride(vp);
        setPage(next);
        persist();
      } else {
        const nextChapter = chapter + direction;
        if (nextChapter < 0 || nextChapter >= chapters.length) return;
        point.current = { b: chapters[nextChapter].blocks[0].id, o: 0 };
        lastPage.current = direction < 0;
        setChapter(nextChapter);
      }
      awaken();
    },
    [page, pages, chapter, chapters, blocks, persist, awaken],
  );
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
        document.querySelector("[role=dialog]") ||
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
      readingPoint: () => point.current,
      goToPoint: (target) => go(target, false),
      jumpToBlock: (b) => go({ b, o: 0 }),
      jumpTo: (n) => {
        const b = ix.byNumber.get(n);
        if (b) go({ b, o: 0 });
      },
      peek: (n, rect) => setPeek(n !== null && rect ? { n, rect } : null),
    }),
    [ix, go],
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
  return (
    <ReaderContext.Provider value={api}>
      <title>{article.title}</title>
      <div
        className={`book-reader study-reader hide-nums ${quiet ? "is-quiet" : ""} ${activeGloss && !notebookOpen ? "is-studying" : ""} ${notebookOpen ? "nb-open" : ""}`}
        onPointerMove={awaken}
      >
        <header className="book-toolbar">
          <nav aria-label="Book navigation">
            <Link href="/" aria-label="Library" className={barBtn}>
              <ArrowLeft size={18} />
            </Link>
            <BookNavigation
              article={article}
              chapters={chapters}
              current={chapter}
              bookmarks={bookmarks}
              go={go}
              remove={removeMark}
            />
          </nav>
          <h1>{article.title}</h1>
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
          <div className="book-chapter-label">{chapters[chapter]?.title}</div>
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
              className="book-pages prose-read"
              onClick={(e) => {
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
        <footer className="book-footer">
          <button
            aria-label="Previous page"
            disabled={chapter === 0 && page === 0}
            onClick={() => turn(-1)}
          >
            <ChevronLeft size={20} />
          </button>
          <span aria-live="polite">
            {page + 1} / {pages}
            <span className="book-progress">
              {" "}
              · Chapter {chapter + 1} of {chapters.length} ·{" "}
              {Math.round(pct * 100)}%
            </span>
          </span>
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
        {saveError && (
          <p role="alert" className="book-save-error">
            {saveError}
          </p>
        )}
        <Lens rootEl={root} openHighlight={openHl} />
        <ListenBar from={() => point.current.b} />
        <StudyPanel />
        <Notebook />
        <Peek peek={peek} />
      </div>
    </ReaderContext.Provider>
  );
}
