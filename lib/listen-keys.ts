/**
 * What a key does to the voice. `null` leaves the key to the page; "ignore"
 * takes it and does nothing (a held Space repeating).
 */
export type ListenKeyAction = "toggle" | "start" | "back" | "next" | "slower" | "faster" | "ignore" | null;

type Key = { key: string; shiftKey: boolean; repeat: boolean; mod: boolean };
/**
 * `typing`: focus is in a field. `onControl`: on a button or link, often left
 * there by a click. `overlay`: a menu or dialog is open. `canStart`: Space may
 * start the voice from the page.
 */
type Where = { typing: boolean; onControl: boolean; overlay: boolean; idle: boolean; canStart: boolean };

export function listenKeyAction(k: Key, at: Where): ListenKeyAction {
  if (k.mod || at.typing || at.overlay) return null;
  if (k.key === " " && !k.shiftKey) {
    // While the voice reads, Space is its pause key, whichever button a click left focused.
    const action = !at.idle ? "toggle" : at.canStart && !at.onControl ? "start" : null;
    // Held down, it acts once: repeats would flicker between play and pause.
    return action && k.repeat ? "ignore" : action;
  }
  if (at.idle) return null;
  if (k.shiftKey && k.key === "ArrowLeft") return "back";
  if (k.shiftKey && k.key === "ArrowRight") return "next";
  if (k.key === "-") return "slower";
  if (k.key === "=" || k.key === "+") return "faster";
  return null;
}
