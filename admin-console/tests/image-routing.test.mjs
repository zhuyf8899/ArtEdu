import test from 'node:test';import assert from 'node:assert/strict';import {planTask} from '../src/taskIntent.js';
for(const prompt of ['生成一张图片，不要SVG，也不要前端UI文件','请调用生图API，画一只猫','帮我生图：一只猫','生成一张首页UI设计图'])test('生图路由 '+prompt,()=>assert.deepEqual(planTask({prompt}).deliverables.map(d=>d.kind),['image']));
