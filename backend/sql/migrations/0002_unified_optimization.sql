-- Unified optimization: audit log + composite indexes + analytics acceleration

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  actor_role TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  resource_type TEXT NOT NULL DEFAULT '',
  resource_id TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'failed')),
  detail JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_id_created_at ON audit_logs (actor_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created_at ON audit_logs (action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_resource_created_at ON audit_logs (resource_type, resource_id, created_at DESC);

-- Composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_ai_generation_logs_scene_status_created_at
  ON ai_generation_logs (scene, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_generation_logs_user_scene_created_at
  ON ai_generation_logs (user_id, scene, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_generation_logs_duration_created_at
  ON ai_generation_logs (duration_ms, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rag_generation_evaluations_rating_created_at
  ON rag_generation_evaluations (rating, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rag_generation_evaluations_user_created_at
  ON rag_generation_evaluations (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_rag_case_chunks_case_id_chunk_index
  ON rag_case_chunks (case_id, chunk_index);
