-- AI 艺术智慧平台 PostgreSQL 16+ 建表草案
-- 文件数据存对象存储；本库只保存元数据和业务关系。

CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TYPE user_status AS ENUM ('active', 'disabled', 'pending');
CREATE TYPE visibility_type AS ENUM ('private', 'organization', 'public');
CREATE TYPE publish_status AS ENUM ('draft', 'pending_review', 'published', 'rejected', 'archived');
CREATE TYPE workflow_version_status AS ENUM ('draft', 'published', 'retired');
CREATE TYPE workflow_run_status AS ENUM ('not_started', 'running', 'completed', 'failed', 'cancelled');
CREATE TYPE step_run_status AS ENUM ('pending', 'running', 'completed', 'failed', 'skipped');
CREATE TYPE ai_task_status AS ENUM ('queued', 'running', 'succeeded', 'failed', 'cancelled');
CREATE TYPE ai_task_type AS ENUM ('text', 'text_to_image', 'image_to_image', 'video');
CREATE TYPE asset_safety_status AS ENUM ('pending', 'safe', 'blocked', 'review');
CREATE TYPE resource_type AS ENUM ('course', 'learning_project', 'case', 'material', 'article');
CREATE TYPE review_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled');
CREATE TYPE learning_status AS ENUM ('not_started', 'in_progress', 'completed');
CREATE TYPE quota_scope_type AS ENUM ('platform', 'organization', 'role', 'user');
CREATE TYPE quota_metric AS ENUM ('credits', 'requests', 'images', 'input_tokens', 'output_tokens', 'concurrent_tasks');
CREATE TYPE quota_period AS ENUM ('day', 'week', 'month', 'forever');
CREATE TYPE ledger_entry_type AS ENUM ('grant', 'reserve', 'consume', 'release', 'adjust', 'expire', 'refund');

CREATE TABLE organizations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar(160) NOT NULL,
    code varchar(64) NOT NULL UNIQUE,
    status user_status NOT NULL DEFAULT 'active',
    settings jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES organizations(id),
    email varchar(320),
    phone varchar(32),
    password_hash text,
    display_name varchar(120) NOT NULL,
    avatar_url text,
    status user_status NOT NULL DEFAULT 'active',
    last_login_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz,
    CONSTRAINT users_login_identity CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

CREATE UNIQUE INDEX uq_users_email_active ON users (lower(email)) WHERE email IS NOT NULL AND deleted_at IS NULL;
CREATE UNIQUE INDEX uq_users_phone_active ON users (phone) WHERE phone IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX idx_users_org_status ON users (organization_id, status);

CREATE TABLE roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES organizations(id),
    code varchar(80) NOT NULL,
    name varchar(120) NOT NULL,
    is_system boolean NOT NULL DEFAULT false,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_roles_scope_code ON roles (COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), code);

CREATE TABLE permissions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code varchar(120) NOT NULL UNIQUE,
    description text NOT NULL DEFAULT ''
);

CREATE TABLE user_roles (
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    granted_by uuid REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, role_id)
);

CREATE TABLE role_permissions (
    role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
    permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE refresh_tokens (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash char(64) NOT NULL UNIQUE,
    expires_at timestamptz NOT NULL,
    revoked_at timestamptz,
    user_agent text,
    ip_address inet,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens (user_id, expires_at);

CREATE TABLE ai_providers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code varchar(64) NOT NULL UNIQUE,
    name varchar(120) NOT NULL,
    adapter_type varchar(80) NOT NULL,
    secret_ref varchar(240) NOT NULL,
    base_url text,
    enabled boolean NOT NULL DEFAULT true,
    config jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE ai_models (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider_id uuid NOT NULL REFERENCES ai_providers(id),
    code varchar(100) NOT NULL UNIQUE,
    provider_model_code varchar(160) NOT NULL,
    display_name varchar(120) NOT NULL,
    capabilities ai_task_type[] NOT NULL,
    parameter_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
    default_parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
    routing_weight integer NOT NULL DEFAULT 100 CHECK (routing_weight >= 0),
    enabled boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_models_provider_enabled ON ai_models (provider_id, enabled);

CREATE TABLE model_price_rules (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    model_id uuid NOT NULL REFERENCES ai_models(id),
    effective_from timestamptz NOT NULL,
    effective_to timestamptz,
    pricing jsonb NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT valid_price_period CHECK (effective_to IS NULL OR effective_to > effective_from)
);

CREATE INDEX idx_price_rules_lookup ON model_price_rules (model_id, effective_from DESC);

CREATE TABLE quota_policies (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    scope_type quota_scope_type NOT NULL,
    scope_id uuid,
    metric quota_metric NOT NULL,
    period quota_period NOT NULL,
    hard_limit bigint NOT NULL CHECK (hard_limit >= 0),
    priority integer NOT NULL DEFAULT 0,
    enabled boolean NOT NULL DEFAULT true,
    created_by uuid REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT quota_platform_scope CHECK (
        (scope_type = 'platform' AND scope_id IS NULL) OR
        (scope_type <> 'platform' AND scope_id IS NOT NULL)
    )
);

CREATE INDEX idx_quota_policies_resolve ON quota_policies (scope_type, scope_id, metric, enabled, priority DESC);

CREATE TABLE quota_usage_buckets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_id uuid NOT NULL REFERENCES quota_policies(id),
    user_id uuid NOT NULL REFERENCES users(id),
    window_start timestamptz NOT NULL,
    window_end timestamptz NOT NULL,
    hard_limit bigint NOT NULL CHECK (hard_limit >= 0),
    used bigint NOT NULL DEFAULT 0 CHECK (used >= 0),
    reserved bigint NOT NULL DEFAULT 0 CHECK (reserved >= 0),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (policy_id, user_id, window_start),
    CONSTRAINT valid_quota_window CHECK (window_end > window_start),
    CONSTRAINT quota_not_over_limit CHECK (used + reserved <= hard_limit)
);

CREATE INDEX idx_quota_bucket_user_window ON quota_usage_buckets (user_id, window_end);

CREATE TABLE credit_accounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL UNIQUE REFERENCES users(id),
    balance bigint NOT NULL DEFAULT 0 CHECK (balance >= 0),
    reserved bigint NOT NULL DEFAULT 0 CHECK (reserved >= 0),
    version integer NOT NULL DEFAULT 0,
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT valid_credit_account CHECK (reserved <= balance)
);

CREATE TABLE workflows (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES organizations(id),
    author_user_id uuid NOT NULL REFERENCES users(id),
    slug varchar(160) NOT NULL,
    title varchar(200) NOT NULL,
    summary text NOT NULL DEFAULT '',
    visibility visibility_type NOT NULL DEFAULT 'private',
    cover_url text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    archived_at timestamptz
);

CREATE UNIQUE INDEX uq_workflows_slug_scope ON workflows (COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), slug);

CREATE TABLE workflow_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_id uuid NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    version_no integer NOT NULL CHECK (version_no > 0),
    status workflow_version_status NOT NULL DEFAULT 'draft',
    graph_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    change_note text NOT NULL DEFAULT '',
    published_by uuid REFERENCES users(id),
    published_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workflow_id, version_no)
);

CREATE TABLE workflow_steps (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_version_id uuid NOT NULL REFERENCES workflow_versions(id) ON DELETE CASCADE,
    step_key varchar(80) NOT NULL,
    sort_order integer NOT NULL CHECK (sort_order >= 0),
    step_type varchar(40) NOT NULL CHECK (step_type IN ('instruction', 'form', 'ai_generation', 'upload', 'approval', 'export')),
    title varchar(200) NOT NULL,
    instruction text NOT NULL DEFAULT '',
    config_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    input_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
    output_mapping jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workflow_version_id, step_key),
    UNIQUE (workflow_version_id, sort_order)
);

CREATE TABLE workflow_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_version_id uuid NOT NULL REFERENCES workflow_versions(id),
    user_id uuid NOT NULL REFERENCES users(id),
    status workflow_run_status NOT NULL DEFAULT 'not_started',
    context_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    current_step_key varchar(80),
    started_at timestamptz,
    completed_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_workflow_runs_user_recent ON workflow_runs (user_id, updated_at DESC);

CREATE TABLE workflow_step_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_run_id uuid NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
    workflow_step_id uuid NOT NULL REFERENCES workflow_steps(id),
    status step_run_status NOT NULL DEFAULT 'pending',
    input_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    output_json jsonb NOT NULL DEFAULT '{}'::jsonb,
    attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    error_code varchar(100),
    error_message text,
    started_at timestamptz,
    completed_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (workflow_run_id, workflow_step_id)
);

CREATE TABLE ai_tasks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES organizations(id),
    user_id uuid NOT NULL REFERENCES users(id),
    model_id uuid NOT NULL REFERENCES ai_models(id),
    workflow_step_run_id uuid REFERENCES workflow_step_runs(id),
    task_type ai_task_type NOT NULL,
    status ai_task_status NOT NULL DEFAULT 'queued',
    idempotency_key varchar(160) NOT NULL,
    provider_job_id varchar(240),
    prompt text,
    negative_prompt text,
    parameters jsonb NOT NULL DEFAULT '{}'::jsonb,
    result_summary jsonb NOT NULL DEFAULT '{}'::jsonb,
    estimated_credits bigint NOT NULL DEFAULT 0 CHECK (estimated_credits >= 0),
    actual_credits bigint CHECK (actual_credits IS NULL OR actual_credits >= 0),
    error_code varchar(100),
    error_message text,
    attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    next_poll_at timestamptz,
    started_at timestamptz,
    finished_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, idempotency_key)
);

CREATE INDEX idx_ai_tasks_user_recent ON ai_tasks (user_id, created_at DESC);
CREATE INDEX idx_ai_tasks_worker_poll ON ai_tasks (status, next_poll_at) WHERE status IN ('queued', 'running');
CREATE INDEX idx_ai_tasks_provider_job ON ai_tasks (provider_job_id) WHERE provider_job_id IS NOT NULL;

CREATE TABLE credit_ledger (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    account_id uuid NOT NULL REFERENCES credit_accounts(id),
    ai_task_id uuid REFERENCES ai_tasks(id),
    entry_type ledger_entry_type NOT NULL,
    amount bigint NOT NULL,
    balance_after bigint NOT NULL CHECK (balance_after >= 0),
    reserved_after bigint NOT NULL CHECK (reserved_after >= 0),
    idempotency_key varchar(200) NOT NULL UNIQUE,
    note text NOT NULL DEFAULT '',
    actor_user_id uuid REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_credit_ledger_account_recent ON credit_ledger (account_id, created_at DESC);

CREATE TABLE assets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES organizations(id),
    owner_user_id uuid NOT NULL REFERENCES users(id),
    storage_bucket varchar(120) NOT NULL,
    storage_key text NOT NULL UNIQUE,
    original_name text,
    mime_type varchar(160) NOT NULL,
    byte_size bigint NOT NULL CHECK (byte_size >= 0),
    sha256 char(64),
    width integer CHECK (width IS NULL OR width > 0),
    height integer CHECK (height IS NULL OR height > 0),
    duration_ms integer CHECK (duration_ms IS NULL OR duration_ms >= 0),
    safety_status asset_safety_status NOT NULL DEFAULT 'pending',
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    deleted_at timestamptz
);

CREATE INDEX idx_assets_owner_recent ON assets (owner_user_id, created_at DESC);
CREATE INDEX idx_assets_sha256 ON assets (sha256) WHERE sha256 IS NOT NULL;

CREATE TABLE ai_task_assets (
    ai_task_id uuid NOT NULL REFERENCES ai_tasks(id) ON DELETE CASCADE,
    asset_id uuid NOT NULL REFERENCES assets(id),
    direction varchar(16) NOT NULL CHECK (direction IN ('input', 'output')),
    sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
    PRIMARY KEY (ai_task_id, asset_id, direction)
);

CREATE TABLE resources (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES organizations(id),
    creator_user_id uuid NOT NULL REFERENCES users(id),
    resource_type resource_type NOT NULL,
    slug varchar(180) NOT NULL,
    title varchar(240) NOT NULL,
    summary text NOT NULL DEFAULT '',
    body jsonb NOT NULL DEFAULT '{}'::jsonb,
    status publish_status NOT NULL DEFAULT 'draft',
    visibility visibility_type NOT NULL DEFAULT 'private',
    cover_asset_id uuid REFERENCES assets(id),
    source_ai_task_id uuid REFERENCES ai_tasks(id),
    published_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    archived_at timestamptz
);

CREATE UNIQUE INDEX uq_resources_slug_scope ON resources (COALESCE(organization_id, '00000000-0000-0000-0000-000000000000'::uuid), slug);
CREATE INDEX idx_resources_public_feed ON resources (status, visibility, published_at DESC, id DESC);
CREATE INDEX idx_resources_admin ON resources (organization_id, status, updated_at DESC);
CREATE INDEX idx_resources_title_trgm ON resources USING gin (title gin_trgm_ops);

CREATE TABLE resource_assets (
    resource_id uuid NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    asset_id uuid NOT NULL REFERENCES assets(id),
    purpose varchar(40) NOT NULL DEFAULT 'attachment',
    sort_order integer NOT NULL DEFAULT 0 CHECK (sort_order >= 0),
    PRIMARY KEY (resource_id, asset_id)
);

CREATE TABLE course_profiles (
    resource_id uuid PRIMARY KEY REFERENCES resources(id) ON DELETE CASCADE,
    difficulty varchar(32),
    estimated_minutes integer CHECK (estimated_minutes IS NULL OR estimated_minutes >= 0),
    instructor_user_id uuid REFERENCES users(id),
    prerequisites text NOT NULL DEFAULT ''
);

CREATE TABLE course_versions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    course_resource_id uuid NOT NULL REFERENCES course_profiles(resource_id) ON DELETE CASCADE,
    version_no integer NOT NULL CHECK (version_no > 0),
    title varchar(240) NOT NULL,
    summary text NOT NULL DEFAULT '',
    snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_by uuid NOT NULL REFERENCES users(id),
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (course_resource_id, version_no)
);

CREATE TABLE course_sections (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    course_resource_id uuid NOT NULL REFERENCES course_profiles(resource_id) ON DELETE CASCADE,
    title varchar(240) NOT NULL,
    summary text NOT NULL DEFAULT '',
    sort_order integer NOT NULL CHECK (sort_order >= 0),
    UNIQUE (course_resource_id, sort_order)
);

CREATE TABLE course_lessons (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    course_resource_id uuid NOT NULL REFERENCES course_profiles(resource_id) ON DELETE CASCADE,
    section_id uuid REFERENCES course_sections(id) ON DELETE CASCADE,
    title varchar(240) NOT NULL,
    sort_order integer NOT NULL CHECK (sort_order >= 0),
    content jsonb NOT NULL DEFAULT '{}'::jsonb,
    workflow_id uuid REFERENCES workflows(id),
    estimated_minutes integer CHECK (estimated_minutes IS NULL OR estimated_minutes >= 0),
    UNIQUE (course_resource_id, sort_order)
);

CREATE TABLE learning_project_profiles (
    resource_id uuid PRIMARY KEY REFERENCES resources(id) ON DELETE CASCADE,
    outcome_description text NOT NULL DEFAULT '',
    difficulty varchar(32),
    estimated_minutes integer CHECK (estimated_minutes IS NULL OR estimated_minutes >= 0),
    instructor_user_id uuid REFERENCES users(id)
);

CREATE TABLE learning_project_steps (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_resource_id uuid NOT NULL REFERENCES learning_project_profiles(resource_id) ON DELETE CASCADE,
    title varchar(240) NOT NULL,
    summary text NOT NULL DEFAULT '',
    step_type varchar(32) NOT NULL CHECK (step_type IN ('lesson', 'resource', 'workflow', 'assignment')),
    sort_order integer NOT NULL CHECK (sort_order >= 0),
    workflow_id uuid REFERENCES workflows(id),
    estimated_minutes integer CHECK (estimated_minutes IS NULL OR estimated_minutes >= 0),
    config jsonb NOT NULL DEFAULT '{}'::jsonb,
    UNIQUE (project_resource_id, sort_order)
);

CREATE TABLE course_enrollments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_resource_id uuid NOT NULL REFERENCES course_profiles(resource_id) ON DELETE CASCADE,
    status learning_status NOT NULL DEFAULT 'not_started',
    last_lesson_id uuid REFERENCES course_lessons(id),
    progress_percent integer NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
    started_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, course_resource_id)
);

CREATE TABLE lesson_progress (
    enrollment_id uuid NOT NULL REFERENCES course_enrollments(id) ON DELETE CASCADE,
    lesson_id uuid NOT NULL REFERENCES course_lessons(id) ON DELETE CASCADE,
    completed boolean NOT NULL DEFAULT false,
    completed_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (enrollment_id, lesson_id)
);

CREATE TABLE project_enrollments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_resource_id uuid NOT NULL REFERENCES learning_project_profiles(resource_id) ON DELETE CASCADE,
    status learning_status NOT NULL DEFAULT 'not_started',
    last_step_id uuid REFERENCES learning_project_steps(id),
    progress_percent integer NOT NULL DEFAULT 0 CHECK (progress_percent BETWEEN 0 AND 100),
    completed_step_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
    started_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, project_resource_id)
);

CREATE INDEX idx_course_enrollments_user_recent ON course_enrollments (user_id, updated_at DESC);
CREATE INDEX idx_project_enrollments_user_recent ON project_enrollments (user_id, updated_at DESC);

CREATE TABLE generation_outputs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ai_task_id uuid NOT NULL REFERENCES ai_tasks(id) ON DELETE CASCADE,
    asset_id uuid REFERENCES assets(id),
    course_lesson_id uuid REFERENCES course_lessons(id),
    project_step_id uuid REFERENCES learning_project_steps(id),
    output_type varchar(24) NOT NULL CHECK (output_type IN ('image', 'text', 'video')),
    metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT output_learning_step CHECK (NOT (course_lesson_id IS NOT NULL AND project_step_id IS NOT NULL))
);

CREATE TABLE case_profiles (
    resource_id uuid PRIMARY KEY REFERENCES resources(id) ON DELETE CASCADE,
    workflow_id uuid REFERENCES workflows(id),
    workflow_run_id uuid REFERENCES workflow_runs(id),
    prompt_excerpt text,
    generation_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
    author_note text NOT NULL DEFAULT ''
);

CREATE TABLE categories (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id uuid REFERENCES categories(id),
    code varchar(80) NOT NULL UNIQUE,
    name varchar(120) NOT NULL,
    sort_order integer NOT NULL DEFAULT 0,
    enabled boolean NOT NULL DEFAULT true
);

CREATE TABLE resource_categories (
    resource_id uuid NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    category_id uuid NOT NULL REFERENCES categories(id),
    PRIMARY KEY (resource_id, category_id)
);

CREATE INDEX idx_resource_categories_reverse ON resource_categories (category_id, resource_id);

CREATE TABLE tags (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name varchar(80) NOT NULL,
    normalized_name varchar(80) NOT NULL UNIQUE
);

CREATE TABLE resource_tags (
    resource_id uuid NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    tag_id uuid NOT NULL REFERENCES tags(id),
    PRIMARY KEY (resource_id, tag_id)
);

CREATE INDEX idx_resource_tags_reverse ON resource_tags (tag_id, resource_id);

CREATE TABLE resource_favorites (
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    resource_id uuid NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    created_at timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (user_id, resource_id)
);

CREATE TABLE resource_counters (
    resource_id uuid PRIMARY KEY REFERENCES resources(id) ON DELETE CASCADE,
    view_count bigint NOT NULL DEFAULT 0 CHECK (view_count >= 0),
    favorite_count bigint NOT NULL DEFAULT 0 CHECK (favorite_count >= 0),
    use_count bigint NOT NULL DEFAULT 0 CHECK (use_count >= 0),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE moderation_reviews (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    target_type varchar(40) NOT NULL CHECK (target_type IN ('resource', 'asset', 'prompt', 'generation')),
    target_id uuid NOT NULL,
    submitter_user_id uuid NOT NULL REFERENCES users(id),
    reviewer_user_id uuid REFERENCES users(id),
    status review_status NOT NULL DEFAULT 'pending',
    snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
    machine_result jsonb NOT NULL DEFAULT '{}'::jsonb,
    reason_code varchar(80),
    comment text NOT NULL DEFAULT '',
    submitted_at timestamptz NOT NULL DEFAULT now(),
    decided_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_reviews_queue ON moderation_reviews (status, submitted_at, id);
CREATE INDEX idx_reviews_target ON moderation_reviews (target_type, target_id, created_at DESC);
CREATE UNIQUE INDEX uq_one_pending_review_per_target
    ON moderation_reviews (target_type, target_id)
    WHERE status = 'pending';

CREATE TABLE notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type varchar(80) NOT NULL,
    title varchar(200) NOT NULL,
    body text NOT NULL DEFAULT '',
    data jsonb NOT NULL DEFAULT '{}'::jsonb,
    read_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_unread ON notifications (user_id, created_at DESC) WHERE read_at IS NULL;

CREATE TABLE audit_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id uuid REFERENCES organizations(id),
    actor_user_id uuid REFERENCES users(id),
    action varchar(120) NOT NULL,
    target_type varchar(80),
    target_id uuid,
    before_data jsonb,
    after_data jsonb,
    request_id varchar(120),
    ip_address inet,
    user_agent text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_actor_recent ON audit_logs (actor_user_id, created_at DESC);
CREATE INDEX idx_audit_target ON audit_logs (target_type, target_id, created_at DESC);

-- Transactional Outbox：业务事务与异步事件保持一致。
CREATE TABLE outbox_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_type varchar(80) NOT NULL,
    aggregate_id uuid NOT NULL,
    event_type varchar(120) NOT NULL,
    payload jsonb NOT NULL,
    occurred_at timestamptz NOT NULL DEFAULT now(),
    published_at timestamptz,
    attempt_count integer NOT NULL DEFAULT 0
);

CREATE INDEX idx_outbox_unpublished ON outbox_events (occurred_at) WHERE published_at IS NULL;

-- 建议由 migration/seed 写入系统权限与默认角色；不在 schema 中硬编码业务数据。
