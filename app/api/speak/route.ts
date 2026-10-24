import { APP_UA } from "@/lib/together";
import { TTS_MAX_CHARS, TTS_MODEL, TTS_URL, TTS_VOICE } from "@/lib/voice";
import { wordsWithTiming, type Alignment } from "@/lib/speech";

export const runtime = "nodejs";
export const maxDuration = 60;
const headers = { "Cache-Control": "no-store" };
const error = (message: string, status: number, code?: string) => Response.json({ error: message, code }, { status, headers });

/** Exposes configuration availability, never the server key. */
export function GET() {
  return Response.json({ elevenlabsConfigured: Boolean(process.env.ELEVENLABS_API_KEY), voiceId: process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM" }, { headers });
}

export async function POST(req: Request) {
  const origin = req.headers.get("Origin");
  if (origin && origin !== new URL(req.url).origin) return error("Cross-origin voice requests are not allowed.", 403);
  let body: { text?: unknown; apiKey?: unknown; provider?: unknown; voiceId?: unknown };
  try { body = await req.json(); } catch { return error("Body must be JSON.", 400); }
  if (!body || typeof body.text !== "string") return error("Text must be a string.", 400);
  const text = body.text.trim();
  if (!text) return error("Nothing to read.", 400);
  if (text.length > TTS_MAX_CHARS) return error("That passage is too long to read in one go.", 413);
  if (body.provider !== undefined && body.provider !== "elevenlabs" && body.provider !== "together") return error("Unknown voice provider.", 400);
  const eleven = body.provider === "elevenlabs";
  const ownKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
  const apiKey = ownKey || (eleven ? process.env.ELEVENLABS_API_KEY : req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim());
  if (!apiKey) return error(`Add your ${eleven ? "ElevenLabs" : "Together"} API key in Voice settings.`, 401, "need_key");
  const voice = typeof body.voiceId === "string" && body.voiceId.trim() ? body.voiceId.trim() : process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";
  if (eleven && !/^[a-zA-Z0-9_-]{1,100}$/.test(voice)) return error("Invalid ElevenLabs voice ID.", 400);
  let res: Response;
  try {
    res = await fetch(eleven ? `https://api.elevenlabs.io/v1/text-to-speech/${voice}/with-timestamps?output_format=mp3_44100_128` : TTS_URL, {
      method: "POST",
      signal: AbortSignal.any([req.signal, AbortSignal.timeout(55000)]),
      headers: eleven ? { "Content-Type": "application/json", "xi-api-key": apiKey } : { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}`, "User-Agent": APP_UA },
      body: JSON.stringify(eleven ? { text, model_id: "eleven_multilingual_v2" } : { model: TTS_MODEL, voice: TTS_VOICE, input: text, response_format: "mp3" }),
    });
  } catch { return error("Could not reach the voice. Please try again.", 502); }
  if (!res.ok) {
    // Provider responses may echo request details; return only our own safe messages.
    const provider = eleven ? "ElevenLabs" : "Together";
    if (res.status === 401 || res.status === 403) return error(`${provider} rejected the key or access to this voice. Check Voice settings.`, 401, "need_key");
    if (res.status === 429) return error(`${provider} rate or credit limit reached. Try later or check your account.`, 429);
    return error(`${provider} could not generate this passage (${res.status}). Check the voice ID and try again.`, 502);
  }
  if (!eleven) return new Response(res.body, { headers: { ...headers, "Content-Type": "audio/mpeg" } });
  try {
    const data = await res.json() as { audio_base64?: string; alignment?: Alignment };
    if (!data.audio_base64 || typeof data.audio_base64 !== "string") return error("ElevenLabs returned no audio.", 502);
    return Response.json({ audio: data.audio_base64, words: wordsWithTiming(text, data.alignment) }, { headers });
  } catch { return error("ElevenLabs returned an unreadable response.", 502); }
}
