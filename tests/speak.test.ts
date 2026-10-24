import assert from "node:assert/strict";
import { test } from "node:test";
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
  assert.deepEqual(await response.json(), { audio: "YWJj", words: [{ start: 0, end: 2, from: 0, to: 0.2 }] });
});
test("provider rejection is actionable and never echoes secret-bearing provider errors", async t => {
  t.mock.method(globalThis, "fetch", async () => Response.json({ error: "fixture-key" }, { status: 401 }));
  const response = await POST(req({ provider: "elevenlabs", apiKey: "fixture-key", text: "Hi" }));
  assert.equal(response.status, 401);
  const data = await response.json();
  assert.equal(data.code, "need_key");
  assert.ok(!data.error.includes("fixture-key"));
});
test("Together still streams audio without receiving the ElevenLabs header", async t => {
  t.mock.method(globalThis, "fetch", async (url: string, options: RequestInit) => {
    assert.equal(url, "https://api.together.xyz/v1/audio/speech");
    assert.equal((options.headers as Record<string, string>).Authorization, "Bearer together-fixture");
    assert.equal((options.headers as Record<string, string>)["xi-api-key"], undefined);
    return new Response("audio");
  });
  const response = await POST(req({ provider: "together", apiKey: "together-fixture", text: "Hi" }));
  assert.equal(response.headers.get("content-type"), "audio/mpeg");
  assert.equal(await response.text(), "audio");
});
test("voice configuration exposes presence, not credentials", async () => {
  const config = await GET().json();
  assert.deepEqual(Object.keys(config).sort(), ["elevenlabsConfigured", "voiceId"]);
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
