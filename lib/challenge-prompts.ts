/** What the reader has written so far in a challenge. */
export type ChallengeAnswers = { claim?: string; doubt?: string; stand?: string };

/** On open: every prompt up to the first one still waiting for an answer. */
export function openPrompts(a: ChallengeAnswers): number {
  if (a.doubt?.trim() || a.stand?.trim()) return 3;
  return a.claim?.trim() ? 2 : 1;
}

const ORDER = ["claim", "doubt", "stand"] as const;

/** After a pause in writing: the next prompt, once the last one shown has an answer. */
export function afterPause(shown: number, a: ChallengeAnswers): number {
  if (shown >= ORDER.length) return ORDER.length;
  return a[ORDER[shown - 1]]?.trim() ? shown + 1 : shown;
}

/** Ways into a doubt. Each is saved as its question, so the Codex handoff and the notebook read it as written. */
export const ANGLES = [
  { label: "Evidence", question: "What supports this claim?" },
  { label: "Limits", question: "When might this stop being true?" },
  { label: "Alternatives", question: "Could something else explain this?" },
];

const SEP = "\n\n";

/** The chosen angles and the reader's own words, from the saved doubt. */
export function doubtParts(doubt: string): { angles: string[]; text: string } {
  const parts = doubt.split(SEP);
  const angleOf = (part: string) => ANGLES.find(a => a.question === part.trim());
  return {
    angles: ANGLES.filter(a => parts.some(p => angleOf(p) === a)).map(a => a.label),
    text: parts.filter(p => !angleOf(p)).join(SEP),
  };
}

function compose(angles: string[], text: string): string {
  return [...ANGLES.filter(a => angles.includes(a.label)).map(a => a.question), ...(text ? [text] : [])].join(SEP);
}

export function toggleAngle(doubt: string, label: string): string {
  const { angles, text } = doubtParts(doubt);
  return compose(angles.includes(label) ? angles.filter(a => a !== label) : [...angles, label], text);
}

export function withDoubtText(doubt: string, text: string): string {
  return compose(doubtParts(doubt).angles, text);
}
