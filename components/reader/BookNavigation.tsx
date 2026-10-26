"use client";
import { useMemo, useState } from "react";
import { List, Search, Bookmark, Trash2 } from "lucide-react";
import type { Article } from "@/lib/article";
import { searchBook, chapterForPoint, type BookChapter } from "@/lib/books";
import type { Point } from "@/lib/store";
import { BookUpgrade } from "./BookUpgrade";
import { Popover, barBtn } from "@/components/ui/Popover";
export type BookMark = { point: Point; excerpt: string };
export function BookNavigation({
  article,
  chapters,
  current,
  bookmarks,
  go,
  remove,
}: {
  article: Article;
  chapters: BookChapter[];
  current: number;
  bookmarks: BookMark[];
  go: (point: Point) => void;
  remove: (point: Point) => void;
}) {
  const [query, setQuery] = useState("");
  const hits = useMemo(() => searchBook(article, query), [article, query]);
  return (
    <>
      <Popover
        align="left"
        label="Contents and bookmarks"
        trigger={<List size={19} />}
        triggerClass={barBtn}
        width={320}
      >
        {(close) => (
          <div className="book-navigation">
            <p className="book-menu-label">Contents</p>
            {(["main", "front", "back"] as const).map(kind => {
              const entries = article.epub?.toc.length ? article.epub.toc.filter(t => t.kind === kind) : kind === "main" ? chapters.map(c => ({title:c.title, block:c.blocks[0].id, depth:0, kind})) : [];
              if (!entries.length) return null;
              const buttons = entries.map((entry, i) => <button key={`${entry.block}-${i}`}
                  aria-current={chapterForPoint(chapters, {b:entry.block,o:0}) === current ? "location" : undefined}
                  onClick={() => { go({b:entry.block,o:0}); close(); }}>
                  <span>{entry.title}</span>
                </button>);
              return kind === "main" ? <div className="book-toc-group" key={kind}>{buttons}</div> :
                <details className="book-toc-group" key={kind}><summary className="book-menu-label">{kind === "front" ? "Opening pages" : "Reference"}</summary>{buttons}</details>;
            })}
            {!article.epub && <BookUpgrade article={article} />}
            <p className="book-menu-label">
              <Bookmark size={13} /> Bookmarks
            </p>
            {!bookmarks.length && (
              <p className="book-menu-empty">
                Save a page with the bookmark button.
              </p>
            )}
            {bookmarks.map((mark) => (
              <div
                className="book-mark-row"
                key={`${mark.point.b}:${mark.point.o}`}
              >
                <button
                  onClick={() => {
                    go(mark.point);
                    close();
                  }}
                >
                  <span><small className="book-mark-chapter">{chapters[chapterForPoint(chapters, mark.point)]?.title}</small>{mark.excerpt}</span>
                </button>
                <button
                  aria-label={`Remove bookmark: ${mark.excerpt}`}
                  onClick={() => remove(mark.point)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Popover>
      <Popover
        align="left"
        label="Search in book"
        trigger={<Search size={18} />}
        triggerClass={barBtn}
        width={340}
      >
        {(close) => (
          <div className="book-navigation">
            <input
              aria-label="Search in book"
              placeholder="Find a word or passage…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoFocus
            />
            {query.trim() && (
              <p className="book-menu-label">
                {hits.length === 40 ? "First 40" : hits.length} results
              </p>
            )}
            {hits.map((hit) => (
              <button
                className="book-search-hit"
                key={`${hit.point.b}:${hit.point.o}`}
                onClick={() => {
                  go(hit.point);
                  close();
                }}
              >
                <small className="book-mark-chapter">{chapters[chapterForPoint(chapters, hit.point)]?.title}</small>{hit.excerpt}
              </button>
            ))}
          </div>
        )}
      </Popover>
    </>
  );
}
