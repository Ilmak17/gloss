import type { Article } from "./article";
import type { BriefState, Gloss, Highlight, LibraryItem, Progress } from "./store";
import { DEFAULT_SETTINGS, type Settings } from "./settings";

export type ReadingState = {
  library: LibraryItem[]; glosses: Record<string, Gloss[]>;
  highlights: Record<string, Highlight[]>; briefs: Record<string, BriefState>;
  progress: Record<string, Progress>;
};
export type BackupData = {
  state: ReadingState;
  docs: Article[];
  originals: { id: string; type: string; base64: string }[];
  settings: Settings;
  bookmarks: Record<string, { point: { b: string; o: number }; excerpt: string }[]>;
  preferences: { library?: { paintedCovers: boolean; hiddenSamples: string[] }; rate?: number; voice?: { provider: string; voiceId: string } };
};
export type Backup = { format: "gloss-backup"; version: 1; sha256: string; data: BackupData };

/**
 * How the GitHub repository keeps a backup: each book once, in its own files
 * (its parsed text, and its original EPUB or PDF as itself), and an index of
 * everything else, small enough that a new note or reading position commits
 * a few kilobytes instead of the whole library again.
 */
export type BookEntry = { id: string; title: string; sha256: string; original?: { type: string; file: string; sha256: string } };
export type IndexData = Omit<BackupData, "docs" | "originals"> & { books: BookEntry[] };
export type BackupIndex = { format: "gloss-backup"; version: 2; sha256: string; data: IndexData };
export type RepoFile = { path: string; bytes: Uint8Array };
const record = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
function assert(v: unknown, message: string): asserts v { if (!v) throw new Error(message); }

/** Credential fields are excluded recursively; arbitrary browser storage is never exported. */
export function withoutSecrets<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (key, v) => /^(apiKey|accessToken|refreshToken|token|secret|password|authorization|cookie)$/i.test(key) ? undefined : v));
}
export function safeSettings(value: Settings): Settings {
  return Object.fromEntries(Object.keys(DEFAULT_SETTINGS).map(k => [k, value[k as keyof Settings] ?? DEFAULT_SETTINGS[k as keyof Settings]])) as Settings;
}
export async function checksum(data: unknown): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(data)));
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("");
}
export async function makeBackup(data: BackupData): Promise<Backup> {
  const clean = withoutSecrets(data);
  return { format: "gloss-backup", version: 1, sha256: await checksum(clean), data: clean };
}
export async function parseBackup(value: unknown): Promise<Backup> {
  assert(!(record(value) && value.format === "gloss-backup" && value.version === 2 && record(value.data) && Array.isArray(value.data.books)), "This is only the index of a GitHub backup, without the books. Use Restore from GitHub backup on the Backups page.");
  assert(record(value) && value.format === "gloss-backup" && value.version === 1, "This is not a supported Gloss backup.");
  const b = value as unknown as Backup;
  assert(record(b.data) && record(b.data.state), "Missing library data.");
  const d = b.data, s = d.state;
  assert(Array.isArray(s.library) && Array.isArray(d.docs) && Array.isArray(d.originals), "Missing books or original files.");
  for (const key of ["glosses", "highlights", "briefs", "progress"] as const) assert(record(s[key]), `Invalid ${key}.`);
  assert(record(d.bookmarks) && record(d.settings) && record(d.preferences), "Missing reader preferences.");
  const ids = new Set<string>();
  for (const doc of d.docs) {
    assert(doc && typeof doc.id === "string" && typeof doc.title === "string" && Array.isArray(doc.blocks) && !ids.has(doc.id), "Invalid or duplicate document.");
    ids.add(doc.id);
    for (const block of doc.blocks) assert(block && typeof block.id === "string" && typeof block.type === "string", "Invalid text block.");
  }
  for (const item of s.library) assert(item && typeof item.id === "string" && typeof item.title === "string" && ids.has(item.id), "A library text is missing from this backup.");
  const originals = new Set<string>();
  for (const f of d.originals) {
    assert(f && ids.has(f.id) && !originals.has(f.id) && typeof f.type === "string" && typeof f.base64 === "string" && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(f.base64), "Invalid original book file.");
    originals.add(f.id);
  }
  for (const list of Object.values(s.glosses)) {
    assert(Array.isArray(list), "Invalid discussions.");
    for (const g of list) assert(g && typeof g.id === "string" && typeof g.articleId === "string" && Array.isArray(g.turns), "Invalid discussion.");
  }
  for (const list of Object.values(s.highlights)) {
    assert(Array.isArray(list), "Invalid highlights.");
    for (const h of list) assert(h && typeof h.id === "string" && h.anchor?.start && h.anchor?.end && typeof h.anchor.quote === "string", "Invalid highlight.");
  }
  for (const p of Object.values(s.progress)) assert(p && typeof p.block === "string" && Number.isFinite(p.pct) && Number.isFinite(p.at), "Invalid reading position.");
  for (const list of Object.values(d.bookmarks)) {
    assert(Array.isArray(list), "Invalid bookmarks.");
    for (const mark of list) assert(mark?.point && typeof mark.point.b === "string" && Number.isFinite(mark.point.o) && typeof mark.excerpt === "string", "Invalid bookmark.");
  }
  assert(typeof b.sha256 === "string" && b.sha256 === await checksum(d), "The backup checksum does not match. Nothing has been restored.");
  assert(JSON.stringify(withoutSecrets(d)) === JSON.stringify(d), "Backup contains credential fields.");
  return b;
}

/** Existing notes win conflicts; absent books/notes are added, newer progress wins. */
export function mergeReadingState(current: ReadingState, incoming: ReadingState): ReadingState {
  const lists = <T extends { id: string }>(a: Record<string, T[]>, b: Record<string, T[]>) => {
    const result = { ...a };
    for (const [id, list] of Object.entries(b)) result[id] = [...(a[id] ?? []), ...list.filter(x => !(a[id] ?? []).some(y => x.id === y.id))];
    return result;
  };
  const progress = { ...current.progress };
  for (const [id, p] of Object.entries(incoming.progress)) if (!progress[id] || p.at > progress[id].at) progress[id] = p;
  return {
    library: [...current.library, ...incoming.library.filter(x => !current.library.some(y => x.id === y.id))],
    glosses: lists(current.glosses, incoming.glosses), highlights: lists(current.highlights, incoming.highlights),
    briefs: { ...incoming.briefs, ...current.briefs }, progress,
  };
}

async function digest(bytes: Uint8Array): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", bytes as Uint8Array<ArrayBuffer>);
  return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2, "0")).join("");
}
const fromBase64 = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
function toBase64(bytes: Uint8Array): string {
  let s = "";
  for (let i = 0; i < bytes.length; i += 32768) s += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(s);
}
const EXT: Record<string, string> = { "application/epub+zip": "epub", "application/pdf": "pdf" };
const bookPath = (id: string, ext: string) => {
  assert(/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(id), "A book id cannot be used as a file name.");
  return `books/${id}.${ext}`;
};

/** A checked backup, laid out as the repository keeps it. */
export async function splitBackup(backup: Backup): Promise<{ index: BackupIndex; files: RepoFile[] }> {
  const { docs, originals, ...rest } = backup.data;
  const files: RepoFile[] = [], books: BookEntry[] = [];
  for (const doc of docs) {
    const text = new TextEncoder().encode(JSON.stringify(doc));
    const path = bookPath(doc.id, "json");
    files.push({ path, bytes: text });
    const entry: BookEntry = { id: doc.id, title: doc.title, sha256: await digest(text) };
    const original = originals.find(o => o.id === doc.id);
    if (original) {
      const bytes = fromBase64(original.base64), file = bookPath(doc.id, EXT[original.type] ?? "bin");
      files.push({ path: file, bytes });
      entry.original = { type: original.type, file, sha256: await digest(bytes) };
    }
    books.push(entry);
  }
  const data: IndexData = { ...rest, books };
  return { index: { format: "gloss-backup", version: 2, sha256: await checksum(data), data }, files };
}

export async function parseIndex(value: unknown): Promise<BackupIndex> {
  assert(record(value) && value.format === "gloss-backup" && value.version === 2 && record(value.data), "This is not a Gloss backup index.");
  const index = value as unknown as BackupIndex;
  assert(Array.isArray(index.data.books) && record(index.data.state) && Array.isArray(index.data.state.library), "The backup index is incomplete.");
  assert(index.sha256 === await checksum(index.data), "The backup index checksum does not match. Nothing has been restored.");
  return index;
}

/** The repository's files put back together as one restorable backup; every book is checked against the index. */
export async function joinBackup(value: unknown, read: (path: string) => Promise<Uint8Array | null>): Promise<Backup> {
  const index = await parseIndex(value);
  const { books, ...rest } = index.data;
  const docs: BackupData["docs"] = [], originals: BackupData["originals"] = [];
  for (const book of books) {
    const text = await read(bookPath(book.id, "json"));
    assert(text, `The book file for “${book.title}” is missing.`);
    assert(await digest(text) === book.sha256, `The book file for “${book.title}” does not match the index.`);
    docs.push(JSON.parse(new TextDecoder().decode(text)));
    if (book.original) {
      assert(book.original.file === bookPath(book.id, EXT[book.original.type] ?? "bin"), "The backup index names an unexpected file.");
      const bytes = await read(book.original.file);
      assert(bytes, `The original file for “${book.title}” is missing.`);
      assert(await digest(bytes) === book.original.sha256, `The original file for “${book.title}” does not match the index.`);
      originals.push({ id: book.id, type: book.original.type, base64: toBase64(bytes) });
    }
  }
  // Books back in their place after the reading state and the other keys in their saved order,
  // so a restored copy carries its original checksum.
  const { state, ...others } = rest;
  return parseBackup(await makeBackup({ state, docs, originals, ...others }));
}

/** Keys in a fixed order, so equal data always compares equal. */
const stable = (v: unknown): string => JSON.stringify(v, (_k, x) => record(x) ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])) : x);
type Comparable = Pick<BackupData, "state" | "settings" | "bookmarks" | "preferences">;

/** True when the only news is where the reader is in their books: not worth a commit of its own every few minutes. */
export function onlyReadingMoved(previous: Comparable, next: Comparable): boolean {
  const rest = (d: Comparable) => stable({ ...d.state, progress: null, settings: d.settings, bookmarks: d.bookmarks, preferences: d.preferences });
  return rest(previous) === rest(next) && stable(previous.state.progress) !== stable(next.state.progress);
}
