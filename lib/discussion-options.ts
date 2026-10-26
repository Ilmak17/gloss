/** Compact UI choices; the complete request still travels with the Codex handoff. */
export const DISCUSSION_OPTIONS = [
  { id: "explain", label: "Explain", description: "Understand the meaning, with a simple example.", prompt: "Explain this passage with a simple example." },
  { id: "translate", label: "Translate", description: "Translate into Russian and unpack unfamiliar expressions.", prompt: "Translate this passage into Russian, preserving the meaning. Briefly explain any idioms or ambiguous terms." },
  { id: "example", label: "Example", description: "Make the idea concrete with a real-world example.", prompt: "Give me an example" },
  { id: "ask", label: "Ask", description: "Bring your own question about this passage.", prompt: "" },
] as const;
export type DiscussionMode = typeof DISCUSSION_OPTIONS[number]["id"];

export function discussionQuestion(question: string): { mode: DiscussionMode; detail: string } {
  for (const option of DISCUSSION_OPTIONS) {
    if (!option.prompt) continue;
    if (question === option.prompt) return { mode: option.id, detail: "" };
    if (question.startsWith(option.prompt + "\n\n")) return { mode: option.id, detail: question.slice(option.prompt.length + 2) };
  }
  return { mode: "ask", detail: question };
}

export function composeDiscussionQuestion(mode: DiscussionMode, detail: string): string {
  const prompt = DISCUSSION_OPTIONS.find(option => option.id === mode)!.prompt;
  return prompt ? prompt + (detail ? "\n\n" + detail : "") : detail;
}
