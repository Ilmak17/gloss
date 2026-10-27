type WheelSample = {
  deltaX: number;
  deltaY: number;
  deltaMode: number;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
};

/** A wheel burst includes the trackpad's momentum tail, even after a page turns. */
export function createPageSwipe() {
  let last = -Infinity;
  let distance = 0;
  let locked = false;
  return (event: WheelSample, now: number, blocked = false) => {
    if (now - last > 180) {
      distance = 0;
      locked = false;
    }
    last = now;
    if (blocked || event.ctrlKey || event.metaKey || event.altKey) {
      locked = true;
      return { handled: false, direction: 0 };
    }
    const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY) * 1.4;
    if (!horizontal) return { handled: false, direction: 0 };
    // Consume horizontal momentum so it cannot scroll between page boundaries.
    if (locked) return { handled: true, direction: 0 };
    const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 640 : 1;
    if (Math.sign(distance) !== Math.sign(event.deltaX)) distance = 0;
    distance += event.deltaX * scale;
    if (Math.abs(distance) < 60) return { handled: true, direction: 0 };
    locked = true;
    return { handled: true, direction: Math.sign(distance) };
  };
}
