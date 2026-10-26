import { join } from "node:path";
import { APP_UA } from "@/lib/together";
import { TTS_MAX_CHARS, TTS_MODEL, TTS_URL, TTS_VOICE, KOKORO_MODEL, KOKORO_URL, KOKORO_VOICE, KOKORO_VOICES } from "@/lib/voice";
import { wordsWithTiming, kokoroWordsWithTiming } from "@/lib/speech";
import { cachedSpeech, speechCacheKey, type SpeechClip } from "@/lib/speech-cache";

export const runtime = "nodejs";
export const maxDuration = 60;
const headers = { "Cache-Control": "no-store" };
const error = (message: string, status: number, code?: string) => Response.json({ error: message, code }, { status, headers });
class VoiceError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string) { super(message); }
}
/** Presence only. Credentials never leave the local server in a response. */
export function GET() {
  return Response.json({ deepinfraConfigured: Boolean(process.env.DEEPINFRA_API_KEY), elevenlabsConfigured: Boolean(process.env.ELEVENLABS_API_KEY), voiceId: process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM" }, { headers });
}

export async function POST(req: Request) {
  const origin = req.headers.get("Origin");
  const host = req.headers.get("host") || new URL(req.url).host;
  if (origin) {
    try {
      const source = new URL(origin);
      if (!/^https?:$/.test(source.protocol) || source.host !== host) return error("Cross-origin voice requests are not allowed.", 403);
    } catch { return error("Invalid request origin.", 403); }
  }
  let body: { text?: unknown; apiKey?: unknown; provider?: unknown; voiceId?: unknown };
  try { body = await req.json(); } catch { return error("Body must be JSON.", 400); }
  if (!body || typeof body.text !== "string") return error("Text must be a string.", 400);
  const text = body.text.trim();
  if (!text) return error("Nothing to read.", 400);
  if (text.length > TTS_MAX_CHARS) return error("That passage is too long to read in one go.", 413);
  const provider = body.provider ?? "kokoro";
  if (provider !== "kokoro" && provider !== "elevenlabs" && provider !== "together") return error("Unknown voice provider.", 400);
  const eleven = provider === "elevenlabs", kokoro = provider === "kokoro";
  const label = kokoro ? "DeepInfra" : eleven ? "ElevenLabs" : "Together";
  const ownKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  const apiKey = ownKey || (kokoro ? process.env.DEEPINFRA_API_KEY : eleven ? process.env.ELEVENLABS_API_KEY : req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim());
  if (!apiKey) return error(`Connect ${label} in Voice settings.`, 401, "need_key");
  const defaultVoice = kokoro ? KOKORO_VOICE : eleven ? process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM" : TTS_VOICE;
  const voice = provider === "together" ? TTS_VOICE : typeof body.voiceId === "string" && body.voiceId.trim() ? body.voiceId.trim() : defaultVoice;
  if (!/^[a-zA-Z0-9_-]{1,100}$/.test(voice) || (kokoro && !KOKORO_VOICES.some(v => v.id === voice))) return error("Choose a supported voice in Voice settings.", 400);
  if (kokoro && /\p{Script=Cyrillic}/u.test(text)) return error("Kokoro supports English, not Russian. Choose ElevenLabs for this passage.", 400, "unsupported_language");
  const model = kokoro ? KOKORO_MODEL : eleven ? "eleven_multilingual_v2" : TTS_MODEL;
  const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);
  const cacheEnabled = local && process.env.GLOSS_AUDIO_CACHE !== "off";

  const generate = async (): Promise<SpeechClip> => {
    let res: Response;
    try {
      res = await fetch(kokoro ? KOKORO_URL : eleven ? `https://api.elevenlabs.io/v1/text-to-speech/${voice}/with-timestamps?output_format=mp3_44100_128` : TTS_URL, {
        method: "POST",
        // Once billed, finish saving the audio even if the reader closes or stops.
        signal: cacheEnabled ? AbortSignal.timeout(55000) : AbortSignal.any([req.signal, AbortSignal.timeout(55000)]),
        headers: eleven ? { "Content-Type": "application/json", "xi-api-key": apiKey } : { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, "User-Agent": APP_UA },
        body: JSON.stringify(kokoro ? { text, preset_voice: [voice], output_format: "mp3", speed: 1, stream: false, return_timestamps: true, service_tier: "default" } : eleven ? { text, model_id: model } : { model, voice, input: text, response_format: "mp3" }),
      });
    } catch { throw new VoiceError("Could not generate audio. Please try again.", 502); }
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) throw new VoiceError(`${label} rejected the key or voice access. Check Voice settings.`, 401, "need_key");
      if (res.status === 402) {
        if (eleven) {
          const data = await res.json().catch(() => null) as { detail?: { code?: string } } | null;
          if (data?.detail?.code === "paid_plan_required") throw new VoiceError("This library voice requires a paid ElevenLabs plan. Choose your own Voice Design voice in Voice settings, or check your ElevenLabs plan.", 402, "voice_plan_required");
        }
        throw new VoiceError(`${label}: insufficient credits. Check your account balance.`, 402, "billing_required");
      }
      if (res.status === 429) throw new VoiceError(`${label}: request or credit limit reached. Try again later.`, 429);
      throw new VoiceError(`${label} could not read this passage (${res.status}).`, 502);
    }
    if (provider === "together") {
      const bytes = Buffer.from(await res.arrayBuffer());
      if (!bytes.length) throw new VoiceError("The voice returned no audio.", 502);
      return { audio: bytes.toString("base64"), words: [], mimeType: "audio/mpeg" };
    }
    try {
      const data = await res.json();
      if (kokoro && data.inference_status?.status && data.inference_status.status !== "succeeded") throw new Error("Incomplete generation");
      const raw = kokoro ? data.audio : data.audio_base64;
      if (typeof raw !== "string") throw new Error("Missing audio");
      const audio = raw.replace(/^data:audio\/[\w.+-]+;base64,/, "");
      if (!audio || audio.length > 30_000_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(audio) || !Buffer.from(audio, "base64").length) throw new Error("Invalid audio");
      return { audio, words: kokoro ? kokoroWordsWithTiming(text, data.words) : wordsWithTiming(text, data.alignment), mimeType: "audio/mpeg" };
    } catch { throw new VoiceError(`${label} returned incomplete audio. Please try again.`, 502); }
  };
  try {
    if (!cacheEnabled) return Response.json({ ...await generate(), cache: "disabled" }, { headers });
    const result = await cachedSpeech(process.env.GLOSS_AUDIO_CACHE_DIR || join(process.cwd(), ".data", "audio"), speechCacheKey({ provider, model, voice, text, credential: apiKey }), generate);
    return Response.json({ ...result.clip, cache: result.cache }, { headers });
  } catch (e) {
    if (e instanceof VoiceError) return error(e.message, e.status, e.code);
    return error("Cannot access saved audio. Check permissions for .data/audio. New generation has been stopped to avoid repeat charges.", 503, "cache_unavailable");
  }
}
