"use client";
import { useMemo, useState } from "react";
import { List, Search, Bookmark, Trash2 } from "lucide-react";
import type { Article } from "@/lib/article";
import { searchBook, type BookChapter } from "@/lib/books";
import type { Point } from "@/lib/store";
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
            {chapters.map((chapter, i) => (
              <button
                key={i}
                aria-current={current === i ? "location" : undefined}
                onClick={() => {
                  go({ b: chapter.blocks[0].id, o: 0 });
                  close();
                }}
              >
                <span>{chapter.title}</span>
                <span>{i + 1}</span>
              </button>
            ))}
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
                  {mark.excerpt}
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
                {hit.excerpt}
              </button>
            ))}
          </div>
        )}
      </Popover>
    </>
  );
}
