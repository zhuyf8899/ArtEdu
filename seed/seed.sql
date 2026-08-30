INSERT INTO roles (id, name, description) VALUES
  ('role-admin', 'admin', '系统管理员'),
  ('role-operator', 'operator', '作品与资源运营审核人员'),
  ('role-teacher', 'teacher', '课程与教学内容管理人员'),
  ('role-student', 'student', '学习课程并发布作品的学生') ON CONFLICT DO NOTHING;

INSERT INTO departments (id, code, name) VALUES
  ('dept-project', 'PROJECT', '项目组'),
  ('dept-fine-arts', 'FINE_ARTS', '美术学院') ON CONFLICT DO NOTHING;

INSERT INTO users (id, username, display_name, email, department_id) VALUES
  ('user-admin-demo', 'admin.demo', '演示管理员', 'admin.demo@example.edu', 'dept-project'),
  ('user-operator-demo', 'operator.demo', '演示运营', 'operator.demo@example.edu', 'dept-project'),
  ('user-teacher-demo', 'teacher.demo', '演示老师', 'teacher.demo@example.edu', 'dept-fine-arts'),
  ('user-student-demo', 'student.demo', '演示学生', 'student.demo@example.edu', 'dept-fine-arts') ON CONFLICT DO NOTHING;

INSERT INTO user_roles (user_id, role_id) VALUES
  ('user-admin-demo', 'role-admin'),
  ('user-operator-demo', 'role-operator'),
  ('user-teacher-demo', 'role-teacher'),
  ('user-student-demo', 'role-student') ON CONFLICT DO NOTHING;

INSERT INTO courses
  (id, slug, title, summary, category, difficulty, is_featured, featured_rank, status, created_by, estimated_minutes, published_at)
VALUES
  ('course-ai-design-foundation', 'ai-design-foundation', 'AI 辅助设计思维与方法', '从灵感到方案，理解 AI 在设计流程中的作用。', '设计基础', 'beginner', TRUE, 1, 'published', 'user-teacher-demo', 45, CURRENT_TIMESTAMP),
  ('course-traditional-pattern', 'traditional-pattern', '传统纹样的当代表达', '从传统视觉元素中提取结构并完成现代转译。', '视觉设计', 'intermediate', FALSE, NULL, 'published', 'user-teacher-demo', 50, CURRENT_TIMESTAMP),
  ('course-vibe-gallery', 'vibe-coding-art-gallery', '用 Vibe Coding 构建数字作品展', '从内容结构、界面节奏到交互实现，完成一个可浏览的线上艺术展。', '交互设计', 'intermediate', TRUE, 3, 'published', 'user-teacher-demo', 60, CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO course_instructors (course_id, user_id) VALUES
  ('course-ai-design-foundation', 'user-teacher-demo'),
  ('course-traditional-pattern', 'user-teacher-demo'),
  ('course-vibe-gallery', 'user-teacher-demo') ON CONFLICT DO NOTHING;

INSERT INTO course_lessons
  (id, course_id, title, summary, sort_order, estimated_minutes, status)
VALUES
  ('lesson-ai-design-01', 'course-ai-design-foundation', '认识生成式 AI', '理解模型从输入到输出的基本过程。', 1, 45, 'published'),
  ('lesson-pattern-01', 'course-traditional-pattern', '提取传统纹样结构', '观察纹样的骨架、重复与节奏。', 1, 50, 'published'),
  ('lesson-vibe-gallery-01', 'course-vibe-gallery', '从内容清单生成可运行画廊', '用自然语言定义页面结构、筛选交互与视觉节奏。', 1, 60, 'published') ON CONFLICT DO NOTHING;

INSERT INTO learning_progress
  (user_id, lesson_id, status, progress_percent, watched_seconds, last_position_seconds)
VALUES
  ('user-student-demo', 'lesson-ai-design-01', 'in_progress', 62, 1674, 1674) ON CONFLICT DO NOTHING;

INSERT INTO course_enrollments (id, user_id, course_id, status) VALUES
  ('enrollment-student-ai-design', 'user-student-demo', 'course-ai-design-foundation', 'in_progress') ON CONFLICT DO NOTHING;

INSERT INTO workflows
  (id, name, description, category, entry_type, entry_url, status, created_by)
VALUES
  ('workflow-case-analysis', '案例分析工作流', '通过多轮提问拆解作品的目标、结构与设计方法。', '案例教学', 'chat', '/#guide', 'published', 'user-teacher-demo'),
  ('workflow-image-draft', '图片生成工作流', '从文字描述开始生成可继续讨论的视觉草稿。', '视觉生成', 'workbench', '/#generate', 'published', 'user-teacher-demo') ON CONFLICT DO NOTHING;

INSERT INTO workflow_versions
  (id, workflow_id, version_number, definition_json, prompt_template, published_at, created_by)
VALUES
  ('workflow-case-analysis-v1', 'workflow-case-analysis', 1, '{"steps":["observe","analyze","reflect"]}', '请从设计目标、视觉结构和创作方法分析这个案例。', CURRENT_TIMESTAMP, 'user-teacher-demo') ON CONFLICT DO NOTHING;

INSERT INTO tools
  (id, name, description, category, tool_type, entry_url, status, created_by)
VALUES
  ('tool-font-lab', '字体搭配实验室', '用于测试字体组合与品牌气质。', '字体设计', 'internal', '/tools/font-lab', 'published', 'user-teacher-demo') ON CONFLICT DO NOTHING;

INSERT INTO workflow_tools (workflow_id, tool_id) VALUES
  ('workflow-case-analysis', 'tool-font-lab') ON CONFLICT DO NOTHING;

INSERT INTO model_providers (id, name, provider_type) VALUES
  ('provider-school', '清华艺智模型服务', 'school') ON CONFLICT DO NOTHING;

INSERT INTO model_configs
  (id, provider_id, display_name, model_identifier, capabilities_json, secret_ref)
VALUES
  ('model-school-chat', 'provider-school', '清华艺智教学对话模型', 'thu-art-chat-v1', '["chat","teaching"]', 'secrets/thu-art-chat-v1') ON CONFLICT DO NOTHING;

INSERT INTO works
  (id, author_id, title, summary, discipline, is_featured, featured_rank, status, published_at)
VALUES
  ('work-demo-cloud-pattern', 'user-student-demo', '云格新序：传统纹样的当代表达', '从云纹、格栅与植物轮廓中提取结构特征，重新组织为当代视觉系统。', '视觉系统设计', TRUE, 1, 'approved', CURRENT_TIMESTAMP) ON CONFLICT DO NOTHING;

INSERT INTO work_workflows (work_id, workflow_id) VALUES
  ('work-demo-cloud-pattern', 'workflow-case-analysis') ON CONFLICT DO NOTHING;

INSERT INTO tags (id, name, slug) VALUES
  ('tag-traditional-pattern', '传统纹样', 'traditional-pattern'),
  ('tag-ai-design', 'AI 设计', 'ai-design') ON CONFLICT DO NOTHING;

INSERT INTO books
  (id, title, authors, publisher, summary, external_url, is_featured, featured_rank, status)
VALUES
  ('book-designing-with-ai', '设计中的人工智能', '演示作者', '演示出版社', '面向设计学习者的 AI 方法参考书。', 'https://example.edu/books/designing-with-ai', TRUE, 1, 'published') ON CONFLICT DO NOTHING;

INSERT INTO book_tags (book_id, tag_id) VALUES
  ('book-designing-with-ai', 'tag-ai-design') ON CONFLICT DO NOTHING;

INSERT INTO work_tags (work_id, tag_id) VALUES
  ('work-demo-cloud-pattern', 'tag-traditional-pattern'),
  ('work-demo-cloud-pattern', 'tag-ai-design') ON CONFLICT DO NOTHING;

INSERT INTO comments (id, work_id, author_id, content) VALUES
  ('comment-demo-01', 'work-demo-cloud-pattern', 'user-teacher-demo', '结构提取很清晰，可以继续补充色彩系统的推导过程。') ON CONFLICT DO NOTHING;

INSERT INTO work_likes (work_id, user_id) VALUES
  ('work-demo-cloud-pattern', 'user-teacher-demo') ON CONFLICT DO NOTHING;

INSERT INTO work_favorites (work_id, user_id) VALUES
  ('work-demo-cloud-pattern', 'user-student-demo') ON CONFLICT DO NOTHING;

INSERT INTO conversations
  (id, user_id, course_id, conversation_type, title)
VALUES
  ('conversation-demo-01', 'user-student-demo', 'course-ai-design-foundation', 'teaching', '生成式 AI 学习讨论') ON CONFLICT DO NOTHING;

INSERT INTO conversation_messages
  (id, conversation_id, sender_type, content, model_config_id)
VALUES
  ('message-demo-01', 'conversation-demo-01', 'user', '什么是生成式 AI？', NULL),
  ('message-demo-02', 'conversation-demo-01', 'assistant', '它根据输入内容生成新的文本、图像或其他媒体。', 'model-school-chat') ON CONFLICT DO NOTHING;

INSERT INTO user_usage_limits
  (id, user_id, capability, period_type, limit_value)
VALUES
  ('limit-demo-image-daily', 'user-student-demo', 'image_generation', 'daily', 20) ON CONFLICT DO NOTHING;

INSERT INTO usage_records
  (id, user_id, model_config_id, capability, request_id, input_units, output_units, status)
VALUES
  ('usage-demo-01', 'user-student-demo', 'model-school-chat', 'teaching_chat', 'req-demo-01', 120, 180, 'success') ON CONFLICT DO NOTHING;
