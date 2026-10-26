"use client";
import { useRef, useState } from 'react';
import { wordCount, type Article } from '@/lib/article';
import { epubToArticle } from '@/lib/epub';
import { upgradeBook } from '@/lib/book-upgrade';
import { savePdf, loadDoc, useStore } from '@/lib/store';

export function BookUpgrade({article}: {article: Article}) {
  const input = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState('');
  return <div className="book-upgrade">
    <p>Update this EPUB’s contents and footnotes. Your place and notes stay saved.</p>
    <input ref={input} type="file" accept=".epub" hidden onChange={async e => {
      const file = e.target.files?.[0];
      if (!file) return;
      setMessage('Checking the original text…');
      try {
        const original = await loadDoc(article.id);
        if (!original) throw new Error("Saved book could not be read. No changes made.");
        const updated = upgradeBook(original, await epubToArticle(file));
        if (!await useStore.getState().updateText(updated, wordCount(updated))) throw new Error('Could not save the update. Browser storage may be full.');
        await savePdf(article.id, file);
        const saved = await loadDoc(article.id);
        if (!saved?.epub) throw new Error("The update could not be verified. Please try again.");
        window.dispatchEvent(new CustomEvent("gloss:text-replaced", {detail:saved}));
        setMessage("Contents and footnotes updated.");
      } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not update this book.'); }
      e.target.value = '';
    }}/>
    <button onClick={() => input.current?.click()}>Update from original EPUB</button>
    {message && <p role="status">{message}</p>}
  </div>;
}
