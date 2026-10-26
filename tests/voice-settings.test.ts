import assert from "node:assert/strict";
import { test } from "node:test";
import { readVoiceSettings, saveVoiceSettings } from "../lib/voice-settings";
test("Kokoro is default and migrating/switching never sends another provider's credentials", t => {
  const storage = new Map<string, string>();
  Object.defineProperty(globalThis, "localStorage", { configurable: true, value: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value) } });
  t.after(() => Reflect.deleteProperty(globalThis, "localStorage"));
  storage.set("gloss:voice-settings", JSON.stringify({ provider: "elevenlabs", apiKey: "eleven-secret", voiceId: "old-voice" }));
  assert.deepEqual(readVoiceSettings(), { provider: "kokoro", apiKey: "", voiceId: "af_heart" });
  saveVoiceSettings({ provider: "kokoro", apiKey: "deep-secret", voiceId: "bf_emma" });
  assert.equal(readVoiceSettings().apiKey, "deep-secret");
  assert.deepEqual(readVoiceSettings("elevenlabs"), { provider: "elevenlabs", apiKey: "eleven-secret", voiceId: "old-voice" });
  saveVoiceSettings(readVoiceSettings("elevenlabs"));
  assert.equal(readVoiceSettings().apiKey, "eleven-secret");
  assert.equal(readVoiceSettings("kokoro").apiKey, "deep-secret");
  storage.set("gloss:voice-settings:v2", "broken");
  assert.equal(readVoiceSettings().provider, "kokoro");
});
