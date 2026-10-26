import assert from "node:assert/strict";
import { test } from "node:test";
import { runInNewContext } from "node:vm";
import { applySettings, BOOT_SCRIPT, DEFAULT_SETTINGS, readingPreset, READING_PRESETS } from "../lib/settings";
import { safeSettings } from "../lib/backup-format";

test("reading presets identify custom changes and preserve unrelated preferences", () => {
  const personal = { ...DEFAULT_SETTINGS, face: "sans" as const, width: "wide" as const, theme: "night" as const, listen: false };
  const compact = { ...personal, ...READING_PRESETS.compact };
  assert.equal(readingPreset(compact), "compact");
  assert.equal(compact.face, "sans");
  assert.equal(compact.width, "wide");
  assert.equal(compact.theme, "night");
  assert.equal(compact.listen, false);
  assert.equal(readingPreset({ ...compact, size: 23 }), "custom");
  assert.equal(readingPreset({ ...compact, ...READING_PRESETS.comfort }), "comfort");
  assert.equal(safeSettings(compact).bookDensity, "compact");
  assert.equal(safeSettings({ ...DEFAULT_SETTINGS, bookDensity: undefined } as never).bookDensity, "comfort");
});

test("first paint and settings updates apply the same pagination density", t => {
  const makeElement = () => ({ dataset: {} as Record<string, string>, style: { setProperty(key: string, value: string) { this.values[key] = String(value); }, values: {} as Record<string, string> } });
  const updated = makeElement(), booted = makeElement();
  Object.defineProperty(globalThis, "document", { configurable: true, value: { documentElement: updated } });
  t.after(() => Reflect.deleteProperty(globalThis, "document"));
  const settings = { ...DEFAULT_SETTINGS, ...READING_PRESETS.compact, theme: "paper" as const };
  applySettings(settings);
  runInNewContext(BOOT_SCRIPT, { document: { documentElement: booted }, localStorage: { getItem: () => JSON.stringify(settings) } });
  assert.deepEqual(booted.dataset, updated.dataset);
  assert.deepEqual(booted.style.values, updated.style.values);
});
