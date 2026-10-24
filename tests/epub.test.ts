import assert from "node:assert/strict";
import { test } from "node:test";
import { DOMParser } from "linkedom";
import { zip } from "../lib/zip";
import { epubToArticle } from "../lib/epub";

Object.assign(globalThis, { DOMParser });

function book(extra: { name: string; text: string }[] = []) {
  return zip([
    { name: "mimetype", text: "application/epub+zip" },
    { name: "META-INF/container.xml", text: '<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>' },
    { name: "OPS/book.opf", text: '<package xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>Книга о мире</dc:title><dc:creator>Автор</dc:creator></metadata><manifest><item id="second" href="two.xhtml" media-type="application/xhtml+xml"/><item id="first" href="one.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="first"/><itemref idref="second"/></spine></package>' },
    { name: "OPS/two.xhtml", text: '<html><body><h1>Вторая глава</h1><p>Второй текст.</p></body></html>' },
    { name: "OPS/one.xhtml", text: '<html><body><h1>Первая глава</h1><p>Первый текст с <em>выделением</em>.</p><script>bad()</script><p><a href="javascript:bad()">Безопасный текст</a></p><h2>References</h2><p>Источники книги сохраняются.</p></body></html>' },
  ].filter(entry => !extra.some(replacement => replacement.name === entry.name)).concat(extra));
}

test("EPUB follows the spine, preserves metadata and formatting, and never imports scripts", async () => {
  const result = await epubToArticle(new File([book()], "test.epub"));
  assert.equal(result.title, "Книга о мире");
  assert.equal(result.author, "Автор");
  const texts = result.blocks.map(b => b.runs.map(r => r.text).join(""));
  assert.ok(texts.indexOf("Первая глава") < texts.indexOf("Вторая глава"));
  assert.ok(texts.includes("Источники книги сохраняются."));
  assert.ok(result.blocks.some(b => b.runs.some(r => r.em && r.text === "выделением")));
  assert.ok(!texts.some(t => t.includes("bad()")));
  assert.ok(!result.blocks.some(b => b.runs.some(r => r.href?.startsWith("javascript:"))));
  assert.equal(new Set(result.blocks.map(b => b.id)).size, result.blocks.length);
  assert.deepEqual(result.chapters?.map(c => c.title), ["Первая глава", "Вторая глава"]);
});

test("EPUB rejects a missing spine item rather than silently dropping a chapter", async () => {
  const archive = book([{ name: "OPS/book.opf", text: '<package><metadata/><manifest/><spine><itemref idref="missing"/></spine></package>' }]);
  await assert.rejects(epubToArticle(new File([archive], "broken.epub")));
});

test("EPUB gives a readable error for a non-ZIP file", async () => {
  await assert.rejects(epubToArticle(new File(["not an epub"], "broken.epub")), /EPUB|ZIP/i);
});

test("a deflated EPUB with XML namespaces imports every chapter", async () => {
  const { readFile } = await import("node:fs/promises");
  const bytes = await readFile(new URL("./fixtures/read-and-listen.epub", import.meta.url));
  const result = await epubToArticle(new File([bytes], "test.epub"));
  assert.equal(result.chapters?.length, 3);
  assert.equal(result.blocks.filter(b => b.type === "p").length, 36);
});

test("EPUB refuses remote images while preserving their surrounding text", async () => {
  const archive = book([{ name: "OPS/one.xhtml", text: '<html><body><h1>Images</h1><img src="https://tracker.invalid/picture.png"/><p>Text survives.</p></body></html>' }]);
  const result = await epubToArticle(new File([archive], "images.epub"));
  assert.equal(result.blocks.filter(b => b.type === "figure").length, 0);
  assert.ok(result.blocks.some(b => b.runs.some(r => r.text === "Text survives.")));
});
