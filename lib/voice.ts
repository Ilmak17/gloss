/**
 * Read aloud: Cartesia on Together. Sonic 3 is the newest Cartesia model
 * served serverless (Sonic 3.5 is listed, but only on dedicated endpoints;
 * checked 2026-10-09). Swap the id here when that changes.
 */
export const TTS_URL = "https://api.together.xyz/v1/audio/speech";
export const TTS_MODEL = "cartesia/sonic-3";
/** "Marian - Poised Narrator": even and unhurried, made for long reading. */
export const TTS_VOICE = "26403c37-80c1-4a1a-8692-540551ca2ae5";
/** One request's worth of text. Paragraphs past this are split at sentence ends. */
export const TTS_MAX_CHARS = 1200;
/** Text read per request: short enough that the next is ready before this one ends. */
export const PASSAGE_CHARS = 600;
/** The first passage of prose when listening starts: short, so the voice begins within seconds. */
export const OPENING_CHARS = 200;

export const KOKORO_MODEL = "hexgrad/Kokoro-82M";
export const KOKORO_URL = `https://api.deepinfra.com/v1/inference/${KOKORO_MODEL}`;
export const KOKORO_VOICE = "am_michael";
export const KOKORO_VOICES = [
  { id: "af_heart", label: "Heart · American · female" },
  { id: "af_bella", label: "Bella · American · female" },
  { id: "am_michael", label: "Michael · American · male" },
  { id: "bf_emma", label: "Emma · British · female" },
  { id: "bm_george", label: "George · British · male" },
  { id: "bm_daniel", label: "Daniel · British · male" },
] as const;

/**
 * Speko routes one key to many voice vendors. Its speech has no word timings,
 * so the same audio goes through its transcriber (the one model that returns
 * word times) to light up the words as they are read.
 */
export const SPEKO_URL = "https://api.speko.dev/v1";
export const SPEKO_RATE = 24000;
/** Times the spoken words; Speko honours this pin, and it answers in about two seconds. */
export const SPEKO_TRANSCRIBER = "deepgram:nova-3";
/**
 * Narrators chosen for long reading. `voice` and `model` are the vendor's own ids.
 * ElevenLabs reads on Multilingual v2, its model for audiobooks: about three times
 * faster to make than v3, so a passage starts in seconds. The others stay steady and
 * repeatable over long reads in Speko's measurements.
 */
export const SPEKO_VOICES = [
  { id: "george", label: "George · British storyteller · ElevenLabs", provider: "elevenlabs", model: "eleven_multilingual_v2", voice: "JBFqnCBsd6RMkjVDRZzb" },
  { id: "brian", label: "Brian · deep American · ElevenLabs", provider: "elevenlabs", model: "eleven_multilingual_v2", voice: "nPczCjzI2devNBz1zQrb" },
  { id: "orpheus", label: "Orpheus · steady narrator · Deepgram", provider: "deepgram", model: "aura-2", voice: "aura-2-orpheus-en" },
  { id: "archie", label: "Archie · British, steady · Cartesia", provider: "cartesia", model: "sonic-3.5", voice: "ef191366-f52f-447a-a398-ed8c0f2943a1" },
  { id: "marian", label: "Marian · calm female · Cartesia", provider: "cartesia", model: "sonic-3.5", voice: "26403c37-80c1-4a1a-8692-540551ca2ae5" },
  { id: "draco", label: "Draco · British baritone · Deepgram", provider: "deepgram", model: "aura-2", voice: "aura-2-draco-en" },
] as const;
export const SPEKO_VOICE = SPEKO_VOICES[0].id;
