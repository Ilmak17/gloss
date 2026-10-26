/** Page numbers are one-based at the UI boundary. */
export function locateBookPage(counts: number[], requested: number): { chapter: number; page: number } | null {
  if (!Number.isInteger(requested) || requested < 1 || requested > counts.reduce((a,b)=>a+b,0)) return null;
  let remaining = requested - 1;
  for (let chapter = 0; chapter < counts.length; chapter++) {
    if (remaining < counts[chapter]) return { chapter, page: remaining };
    remaining -= counts[chapter];
  }
  return null;
}
