"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { keepInRotation, retire, todaysThoughts } from "@/lib/review";
import { useStore } from "@/lib/store";
import { Desk } from "./Desk";

/** Reuses the highlight review intervals; the conclusion stays hidden until recall. */
export function DailyThought() {
  const glosses = useStore(s => s.glosses);
  const library = useStore(s => s.library);
  const update = useStore(s => s.updateGloss);
  const [revealed, setRevealed] = useState<string | null>(null);
  const { deck } = todaysThoughts(Object.values(glosses).flat().filter(g => library.some(b => b.id === g.articleId)));
  const pick = deck[0];
  if (!pick) return null;
  const title = library.find(b => b.id === pick.articleId)?.title ?? "Your book";
  const open = revealed === pick.id;
  return <Desk label="A thought to revisit">
    <article className="thought-review">
      <p className="thought-book">{title}</p>
      <h2>Does this idea still hold up?</h2>
      <p className="thought-review-claim">{pick.reflection?.claim || pick.anchor?.quote || "Recall the idea you discussed."}</p>
      {!open ? <><p className="thought-lead">Recall your conclusion. Can you find a new example?</p><button type="button" className="thought-primary" onClick={() => setRevealed(pick.id)}>Reveal my takeaway</button></> : <>
        <div className="thought-review-answer"><span>Your earlier conclusion</span><p>{pick.reflection?.takeaway}</p>{pick.reflection?.openQuestion && <><span>Still unresolved</span><p>{pick.reflection.openQuestion}</p></>}</div>
        <div className="thought-actions"><button type="button" className="thought-back" onClick={() => update(pick.articleId, pick.id, g => ({ ...g, review: retire(g) }))}>Done with this thought</button><button type="button" className="thought-primary" onClick={() => update(pick.articleId, pick.id, g => ({ ...g, review: keepInRotation(g) }))}>Revisit later</button></div>
      </>}
      <Link className="thought-book-link" href={`/read/${pick.articleId}`}>Read the book <ArrowUpRight size={14} /></Link>
    </article>
  </Desk>;
}
