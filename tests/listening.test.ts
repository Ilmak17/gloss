import assert from "node:assert/strict";
import { test } from "node:test";
import { indexArticle } from "../lib/doc";
import { listeningSessionId, pauseListening, resumeAfterStudy, resumeListening, seekListening, startListening, stopListening, useListen } from "../lib/listening";

test("study interruptions preserve audio and cannot revive an obsolete session", async t => {
  class FakeAudio {
    src = ""; currentTime = 0; duration = 20; playbackRate = 1; paused = true;
    playCalls = 0;
    async play() { this.paused = false; this.playCalls++; }
    pause() { this.paused = true; }
    removeAttribute() { this.src = ""; }
  }
  const a = new FakeAudio();
  Object.defineProperty(globalThis, "cancelAnimationFrame", { configurable: true, value: () => {} });
  Object.defineProperty(globalThis, "Audio", { configurable: true, value: function () { return a; } });
  t.after(() => { stopListening(); Reflect.deleteProperty(globalThis, "Audio"); Reflect.deleteProperty(globalThis, "cancelAnimationFrame"); });
  const ix = indexArticle({ id: "audio-test", title: "Audio test", blocks: [{ id: "p1", type: "p", runs: [{ text: "A small passage." }] }] });
  const settle = () => new Promise(resolve => setImmediate(resolve));
  t.mock.method(globalThis, "fetch", async () => new Response("test audio"));

  await t.test("pause and explicit continuation reuse the same clip and position", async () => {
    startListening(ix, "p1");
    await settle();
    assert.equal(useListen.getState().status, "playing");
    a.currentTime = 9;
    const identity = listeningSessionId();
    const url = a.src;
    pauseListening(true);
    pauseListening(true);
    assert.equal(listeningSessionId(), identity, 'pausing keeps the navigation playback identity');
    assert.equal(useListen.getState().status, "paused");
    assert.equal(useListen.getState().studyPaused, true);
    resumeAfterStudy();
    await settle();
    assert.equal(useListen.getState().status, "playing");
    assert.equal(a.src, url);
    assert.equal(a.currentTime, 9);
    seekListening(100);
    assert.equal(a.currentTime, 20);
    seekListening(-2);
    assert.equal(a.currentTime, 0);
    stopListening();
  });

  await t.test("a pre-existing manual pause is not resumed by leaving study", async () => {
    startListening(ix, "p1"); await settle();
    pauseListening(); pauseListening(true); resumeAfterStudy();
    await settle();
    assert.equal(useListen.getState().status, "paused");
    assert.equal(useListen.getState().studyPaused, false);
    stopListening();
  });

  await t.test("stop and new article invalidate the study continuation", async () => {
    startListening(ix, "p1"); await settle(); pauseListening(true);
    stopListening(); resumeAfterStudy();
    assert.equal(useListen.getState().status, "idle");
    startListening(ix, "p1"); await settle(); pauseListening(); resumeAfterStudy();
    assert.equal(useListen.getState().status, "paused");
    stopListening();
  });

  await t.test("starting and pausing do not pre-generate unread passages", async () => {
    const requested: string[] = [];
    t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
      requested.push(JSON.parse(init?.body as string).text);
      return new Response("test audio");
    });
    const book = indexArticle({ id: "budget-test", title: "Budget", blocks: ["First.", "Second.", "Third."].map((text, i) => ({ id: `p${i}`, type: "p" as const, runs: [{ text }] })) });
    startListening(book, "p0"); await settle(); pauseListening(); await settle();
    assert.deepEqual(requested, ["First."]);
    stopListening();
  });

  await t.test("starting midway seeks within the original cached passage and publishes source offsets", async () => {
    const requested: string[] = [];
    t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
      requested.push(JSON.parse(init?.body as string).text);
      return Response.json({audio:btoa('audio'),words:[{start:0,end:1,from:0,to:1},{start:2,end:7,from:2,to:3},{start:8,end:15,from:4,to:6}]});
    });
    startListening(ix, "p1", 8); await settle();
    (a as unknown as {onloadedmetadata:()=>void}).onloadedmetadata();
    assert.deepEqual(requested,["A small passage."]);
    assert.equal(a.currentTime,4);
    seekListening(2.2);
    assert.equal(useListen.getState().offset,2);
    stopListening();
  });

  await t.test("a non-spoken start never applies its offset to the next paragraph", async () => {
    t.mock.method(globalThis, "fetch", async () => Response.json({audio:btoa('audio'),words:[{start:0,end:3,from:0,to:1},{start:4,end:8,from:2,to:3},{start:9,end:15,from:4,to:6}]}));
    const book=indexArticle({id:'figure-test',title:'Figure test',blocks:[{id:'figure',type:'figure',runs:[{text:'Illustration'}]},{id:'next',type:'p',runs:[{text:'One word after.'}]}]});
    startListening(book,'figure',9); await settle();
    (a as unknown as {onloadedmetadata:()=>void}).onloadedmetadata();
    assert.equal(useListen.getState().block,'next');
    assert.equal(useListen.getState().offset,0);
    assert.equal(a.currentTime,0);
    stopListening();
  });

  await t.test("selection while loading prevents delayed automatic playback", async () => {
    let resolve!: (value: Response) => void;
    t.mock.method(globalThis, "fetch", () => new Promise<Response>(r => { resolve = r; }));
    startListening(ix, "p1"); pauseListening(true);
    resolve(new Response("test audio")); await settle();
    assert.equal(useListen.getState().status, "paused");
    assert.equal(a.paused, true);
    resumeAfterStudy(); await settle();
    assert.equal(useListen.getState().status, "playing");
    // A pause arriving before play() settles must also win.
    pauseListening(); resumeListening(); pauseListening(true); await settle();
    assert.equal(useListen.getState().status, "paused");
    assert.equal(a.paused, true);
  });
});
