"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Minus, Plus, X } from "lucide-react";
import { pauseListening } from "@/lib/listening";

/** A top-layer surface: diagrams stay readable without changing the book's position. */
export function ImageViewer({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [zoom, setZoom] = useState<number | null>(null);
  useEffect(() => {
    pauseListening(true);
    const el = dialog.current;
    el?.showModal();
    return () => el?.close();
  }, []);
  useEffect(() => { stage.current?.scrollTo({ top: 0, left: 0 }); }, [zoom]);
  const step = (direction: number) => {
    const fit = size.w && stage.current ? Math.min(2, (stage.current.clientWidth - 48) / size.w, (stage.current.clientHeight - 48) / size.h) : 1;
    setZoom(Math.max(.25, Math.min(4, (zoom ?? fit) * (direction > 0 ? 1.5 : 1 / 1.5))));
  };
  return createPortal(<dialog ref={dialog} className="image-viewer" aria-label="Image viewer"
    onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => e.stopPropagation()} onTouchStart={e => e.stopPropagation()} onTouchEnd={e => e.stopPropagation()}>
    <header className="image-viewer-toolbar">
      <div className="image-viewer-title"><span>{alt && alt !== "image" ? alt : "Illustration"}</span>{size.w > 0 && <small>{size.w} × {size.h} · Original image</small>}</div>
      <nav aria-label="Image zoom">
        <button onClick={() => setZoom(null)} aria-pressed={zoom === null}>Fit</button>
        <button onClick={() => setZoom(1)} aria-pressed={zoom === 1}>100%</button>
        <button aria-label="Zoom out" onClick={() => step(-1)} disabled={zoom !== null && zoom <= .25}><Minus size={18} /></button>
        <span className="image-viewer-percent" aria-live="polite">{zoom === null ? "Fit" : `${Math.round(zoom * 100)}%`}</span>
        <button aria-label="Zoom in" onClick={() => step(1)} disabled={zoom !== null && zoom >= 4}><Plus size={18} /></button>
        <button autoFocus aria-label="Close image" onClick={onClose}><X size={21} /></button>
      </nav>
    </header>
    <div ref={stage} className={`image-viewer-stage${zoom === null ? " is-fit" : ""}`} tabIndex={0} aria-label="Image; scroll to pan when zoomed"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <img src={src} alt={alt} draggable={false} referrerPolicy="no-referrer"
        onLoad={e => setSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
        style={size.w ? { width: size.w * (zoom ?? 2), height: size.h * (zoom ?? 2) } : undefined} />
    </div>
  </dialog>, document.body);
}
