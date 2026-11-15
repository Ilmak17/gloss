import assert from "node:assert/strict";
import { test } from "node:test";
import { readVoiceSettings, saveVoiceSettings } from "../lib/voice-settings";
import { SPEKO_VOICE } from "../lib/voice";
test("Speko's book narrator is default and migrating/switching never sends another provider's credentials", t => {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } });
  t.after(() => Reflect.deleteProperty(globalThis, "localStorage"));
  storage.set("gloss:voice-settings", JSON.stringify({ provider: "elevenlabs", apiKey: "eleven-secret", voiceId: "old-voice" }));
  assert.deepEqual(readVoiceSettings(), { provider: "speko", apiKey: "", voiceId: "orpheus" });
  saveVoiceSettings({ provider: "kokoro", apiKey: "deep-secret", voiceId: "bf_emma" });
  assert.equal(readVoiceSettings().apiKey, "deep-secret");
  assert.deepEqual(readVoiceSettings("elevenlabs"), { provider: "elevenlabs", apiKey: "eleven-secret", voiceId: "old-voice" });
  saveVoiceSettings(readVoiceSettings("elevenlabs"));
  assert.equal(readVoiceSettings().apiKey, "eleven-secret");
  assert.equal(readVoiceSettings("kokoro").apiKey, "deep-secret");
  storage.set("gloss:voice-settings:v3", "broken");
  assert.equal(readVoiceSettings().provider, "speko");
});

test("choosing Speko starts on its narrator and stays chosen", t => {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } });
  t.after(() => Reflect.deleteProperty(globalThis, "localStorage"));
  assert.deepEqual(readVoiceSettings("speko"), { provider: "speko", apiKey: "", voiceId: SPEKO_VOICE });
  saveVoiceSettings(readVoiceSettings("speko"));
  assert.equal(readVoiceSettings().provider, "speko");
});

test("a voice chosen before the Speko narrator moves to Orpheus once, keeping saved keys", t => {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } });
  t.after(() => Reflect.deleteProperty(globalThis, "localStorage"));
  storage.set("gloss:voice-settings:v2", JSON.stringify({ provider: "kokoro", profiles: { kokoro: { apiKey: "deep-secret", voiceId: "bf_emma" }, speko: { apiKey: "", voiceId: "george" } } }));
  assert.deepEqual(readVoiceSettings(), { provider: "speko", apiKey: "", voiceId: "orpheus" });
  assert.deepEqual(readVoiceSettings("kokoro"), { provider: "kokoro", apiKey: "deep-secret", voiceId: "bf_emma" });
  saveVoiceSettings(readVoiceSettings("kokoro"));
  assert.equal(readVoiceSettings().provider, "kokoro");
});
