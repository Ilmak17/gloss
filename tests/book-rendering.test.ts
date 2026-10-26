import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parseHTML } from 'linkedom';
import { Block } from '../components/reader/Block';

test('footnote markers survive highlights without changing text coordinates',()=>{
 const block={id:'b1',type:'p' as const,runs:[{text:'Before '},{text:'',noteLabel:'1',href:'#epub-note'},{text:'after'}]};
 const html=renderToStaticMarkup(createElement(Block,{block,marks:[{from:0,to:12,kind:'hl',id:'h'}],activeGloss:null,hoverGloss:null,activeHighlight:null,fresh:null,cursor:false,hasAt:false,onAsk:()=>{}}));
 const {document}=parseHTML(html);
 assert.equal(document.querySelector('.blk-text')?.textContent,'Before after');
 assert.equal(document.querySelectorAll('.book-note-ref').length,1);
 assert.equal(document.querySelector('.book-note-ref')?.getAttribute('aria-label'),'Footnote 1');
});
