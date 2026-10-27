"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ComponentProps } from "react";
import { Check, Copy, X } from "lucide-react";
import { ANGLES, afterPause, doubtParts, openPrompts, toggleAngle, withDoubtText } from "@/lib/challenge-prompts";
import { composeDiscussionQuestion, discussionQuestion } from "@/lib/discussion-options";
import { pauseListening, resumeAfterStudy, useListen } from "@/lib/listening";
import { keepInRotation, retire } from "@/lib/review";
import { studyContext } from "@/lib/study";
import { useStore, type Gloss } from "@/lib/store";
import { placeThought, type ThoughtPlacement } from "@/lib/thought-placement";
import { useReader } from "./context";

/** How long the reader pauses in writing before the next question comes. */
const PAUSE_MS = 600;
/** Closing: the thought fades while the pencil line folds into the margin dot. */
const LEAVE_MS = 240;

/** A writing line that grows with its text, and refits when the thought changes width. */
function Answer(props: ComponentProps<"textarea">) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fit = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);
  useLayoutEffect(fit, [props.value, fit]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let width = el.clientWidth;
    const observer = new ResizeObserver(() => { if (el.clientWidth !== width) { width = el.clientWidth; fit(); } });
    observer.observe(el);
    return () => observer.disconnect();
  }, [fit]);
  return <textarea {...props} ref={ref} rows={1} spellCheck />;
}

/**
 * Challenge, written in the margin beside the passage. The page never moves:
 * a pencil line marks the passage and three short prompts come one at a time.
 * Everything autosaves to the notebook; closing leaves a dot in the margin.
 */
export function ChallengeThought({ gloss }: { gloss: Gloss }) {
  const { ix } = useReader();
  const update = useStore(s => s.updateGloss);
  const setUI = useStore(s => s.setUI);
  const studyPaused = useListen(s => s.studyPaused);
  const card = useRef<HTMLElement>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [place, setPlace] = useState<ThoughtPlacement | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [copy, setCopy] = useState<"idle" | "done" | "failed">("idle");
  const [packet, setPacket] = useState("");
  const id = gloss.id;
  const { detail } = discussionQuestion(gloss.question ?? "");
  const doubt = doubtParts(detail);
  const claim = gloss.reflection?.claim ?? "";
  const stand = gloss.reflection?.takeaway ?? "";
  const openQuestion = gloss.reflection?.openQuestion ?? "";
  const [first] = useState(() => openPrompts({ claim, doubt: detail, stand }));
  const [shown, setShown] = useState(first);
  const [askMore, setAskMore] = useState(() => !!openQuestion.trim());
  const repeat = !!gloss.review && !gloss.review.off;
  const written = !!(claim.trim() || detail.trim() || stand.trim());

  const close = useCallback(() => {
    if (leaveTimer.current) return;
    setLeaving(true);
    const quick = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    leaveTimer.current = setTimeout(() => {
      if (useStore.getState().activeGloss === id) setUI({ activeGloss: null });
    }, quick ? 0 : LEAVE_MS);
  }, [id, setUI]);
  useEffect(() => () => clearTimeout(leaveTimer.current), []);
  // Escape closes it from anywhere on the page, unless something on top of it takes the key first.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented || document.querySelector(".lens, [role=dialog], [role=menu], dialog[open]")) return;
      close();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [close]);

  // Opening: listening pauses; focus returns to where it was once the thought closes.
  useEffect(() => {
    const before = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    pauseListening(true);
    return () => {
      if (before?.isConnected && (!document.activeElement || document.activeElement === document.body)) before.focus({ preventScroll: true });
    };
  }, [id]);
  // Once placed (it is hidden while measured, and hidden fields take no focus), a fresh thought puts the caret in the first answer.
  const placed = !!place;
  useEffect(() => {
    if (!placed) return;
    const target = document.getElementById(`challenge-claim-${id}`) as HTMLTextAreaElement | null;
    if (target && !target.value.trim()) target.focus({ preventScroll: true });
    else card.current?.focus({ preventScroll: true });
  }, [placed, id]);

  // The next question comes after a short pause, once the last one has an answer.
  useEffect(() => {
    if (shown >= 3) return;
    const t = setTimeout(() => setShown(s => afterPause(s, { claim, doubt: detail, stand })), PAUSE_MS);
    return () => clearTimeout(t);
  }, [claim, detail, stand, shown]);

  // Follow the passage: on scroll, resize, page turns and as the thought grows.
  useLayoutEffect(() => {
    let frame = 0;
    let hadRule = false;
    const measure = () => {
      frame = 0;
      const marks = [...document.querySelectorAll<HTMLElement>(`.prose-read .m-gloss[data-g~="${CSS.escape(id)}"]`)];
      const block = !marks.length && gloss.at ? document.querySelector<HTMLElement>(`.prose-read [data-block="${CSS.escape(gloss.at)}"] .blk-text`) : null;
      const lines = [...marks, ...(block ? [block] : [])].flatMap(el => [...el.getClientRects()]);
      const stage = document.querySelector<HTMLElement>(".book-stage");
      const text = stage ?? document.querySelector<HTMLElement>(".prose-read");
      if (!text) return;
      const topbar = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--topbar-h")) || 0;
      const column = text.getBoundingClientRect();
      const next = placeThought({
        lines, column,
        view: { width: document.documentElement.clientWidth, height: window.innerHeight },
        minTop: stage ? column.top : topbar + 16,
        height: card.current?.offsetHeight,
      });
      // A book page turned away from the passage takes its thought with it.
      if (stage && hadRule && !next.rule) { close(); return; }
      hadRule ||= !!next.rule;
      setPlace(next);
    };
    const soon = () => { frame ||= requestAnimationFrame(measure); };
    measure();
    window.addEventListener("resize", soon);
    window.addEventListener("scroll", soon, true);
    const observer = new ResizeObserver(soon);
    if (card.current) observer.observe(card.current);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", soon);
      window.removeEventListener("scroll", soon, true);
      observer.disconnect();
    };
  }, [id, gloss.at, close]);

  const edit = (key: "claim" | "takeaway" | "openQuestion", value: string) => {
    update(ix.article.id, id, g => ({ ...g, reflection: { ...g.reflection, [key]: value } }));
    setCopy("idle");
  };
  const editDoubt = (next: string) => {
    update(ix.article.id, id, g => ({ ...g, question: composeDiscussionQuestion("challenge", next) }));
    setCopy("idle");
  };
  const copyForCodex = async () => {
    const text = studyContext(ix, gloss);
    setPacket(text);
    try { await navigator.clipboard.writeText(text); setCopy("done"); }
    catch { setCopy("failed"); }
  };
  const skip = (n: number) => shown === n && n < 3 && <button type="button" className="challenge-skip" onClick={() => setShown(n + 1)}>Skip</button>;
  const isNew = (n: number) => (n > first ? " is-new" : "");

  const box = place?.card;
  return <>
    {place?.rule && <div className={`challenge-rule${leaving ? " is-leaving" : ""}`} aria-hidden
      style={{ left: place.rule.left, top: place.rule.top, height: place.rule.height, ["--fold" as string]: `${place.rule.fold}px` }} />}
    <aside ref={card} tabIndex={-1} aria-label="Challenge this passage"
      className={`challenge-thought ${box?.mode === "overlay" ? "is-over" : "is-beside"}${leaving ? " is-leaving" : ""}`}
      style={!box ? { visibility: "hidden" } : box.mode === "margin" ? { left: box.left, top: box.top, width: box.width, maxHeight: box.maxHeight } : undefined}
      onKeyDown={e => {
        e.stopPropagation();
        if (e.key === "Escape") { e.preventDefault(); close(); }
      }}>
      <header className="challenge-label">
        <span><i aria-hidden />Challenge</span>
        <button type="button" aria-label="Close. Your thinking stays saved." title="Close · your thinking stays saved" onClick={close}><X size={14} strokeWidth={1.6} /></button>
      </header>

      <section className="challenge-prompt">
        <div className="challenge-q"><label htmlFor={`challenge-claim-${id}`}>In your words, what is the claim?</label>{!claim.trim() && skip(1)}</div>
        <Answer id={`challenge-claim-${id}`} value={claim} maxLength={2000} placeholder="The author is saying…" onChange={e => edit("claim", e.target.value)} />
      </section>

      {shown >= 2 && <section className={`challenge-prompt${isNew(2)}`}>
        <div className="challenge-q"><label htmlFor={`challenge-doubt-${id}`}>Where do you doubt it?</label>{!detail.trim() && skip(2)}</div>
        <div className="challenge-angles" role="group" aria-label="Ways into a doubt">
          {ANGLES.map(a => <button key={a.label} type="button" title={a.question} aria-pressed={doubt.angles.includes(a.label)}
            onClick={() => editDoubt(toggleAngle(detail, a.label).slice(0, 1900))}>{a.label}</button>)}
        </div>
        <Answer id={`challenge-doubt-${id}`} value={doubt.text} maxLength={1600} placeholder="It doesn’t convince me because…" onChange={e => editDoubt(withDoubtText(detail, e.target.value))} />
      </section>}

      {shown >= 3 && <section className={`challenge-prompt${isNew(3)}`}>
        <div className="challenge-q"><label htmlFor={`challenge-stand-${id}`}>Where do you stand, for now?</label></div>
        <Answer id={`challenge-stand-${id}`} value={stand} maxLength={2000} placeholder="For now, I think…" onChange={e => edit("takeaway", e.target.value)} />
        {stand.trim() && <label className="challenge-revisit">
          <input type="checkbox" checked={repeat} onChange={e => {
            const on = e.target.checked;
            update(ix.article.id, id, g => ({ ...g, review: on ? (g.review ? { ...g.review, off: false } : keepInRotation(g)) : retire(g) }));
          }} />
          <span>Revisit later{repeat && <small> · {new Date(gloss.review!.due).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</small>}</span>
        </label>}
        {stand.trim() && !askMore && <button type="button" className="challenge-more" onClick={() => setAskMore(true)}>What would change your mind?</button>}
      </section>}

      {askMore && <section className={`challenge-prompt${openQuestion.trim() ? "" : " is-new"}`}>
        <div className="challenge-q"><label htmlFor={`challenge-open-${id}`}>What would change your mind?</label></div>
        <Answer id={`challenge-open-${id}`} value={openQuestion} maxLength={2000} placeholder="I’d think again if…" autoFocus={!openQuestion.trim()} onChange={e => edit("openQuestion", e.target.value)} />
      </section>}

      <footer className="challenge-actions">
        <button type="button" title="Copies the passage and your thinking. Paste it into Codex to discuss." onClick={copyForCodex}>
          {copy === "done" ? <Check size={13} aria-hidden /> : <Copy size={13} aria-hidden />}{copy === "done" ? "Copied" : "Copy for Codex"}
        </button>
        <span role="status">{copy === "done" ? "Paste it into Codex" : written ? "Saved" : "Autosaves"}</span>
      </footer>
      {copy === "failed" && <div className="challenge-packet">
        <p>Couldn’t copy. Select the message below.</p>
        <Answer aria-label="Prepared message" readOnly value={packet} onFocus={e => e.currentTarget.select()} />
      </div>}
      {studyPaused && <button type="button" className="challenge-more" onClick={() => { close(); resumeAfterStudy(); }}>Resume listening</button>}
    </aside>
  </>;
}
