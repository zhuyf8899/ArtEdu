import test from 'node:test';
import assert from 'node:assert/strict';
import {lockPageScroll} from '../src/pageScrollLock.js';
const fixture=overflow=>({body:{style:{overflow}}});
test('nested dialogs do not unlock their parent and restore the original page style',()=>{
 const doc=fixture('auto'),closeParent=lockPageScroll(doc),closeChild=lockPageScroll(doc);
 assert.equal(doc.body.style.overflow,'hidden');closeChild();assert.equal(doc.body.style.overflow,'hidden');closeParent();assert.equal(doc.body.style.overflow,'auto');
});
test('out of order or repeated cleanup cannot unlock a still open dialog',()=>{
 const doc=fixture(''),a=lockPageScroll(doc),b=lockPageScroll(doc);a();a();assert.equal(doc.body.style.overflow,'hidden');b();assert.equal(doc.body.style.overflow,'');
});
test('existing independent review locks and other documents retain their own style',()=>{
 const review=fixture('hidden'),page=fixture('scroll'),a=lockPageScroll(review),b=lockPageScroll(page);a();assert.equal(review.body.style.overflow,'hidden');assert.equal(page.body.style.overflow,'hidden');b();assert.equal(page.body.style.overflow,'scroll');
});
