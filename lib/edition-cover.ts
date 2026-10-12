/**
 * An edition's cover words, on the server. The fast model reads the month's
 * titles and writes the subtitle that goes under the edition's name, and picks
 * the month's main subject. The cover itself is drawn from the month (lib/print/html.ts).
 */

import { undash } from "./article";
import type { CoverCopy } from "./edition";
import { isTopic, TOPIC, TOPICS, type TopicKey } from "./library";
import { completeJSON, DEFAULT_MODEL } from "./together";

export type CoverTitle = { title: string; topic: TopicKey; tags?: string[] };

const SYSTEM = `You are the editor of a small printed edition made for one reader: each month's edition gathers the texts they saved that month.

From the month's titles, write:
- theme: the edition's subtitle, under its name on the cover. Six to nine words that name what the month was about, in sentence case, like "On doing great work, and the machines learning to help". No colon, no quotation marks, no dashes.
- topic: the key of the subject the month was most about, from: ${TOPICS.filter((t) => t.key !== "unsorted")
  .map((t) => t.key)
  .join(", ")}.

Reply with JSON only: {"theme": "...", "topic": "<key>"}`;

const clean = (s: unknown, max: number) => (typeof s === "string" ? undash(s).replace(/["“”]/g, "").replace(/\s+/g, " ").trim().slice(0, max) : "");

/** The subject with the most texts: the inks when the model doesn't pick. */
export function mainTopic(titles: CoverTitle[]): TopicKey {
  const n = new Map<TopicKey, number>();
  for (const t of titles) if (t.topic !== "unsorted") n.set(t.topic, (n.get(t.topic) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "living";
}

export async function writeCover(input: { month: string; titles: CoverTitle[] }, opts: { apiKey?: string; signal?: AbortSignal } = {}): Promise<{ ok: true; copy: CoverCopy; usd: number } | { ok: false; error: string }> {
  const list = input.titles
    .slice(0, 60)
    .map((t) => `- ${t.title} [${TOPIC[t.topic].name}${t.tags?.length ? `; ${t.tags.slice(0, 3).join(", ")}` : ""}]`)
    .join("\n");
  const r = await completeJSON<{ theme?: unknown; topic?: unknown }>({
    model: DEFAULT_MODEL,
    apiKey: opts.apiKey,
    signal: opts.signal,
    maxTokens: 160,
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: `The month: ${input.month}\nThe texts saved:\n${list}` },
    ],
  });
  if (!r.ok) return r;
  const copy: CoverCopy = {
    theme: clean(r.data.theme, 90),
    topic: isTopic(r.data.topic) && r.data.topic !== "unsorted" ? r.data.topic : mainTopic(input.titles),
  };
  if (!copy.theme) return { ok: false, error: "The cover came back without a subtitle." };
  return { ok: true, copy, usd: r.usage.costUsd };
}
