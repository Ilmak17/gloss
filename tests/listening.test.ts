import assert from "node:assert/strict";
import { test } from "node:test";
import { indexArticle } from "../lib/doc";
import { listeningSessionId, pauseListening, resumeAfterStudy, resumeListening, seekListening, startPageListening, startListening, stopListening, useListen } from "../lib/listening";

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

  await t.test("chapter playback starts with prose and skips headings between passages", async () => {
    const requested: string[] = [];
    t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
      requested.push(JSON.parse(init?.body as string).text);
      return new Response("test audio");
    });
    const book = indexArticle({ id: "heading-test", title: "Book", blocks: [
      { id: "heading", type: "h2", runs: [{ text: "Chapter one" }] },
      { id: "prose", type: "p", runs: [{ text: "The actual book text." }] },
      { id: "subheading", type: "h3", runs: [{ text: "A heading" }] },
      { id: "next", type: "p", runs: [{ text: "More book text." }] },
    ] });
    startListening(book, "heading"); await settle();
    assert.equal(requested[0], "The actual book text.");
    (a as unknown as { onended: () => void }).onended(); await settle();
    assert.equal(requested[1], "More book text.");
    stopListening();
  });

  await t.test("next passage is ready before the current one ends, but never more than one ahead", async () => {
    const requested: string[] = [];
    t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
      requested.push(JSON.parse(init?.body as string).text);
      return new Response("test audio");
    });
    const book = indexArticle({ id: "prefetch-test", title: "Book", blocks: ["One.", "Two.", "Three."].map((text, i) => ({ id: `p${i}`, type: "p" as const, runs: [{ text }] })) });
    startListening(book, "p0"); await settle();
    a.currentTime = 1;
    (a as unknown as { ontimeupdate: () => void }).ontimeupdate(); await settle();
    assert.deepEqual(requested, ["One.", "Two."]);
    (a as unknown as { ontimeupdate: () => void }).ontimeupdate(); await settle();
    assert.deepEqual(requested, ["One.", "Two."]);
    (a as unknown as { onended: () => void }).onended(); await settle();
    assert.equal(useListen.getState().block, "p1");
    assert.equal(useListen.getState().status, "playing");
    assert.deepEqual(requested, ["One.", "Two."], "transition reuses the prepared audio, without another network request");
    pauseListening();
    a.currentTime = 2;
    (a as unknown as { ontimeupdate: () => void }).ontimeupdate(); await settle();
    assert.equal(requested.length, 2);
    stopListening();
  });

  await t.test("page playback combines paragraphs, seeks across them, and stops before the next page", async () => {
    const requested: string[] = [];
    t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
      requested.push(JSON.parse(init?.body as string).text);
      return Response.json({ audio: btoa("audio"), words: [
        { start: 0, end: 5, from: 0, to: 1 },
        { start: 8, end: 14, from: 2, to: 3 },
      ], cache: "hit" });
    });
    const book = indexArticle({ id: "page-test", title: "Book", blocks: [
      { id: "heading", type: "h2", runs: [{ text: "Chapter one" }] },
      { id: "first", type: "p", runs: [{ text: "First." }] },
      { id: "second", type: "p", runs: [{ text: "Second. Not on this page." }] },
      { id: "next", type: "p", runs: [{ text: "Next page." }] },
    ] });
    startPageListening(book, { start: { b: "heading", o: 0 }, end: { b: "second", o: 7 } }); await settle();
    assert.deepEqual(requested, ["First.\n\nSecond."]);
    assert.equal(useListen.getState().scope, "page");
    seekListening(2.2);
    assert.equal(useListen.getState().block, "second");
    assert.equal(useListen.getState().offset, 0);
    seekListening(.5);
    assert.equal(useListen.getState().block, "first");
    (a as unknown as { onended: () => void }).onended(); await settle();
    assert.equal(useListen.getState().status, "idle");
    assert.equal(requested.length, 1);
  });

  await t.test("page preparation is bounded to two requests and cancel stops the remaining queue", async () => {
    const pending: ((r: Response) => void)[] = [];
    t.mock.method(globalThis, "fetch", () => new Promise<Response>(resolve => pending.push(resolve)));
    const text = "A sentence on this page. ".repeat(160);
    const book = indexArticle({ id: "long-page", title: "Book", blocks: [{ id: "p", type: "p", runs: [{ text }] }] });
    startPageListening(book, { start: { b: "p", o: 0 }, end: { b: "p", o: text.length } });
    assert.equal(pending.length, 2);
    assert.equal(useListen.getState().status, "loading");
    stopListening();
    for (const resolve of pending) resolve(new Response("late audio"));
    await settle();
    assert.equal(pending.length, 2);
    assert.equal(useListen.getState().status, "idle");
    assert.equal(a.src, "");
  });

  await t.test("an image-only page does not fall through into another page", async () => {
    let calls = 0;
    t.mock.method(globalThis, "fetch", async () => { calls++; return new Response("audio"); });
    startPageListening(ix, { start: { b: "p1", o: 0 }, end: { b: "p1", o: 0 } }); await settle();
    assert.equal(calls, 0);
    assert.equal(useListen.getState().status, "error");
    assert.match(useListen.getState().error!, /no text/);
    stopListening();
  });

  await t.test("cancel during preparation cannot start late audio", async () => {
    let resolve!: (value: Response) => void;
    t.mock.method(globalThis, "fetch", () => new Promise<Response>(r => { resolve = r; }));
    startListening(ix, "p1");
    assert.equal(useListen.getState().status, "loading");
    stopListening();
    const calls = a.playCalls;
    resolve(new Response("late audio")); await settle();
    assert.equal(useListen.getState().status, "idle");
    assert.equal(a.playCalls, calls);
    assert.equal(a.src, "");
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
