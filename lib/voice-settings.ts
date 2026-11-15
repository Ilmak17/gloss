import { KOKORO_VOICE, SPEKO_VOICE } from "./voice";
export type VoiceProvider = "kokoro" | "elevenlabs" | "together" | "speko";
export type VoiceSettings = { provider: VoiceProvider; apiKey: string; voiceId: string };
type Profile = Pick<VoiceSettings, "apiKey" | "voiceId">;
type Saved = { provider: VoiceProvider; profiles: Partial<Record<VoiceProvider, Profile>> };
const KEY = "gloss:voice-settings:v3";
/** Saved before Speko's narrator became the default; read once, then moved to it. */
const V2_KEY = "gloss:voice-settings:v2";
const LEGACY_KEY = "gloss:voice-settings";
export const VOICE_SETTINGS_EVENT = "gloss:voice-settings";
const isProvider = (v: unknown): v is VoiceProvider => v === "kokoro" || v === "elevenlabs" || v === "together" || v === "speko";
const profile = (v: Partial<Profile> | null | undefined): Profile => ({ apiKey: typeof v?.apiKey === "string" ? v.apiKey : "", voiceId: typeof v?.voiceId === "string" ? v.voiceId : "" });
function saved(): Saved {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null");
    if (v && isProvider(v.provider) && v.profiles) return { provider: v.provider, profiles: v.profiles };
    // Earlier choices start on Speko's book narrator; their saved keys stay with their provider.
    const v2 = JSON.parse(localStorage.getItem(V2_KEY) || "null");
    if (v2 && isProvider(v2.provider) && v2.profiles) { const { speko: _, ...profiles } = v2.profiles; return { provider: "speko", profiles }; }
    const old = JSON.parse(localStorage.getItem(LEGACY_KEY) || "null");
    return { provider: "speko", profiles: old && isProvider(old.provider) ? { [old.provider]: profile(old) } : {} };
  } catch { return { provider: "speko", profiles: {} }; }
}
export function readVoiceSettings(provider?: VoiceProvider): VoiceSettings {
  const value = saved();
  provider ??= value.provider;
  const p = profile(value.profiles[provider]);
  return { provider, ...p, voiceId: p.voiceId || (provider === "kokoro" ? KOKORO_VOICE : provider === "speko" ? SPEKO_VOICE : "") };
}
export function saveVoiceSettings(value: VoiceSettings) {
  const current = saved();
  localStorage.setItem(KEY, JSON.stringify({ provider: value.provider, profiles: { ...current.profiles, [value.provider]: profile(value) } }));
}
export function openVoiceSettings() { window.dispatchEvent(new Event(VOICE_SETTINGS_EVENT)); }
