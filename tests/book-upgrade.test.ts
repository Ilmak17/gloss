import { test } from 'node:test';
import assert from 'node:assert/strict';
import { upgradeBook } from '../lib/book-upgrade';
import type { Article } from '../lib/article';
const a: Article = { id:'saved', title:'Book', format:'epub', addedAt:123, blocks:[{id:'b1',type:'p',runs:[{text:'Original text'}]}] };
test('metadata upgrade keeps saved identity and offsets', () => {
  const result = upgradeBook(a, {...a,id:'new',epub:{version:2,toc:[],targets:{}}});
  assert.equal(result.id,'saved'); assert.equal(result.addedAt,123); assert.equal(result.epub?.version,2);
});
test('different edition cannot replace annotated text', () => {
  assert.throws(() => upgradeBook(a,{...a,blocks:[{...a.blocks[0],runs:[{text:'Other text'}]}]}),/does not match/);
});
test('an update from the original EPUB adds the language the book declares', () => {
  assert.equal(upgradeBook(a, {...a, lang:'ru', epub:{version:2,toc:[],targets:{}}}).lang, 'ru');
  assert.equal(upgradeBook({...a, lang:'en'}, {...a, epub:{version:2,toc:[],targets:{}}}).lang, 'en');
});
