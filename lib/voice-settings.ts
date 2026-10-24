export type VoiceSettings = { provider: "elevenlabs" | "together"; apiKey: string; voiceId: string };
const KEY = "gloss:voice-settings";
export const VOICE_SETTINGS_EVENT = "gloss:voice-settings";
export function readVoiceSettings(): VoiceSettings {
  const defaults: VoiceSettings = { provider: "elevenlabs", apiKey: "", voiceId: "" };
  try {
    const value = JSON.parse(localStorage.getItem(KEY) || "{}");
    return { provider: value.provider === "together" ? "together" : "elevenlabs", apiKey: typeof value.apiKey === "string" ? value.apiKey : "", voiceId: typeof value.voiceId === "string" ? value.voiceId : "" };
  } catch { return defaults; }
}
export function saveVoiceSettings(value: VoiceSettings) { localStorage.setItem(KEY, JSON.stringify(value)); }
export function openVoiceSettings() { window.dispatchEvent(new Event(VOICE_SETTINGS_EVENT)); }
