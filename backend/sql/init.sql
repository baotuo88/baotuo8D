CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique ON users (email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users (role);

-- Runtime AI configuration (single row)
CREATE TABLE IF NOT EXISTS ai_runtime_config (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  chat_api_key TEXT NOT NULL DEFAULT '',
  chat_base_url TEXT NOT NULL DEFAULT '',
  chat_model TEXT NOT NULL DEFAULT '',
  embed_api_key TEXT NOT NULL DEFAULT '',
  embed_base_url TEXT NOT NULL DEFAULT '',
  embed_model TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO ai_runtime_config (id)
VALUES (1)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS ai_provider_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_name TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 1,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  chat_api_key TEXT NOT NULL DEFAULT '',
  chat_base_url TEXT NOT NULL DEFAULT '',
  chat_model TEXT NOT NULL DEFAULT '',
  embed_api_key TEXT NOT NULL DEFAULT '',
  embed_base_url TEXT NOT NULL DEFAULT '',
  embed_model TEXT NOT NULL DEFAULT '',
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (provider_name)
);

CREATE INDEX IF NOT EXISTS idx_ai_provider_configs_enabled_priority
  ON ai_provider_configs (enabled, priority ASC, created_at ASC);

-- Legacy AI report table (kept for backward compatibility)
CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  problem_statement TEXT NOT NULL,
  impact TEXT NOT NULL DEFAULT '',
  root_cause_hint TEXT NOT NULL DEFAULT '',
  team_members JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw_input JSONB NOT NULL,
  report_json JSONB NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'reports'
      AND column_name = 'created_by'
  ) THEN
    ALTER TABLE reports
      ADD COLUMN created_by UUID REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_ai_provider_configs_updated_at'
  ) THEN
    CREATE TRIGGER trg_ai_provider_configs_updated_at
    BEFORE UPDATE ON ai_provider_configs
    FOR EACH ROW
    EXECUTE FUNCTION set_row_updated_at();
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_created_by ON reports (created_by);

-- 8D Report Module
CREATE TABLE IF NOT EXISTS eight_d_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'closed')),
  d1 TEXT NOT NULL DEFAULT '',
  d2 TEXT NOT NULL DEFAULT '',
  d3 TEXT NOT NULL DEFAULT '',
  d4 TEXT NOT NULL DEFAULT '',
  d5 TEXT NOT NULL DEFAULT '',
  d6 TEXT NOT NULL DEFAULT '',
  d7 TEXT NOT NULL DEFAULT '',
  d8 TEXT NOT NULL DEFAULT '',
  created_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  submitted_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_eight_d_reports_status ON eight_d_reports (status);
CREATE INDEX IF NOT EXISTS idx_eight_d_reports_created_by ON eight_d_reports (created_by);
CREATE INDEX IF NOT EXISTS idx_eight_d_reports_created_at ON eight_d_reports (created_at DESC);

CREATE TABLE IF NOT EXISTS eight_d_status_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES eight_d_reports(id) ON DELETE CASCADE,
  from_status TEXT NOT NULL CHECK (from_status IN ('draft', 'review', 'closed')),
  to_status TEXT NOT NULL CHECK (to_status IN ('draft', 'review', 'closed')),
  actor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  comment TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eight_d_status_history_report_id ON eight_d_status_history (report_id);
CREATE INDEX IF NOT EXISTS idx_eight_d_status_history_created_at ON eight_d_status_history (created_at DESC);

CREATE TABLE IF NOT EXISTS eight_d_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID NOT NULL REFERENCES eight_d_reports(id) ON DELETE CASCADE,
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected')),
  comment TEXT NOT NULL DEFAULT '',
  actor_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_eight_d_approvals_report_id ON eight_d_approvals (report_id);
CREATE INDEX IF NOT EXISTS idx_eight_d_approvals_created_at ON eight_d_approvals (created_at DESC);

-- Enterprise RAG case base
CREATE TABLE IF NOT EXISTS rag_cases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL DEFAULT 'document',
  source_name TEXT NOT NULL DEFAULT '',
  source_path TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL DEFAULT '',
  product TEXT NOT NULL DEFAULT '',
  issue_type TEXT NOT NULL DEFAULT '',
  problem_type TEXT NOT NULL DEFAULT '',
  process TEXT NOT NULL DEFAULT '',
  problem TEXT NOT NULL DEFAULT '',
  root_cause TEXT NOT NULL DEFAULT '',
  solution TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  raw_text TEXT NOT NULL,
  normalized_text TEXT NOT NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rag_cases_product ON rag_cases (product);
CREATE INDEX IF NOT EXISTS idx_rag_cases_issue_type ON rag_cases (issue_type);
CREATE INDEX IF NOT EXISTS idx_rag_cases_problem_type ON rag_cases (problem_type);
CREATE INDEX IF NOT EXISTS idx_rag_cases_process ON rag_cases (process);
CREATE INDEX IF NOT EXISTS idx_rag_cases_created_at ON rag_cases (created_at DESC);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'rag_cases'
      AND column_name = 'issue_type'
  ) THEN
    ALTER TABLE rag_cases
      ADD COLUMN issue_type TEXT NOT NULL DEFAULT '';
  END IF;
END $$;

UPDATE rag_cases
SET issue_type = problem_type
WHERE issue_type = '' AND problem_type <> '';

CREATE TABLE IF NOT EXISTS rag_case_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id UUID NOT NULL REFERENCES rag_cases(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  chunk_text TEXT NOT NULL,
  char_count INTEGER NOT NULL DEFAULT 0,
  vector_id TEXT NOT NULL UNIQUE,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (case_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_rag_case_chunks_case_id ON rag_case_chunks (case_id);
CREATE INDEX IF NOT EXISTS idx_rag_case_chunks_created_at ON rag_case_chunks (created_at DESC);

CREATE TABLE IF NOT EXISTS writing_style_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  source_count INTEGER NOT NULL DEFAULT 0,
  lexicon JSONB NOT NULL DEFAULT '[]'::jsonb,
  sentence_patterns JSONB NOT NULL DEFAULT '[]'::jsonb,
  technical_terms JSONB NOT NULL DEFAULT '[]'::jsonb,
  style_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  anti_template_rules JSONB NOT NULL DEFAULT '[]'::jsonb,
  sample_phrases JSONB NOT NULL DEFAULT '[]'::jsonb,
  profile_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_writing_style_profiles_created_at
  ON writing_style_profiles (created_at DESC);

CREATE TABLE IF NOT EXISTS ai_generation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  scene TEXT NOT NULL DEFAULT 'rag_generation',
  user_input JSONB NOT NULL DEFAULT '{}'::jsonb,
  retrieval_content JSONB NOT NULL DEFAULT '[]'::jsonb,
  prompt_content TEXT NOT NULL DEFAULT '',
  ai_output JSONB NOT NULL DEFAULT '{}'::jsonb,
  report_text TEXT NOT NULL DEFAULT '',
  duration_ms INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'failed')),
  error_message TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_generation_logs_created_at
  ON ai_generation_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_generation_logs_user_id
  ON ai_generation_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_ai_generation_logs_scene
  ON ai_generation_logs (scene);

CREATE TABLE IF NOT EXISTS rag_generation_evaluations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  generation_log_id UUID NOT NULL REFERENCES ai_generation_logs(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  rating TEXT NOT NULL CHECK (rating IN ('good', 'normal', 'bad')),
  comment TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (generation_log_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_rag_generation_evaluations_created_at
  ON rag_generation_evaluations (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rag_generation_evaluations_rating
  ON rag_generation_evaluations (rating);
CREATE INDEX IF NOT EXISTS idx_rag_generation_evaluations_generation_log_id
  ON rag_generation_evaluations (generation_log_id);

CREATE TABLE IF NOT EXISTS prompt_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  scene TEXT NOT NULL DEFAULT 'rag_generation',
  version TEXT NOT NULL CHECK (version IN ('v1', 'v2')),
  template TEXT NOT NULL,
  variables JSONB NOT NULL DEFAULT '["context","query"]'::jsonb,
  is_current BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (scene, version)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_prompt_templates_scene_current
  ON prompt_templates (scene)
  WHERE is_current = TRUE;

INSERT INTO prompt_templates (scene, version, template, is_current)
VALUES (
  'rag_generation',
  'v1',
  '你是企业知识助手。\n请基于以下上下文回答用户问题。\n\n上下文:\n{context}\n\n问题:\n{query}\n\n要求：回答准确、简洁、可执行。',
  TRUE
)
ON CONFLICT (scene, version) DO NOTHING;

CREATE OR REPLACE FUNCTION set_row_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_ai_runtime_config_updated_at'
  ) THEN
    CREATE TRIGGER trg_ai_runtime_config_updated_at
    BEFORE UPDATE ON ai_runtime_config
    FOR EACH ROW
    EXECUTE FUNCTION set_row_updated_at();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_rag_generation_evaluations_updated_at'
  ) THEN
    CREATE TRIGGER trg_rag_generation_evaluations_updated_at
    BEFORE UPDATE ON rag_generation_evaluations
    FOR EACH ROW
    EXECUTE FUNCTION set_row_updated_at();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_prompt_templates_updated_at'
  ) THEN
    CREATE TRIGGER trg_prompt_templates_updated_at
    BEFORE UPDATE ON prompt_templates
    FOR EACH ROW
    EXECUTE FUNCTION set_row_updated_at();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_eight_d_reports_updated_at'
  ) THEN
    CREATE TRIGGER trg_eight_d_reports_updated_at
    BEFORE UPDATE ON eight_d_reports
    FOR EACH ROW
    EXECUTE FUNCTION set_row_updated_at();
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgname = 'trg_rag_cases_updated_at'
  ) THEN
    CREATE TRIGGER trg_rag_cases_updated_at
    BEFORE UPDATE ON rag_cases
    FOR EACH ROW
    EXECUTE FUNCTION set_row_updated_at();
  END IF;
END $$;
