import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const priorCache = process.env.GLOSS_AUDIO_CACHE;
before(() => { process.env.GLOSS_AUDIO_CACHE = "off"; });
after(() => { if (priorCache === undefined) delete process.env.GLOSS_AUDIO_CACHE; else process.env.GLOSS_AUDIO_CACHE = priorCache; });
import { POST, GET } from "../app/api/speak/route";

const req = (body: unknown) => new Request("http://localhost/api/speak", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
test("voice route validates input before making provider calls", async () => {
  for (const body of [null, { text: 42 }, { text: "" }, { text: "hi", provider: "unknown" }]) assert.equal((await POST(req(body))).status, 400);
  assert.equal((await POST(req({ text: "x".repeat(1201) }))).status, 413);
});
test("ElevenLabs gets only its own key and returns source-aligned timestamps", async t => {
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    assert.match(url, /^https:\/\/api.elevenlabs.io\/v1\/text-to-speech\/myvoice\/with-timestamps/);
    assert.equal((options.headers as Record<string, string>)["xi-api-key"], "fixture-key");
    assert.equal((options.headers as Record<string, string>).Authorization, undefined);
    assert.deepEqual(JSON.parse(options.body as string), { text: "Hi", model_id: "eleven_multilingual_v2" });
    return Response.json({ audio_base64: "YWJj", alignment: { characters: ["H", "i"], character_start_times_seconds: [0, 0.1], character_end_times_seconds: [0.1, 0.2] } });
  });
  const response = await POST(req({ provider: "elevenlabs", apiKey: "fixture-key", voiceId: "myvoice", text: "Hi" }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.deepEqual(await response.json(), { audio: "YWJj", words: [{ start: 0, end: 2, from: 0, to: 0.2 }], mimeType: "audio/mpeg", cache: "disabled" });
});
test("provider rejection is actionable and never echoes secret-bearing provider errors", async t => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ error: "fixture-key" }, { status: 401 }));
  const response = await POST(req({ provider: "elevenlabs", apiKey: "fixture-key", text: "Hi" }));
  assert.equal(response.status, 401);
  const data = await response.json();
  assert.equal(data.code, "need_key");
  assert.ok(!data.error.includes("fixture-key"));
});
test("Together audio keeps its own credential and never receives the ElevenLabs header", async t => {
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    assert.equal(url, "https://api.together.xyz/v1/audio/speech");
    assert.equal((options.headers as Record<string, string>).Authorization, "Bearer together-fixture");
    assert.equal((options.headers as Record<string, string>)["xi-api-key"], undefined);
    return new Response("audio");
  });
  const response = await POST(req({ provider: "together", apiKey: "together-fixture", text: "Hi" }));
  const data = await response.json();
  assert.equal(data.mimeType, "audio/mpeg");
  assert.equal(Buffer.from(data.audio, "base64").toString(), "audio");
});
test("voice configuration exposes presence, not credentials", async () => {
  const config = await GET().json();
  assert.deepEqual(Object.keys(config).sort(), ["deepinfraConfigured", "elevenlabsConfigured", "voiceId"]);
});


test("another website cannot use the local server voice key", async () => {
  const request = new Request("http://localhost/api/speak", { method: "POST", headers: { Origin: "https://unrelated.example", "Content-Type": "text/plain" }, body: JSON.stringify({ text: "Hi", provider: "elevenlabs" }) });
  assert.equal((await POST(request)).status, 403);
});

test("a library voice plan restriction remains actionable instead of becoming a server error", async t => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ detail: { code: "paid_plan_required", message: "private provider details" } }, { status: 402 }));
  const response = await POST(req({ provider: "elevenlabs", apiKey: "fixture-key", text: "Hi" }));
  assert.equal(response.status, 402);
  const data = await response.json();
  assert.equal(data.code, "voice_plan_required");
  assert.match(data.error, /Voice Design/);
  assert.ok(!data.error.includes("private provider details"));
});

test("local browser origins are checked against the incoming Host when Next rewrites the request URL", async t => {
  t.mock.method(globalThis, "fetch", async () => new Response("audio"));
  const request = new Request("http://localhost:3100/api/speak", { method: "POST", headers: { Host: "127.0.0.1:3100", Origin: "http://127.0.0.1:3100", "Content-Type": "application/json" }, body: JSON.stringify({ text: "Hi", provider: "together", apiKey: "fixture-key" }) });
  assert.equal((await POST(request)).status, 200);
});


test("Kokoro uses standard pricing, its own credential and source-aligned word timestamps", async t => {
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    assert.equal(url, "https://api.deepinfra.com/v1/inference/hexgrad/Kokoro-82M");
    assert.equal((options.headers as Record<string, string>).Authorization, "Bearer deepinfra-test");
    assert.equal((options.headers as Record<string, string>)["xi-api-key"], undefined);
    assert.deepEqual(JSON.parse(options.body as string), { text: "Hello, world!", preset_voice: ["af_heart"], output_format: "mp3", speed: 1, stream: false, return_timestamps: true, service_tier: "default" });
    return Response.json({ audio: "data:audio/mpeg;base64,YWJj", words: [{ text: "Hello", start: 0, end: 0.4 }, { text: "world", start: 0.5, end: 0.9 }] });
  });
  const response = await POST(req({ provider: "kokoro", apiKey: "deepinfra-test", text: "Hello, world!" }));
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.audio, "YWJj");
  assert.deepEqual(data.words, [{ start: 0, end: 5, from: 0, to: 0.4 }, { start: 7, end: 12, from: 0.5, to: 0.9 }]);
});

test("Kokoro never falls back to ElevenLabs for missing keys, unsupported language or billing errors", async t => {
  const old = process.env.DEEPINFRA_API_KEY;
  delete process.env.DEEPINFRA_API_KEY;
  t.after(() => { if (old === undefined) delete process.env.DEEPINFRA_API_KEY; else process.env.DEEPINFRA_API_KEY = old; });
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; return Response.json({ error: "secret" }, { status: 402 }); });
  assert.equal((await POST(req({ text: "Hi" }))).status, 401);
  assert.equal((await POST(req({ text: "Привет", provider: "kokoro", apiKey: "test" }))).status, 400);
  assert.equal((await POST(req({ text: "Hi", provider: "kokoro", voiceId: "wrong", apiKey: "test" }))).status, 400);
  assert.equal(calls, 0);
  const res = await POST(req({ text: "Hi", provider: "kokoro", apiKey: "test" }));
  assert.equal(res.status, 402);
  assert.equal((await res.json()).code, "billing_required");
  assert.equal(calls, 1);
});

test("a replay and concurrent duplicate produce only one provider request; voice changes generate separately", async t => {
  const dir = await mkdtemp(join(tmpdir(), "gloss-route-"));
  const oldDir = process.env.GLOSS_AUDIO_CACHE_DIR;
  process.env.GLOSS_AUDIO_CACHE_DIR = dir;
  delete process.env.GLOSS_AUDIO_CACHE;
  t.after(async () => { process.env.GLOSS_AUDIO_CACHE = "off"; if (oldDir === undefined) delete process.env.GLOSS_AUDIO_CACHE_DIR; else process.env.GLOSS_AUDIO_CACHE_DIR = oldDir; await rm(dir, { recursive: true, force: true }); });
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; return Response.json({ audio: "YWJj", words: [] }); });
  const body = { text: "A passage.", provider: "kokoro", apiKey: "test" };
  const responses = await Promise.all([POST(req(body)), POST(req(body))]);
  assert.ok(responses.every(r => r.status === 200));
  assert.equal(calls, 1);
  assert.equal((await (await POST(req(body))).json()).cache, "hit");
  assert.equal(calls, 1);
  await POST(req({ ...body, voiceId: "bf_emma" }));
  assert.equal(calls, 2);
});

test("malformed provider audio is not accepted as a successful clip", async t => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ audio: "https://external.example/audio.mp3", words: [] }));
  assert.equal((await POST(req({ provider: "kokoro", apiKey: "test", text: "Hi" }))).status, 502);
});

test("stopping the reader does not cancel already-paid audio before it is saved", async t => {
  const dir = await mkdtemp(join(tmpdir(), "gloss-abort-"));
  const oldDir = process.env.GLOSS_AUDIO_CACHE_DIR;
  process.env.GLOSS_AUDIO_CACHE_DIR = dir;
  delete process.env.GLOSS_AUDIO_CACHE;
  t.after(async () => { process.env.GLOSS_AUDIO_CACHE = "off"; if (oldDir === undefined) delete process.env.GLOSS_AUDIO_CACHE_DIR; else process.env.GLOSS_AUDIO_CACHE_DIR = oldDir; await rm(dir, { recursive: true, force: true }); });
  const controller = new AbortController();
  let release!: () => void;
  let started!: () => void;
  const didStart = new Promise<void>(r => { started = r; });
  const wait = new Promise<void>(r => { release = r; });
  let providerSignal: AbortSignal | null | undefined;
  t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
    providerSignal = init?.signal;
    started(); await wait;
    return Response.json({ audio: "YWJj", words: [] });
  });
  const body = { provider: "kokoro", apiKey: "abort-test", text: "Keep this paid audio." };
  const running = POST(new Request("http://localhost/api/speak", { method: "POST", signal: controller.signal, body: JSON.stringify(body) }));
  await didStart; controller.abort();
  assert.equal(providerSignal?.aborted, false);
  release();
  assert.equal((await (await running).json()).cache, "saved");
  assert.equal((await (await POST(req(body))).json()).cache, "hit");
});
