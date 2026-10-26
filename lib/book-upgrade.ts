import { blockText, type Article } from './article';

/** Metadata-only upgrade. Never remap annotations onto a different edition. */
export function upgradeBook(original: Article, parsed: Article): Article {
  if (original.format !== 'epub' || parsed.format !== 'epub' || original.title !== parsed.title ||
      original.blocks.length !== parsed.blocks.length || original.blocks.some((b, i) =>
        b.id !== parsed.blocks[i].id || b.type !== parsed.blocks[i].type || blockText(b) !== blockText(parsed.blocks[i]))) {
    throw new Error('This file does not match the saved book. Your book and notes have not been changed. Choose the original EPUB.');
  }
  return { ...original, blocks: parsed.blocks, chapters: parsed.chapters, epub: parsed.epub };
}
