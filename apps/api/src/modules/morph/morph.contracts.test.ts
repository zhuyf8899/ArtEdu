import test from 'node:test';
import assert from 'node:assert/strict';
import { morphKeySchema, morphWriteSchema, parseMorphValue } from './morph.contracts';
test('workspace state accepts only supported keys and typed values',()=>{
  assert.equal(morphKeySchema.safeParse('users').success,false);assert.equal(morphWriteSchema.safeParse({version:-1,value:[]}).success,false);
  assert.throws(()=>parseMorphValue('favorites',[{type:'admin',id:'x'}]));assert.throws(()=>parseMorphValue('favorites',[{type:'case',id:'x'}]));
  assert.throws(()=>parseMorphValue('profile',{name:'name',roles:['admin']}));
  assert.throws(()=>parseMorphValue('tool-submissions',[{id:'x',title:'x',url:'javascript:alert(1)',reason:'x',createdAt:new Date().toISOString()}]));
});
test('large workspace histories have a bounded aggregate payload',()=>{
  const record={id:'x',title:'x',messages:Array.from({length:10},()=>({role:'user',text:'a'.repeat(100_000),at:new Date().toISOString()}))};assert.throws(()=>parseMorphValue('creation-records',[record]),/大小限制/);
});
