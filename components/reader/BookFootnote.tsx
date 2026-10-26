"use client";
import { useEffect, useRef } from 'react';
import type { Block as BlockType } from '@/lib/article';
import { Block } from './Block';

export function BookFootnote({blocks,onClose,onOpen,onLink}: {blocks:BlockType[];onClose:()=>void;onOpen:()=>void;onLink:(key:string)=>void}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(()=>{const d=ref.current; d?.showModal(); return ()=>d?.close();},[]);
  return <dialog ref={ref} className="book-footnote" aria-label="Footnote" onCancel={e=>{e.preventDefault();onClose();}} onClick={e=>{
      const link=(e.target as HTMLElement).closest<HTMLAnchorElement>('a[href^="#epub-"]');
      if (link) {e.preventDefault();onLink(decodeURIComponent(link.getAttribute('href')!.slice(6)));return;}
      if(e.target===e.currentTarget) onClose();
    }}>
    <header><span>Footnote</span><button onClick={onClose} autoFocus aria-label="Close footnote">×</button></header>
    <div className="prose-read book-footnote-text">{blocks.map(b=><Block key={b.id} block={b} measuring marks={[]} activeGloss={null} hoverGloss={null} activeHighlight={null} fresh={null} cursor={false} hasAt={false} onAsk={()=>{}}/>)}</div>
    <footer><button onClick={onOpen}>Open in book</button><button onClick={onClose}>Back to reading</button></footer>
  </dialog>;
}
