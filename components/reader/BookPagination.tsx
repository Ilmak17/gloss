"use client";
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { BookChapter } from '@/lib/books';
import { pageCount } from '@/lib/book-pages';
import { Block } from './Block';

/** One chapter at a time; identical renderer, no anchors or interactive surface. */
export function BookPagination({chapters, viewport, layoutKey, onCounts}: {
  chapters: BookChapter[]; viewport: HTMLDivElement; layoutKey: string;
  onCounts: (counts: number[] | null) => void;
}) {
  const [size,setSize] = useState({w:viewport.clientWidth,h:viewport.clientHeight});
  useEffect(()=>{
    const update = () => setSize(s => s.w === viewport.clientWidth && s.h === viewport.clientHeight ? s : {w:viewport.clientWidth,h:viewport.clientHeight});
    const ro = new ResizeObserver(update); ro.observe(viewport); update();
    return ()=>ro.disconnect();
  },[viewport]);
  return <MeasureBook key={`${layoutKey}:${size.w}:${size.h}`} chapters={chapters} size={size} onCounts={onCounts}/>;
}
function MeasureBook({chapters,size,onCounts}: {chapters:BookChapter[];size:{w:number;h:number};onCounts:(counts:number[]|null)=>void}) {
  const [index,setIndex] = useState(0);
  const counts = useRef<number[]>([]);
  const vp = useRef<HTMLDivElement>(null);
  useLayoutEffect(()=>{ counts.current=[]; setIndex(0); onCounts(null); },[chapters,size,onCounts]);
  useEffect(()=>{
    const el = vp.current;
    if (!el || index >= chapters.length || !size.w || !size.h) return;
    let cancelled = false, frame = 0;
    const measure = async () => {
      await document.fonts.ready;
      await Promise.all(Array.from(el.querySelectorAll('img')).map(im => im.decode().catch(()=>{})));
      // Let image load/error state settle before measuring the same layout the reader sees.
      frame = requestAnimationFrame(()=>{ frame = requestAnimationFrame(()=>{
        if (cancelled) return;
        counts.current[index] = pageCount(el);
        if (index + 1 === chapters.length) onCounts([...counts.current]);
        setIndex(index+1);
      }); });
    };
    void measure();
    return ()=>{cancelled=true;cancelAnimationFrame(frame);};
  },[index,chapters,size,onCounts]);
  if (index >= chapters.length) return null;
  return <div className="book-measure" aria-hidden inert>
    <div ref={vp} className="book-viewport" style={{width:size.w,height:size.h}}>
      <div className="book-pages prose-read">
        {chapters[index].blocks.map(b=><Block key={b.id} block={b} measuring first={false} marks={[]} activeGloss={null} hoverGloss={null} activeHighlight={null} fresh={null} cursor={false} hasAt={false} onAsk={()=>{}} />)}
      </div>
    </div>
  </div>;
}
