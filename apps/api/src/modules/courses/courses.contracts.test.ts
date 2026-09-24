import assert from "node:assert/strict";
import test from "node:test";
import { createCourseSchema, lessonSubmissionSchema, updateProgressSchema } from "./courses.contracts";

test("课程课时支持分步学习、练习与可选作品提交门槛", () => {
  const parsed = createCourseSchema.parse({
    title: "AI 纹样设计",
    category: "艺术设计",
    lessons: [{
      title: "构建纹样",
      learningSteps: ["观察参考图", "提取形态"],
      practiceTask: "完成一张连续纹样",
      completionCriteria: "提交预览并说明构图",
      requiresWorkSubmission: true,
    }],
  });
  assert.deepEqual(parsed.lessons[0]?.learningSteps, ["观察参考图", "提取形态"]);
  assert.equal(parsed.lessons[0]?.requiresWorkSubmission, true);
});

test("完成课时需要显式确认；作品提交只能带作品 ID 和说明", () => {
  assert.equal(updateProgressSchema.parse({ progressPercent: 45 }).completionConfirmed, false);
  assert.equal(updateProgressSchema.safeParse({ progressPercent: 100, completionConfirmed: "yes" }).success, false);
  assert.equal(lessonSubmissionSchema.safeParse({ workId: "work-1", note: "我的练习" }).success, true);
  assert.equal(lessonSubmissionSchema.safeParse({ workId: "", externalUrl: "https://example.com" }).success, false);
});
