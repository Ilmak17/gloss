import { unzipSync, strFromU8 } from "fflate";
import { blockText, slugify, type Article, type Block } from "./article";
import { htmlToBlocks } from "./html-to-blocks";

const MAX_FILE = 64 * 1024 * 1024;
const MAX_ENTRY = 16 * 1024 * 1024;
const MAX_TOTAL = 128 * 1024 * 1024;
const nodes = (doc: Document | Element, name: string) => Array.from(doc.querySelectorAll("*")).filter(e => e.localName.split(":").at(-1) === name);
function pathFrom(base: string, href: string): string {
  const url = new URL(href, `https://epub.invalid/${base}`);
  if (url.origin !== "https://epub.invalid") throw new Error("EPUB resources must be inside the book.");
  return decodeURIComponent(url.pathname.slice(1));
}

/** A declared language, if it is a real BCP 47 tag ("ru", "en-GB"); "Russian" or "und" say nothing usable. */
function languageTag(value: string | null | undefined): string | undefined {
  const tag = value?.trim();
  return tag && /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(tag) && tag.toLowerCase() !== "und" ? tag : undefined;
}

/** EPUB is parsed locally into inert reader blocks. No book HTML or scripts are mounted. */
export async function epubToArticle(file: File): Promise<Article> {
  if (file.size > MAX_FILE) throw new Error("This EPUB is too large (maximum 64 MB).");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes[0] !== 80 || bytes[1] !== 75) throw new Error("This file is not an EPUB / ZIP archive.");
  let total = 0, count = 0;
  const seen = new Set<string>();
  const files = unzipSync(bytes, { filter: entry => {
    if (seen.has(entry.name)) throw new Error("EPUB contains duplicate file names.");
    seen.add(entry.name);
    total += entry.originalSize;
    if (++count > 5000 || entry.originalSize > MAX_ENTRY || total > MAX_TOTAL) throw new Error("This EPUB expands beyond the supported size.");
    return true;
  }});
  const xml = (path: string) => {
    if (!files[path]) throw new Error(`EPUB is missing ${path}.`);
    const doc = new DOMParser().parseFromString(strFromU8(files[path]), "application/xml");
    if (doc.getElementsByTagName("parsererror").length) throw new Error(`EPUB contains invalid XML: ${path}.`);
    return doc;
  };
  const container = xml("META-INF/container.xml");
  const packagePath = nodes(container, "rootfile")[0]?.getAttribute("full-path");
  if (!packagePath) throw new Error("EPUB has no package document.");
  const pkg = xml(packagePath);
  const title = nodes(pkg, "title")[0]?.textContent?.trim() || file.name.replace(/\.epub$/i, "");
  const author = nodes(pkg, "creator").map(e => e.textContent?.trim()).filter(Boolean).join(", ") || undefined;
  const lang = languageTag(nodes(pkg, "language")[0]?.textContent);
  const manifest = new Map(nodes(pkg, "item").map(e => [e.getAttribute("id"), e]));
  const spine = nodes(pkg, "itemref");
  if (!spine.length) throw new Error("EPUB has no reading order (spine).");
  const links: { title: string; key: string; depth: number }[] = [];
  const keyFor = (base: string, href: string) => {
    if (!href || /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href)) return undefined;
    try {
      const u = new URL(href, `https://epub.invalid/${base}`);
      if (u.origin !== "https://epub.invalid") return undefined;
      return decodeURIComponent(u.pathname.slice(1)) + (u.hash ? `#${decodeURIComponent(u.hash.slice(1))}` : "");
    } catch { return undefined; }
  };
  const navItem = [...manifest.values()].find(e => e.getAttribute("properties")?.split(/\s+/).includes("nav"));
  const ncxItem = [...manifest.values()].find(e => e.getAttribute("media-type") === "application/x-dtbncx+xml");
  if (navItem || ncxItem) {
    const path = pathFrom(packagePath, (navItem ?? ncxItem)!.getAttribute("href") || "");
    const navDoc = xml(path);
    const toc = nodes(navDoc, "nav").find(e => (e.getAttribute("epub:type") ?? e.getAttribute("type") ?? "").split(/\s+/).includes("toc")) ?? nodes(navDoc, "nav")[0];
    const entries = navItem && toc ? nodes(toc, "a") : nodes(navDoc, "navPoint");
    for (const el of entries) {
      const href = navItem ? el.getAttribute("href") : nodes(el, "content")[0]?.getAttribute("src");
      const key = keyFor(path, href ?? "");
      const title = (navItem ? el.textContent : nodes(el, "text")[0]?.textContent)?.trim();
      let depth = 0;
      for (let p = el.parentElement; p; p = p.parentElement) if (["ol", "navPoint"].includes(p.localName)) depth++;
      if (key && title) links.push({ title, key, depth: Math.max(0, depth - (navItem ? 1 : 0)) });
    }
  }
  const targets: NonNullable<Article["epub"]>["targets"] = {};
  const blocks: Block[] = [];
  const chapters: NonNullable<Article["chapters"]> = [];
  const images = new Map<string, string>();
  const mime = new Map(nodes(pkg, "item").map(e => [pathFrom(packagePath, e.getAttribute("href") || ""), e.getAttribute("media-type")]));
  const encrypted = files["META-INF/encryption.xml"] ? nodes(xml("META-INF/encryption.xml"), "CipherReference").map(e => pathFrom("", e.getAttribute("URI") || "")) : [];
  for (const ref of spine) {
    const item = manifest.get(ref.getAttribute("idref"));
    if (!item) throw new Error("EPUB references a missing chapter.");
    const path = pathFrom(packagePath, item.getAttribute("href") || "");
    if (encrypted.includes(path)) throw new Error("This EPUB has encrypted chapters. Import a DRM-free copy.");
    const doc = xml(path);
    const body = nodes(doc, "body")[0];
    if (!body) throw new Error(`EPUB chapter has no body: ${path}.`);
    const sourceBlocks = new Map<string, Block>();
    const sourceNotes = new Map<string, {start:Block;end:Block}>();
    const chapter = htmlToBlocks(body, undefined, { preserveBookContent: true,
      resolveLink: href => {
        if (href.startsWith("#epub-")) return href;
        const key = keyFor(path, href);
        return key ? `#epub-${encodeURIComponent(key)}` : undefined;
      },
      onBlock: (node, block) => {
        const el = node as Element;
        for (let p: Element | null = el; p && p !== body; p = p.parentElement) {
          const id = p.getAttribute("id");
          if (id && /(?:^|\s)(?:footnote|endnote|doc-footnote|doc-endnote)(?:$|\s)/.test(`${p.getAttribute("epub:type") ?? ""} ${p.getAttribute("role") ?? ""}`)) {
            const old = sourceNotes.get(id);
            sourceNotes.set(id, {start:old?.start ?? block,end:block});
          }
        }
        for (const child of [el, ...Array.from(el.querySelectorAll("[id]"))]) {
          const id = child.getAttribute("id");
          if (id && !sourceBlocks.has(id)) sourceBlocks.set(id, block);
        }
        for (let p = el.parentElement; p && p !== body; p = p.parentElement) {
          const id = p.getAttribute("id");
          if (id && !sourceBlocks.has(id)) sourceBlocks.set(id, block);
        }
      }, resolveImage: src => {
      let imagePath: string;
      try { imagePath = pathFrom(path, src); } catch { return undefined; }
      const type = mime.get(imagePath);
      if (!type || !/^image\/(png|jpeg|gif|webp)$/.test(type) || !files[imagePath]) return undefined;
      if (!images.has(imagePath)) {
        let binary = "";
        for (const byte of files[imagePath]) binary += String.fromCharCode(byte);
        images.set(imagePath, `data:${type};base64,${btoa(binary)}`);
      }
      return images.get(imagePath);
    }});
    if (!chapter.length) continue;
    const heading = chapter.find(b => b.type === "h2" || b.type === "h3");
    const label = heading ? blockText(heading) : nodes(doc, "title")[0]?.textContent?.trim() || `Chapter ${chapters.length + 1}`;
    if (!heading) chapter.unshift({ id: "", type: "h2", runs: [{ text: label }] });
    chapter.forEach((block, index) => { block.id = `b${blocks.length + index + 1}`; });
    const noteFile = /(?:footnote|endnote|notes|[-_]fn)(?:[.\/_-]|$)/i.test(path);
    targets[path] = { block: chapter[0].id, note: noteFile };
    for (const [id, block] of sourceBlocks) targets[`${path}#${id}`] = { block: block.id, note: noteFile };
    for (const [id, note] of sourceNotes) targets[`${path}#${id}`] = {block:note.start.id,endBlock:note.end.id,note:true};
    const labels = links.filter(l => l.key.split("#")[0] === path);
    const best = labels.find(l => /^\d+[. :]\s*\S/.test(l.title)) ?? labels[0];
    chapters.push({ title: best?.title ?? label, block: chapter[0].id });
    blocks.push(...chapter);
  }
  if (!blocks.length) throw new Error("This EPUB has no readable text or supported pictures.");
  const toc: NonNullable<Article["epub"]>["toc"] = [];
  for (const link of links) {
    const target = targets[link.key] ?? targets[link.key.split("#")[0]];
    if (!target) continue;
    const kind = target.note || /^(?:bibliography|index|footnotes|notes|references)/i.test(link.title) ? "back" : /^(?:cover|title page|copyright|contents|acknowledgements|preface)/i.test(link.title) ? "front" : "main";
    const existing = toc.findIndex(t => t.block === target.block);
    const item = { title: link.title, block: target.block, depth: link.depth, kind } as const;
    if (existing < 0) toc.push(item);
    else if (/^\d+[. :]\s*\S/.test(link.title)) toc[existing] = item;
  }
  // An explicit superscript or EPUB noteref is a note even with an arbitrary filename.
  for (const b of blocks) for (const r of b.runs) if ((r.noteLabel || r.noteReference) && r.href?.startsWith("#epub-")) {
    const target = targets[decodeURIComponent(r.href.slice(6))];
    if (target) target.note = true;
  }
  return { id: `${slugify(title)}-${crypto.randomUUID().slice(0, 8)}`, title, author, lang, blocks, chapters, epub: { version: 2, toc, targets }, origin: "file",
    format: "epub", source: file.name, addedAt: Date.now() };
}
