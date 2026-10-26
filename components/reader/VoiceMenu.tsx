"use client";
import { useEffect, useRef, useState } from "react";
import { AudioLines, Play, Square, LoaderCircle } from "lucide-react";
import { Popover, barBtn } from "@/components/ui/Popover";
import { readVoiceSettings, saveVoiceSettings, VOICE_SETTINGS_EVENT, type VoiceSettings, type VoiceProvider } from "@/lib/voice-settings";
import { KOKORO_VOICES } from "@/lib/voice";
import { stopListening } from "./Listen";

function VoiceForm({ close }: { close: () => void }) {
  const [value, setValue] = useState<VoiceSettings>(() => readVoiceSettings());
  const drafts = useRef<Partial<Record<VoiceProvider, VoiceSettings>>>({});
  const [config, setConfig] = useState({ deepinfraConfigured: false, elevenlabsConfigured: false, voiceId: "" });
  const [error, setError] = useState("");
  const [preview, setPreview] = useState<"idle" | "loading" | "playing">("idle");
  const [saved, setSaved] = useState(false);
  const audio = useRef<HTMLAudioElement | null>(null);
  const url = useRef<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const clearPreview = () => {
    request.current?.abort(); request.current = null;
    audio.current?.pause(); audio.current = null;
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = null;
  };
  useEffect(() => { const ctrl = new AbortController(); fetch("/api/speak", { signal: ctrl.signal }).then(r => r.json()).then(setConfig).catch(() => {}); return () => { ctrl.abort(); clearPreview(); }; }, []);
  const change = (next: VoiceSettings) => { clearPreview(); setPreview("idle"); setError(""); setSaved(false); setValue(next); };
  const sample = async () => {
    clearPreview(); stopListening(); setError(""); setSaved(false); setPreview("loading");
    const ctrl = new AbortController(); request.current = ctrl;
    try {
      const res = await fetch("/api/speak", { method: "POST", headers: { "Content-Type": "application/json" }, signal: ctrl.signal, body: JSON.stringify({ ...value, text: "Understanding begins with a good question. As we read, we connect new ideas to what we already know. A useful explanation helps us see both the possibilities and the limits of an idea." }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not play this voice.");
      if (ctrl.signal.aborted) return;
      url.current = URL.createObjectURL(new Blob([Uint8Array.from(atob(data.audio), c => c.charCodeAt(0))], { type: "audio/mpeg" }));
      const player = new Audio(url.current); audio.current = player;
      player.onended = () => setPreview("idle");
      setSaved(data.cache === "hit" || data.cache === "saved");
      await player.play();
      if (ctrl.signal.aborted) { player.pause(); return; }
      setPreview("playing");
    } catch (e) { if (!ctrl.signal.aborted) { setError(e instanceof Error ? e.message : "Could not play this voice."); setPreview("idle"); } }
  };
  const input = "mt-1 w-full rounded-lg border border-rule bg-bg px-3 py-2 text-sm text-ink";
  const kokoro = value.provider === "kokoro";
  const configured = kokoro ? config.deepinfraConfigured : config.elevenlabsConfigured;
  return <form className="max-h-[calc(100dvh-130px)] overflow-y-auto pr-1" onSubmit={e => { e.preventDefault(); try { saveVoiceSettings(value); stopListening(); close(); } catch { setError("Allow browser storage to save your voice."); } }}>
    <h2 className="font-serif text-xl">Reading voice</h2>
    {kokoro ? <label className="mt-4 block text-sm">Voice
      <select className={input} value={value.voiceId} onChange={e => change({ ...value, voiceId: e.target.value })}>
        {KOKORO_VOICES.map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
      </select>
    </label> : value.provider === "elevenlabs" ? <label className="mt-4 block text-sm">Voice ID<input className={input} value={value.voiceId} placeholder={config.voiceId || "Default voice"} onChange={e => change({ ...value, voiceId: e.target.value })} /></label> : null}
    {value.provider !== "together" && <button type="button" disabled={preview === "loading"} onClick={() => preview === "playing" ? (clearPreview(), setPreview("idle")) : void sample()} className="mt-3 flex w-full items-center justify-center gap-2 rounded-full border border-rule py-2 text-sm disabled:opacity-50">
      {preview === "loading" ? <LoaderCircle size={14} className="animate-spin" /> : preview === "playing" ? <Square size={14} /> : <Play size={14} />}
      {preview === "loading" ? "Preparing preview…" : preview === "playing" ? "Stop preview" : "Preview voice"}
    </button>}
    {saved && <p role="status" className="mt-2 text-center text-xs text-ink-3">Preview saved for replay.</p>}
    <details className="mt-4" open={value.provider !== "together" && !configured && !value.apiKey || undefined}>
      <summary className="cursor-pointer text-xs text-ink-3">Advanced</summary>
      <label className="mt-3 block text-sm">Service<select className={input} value={value.provider} onChange={e => {
        drafts.current[value.provider] = value;
        const provider = e.target.value as VoiceProvider;
        change(drafts.current[provider] || readVoiceSettings(provider));
      }}><option value="kokoro">Kokoro · English</option><option value="elevenlabs">ElevenLabs</option><option value="together">Together</option></select></label>
      {value.provider !== "together" ? <>
        <label className="mt-3 block text-sm">{kokoro ? "DeepInfra" : "ElevenLabs"} API key<input type="password" autoComplete="off" spellCheck={false} className={input} value={value.apiKey} placeholder={configured ? "Connected on this Mac" : "Paste API key"} onChange={e => change({ ...value, apiKey: e.target.value })} /></label>
        <p className="mt-2 text-xs text-ink-3">Keys entered here stay in this browser and are sent only to the selected service through the local server.</p>
        {kokoro && <p className="mt-2 text-xs text-ink-3">Standard tier. About $0.60 per 100,000 English words. <a className="underline" href="https://deepinfra.com/dash/keys" target="_blank" rel="noreferrer">Manage keys ↗</a></p>}
      </> : <p className="mt-3 text-xs text-ink-3">Uses your separate Together key. Paragraph highlighting only.</p>}
      <p className="mt-2 text-xs text-ink-3">Audio is saved on this Mac. Replaying the same passage and voice does not generate it again.</p>
    </details>
    {error && <p role="alert" className="mt-3 text-sm text-ink-2">{error}</p>}
    <button type="submit" className="mt-4 w-full rounded-full bg-ink py-2 text-sm text-bg">Use this voice</button>
  </form>;
}
export function VoiceMenu() {
  return <Popover label="Voice settings" trigger={<AudioLines size={17} />} triggerClass={barBtn} width={340} openOn={VOICE_SETTINGS_EVENT}>{close => <VoiceForm close={close} />}</Popover>;
}
