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

test("NCX titles and internal notes preserve legacy block coordinates", async () => {
  const archive = book([
    { name: 'OPS/book.opf', text: '<package><metadata><title>Navigation</title></metadata><manifest><item id="a" href="one.xhtml"/><item id="b" href="two.xhtml"/><item id="toc" href="toc.ncx" media-type="application/x-dtbncx+xml"/></manifest><spine toc="toc"><itemref idref="a"/><itemref idref="b"/></spine></package>' },
    { name: 'OPS/toc.ncx', text: '<ncx><navMap><navPoint><navLabel><text>1. Real chapter name</text></navLabel><content src="one.xhtml#chapter"/></navPoint><navPoint><navLabel><text>Notes</text></navLabel><content src="two.xhtml"/></navPoint></navMap></ncx>' },
    { name: 'OPS/one.xhtml', text: '<html><body><h1 id="chapter">1</h1><p>Before<sup><a href="two.xhtml#note1">1</a></sup> after.</p></body></html>' },
    { name: 'OPS/two.xhtml', text: '<html><body><h1>Notes</h1><p id="note1">The note.</p></body></html>' },
  ]);
  const result = await epubToArticle(new File([archive], 'navigation.epub'));
  assert.equal(result.chapters?.[0].title, '1. Real chapter name');
  assert.equal(result.blocks[1].runs.map(r => r.text).join(''), 'Before after.');
  assert.equal(result.blocks[1].id, 'b2');
  assert.ok(result.blocks[1].runs.some(r => r.noteLabel === '1' && r.href?.startsWith('#epub-')));
  assert.equal(result.epub?.targets['OPS/two.xhtml#note1'].block, 'b4');
  assert.equal(result.epub?.toc[0].block, 'b1');
});

test("EPUB3 TOC resolves nested fragment links without importing remote targets", async () => {
  const archive = book([
    { name: 'OPS/book.opf', text: '<package><metadata/><manifest><item id="a" href="one.xhtml"/><item id="b" href="two.xhtml"/><item id="nav" href="nav.xhtml" properties="nav"/></manifest><spine><itemref idref="a"/><itemref idref="b"/></spine></package>' },
    { name: 'OPS/nav.xhtml', text: '<html xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol><li><a href="one.xhtml">First real title</a><ol><li><a href="two.xhtml#second">Second real title</a></li></ol></li><li><a href="https://bad.invalid/">Remote</a></li></ol></nav></body></html>' },
    { name: 'OPS/two.xhtml', text: '<html><body><h1 id="second">2</h1><p>Content</p></body></html>' },
  ]);
  const result = await epubToArticle(new File([archive], 'nav.epub'));
  assert.deepEqual(result.epub?.toc.map(t => t.title), ['First real title', 'Second real title']);
  assert.equal(result.chapters?.[1].title, 'Second real title');
});

test('semantic EPUB3 footnotes preserve their complete container boundary', async () => {
  const archive=book([{name:'OPS/one.xhtml',text:'<html xmlns:epub="http://www.idpf.org/2007/ops"><body><h1>Chapter</h1><p>Text<a epub:type="noteref" href="#n1">1</a></p><aside id="n1" epub:type="footnote"><p>First note paragraph.</p><p>Second note paragraph.</p></aside><p>Unrelated prose.</p></body></html>'}]);
  const a=await epubToArticle(new File([archive],'semantic.epub'));
  const note=a.epub?.targets['OPS/one.xhtml#n1'];
  assert.equal(note?.note,true);
  assert.equal(note?.block,'b3');
  assert.equal(note?.endBlock,'b4');
  assert.equal(a.blocks[1].runs.map(r=>r.text).join(''),'Text1');
});

const withLanguage = (language: string) => book([{ name: "OPS/book.opf", text: `<package xmlns:dc="http://purl.org/dc/elements/1.1/"><metadata><dc:title>Книга</dc:title><dc:language>${language}</dc:language></metadata><manifest><item id="first" href="one.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="first"/></spine></package>` }]);

test("EPUB keeps the language the book declares, so the reader hyphenates in it", async () => {
  assert.equal((await epubToArticle(new File([withLanguage("ru")], "ru.epub"))).lang, "ru");
  assert.equal((await epubToArticle(new File([withLanguage(" en-GB ")], "en.epub"))).lang, "en-GB");
  assert.equal((await epubToArticle(new File([withLanguage("Russian")], "odd.epub"))).lang, undefined);
  assert.equal((await epubToArticle(new File([withLanguage("und")], "und.epub"))).lang, undefined);
  assert.equal((await epubToArticle(new File([book()], "none.epub"))).lang, undefined);
});
