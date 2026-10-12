"use client";

import { useUser } from "@clerk/nextjs";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, Play } from "lucide-react";
import { Edition } from "@/components/library/Edition";
import { TopBar } from "@/components/ui/TopBar";
import { tidyTitle } from "@/lib/article";
import { editionMonth, editionTitle, estimatePages, monthName, monthOf, price, spineInches, SPINE_TEXT_PAGES, type EditionOrder } from "@/lib/edition";
import { fetchOrders, keptCover, monthsOf, plainCopy, savedName, type KeptCover } from "@/lib/editions";
import { TOPIC, topicArtSrc, topicOf, type TopicKey } from "@/lib/library";
import { COVER_CSS, frontHTML, MARK_WASH } from "@/lib/print/html";
import { applySettings } from "@/lib/settings";
import { useStore, type LibraryItem } from "@/lib/store";

/** Fewer than this and there's no book to bind yet. */
const MIN_PIECES = 3;

const STATUS: Record<EditionOrder["status"], string> = {
  draft: "Not paid for yet",
  paid: "Paid, being set in type",
  setting: "Being set in type",
  sent: "With the printer",
  printing: "Being printed",
  shipped: "On its way to you",
  delivered: "Delivered",
  failed: "Couldn't be printed, refunded",
  canceled: "Canceled",
};

type Sheet = { month: string; order?: string; session?: string | null };

/**
 * The print page: this month's reading as the book it would be, held up
 * before you order it, and what goes into one. Making it, leaving things
 * out, hearing it and ordering it happen in the edition sheet it opens.
 */
export function PrintPage() {
  const { user } = useUser();
  const hydrate = useStore((s) => s.hydrate);
  const hydrated = useStore((s) => s.hydrated);
  const library = useStore((s) => s.library);
  const highlights = useStore((s) => s.highlights);

  const [sheet, setSheet] = useState<Sheet | null>(null);
  const [kept, setKept] = useState<KeptCover | null>(null);
  const [orders, setOrders] = useState<EditionOrder[]>([]);
  const [name, setName] = useState("");
  // Bumped when the sheet closes, to read back a cover painted or a name changed in it.
  const [seen, setSeen] = useState(0);

  useEffect(() => {
    hydrate();
    applySettings(useStore.getState().settings);
  }, [hydrate]);

  const month = useMemo(() => editionMonth(library), [library]);
  const items = useMemo(() => library.filter((x) => x.origin !== "sample" && monthOf(x.addedAt) === month), [library, month]);

  useEffect(() => {
    let live = true;
    void keptCover(month).then((c) => live && setKept(c));
    void fetchOrders().then((os) => live && setOrders(os));
    return () => {
      live = false;
    };
  }, [month, seen]);

  useEffect(() => {
    setName(savedName() ?? user?.firstName ?? "");
  }, [user?.firstName, seen]);

  // Back from checkout (?edition=ed_...&session=...), or sent straight to this month's edition (?edition=open).
  useEffect(() => {
    if (!hydrated) return;
    const q = new URLSearchParams(window.location.search);
    const e = q.get("edition");
    if (!e) return;
    const m = editionMonth(useStore.getState().library);
    setSheet(e.startsWith("ed_") && !q.get("canceled") ? { month: m, order: e, session: q.get("session") } : { month: m });
    window.history.replaceState(null, "", "/print");
  }, [hydrated]);

  const marksOf = useCallback((x: LibraryItem) => highlights[x.id] ?? [], [highlights]);
  const marks = items.reduce((n, x) => n + marksOf(x).length, 0);
  const notes = items.reduce((n, x) => n + marksOf(x).filter((h) => h.note?.trim()).length, 0);
  const pages = estimatePages(items.map((x) => ({ words: x.words, figures: 0, tables: 0, code: 0, plate: true })));
  const copy = kept?.copy ?? plainCopy(items.map((item) => ({ item, marks: marksOf(item).length, size: { words: item.words } })));
  const view = { name, month, theme: copy.theme, lines: copy.lines, topic: copy.topic, art: kept?.art ? `data:image/jpeg;base64,${kept.art}` : null, count: items.length };
  const ready = items.length >= MIN_PIECES;
  const when = monthName(month, { year: false });

  // A real mark of yours for the page specimen: one with a note if there is one.
  const specimen = useMemo(() => {
    const all = items.flatMap((x) => marksOf(x).map((h) => ({ h, x })));
    const pick = all.find((m) => m.h.note?.trim() && m.h.anchor.quote.length > 40) ?? all.find((m) => m.h.anchor.quote.length > 40);
    return pick ? { title: tidyTitle(pick.x.title), topic: topicOf(pick.x.topic), quote: pick.h.anchor.quote, note: pick.h.note?.trim(), color: pick.h.color ?? "yellow" } : null;
  }, [items, marksOf]);

  const others = useMemo(
    () => monthsOf(library).filter((m) => m !== month && library.filter((x) => x.origin !== "sample" && monthOf(x.addedAt) === m).length >= MIN_PIECES),
    [library, month]
  );
  const open = () => setSheet({ month });

  return (
    <div className="pp">
      <style dangerouslySetInnerHTML={{ __html: COVER_CSS }} />
      <div className="pp-top">
        <TopBar here="print" />
      </div>

      <main>
        <section className="pp-hero">
          <div className="pp-copy">
            <p className="pp-eyebrow">
              <span className="pp-dot" /> Gloss Editions
            </p>
            <h1 className="pp-title">
              Print and ship <span className="hero-mark">your book</span>.
            </h1>
            <p className="pp-lede">
              {ready ? `Everything you saved in ${when}` : "Everything you save in a month"}, with your highlights and notes, set as a 6 × 9 paperback under a
              cover painted for the month. Printed and posted to you.
            </p>
            <div className="pp-actions">
              {ready || !hydrated ? (
                <button type="button" className="pp-cta" onClick={open} disabled={!hydrated}>
                  Make your {when} edition <ArrowRight size={17} />
                </button>
              ) : (
                <Link href="/library" className="pp-cta">
                  Save a few things first <ArrowRight size={17} />
                </Link>
              )}
              <p className="pp-price">
                <b>{price()}</b> shipping included
              </p>
            </div>
            {hydrated && (
              <p className="pp-stats">
                {ready ? (
                  <>
                    <span>
                      <b>{items.length}</b> pieces
                    </span>
                    <span>
                      about <b>{pages}</b> pages
                    </span>
                    {marks > 0 && (
                      <span>
                        <b>{marks}</b> {marks === 1 ? "highlight" : "highlights"}
                      </span>
                    )}
                    {notes > 0 && (
                      <span>
                        <b>{notes}</b> {notes === 1 ? "note" : "notes"}
                      </span>
                    )}
                  </>
                ) : (
                  <span>An edition starts at three pieces. You have {items.length} this month.</span>
                )}
              </p>
            )}
          </div>

          <div className="pp-stage">
            {hydrated && <HeroBook view={view} pages={pages} plate={topicArtSrc(copy.topic)} onOpen={ready ? open : undefined} />}
            {hydrated && (
              <p className="pp-caption">
                {editionTitle(name)} <span>·</span> {monthName(month)}
              </p>
            )}
          </div>
        </section>

        <section className="pp-inside" aria-labelledby="pp-inside">
          <header className="pp-head">
            <p className="pp-kicker">Inside</p>
            <h2 id="pp-inside">Everything you kept, the way you kept it.</h2>
          </header>
          <div className="pp-tiles">
            <figure className="pp-tile">
              <Specimen s={specimen} />
              <figcaption>
                <b>Your highlights and notes, on every page.</b> In their marker colours, with each note under the passage it belongs to.
              </figcaption>
            </figure>
            <figure className="pp-tile">
              <div className="pp-painting" style={{ ["--c" as string]: TOPIC[copy.topic].shades[2] }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={view.art ?? topicArtSrc(copy.topic)} alt="" className={view.art ? "" : "is-plate"} />
                {copy.theme && <p>{copy.theme}</p>}
              </div>
              <figcaption>
                <b>A cover painted for the month.</b> Written and painted from what you read, so no two editions look alike.
              </figcaption>
            </figure>
            <figure className="pp-tile">
              <Waves topic={copy.topic} />
              <figcaption>
                <b>Hear it as a podcast.</b> Two hosts talk your month through, with the lines you marked and the notes you left.
              </figcaption>
            </figure>
          </div>
        </section>

        <section className="pp-how" aria-labelledby="pp-how">
          <header className="pp-head">
            <p className="pp-kicker">How it works</p>
            <h2 id="pp-how">From your shelf to your door.</h2>
          </header>
          <ol className="pp-steps">
            <li>
              <span className="pp-n">1</span>
              <b>Choose what goes in</b>
              <p>Name your edition, leaf through it, and untick anything you'd rather leave out.</p>
            </li>
            <li>
              <span className="pp-n">2</span>
              <b>We set it and print it</b>
              <p>Justified, hyphenated and paged like a book, then printed on demand by Lulu in full colour.</p>
            </li>
            <li>
              <span className="pp-n">3</span>
              <b>It comes to you</b>
              <p>Posted in about three weeks. {price()} with shipping, in the US for now.</p>
            </li>
          </ol>
        </section>

        {(orders.length > 0 || others.length > 0) && (
          <section className="pp-yours" aria-labelledby="pp-yours">
            <header className="pp-head">
              <p className="pp-kicker">Yours</p>
              <h2 id="pp-yours">Your editions</h2>
            </header>
            <ul className="pp-orders">
              {orders.map((o) => (
                <li key={o.id}>
                  <button type="button" onClick={() => setSheet({ month: o.month, order: o.id })}>
                    <span className="pp-o-title">
                      {editionTitle(o.name)}, {monthName(o.month)}
                    </span>
                    <span className="pp-o-status" data-done={o.status === "delivered" || undefined}>
                      {o.test ? "Test order, " : ""}
                      {o.test && o.status === "sent" ? "ready for the printer" : STATUS[o.status].toLowerCase()}
                    </span>
                    <ArrowUpRight size={15} />
                  </button>
                </li>
              ))}
              {others.map((m) => (
                <li key={m}>
                  <button type="button" onClick={() => setSheet({ month: m })}>
                    <span className="pp-o-title">{monthName(m)}</span>
                    <span className="pp-o-status">Not printed yet</span>
                    <ArrowUpRight size={15} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <p className="pp-fine">
          A 6 × 9 inch paperback on 60 lb white paper, in full colour, printed on demand by Lulu and posted to you. Up to 300 pages for {price()}, shipping
          included. US addresses only for now.
        </p>
      </main>

      {sheet && (
        <Edition
          month={sheet.month}
          orderId={sheet.order}
          session={sheet.session}
          owner={user?.firstName ?? ""}
          onClose={() => {
            setSheet(null);
            setSeen((n) => n + 1);
          }}
        />
      )}
    </div>
  );
}

/**
 * The month's book, held up: the cover as the press sets it, a spine as thick
 * as the page count, page edges, and a tilt that follows the pointer.
 */
function HeroBook({ view, pages, plate, onOpen }: { view: Parameters<typeof frontHTML>[0]; pages: number; plate: string; onOpen?: () => void }) {
  const ref = useRef<HTMLButtonElement>(null);
  const ink = TOPIC[view.topic].shades[2];
  // Thickness in units of the cover's width (6 inches), so it scales with the book.
  const depth = Math.max(0.04, spineInches(pages) / 6);

  useEffect(() => {
    const el = ref.current;
    if (!el || !window.matchMedia("(hover: hover) and (pointer: fine)").matches || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      const x = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / (window.innerWidth / 2)));
      const y = Math.max(-1, Math.min(1, (e.clientY - (r.top + r.height / 2)) / (window.innerHeight / 2)));
      el.style.setProperty("--tx", x.toFixed(3));
      el.style.setProperty("--ty", y.toFixed(3));
    };
    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, []);

  return (
    <button
      ref={ref}
      type="button"
      className="hb"
      onClick={onOpen}
      disabled={!onOpen}
      aria-label={`Open ${editionTitle(view.name)}`}
      style={{ ["--d" as string]: depth, ["--ink" as string]: ink }}
    >
      <span className="hb-shadow" aria-hidden />
      <span className="hb-float" aria-hidden>
        <span className="hb-book">
          <span className="hb-face hb-back" />
          <span className="hb-face hb-edge" />
          <span className="hb-face hb-edge is-top" />
          <span className="hb-face hb-spine">
            {pages >= SPINE_TEXT_PAGES && (
              <span className="hb-spine-text">
                <b>Gloss</b>
                <i />
                <em>{editionTitle(view.name)}</em>
              </span>
            )}
          </span>
          <span className="hb-face hb-front">
            <span className="hb-cover" dangerouslySetInnerHTML={{ __html: frontHTML(view, { plate }) }} />
            <span className="hb-gloss" />
          </span>
        </span>
      </span>
    </button>
  );
}

/** A corner of a printed page: one of your own marks, set the way the press sets it. */
function Specimen({ s }: { s: { title: string; topic: TopicKey; quote: string; note?: string; color: keyof typeof MARK_WASH } | null }) {
  const quote = s ? (s.quote.length > 170 ? `${s.quote.slice(0, 168).replace(/\s+\S*$/, "")}…` : s.quote) : "The first principle is that you must not fool yourself, and you are the easiest person to fool.";
  return (
    <div className="pp-page" aria-hidden>
      <p className="pp-page-kicker">{s && s.topic !== "unsorted" ? TOPIC[s.topic].name : "Science"}</p>
      <p className="pp-page-title">{s?.title ?? "Cargo Cult Science"}</p>
      <p className="pp-page-body">
        <mark style={{ background: MARK_WASH[s?.color ?? "yellow"] }}>{quote}</mark>
      </p>
      {(s ? s.note : "Put this above the desk.") && (
        <p className="pp-page-note">
          <b>Your note</b> {s ? s.note : "Put this above the desk."}
        </p>
      )}
    </div>
  );
}

/** Two voices, as a waveform in the month's inks. */
function Waves({ topic }: { topic: TopicKey }) {
  const shades = TOPIC[topic].shades;
  const bars = Array.from({ length: 44 }, (_, i) => 0.28 + 0.72 * Math.abs(Math.sin(i * 0.57) * Math.cos(i * 0.23 + 1)) ** 0.7);
  return (
    <div className="pp-pod" aria-hidden>
      <div className="pp-pod-top">
        <span className="pp-pod-play">
          <Play size={15} fill="currentColor" />
        </span>
        <span>
          <b>Your month, talked through</b>
          <small>Two hosts · about 10 minutes</small>
        </span>
      </div>
      <div className="pp-pod-wave">
        {bars.map((h, i) => (
          <span key={i} style={{ height: `${h * 100}%`, background: shades[[2, 0, 1, 2, 3][Math.floor(i / 9) % 5]], opacity: i < 17 ? 1 : 0.32 }} />
        ))}
      </div>
    </div>
  );
}
