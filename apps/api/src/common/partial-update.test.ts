import assert from 'node:assert/strict';
import test from 'node:test';
import {updateCourseSchema,updateCourseResourceMetadataSchema} from '../modules/courses/courses.contracts';
import {nodeUpdateSchema,goalUpdateSchema} from '../modules/knowledge/knowledge.contracts';
import {workflowUpdateSchema} from '../modules/studio/studio.contracts';

test('局部更新只返回实际提供的字段，不用创建默认值清空课程、知识或工作流',()=>{
 for(const schema of [updateCourseSchema,updateCourseResourceMetadataSchema,nodeUpdateSchema,goalUpdateSchema]){
  assert.deepEqual(schema.parse({title:'只修改名称'}),{title:'只修改名称'});
  assert.equal(schema.safeParse({}).success,false);
 }
 assert.deepEqual(workflowUpdateSchema.parse({name:'只修改名称'}),{name:'只修改名称'});
 assert.deepEqual(workflowUpdateSchema.parse({}),{});
});
