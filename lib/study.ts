import type { DocIndex } from "./doc";
import type { Gloss } from "./store";

/** A user-initiated handoff, bounded so a book cannot fill the clipboard. */
export function studyContext(ix: DocIndex, gloss: Gloss): string {
  const block = gloss.anchor?.start.b ?? gloss.at;
  const i = block ? ix.order.get(block) ?? 0 : 0;
  const surrounding = ix.article.blocks.slice(Math.max(0, i - 1), i + 2)
    .map(b => ix.texts.get(b.id) ?? "").join("\n\n").slice(0, 6000);
  const turns = gloss.turns.filter(t => t.content).slice(-4)
    .map(t => `${t.role === "user" ? "Мой вопрос" : "Ответ AI в читалке (нужно проверить)"}: ${t.content.slice(0, 2000)}`).join("\n\n");
  return [
    "Разберём фрагмент моего чтения. Объясняй по-русски: смысл, механизм, пример, затем при необходимости углубимся. Отделяй слова автора от дополнительных знаний.",
    `Книга / статья: ${ix.article.title.slice(0, 500)}${ix.article.author ? `\nАвтор: ${ix.article.author.slice(0, 300)}` : ""}`,
    `Выделенный фрагмент:\n${(gloss.anchor?.quote ?? "Вопрос ко всему тексту").slice(0, 6000)}`,
    `Соседний контекст (часть текста):\n${surrounding}`,
    `Исходный вопрос: ${(gloss.question ?? "Что здесь имеет в виду автор?").slice(0, 2000)}`,
    turns,
  ].filter(Boolean).join("\n\n");
}
