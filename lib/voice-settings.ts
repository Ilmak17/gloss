import { KOKORO_VOICE } from "./voice";
export type VoiceProvider = "kokoro" | "elevenlabs" | "together";
export type VoiceSettings = { provider: VoiceProvider; apiKey: string; voiceId: string };
type Profile = Pick<VoiceSettings, "apiKey" | "voiceId">;
type Saved = { provider: VoiceProvider; profiles: Partial<Record<VoiceProvider, Profile>> };
const KEY = "gloss:voice-settings:v2";
const LEGACY_KEY = "gloss:voice-settings";
export const VOICE_SETTINGS_EVENT = "gloss:voice-settings";
const isProvider = (v: unknown): v is VoiceProvider => v === "kokoro" || v === "elevenlabs" || v === "together";
const profile = (v: Partial<Profile> | null | undefined): Profile => ({ apiKey: typeof v?.apiKey === "string" ? v.apiKey : "", voiceId: typeof v?.voiceId === "string" ? v.voiceId : "" });
function saved(): Saved {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) || "null");
    if (v && isProvider(v.provider) && v.profiles) return { provider: v.provider, profiles: v.profiles };
    const old = JSON.parse(localStorage.getItem(LEGACY_KEY) || "null");
    // Start with Kokoro while keeping legacy credentials scoped to their provider.
    return { provider: "kokoro", profiles: old && isProvider(old.provider) ? { [old.provider]: profile(old) } : {} };
  } catch { return { provider: "kokoro", profiles: {} }; }
}
export function readVoiceSettings(provider?: VoiceProvider): VoiceSettings {
  const value = saved();
  provider ??= value.provider;
  const p = profile(value.profiles[provider]);
  return { provider, ...p, voiceId: p.voiceId || (provider === "kokoro" ? KOKORO_VOICE : "") };
}
export function saveVoiceSettings(value: VoiceSettings) {
  const current = saved();
  localStorage.setItem(KEY, JSON.stringify({ provider: value.provider, profiles: { ...current.profiles, [value.provider]: profile(value) } }));
}
export function openVoiceSettings() { window.dispatchEvent(new Event(VOICE_SETTINGS_EVENT)); }
