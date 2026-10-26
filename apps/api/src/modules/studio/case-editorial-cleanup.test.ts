import assert from 'node:assert/strict';
import test from 'node:test';
import {separateEditorialText} from './case-editorial';
test('整理说明保留作者原文，并将明确的平台尾注完整移出，重复执行不再改变',()=>{
 const body='我们用生成影像讨论记忆。\n\n作品把自然与人工连接起来。\n\n资料整理说明：原包视频是 webloc，视频待作者补充。';
 const result=separateEditorialText(body);
 assert.equal(result.text,'我们用生成影像讨论记忆。\n\n作品把自然与人工连接起来。');assert.ok(result.notes.includes('webloc'));
 assert.deepEqual(separateEditorialText(result.text),{text:result.text,notes:''});
 const author='我们在实验中观察 404 图像，这次创作保留了失败的痕迹。';
 assert.equal(separateEditorialText(author).text,author);
});
