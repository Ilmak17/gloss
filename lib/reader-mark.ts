/** A text span may carry several overlapping annotations. Highlights take priority. */
export function resolveReaderMark(highlightIds: string | undefined, glossIds: string | undefined, highlights: { id: string }[], glosses: { id: string }[]) {
  const ids = [...new Set((highlightIds ?? "").split(/\s+/).filter(id => highlights.some(h => h.id === id)))];
  if (ids.length) return { kind: "highlight" as const, id: ids[ids.length - 1], ids };
  const id = (glossIds ?? "").split(/\s+/).filter(id => glosses.some(g => g.id === id)).at(-1);
  return id ? { kind: "gloss" as const, id } : null;
}
