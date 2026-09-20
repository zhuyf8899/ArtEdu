-- 课件显示支持：新增图片与网页（HTML/CSS/JS）课件类型，并允许记录"预览"这一访问方式。
-- 原文件仍保存在私有目录，预览与下载都经过应用层授权；下载始终只对课程创建教师和管理员开放。
BEGIN;

ALTER TABLE course_resources DROP CONSTRAINT IF EXISTS course_resources_resource_type_check;
ALTER TABLE course_resources ADD CONSTRAINT course_resources_resource_type_check
  CHECK (resource_type IN ('pdf', 'video', 'word', 'ppt', 'book', 'link', 'other', 'image', 'web'));

ALTER TABLE course_resource_access_events DROP CONSTRAINT IF EXISTS course_resource_access_events_access_kind_check;
ALTER TABLE course_resource_access_events ADD CONSTRAINT course_resource_access_events_access_kind_check
  CHECK (access_kind IN ('stream', 'download', 'preview'));

COMMIT;
