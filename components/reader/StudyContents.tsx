"use client";

import Link from "next/link";
import { ArrowLeft, NotebookPen } from "lucide-react";
import { blockText, isHeading } from "@/lib/article";
import { stopListening } from "@/lib/listening";
import { useStore } from "@/lib/store";
import { useReader } from "./context";

export function StudyContents({ current }: { current: string | null }) {
  const { ix, jumpToBlock } = useReader();
  const setUI = useStore(s => s.setUI);
  const chapters = ix.article.chapters ?? ix.article.blocks.filter(isHeading).map(b => ({ title: blockText(b), block: b.id }));
  const order = ix.order.get(current ?? "") ?? 0;
  const active = chapters.filter(c => (ix.order.get(c.block) ?? 0) <= order).at(-1)?.block;
  return <aside className="study-contents focus-hide" aria-label="Оглавление">
    <Link href="/library" className="study-library"><ArrowLeft size={14} /> Моя библиотека</Link>
    <div className="study-book"><span>НА МОЁМ СТОЛЕ</span><h2>{ix.article.title}</h2>{ix.article.author && <p>{ix.article.author}</p>}</div>
    <span className="study-eyebrow">В ЭТОМ ТЕКСТЕ</span>
    <nav className="scroll-thin">{chapters.length ? chapters.map((c, i) => <button type="button" key={c.block} aria-current={active === c.block ? "location" : undefined} onClick={() => {
      stopListening(); setUI({ activeGloss: null }); jumpToBlock(c.block);
    }}><span>{String(i + 1).padStart(2, "0")}</span>{c.title}</button>) : <p className="text-sm text-ink-3">Читай в своём темпе. Выдели фрагмент, чтобы его разобрать.</p>}</nav>
    <button type="button" className="study-notes" onClick={() => setUI({ notebookOpen: true })}><NotebookPen size={15} /> Мои мысли и разборы</button>
  </aside>;
}
