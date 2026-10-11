"use client";

/**
 * A month's edition in the browser: which texts it gathers, with their words
 * and your marks from this device (or the account, for a text never opened
 * here), the cover painted for it and kept here, and the orders placed from
 * this browser.
 */

import { tidyTitle } from "./article";
import { readApiKey } from "./ask";
import { paintedUrl } from "./covers";
import { monthOf, sizeOf, type CoverCopy, type EditionInput, type EditionOrder, type PrintText, type TextSize } from "./edition";
import { TOPIC, topicOf, type TopicKey } from "./library";
import { loadDoc, useStore, type LibraryItem } from "./store";
import { fetchText } from "./sync";

/** One text in the month: its words when this device has them, how long it runs, your marks on it. */
export type Pick = {
  item: LibraryItem;
  text: PrintText | null;
  size: TextSize;
  marks: number;
  notes: number;
  /** Its own cover for the list and the plate page: a bundled path or a painted one's object URL. */
  thumb?: string;
};

/** Months with something saved in them, newest first. */
export function monthsOf(library: LibraryItem[]): string[] {
  return [...new Set(library.filter((x) => x.origin !== "sample").map((x) => monthOf(x.addedAt)))].sort().reverse();
}

const asDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });

/** Everything saved in a month, ready for press. */
export async function gather(month: string): Promise<Pick[]> {
  const st = useStore.getState();
  const items = st.library.filter((x) => x.origin !== "sample" && monthOf(x.addedAt) === month).sort((a, b) => a.addedAt - b.addedAt);
  return Promise.all(
    items.map(async (item): Promise<Pick> => {
      const doc = (await loadDoc(item.id)) ?? (await fetchText(item.id));
      const marks = st.highlights[item.id] ?? [];
      let plate: string | undefined;
      let thumb: string | undefined;
      if (item.cover?.startsWith("/library/covers/")) plate = thumb = item.cover;
      else if (item.cover === "painted") {
        thumb = (await paintedUrl(item.id)) ?? undefined;
        if (thumb) plate = await asDataUrl(await (await fetch(thumb)).blob()).catch(() => undefined);
      }
      const text: PrintText | null = doc
        ? {
            id: item.id,
            title: tidyTitle(item.title || doc.title),
            author: item.author ?? doc.author,
            source: item.source ?? doc.source,
            sourceUrl: item.sourceUrl ?? doc.sourceUrl,
            published: doc.published ?? (item.year ? String(item.year) : undefined),
            topic: topicOf(item.topic),
            addedAt: item.addedAt,
            blocks: doc.blocks,
            marks: marks.map((h) => ({ start: h.anchor.start, end: h.anchor.end, color: h.color, note: h.note })),
            plate,
          }
        : null;
      const size = doc ? sizeOf(doc.blocks, Boolean(plate)) : { words: item.words, figures: 0, tables: 0, code: 0, plate: false };
      return { item, text, size, marks: marks.length, notes: marks.filter((h) => h.note?.trim()).length, thumb };
    })
  );
}

/* ---------- the cover ---------- */

/** A cover kept for a month: its words, and the painting as a base64 JPEG. */
export type KeptCover = { copy: CoverCopy; art: string | null; at: number };

const DB = "gloss-editions";
let opening: Promise<IDBDatabase> | null = null;
function idb(): Promise<IDBDatabase> {
  return (opening ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore("covers");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}
async function tx<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  try {
    const db = await idb();
    return await new Promise<T>((resolve, reject) => {
      const r = fn(db.transaction("covers", mode).objectStore("covers"));
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => reject(r.error);
    });
  } catch {
    return null;
  }
}

export const keptCover = (month: string) => tx<KeptCover | undefined>("readonly", (s) => s.get(month)).then((c) => c ?? null);
export const keepCover = (month: string, c: KeptCover) => tx("readwrite", (s) => s.put(c, month));

/** The cover's words without the model: the month's subjects, and three of its titles. */
export function plainCopy(picks: Pick[]): CoverCopy {
  const count = new Map<TopicKey, number>();
  for (const p of picks) {
    const t = topicOf(p.item.topic);
    if (t !== "unsorted") count.set(t, (count.get(t) ?? 0) + 1);
  }
  const top = [...count.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  const names = top.slice(0, 3).map((k) => (k === "ai" ? TOPIC[k].name : TOPIC[k].name.toLowerCase()));
  const theme = names.length > 1 ? `On ${names.slice(0, -1).join(", ")} and ${names.at(-1)}` : names.length ? `On ${names[0]}` : "";
  const lines = picks
    .slice()
    .sort((a, b) => b.marks - a.marks || b.size.words - a.size.words)
    .slice(0, 3)
    .map((p) => tidyTitle(p.item.title))
    .map((t) => (t.length > 44 ? `${t.slice(0, 43).replace(/\s+\S*$/, "")}…` : t));
  return { theme, lines, scene: "", topic: top[0] ?? "living" };
}

export type Painted = { ok: true; cover: KeptCover; error?: string } | { ok: false; error: string; needKey?: boolean };

/** Ask for a cover: written from the month's titles and painted. With `copy`, the same words painted again. */
export async function paintCover(month: string, picks: Pick[], copy?: CoverCopy): Promise<Painted> {
  try {
    const res = await fetch("/api/editions/cover", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        month,
        titles: picks.map((p) => ({ title: tidyTitle(p.item.title), topic: topicOf(p.item.topic), tags: p.item.tags })),
        copy,
        apiKey: readApiKey() || undefined,
      }),
    });
    const j = (await res.json().catch(() => ({}))) as { copy?: CoverCopy; art?: string | null; error?: string; code?: string };
    if (!res.ok || !j.copy) return { ok: false, error: j.error ?? "The cover could not be painted.", needKey: j.code === "need_key" };
    const cover: KeptCover = { copy: j.copy, art: j.art ?? null, at: Date.now() };
    await keepCover(month, cover);
    return { ok: true, cover, error: j.art ? undefined : j.error };
  } catch {
    return { ok: false, error: "Could not reach Gloss. Check your connection." };
  }
}

/* ---------- orders ---------- */

const ORDERS = "gloss:editions";

export function orderIds(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(ORDERS) || "[]");
    return Array.isArray(v) ? v.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

function rememberOrder(id: string) {
  try {
    localStorage.setItem(ORDERS, JSON.stringify([id, ...orderIds().filter((x) => x !== id)].slice(0, 24)));
  } catch {}
}

export async function fetchOrders(): Promise<EditionOrder[]> {
  try {
    const res = await fetch(`/api/editions?ids=${orderIds().join(",")}`);
    return res.ok ? ((await res.json()) as { orders: EditionOrder[] }).orders : [];
  } catch {
    return [];
  }
}

export async function fetchOrder(id: string, session?: string | null): Promise<{ order: EditionOrder; art: boolean; copy?: CoverCopy } | null> {
  try {
    const res = await fetch(`/api/editions/${encodeURIComponent(id)}${session ? `?session=${encodeURIComponent(session)}` : ""}`);
    if (!res.ok) return null;
    rememberOrder(id);
    return (await res.json()) as { order: EditionOrder; art: boolean; copy?: CoverCopy };
  } catch {
    return null;
  }
}

export type Placed = { ok: true; id: string; url: string; test?: boolean } | { ok: false; error: string; soon?: boolean };

/** Send an edition to press: gzipped, since a month of texts runs to megabytes. Back comes where to pay. */
export async function placeOrder(input: EditionInput): Promise<Placed> {
  try {
    const raw = new Blob([JSON.stringify(input)]);
    const body = await new Response(raw.stream().pipeThrough(new CompressionStream("gzip"))).blob();
    const res = await fetch("/api/editions", { method: "POST", headers: { "Content-Type": "application/x-gloss-edition" }, body });
    const j = (await res.json().catch(() => ({}))) as { id?: string; url?: string; test?: boolean; error?: string; code?: string };
    if (!res.ok || !j.id || !j.url) return { ok: false, error: j.error ?? "The order could not be placed.", soon: j.code === "soon" };
    rememberOrder(j.id);
    return { ok: true, id: j.id, url: j.url, test: j.test };
  } catch {
    return { ok: false, error: "Could not reach Gloss. Check your connection." };
  }
}
