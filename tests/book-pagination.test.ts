import { test } from 'node:test';
import assert from 'node:assert/strict';
import { locateBookPage } from '../lib/book-pagination';
test('page navigation handles chapter boundaries and rejects impossible pages',()=>{
  assert.deepEqual(locateBookPage([1,3,8],1),{chapter:0,page:0});
  assert.deepEqual(locateBookPage([1,3,8],4),{chapter:1,page:2});
  assert.deepEqual(locateBookPage([1,3,8],5),{chapter:2,page:0});
  assert.deepEqual(locateBookPage([1,3,8],12),{chapter:2,page:7});
  for (const n of [0,-1,13,NaN,1.5]) assert.equal(locateBookPage([1,3,8],n),null);
});
