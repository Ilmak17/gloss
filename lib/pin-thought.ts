import type { DocIndex } from "./doc";
import { studyBlock } from "./study";
import { uid, useStore } from "./store";

/** Explicitly pin a copy of a conclusion; never replace an unrelated passage note. */
export function pinThoughtConclusion(ix: DocIndex, glossId: string): string | null {
  const st = useStore.getState();
  const gloss = st.glosses[ix.article.id]?.find(g => g.id === glossId);
  const note = gloss?.reflection?.takeaway?.trim();
  if (!gloss || !note) return null;
  const b = studyBlock(ix, gloss.at);
  const quote = b ? ix.texts.get(b) ?? "" : "";
  const anchor = gloss.anchor ?? (b && quote ? { start: { b, o: 0 }, end: { b, o: quote.length }, quote } : null);
  if (!anchor) return null;
  const existing = st.highlights[ix.article.id]?.find(h => h.id === gloss.reflection?.pinnedHighlightId);
  const id = existing?.id ?? uid();
  if (existing) st.updateHighlight(ix.article.id, id, { note });
  else st.addHighlight({ id, articleId: ix.article.id, anchor, note, color: st.settings.marker, createdAt: Date.now() });
  st.updateGloss(ix.article.id, glossId, g => ({ ...g, reflection: { ...g.reflection, pinnedHighlightId: id } }));
  return id;
}
