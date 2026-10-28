import assert from "node:assert/strict";
import { test } from "node:test";
import { indexArticle } from "../lib/doc";
import { holdListening, listeningSessionId, nudgeRate, pauseListening, resumeAfterStudy, resumeListening, seekListening, skipSentence, startListening, stopListening, useListen } from "../lib/listening";

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

  await t.test("chapter titles and headings are read aloud in order with the prose", async () => {
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
    for (let i = 0; i < 3; i++) { (a as unknown as { onended: () => void }).onended(); await settle(); }
    assert.deepEqual(requested, ["Chapter one", "The actual book text.", "A heading", "More book text."]);
    stopListening();
  });

  await t.test("the next two passages are prepared once playback is under way, and transitions reuse them", async () => {
    const requested: string[] = [];
    t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
      requested.push(JSON.parse(init?.body as string).text);
      return new Response("test audio");
    });
    const book = indexArticle({ id: "prefetch-test", title: "Book", blocks: ["One.", "Two.", "Three.", "Four."].map((text, i) => ({ id: `p${i}`, type: "p" as const, runs: [{ text }] })) });
    startListening(book, "p0"); await settle();
    a.currentTime = .3;
    (a as unknown as { ontimeupdate: () => void }).ontimeupdate(); await settle();
    assert.deepEqual(requested, ["One.", "Two.", "Three."]);
    (a as unknown as { ontimeupdate: () => void }).ontimeupdate(); await settle();
    assert.deepEqual(requested, ["One.", "Two.", "Three."]);
    (a as unknown as { onended: () => void }).onended(); await settle();
    assert.equal(useListen.getState().block, "p1");
    assert.equal(useListen.getState().status, "playing");
    assert.deepEqual(requested, ["One.", "Two.", "Three."], "transition reuses the prepared audio, without another network request");
    pauseListening();
    a.currentTime = 2;
    (a as unknown as { ontimeupdate: () => void }).ontimeupdate(); await settle();
    assert.equal(requested.length, 3, "a paused voice prepares nothing more");
    stopListening();
  });

  await t.test("back and next move by sentence, across passages, from the word being spoken", async () => {
    const timings: Record<string, { start: number; end: number; from: number; to: number }[]> = {
      "First one. First two.": [{ start: 0, end: 5, from: 0, to: .4 }, { start: 6, end: 10, from: .5, to: .9 }, { start: 11, end: 16, from: 1, to: 1.4 }, { start: 17, end: 21, from: 1.5, to: 1.9 }],
      "Second one. Second two.": [{ start: 0, end: 6, from: 0, to: .4 }, { start: 7, end: 11, from: .5, to: .9 }, { start: 12, end: 18, from: 1, to: 1.4 }, { start: 19, end: 23, from: 1.5, to: 1.9 }],
    };
    t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => Response.json({ audio: btoa("audio"), words: timings[JSON.parse(init?.body as string).text] }));
    const loaded = () => (a as unknown as { onloadedmetadata: () => void }).onloadedmetadata();
    const book = indexArticle({ id: "sentence-test", title: "Book", blocks: [
      { id: "s1", type: "p", runs: [{ text: "First one. First two." }] },
      { id: "s2", type: "p", runs: [{ text: "Second one. Second two." }] },
    ] });
    startListening(book, "s1"); await settle(); loaded();
    a.currentTime = .6;
    skipSentence(1);
    assert.equal(a.currentTime, 1, "next: the second sentence");
    skipSentence(1); await settle(); loaded();
    assert.equal(useListen.getState().block, "s2", "next from the last sentence: the next passage");
    assert.equal(a.currentTime, 0);
    a.currentTime = .2;
    skipSentence(-1); await settle(); loaded();
    assert.equal(useListen.getState().block, "s1", "back from the first sentence: the passage before");
    assert.equal(a.currentTime, 1, "...at its last sentence");
    stopListening();
  });

  await t.test("the voice waits at a chapter's end when asked, and goes on after the recap", async () => {
    const requested: string[] = [];
    t.mock.method(globalThis, "fetch", async (_url: unknown, init?: RequestInit) => {
      requested.push(JSON.parse(init?.body as string).text);
      return new Response("test audio");
    });
    const book = indexArticle({ id: "hold-test", title: "Book", blocks: [
      { id: "one-h", type: "h2", runs: [{ text: "Chapter one" }] },
      { id: "one-p", type: "p", runs: [{ text: "Its text." }] },
      { id: "two-h", type: "h2", runs: [{ text: "Chapter two" }] },
      { id: "two-p", type: "p", runs: [{ text: "More text." }] },
    ] });
    const ended = async () => { (a as unknown as { onended: () => void }).onended(); await settle(); };
    holdListening((from, to) => from === "one-p" && to === "two-h");
    try {
      startListening(book, "one-h"); await settle();
      await ended();
      assert.equal(useListen.getState().held, null, "within a chapter the voice reads on");
      assert.equal(useListen.getState().status, "playing");
      // The next chapter's title is already prepared, so nothing has to load before it could play.
      a.currentTime = .3;
      (a as unknown as { ontimeupdate: () => void }).ontimeupdate(); await settle();
      (a as unknown as { onended: () => void }).onended();
      assert.equal(useListen.getState().status, "paused", "stopped at once, before anything could follow the voice on");
      await settle();
      assert.equal(useListen.getState().status, "paused");
      assert.equal(useListen.getState().held, "one-p", "it says where it stopped");
      assert.equal(a.paused, true);
      resumeAfterStudy(); await settle();
      assert.equal(useListen.getState().status, "playing");
      assert.equal(useListen.getState().held, null);
      assert.equal(useListen.getState().block, "two-h", "the next chapter begins at its title");
      await ended();
      assert.equal(useListen.getState().status, "playing", "a chapter's own paragraphs never hold");
      assert.deepEqual(requested, ["Chapter one", "Its text.", "Chapter two", "More text."]);
    } finally {
      holdListening(null);
      stopListening();
    }
  });

  await t.test("speed steps up and down within its range", async () => {
    useListen.setState({ rate: 1 });
    nudgeRate(1); assert.equal(useListen.getState().rate, 1.2);
    nudgeRate(-1); nudgeRate(-1); nudgeRate(-1); assert.equal(useListen.getState().rate, .8);
    for (let i = 0; i < 9; i++) nudgeRate(1);
    assert.equal(useListen.getState().rate, 2);
    useListen.setState({ rate: 1 });
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
