"use client";
import { useEffect, useState } from "react";
import { AudioLines } from "lucide-react";
import { Popover, barBtn } from "@/components/ui/Popover";
import { readVoiceSettings, saveVoiceSettings, VOICE_SETTINGS_EVENT, type VoiceSettings } from "@/lib/voice-settings";
import { stopListening } from "./Listen";

function VoiceForm({ close }: { close: () => void }) {
  const [value, setValue] = useState<VoiceSettings>(() => readVoiceSettings());
  const [configured, setConfigured] = useState(false);
  const [defaultVoice, setDefaultVoice] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { const ctrl = new AbortController(); fetch("/api/speak", { signal: ctrl.signal }).then(r => r.json()).then(j => { setConfigured(j.elevenlabsConfigured); setDefaultVoice(j.voiceId); }).catch(() => {}); return () => ctrl.abort(); }, []);
  const input = "mt-1 w-full rounded-lg border border-rule bg-bg px-3 py-2 text-sm text-ink";
  return <form onSubmit={e => { e.preventDefault(); try { saveVoiceSettings(value); stopListening(); close(); } catch { setError("Browser storage is unavailable. Allow local storage to save settings."); } }}>
    <h2 className="font-serif text-xl">Read & listen</h2>
    <p className="mt-2 text-sm text-ink-3">Follow the voice in the text. ElevenLabs adds word highlighting; Together follows paragraphs.</p>
    <label className="mt-4 block text-sm">Voice provider<select className={input} value={value.provider} onChange={e => setValue({ ...value, provider: e.target.value as VoiceSettings["provider"] })}><option value="elevenlabs">ElevenLabs</option><option value="together">Together</option></select></label>
    {value.provider === "elevenlabs" ? <>
      <label className="mt-3 block text-sm">ElevenLabs API key<input type="password" autoComplete="off" spellCheck={false} className={input} value={value.apiKey} placeholder={configured ? "Server key configured (optional override)" : "Paste your ElevenLabs key"} onChange={e => setValue({ ...value, apiKey: e.target.value })} /></label>
      <label className="mt-3 block text-sm">Voice ID<input className={input} value={value.voiceId} placeholder={defaultVoice || "Default voice"} onChange={e => setValue({ ...value, voiceId: e.target.value })} /></label>
      <p className="mt-2 text-xs text-ink-3">Find a voice ID in your ElevenLabs voice library. Russian and English are supported.</p>
      <p className="mt-2 text-xs text-ink-3">The key stays in this browser and is sent through your local server only to ElevenLabs. Generating audio uses your ElevenLabs credits. Leave it empty to use a server key.</p>
    </> : <p className="mt-3 text-sm text-ink-3">Uses the Together key from AI settings. Word timestamps are unavailable with this provider.</p>}
    {error && <p role="alert" className="mt-2 text-sm">{error}</p>}
    <button type="submit" className="mt-4 w-full rounded-full bg-ink py-2 text-sm text-bg">Save voice settings</button>
  </form>;
}
export function VoiceMenu() {
  return <Popover label="Voice settings" trigger={<AudioLines size={17} />} triggerClass={barBtn} width={320} openOn={VOICE_SETTINGS_EVENT}>{close => <VoiceForm close={close} />}</Popover>;
}
