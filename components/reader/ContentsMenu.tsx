"use client";
import { List } from "lucide-react";
import { blockText, isHeading } from "@/lib/article";
import { Popover, barBtn } from "@/components/ui/Popover";
import { useReader } from "./context";
import { stopListening } from "./Listen";
export function ContentsMenu() {
  const { ix, jumpToBlock } = useReader();
  const chapters = ix.article.chapters ?? ix.article.blocks.filter(isHeading).map(b => ({ title: blockText(b), block: b.id }));
  if (!chapters.length) return null;
  return <Popover label="Contents" trigger={<List size={17} />} triggerClass={barBtn} width={320}>
    {close => <><h2 className="mb-3 font-serif text-xl">Contents</h2><nav className="max-h-[60vh] overflow-y-auto" aria-label="Chapters">{chapters.map((chapter) => <button key={chapter.block} className="block w-full rounded-lg px-2 py-2 text-left text-sm text-ink-2 hover:bg-sunk" onClick={() => { stopListening(); jumpToBlock(chapter.block); close(); }}>{chapter.title}</button>)}</nav></>}
  </Popover>;
}
