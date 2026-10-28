"use client";

import type { Action } from "./actions";
import type { DocIndex } from "./doc";
import { isRecap } from "./recap";
import { uid, useStore, type Anchor, type Gloss } from "./store";

export const STUDY_QUESTIONS: Record<Action, string> = {
  ask: "",
  explain: "Explain this passage with a simple example.",
  define: "What does this concept mean here?",
  simplify: "Explain this idea in simpler terms.",
  check: "What evidence supports this claim? What should we check?",
  connect: "How does this connect to other ideas?",
  counter: "What is the strongest counterargument?",
};

/** Saving a study question is entirely local: no model, key or network call. */
export function startStudy(ix: DocIndex, opts: { anchor?: Anchor; at?: string; action: Action; question?: string }): string {
  const st = useStore.getState();
  const existing = [...(st.glosses[ix.article.id] ?? [])].reverse().find(g =>
    g.destination === "codex" && !isRecap(g) && g.action === opts.action &&
    g.at === opts.at && JSON.stringify(g.anchor) === JSON.stringify(opts.anchor) &&
    (opts.question === undefined || g.question === opts.question));
  st.setUI({ focusMode: false, notebookOpen: false });
  if (existing) { st.setUI({ activeGloss: existing.id }); return existing.id; }
  const g: Gloss = { id: uid(), articleId: ix.article.id, destination: "codex", ...opts, question: opts.question ?? STUDY_QUESTIONS[opts.action], turns: [], createdAt: Date.now() };
  st.addGloss(g);
  return g.id;
}
