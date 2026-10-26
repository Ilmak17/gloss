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
  const manifest = new Map(nodes(pkg, "item").map(e => [e.getAttribute("id"), e]));
  const spine = nodes(pkg, "itemref");
  if (!spine.length) throw new Error("EPUB has no reading order (spine).");
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
    const chapter = htmlToBlocks(body, undefined, { preserveBookContent: true, resolveImage: src => {
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
    chapters.push({ title: label, block: chapter[0].id });
    blocks.push(...chapter);
  }
  if (!blocks.length) throw new Error("This EPUB has no readable text or supported pictures.");
  return { id: `${slugify(title)}-${crypto.randomUUID().slice(0, 8)}`, title, author, blocks, chapters, origin: "file",
    format: "epub", source: file.name, addedAt: Date.now() };
}
