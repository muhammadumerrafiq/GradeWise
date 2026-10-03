-- ============================================================
-- GRADEWISE DATABASE SCHEMA
-- PostgreSQL 16
-- Run automatically by Docker on first start
-- ============================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- TABLE: teachers
-- Single teacher for MVP. Schema ready for multi-user.
-- ============================================================
CREATE TABLE IF NOT EXISTS teachers (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        VARCHAR(255) NOT NULL,
    email       VARCHAR(255) UNIQUE,
    password_hash VARCHAR(255),
    api_key_hash  VARCHAR(255),          -- hashed reference, actual key in .env
    grade_scale JSONB DEFAULT '[
        {"min_pct": 90, "label": "A"},
        {"min_pct": 80, "label": "B"},
        {"min_pct": 70, "label": "C"},
        {"min_pct": 60, "label": "D"},
        {"min_pct": 0,  "label": "F"}
    ]'::jsonb,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: assignments
-- ============================================================
CREATE TABLE IF NOT EXISTS assignments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id      UUID NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
    title           VARCHAR(500) NOT NULL,
    type            VARCHAR(50)  NOT NULL
                    CHECK (type IN (
                        'essay', 'narrative', 'descriptive', 'paragraph',
                        'letter', 'report', 'creative', 'general', 'custom'
                    )),
    instructions    TEXT,
    grading_notes   TEXT,
    feedback_instructions TEXT,
    total_marks     INTEGER NOT NULL CHECK (total_marks > 0),
    grade_scale     JSONB,               -- overrides teacher default if set
    status          VARCHAR(20) NOT NULL DEFAULT 'active'
                    CHECK (status IN ('draft', 'active', 'archived')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_assignments_teacher
    ON assignments(teacher_id);
CREATE INDEX IF NOT EXISTS idx_assignments_status
    ON assignments(status);

-- ============================================================
-- TABLE: rubric_criteria
-- ============================================================
CREATE TABLE IF NOT EXISTS rubric_criteria (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id   UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    name            VARCHAR(255) NOT NULL,
    max_marks       INTEGER NOT NULL CHECK (max_marks > 0),
    description     TEXT,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rubric_assignment
    ON rubric_criteria(assignment_id);

-- ============================================================
-- TABLE: requirements
-- ============================================================
CREATE TABLE IF NOT EXISTS requirements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id   UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    description     TEXT NOT NULL,
    sort_order      INTEGER NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_requirements_assignment
    ON requirements(assignment_id);

-- ============================================================
-- TABLE: students
-- Created automatically from filenames or manual entry
-- ============================================================
CREATE TABLE IF NOT EXISTS students (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            VARCHAR(255) NOT NULL,
    section         VARCHAR(100),
    roll_number     VARCHAR(100),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_students_name
    ON students(name);

-- ============================================================
-- TABLE: submissions
-- One row per student file per assignment
-- ============================================================
CREATE TABLE IF NOT EXISTS submissions (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id       UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    student_id          UUID REFERENCES students(id) ON DELETE SET NULL,
    original_filename   VARCHAR(500) NOT NULL,
    stored_filename     VARCHAR(500) NOT NULL,   -- UUID-based name on disk
    stored_path         TEXT NOT NULL,           -- full path
    file_type           VARCHAR(10)
                        CHECK (file_type IN ('pdf', 'docx', 'doc', 'txt')),
    file_size_bytes     BIGINT,
    file_hash           VARCHAR(64),             -- SHA-256 for duplicate detection
    extracted_text      TEXT,
    word_count          INTEGER,
    detected_name       VARCHAR(255),            -- parsed from filename
    name_confidence     NUMERIC(4,3)             -- 0.000 to 1.000
                        CHECK (name_confidence >= 0 AND name_confidence <= 1),
    name_flagged        BOOLEAN NOT NULL DEFAULT FALSE,
    status              VARCHAR(30) NOT NULL DEFAULT 'pending'
                        CHECK (status IN (
                            'pending',           -- just uploaded
                            'name_pending',      -- needs name resolution
                            'extracting',        -- text extraction in progress
                            'extraction_failed', -- could not read file
                            'queued',            -- waiting for Gemini
                            'processing',        -- Gemini call in progress
                            'evaluated',         -- AI evaluation complete
                            'review_needed',     -- AI result needs manual check
                            'approved',          -- teacher approved
                            'failed'             -- permanent failure
                        )),
    error_message       TEXT,
    retry_count         INTEGER NOT NULL DEFAULT 0,
    uploaded_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_submissions_assignment
    ON submissions(assignment_id);
CREATE INDEX IF NOT EXISTS idx_submissions_student
    ON submissions(student_id);
CREATE INDEX IF NOT EXISTS idx_submissions_status
    ON submissions(status);
CREATE INDEX IF NOT EXISTS idx_submissions_hash
    ON submissions(file_hash);

-- ============================================================
-- TABLE: evaluations
-- One row per submission (one-to-one)
-- ============================================================
CREATE TABLE IF NOT EXISTS evaluations (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    submission_id       UUID NOT NULL UNIQUE
                        REFERENCES submissions(id) ON DELETE CASCADE,

    -- Scores
    total_score         INTEGER NOT NULL CHECK (total_score >= 0),
    max_score           INTEGER NOT NULL CHECK (max_score > 0),
    percentage          NUMERIC(5,2)
                        CHECK (percentage >= 0 AND percentage <= 100),
    grade_label         VARCHAR(10),

    -- Structured AI output stored as JSONB for queryability
    requirements_result JSONB,
    english_analysis    JSONB,
    strengths           JSONB,            -- ["string", "string", ...]
    improvements        JSONB,            -- ["string", "string", ...]

    -- Feedback
    ai_feedback         TEXT,             -- original Gemini output
    teacher_feedback    TEXT,             -- editable copy (starts = ai_feedback)
    teacher_notes       TEXT,             -- private, never exported

    -- Status
    eval_status         VARCHAR(20) NOT NULL DEFAULT 'pending_review'
                        CHECK (eval_status IN (
                            'pending_review',
                            'reviewed',
                            'approved'
                        )),

    -- Gemini metadata
    gemini_model        VARCHAR(100),
    prompt_tokens       INTEGER,
    completion_tokens   INTEGER,
    raw_gemini_response TEXT,             -- stored for debugging on retry/failure

    -- Timestamps
    generated_at        TIMESTAMPTZ,
    approved_at         TIMESTAMPTZ,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_evaluations_submission
    ON evaluations(submission_id);
CREATE INDEX IF NOT EXISTS idx_evaluations_status
    ON evaluations(eval_status);
CREATE INDEX IF NOT EXISTS idx_evaluations_score
    ON evaluations(total_score);

-- ============================================================
-- TABLE: criterion_scores
-- One row per rubric criterion per evaluation
-- ============================================================
CREATE TABLE IF NOT EXISTS criterion_scores (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evaluation_id   UUID NOT NULL REFERENCES evaluations(id) ON DELETE CASCADE,
    criterion_id    UUID NOT NULL REFERENCES rubric_criteria(id) ON DELETE CASCADE,
    criterion_name  VARCHAR(255) NOT NULL,  -- denormalized for query convenience
    score           INTEGER NOT NULL CHECK (score >= 0),
    max_score       INTEGER NOT NULL CHECK (max_score > 0),
    rationale       TEXT,
    evidence        TEXT,                   -- direct quote from submission
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE (evaluation_id, criterion_id)
);

CREATE INDEX IF NOT EXISTS idx_criterion_scores_evaluation
    ON criterion_scores(evaluation_id);

-- ============================================================
-- TABLE: processing_jobs
-- Tracks batch evaluation progress per assignment
-- ============================================================
CREATE TABLE IF NOT EXISTS processing_jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id   UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    status          VARCHAR(20) NOT NULL DEFAULT 'running'
                    CHECK (status IN ('running', 'paused', 'completed', 'cancelled', 'failed')),
    total_count     INTEGER NOT NULL DEFAULT 0,
    completed_count INTEGER NOT NULL DEFAULT 0,
    failed_count    INTEGER NOT NULL DEFAULT 0,
    current_name    VARCHAR(255),
    started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at    TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_processing_jobs_assignment
    ON processing_jobs(assignment_id);

-- ============================================================
-- TABLE: exports
-- Log of generated export files
-- ============================================================
CREATE TABLE IF NOT EXISTS exports (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    assignment_id   UUID NOT NULL REFERENCES assignments(id) ON DELETE CASCADE,
    export_type     VARCHAR(30) NOT NULL
                    CHECK (export_type IN (
                        'individual_pdf',
                        'individual_docx',
                        'bulk_zip_pdf',
                        'bulk_zip_docx',
                        'excel_summary',
                        'csv_summary'
                    )),
    file_path       TEXT NOT NULL,
    file_size_bytes BIGINT,
    submission_count INTEGER,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_exports_assignment
    ON exports(assignment_id);

-- ============================================================
-- TABLE: manual_sessions
-- ============================================================
CREATE TABLE IF NOT EXISTS manual_sessions (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    teacher_id            UUID REFERENCES teachers(id) ON DELETE CASCADE,
    title                 VARCHAR(500) NOT NULL,
    assignment_type       VARCHAR(50)  NOT NULL,
    instructions          TEXT,
    requirements          JSONB,
    feedback_instructions TEXT NOT NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- TABLE: manual_evaluations
-- ============================================================
CREATE TABLE IF NOT EXISTS manual_evaluations (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id              UUID NOT NULL REFERENCES manual_sessions(id) ON DELETE CASCADE,
    student_name            VARCHAR(255) NOT NULL,
    submission_text         TEXT NOT NULL,
    word_count              INTEGER,
    requirements_result     JSONB,
    writing_quality_summary TEXT,
    strengths               JSONB,
    improvements            JSONB,
    ai_feedback             TEXT,
    teacher_feedback        TEXT,
    gemini_model            VARCHAR(100),
    status                  VARCHAR(20) NOT NULL DEFAULT 'complete'
                            CHECK (status IN ('processing', 'complete', 'failed')),
    error_message           TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_manual_evaluations_session
    ON manual_evaluations(session_id);

-- ============================================================
-- TABLE: app_settings
-- Single-row settings table (key-value for flexibility)
-- ============================================================
CREATE TABLE IF NOT EXISTS app_settings (
    key     VARCHAR(100) PRIMARY KEY,
    value   TEXT,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- FUNCTIONS & TRIGGERS
-- Auto-update updated_at timestamps
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to all tables with updated_at
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'teachers', 'assignments', 'submissions',
        'evaluations', 'criterion_scores', 'processing_jobs',
        'manual_sessions', 'manual_evaluations'
    ]
    LOOP
        EXECUTE format(
            'DROP TRIGGER IF EXISTS trg_%s_updated_at ON %s;
             CREATE TRIGGER trg_%s_updated_at
             BEFORE UPDATE ON %s
             FOR EACH ROW EXECUTE FUNCTION update_updated_at();',
            t, t, t, t
        );
    END LOOP;
END;
$$;

-- ============================================================
-- VIEW: submission_summary
-- Convenient join for results dashboard queries
-- ============================================================
CREATE OR REPLACE VIEW submission_summary AS
SELECT
    s.id                    AS submission_id,
    s.assignment_id,
    s.original_filename,
    s.word_count,
    s.status                AS submission_status,
    s.name_flagged,
    s.uploaded_at,

    st.id                   AS student_id,
    st.name                 AS student_name,
    st.section,

    e.id                    AS evaluation_id,
    e.total_score,
    e.max_score,
    e.percentage,
    e.grade_label,
    e.eval_status,
    e.teacher_feedback,
    e.generated_at,
    e.approved_at

FROM submissions s
LEFT JOIN students st       ON s.student_id = st.id
LEFT JOIN evaluations e     ON e.submission_id = s.id;

-- ============================================================
-- VIEW: assignment_stats
-- Quick stats per assignment for dashboard
-- ============================================================
CREATE OR REPLACE VIEW assignment_stats AS
SELECT
    a.id                        AS assignment_id,
    a.title,
    a.type,
    a.total_marks,
    a.status,
    a.created_at,
    COUNT(s.id)                 AS total_submissions,
    COUNT(s.id) FILTER (
        WHERE s.status = 'approved'
    )                           AS approved_count,
    COUNT(s.id) FILTER (
        WHERE e.eval_status = 'pending_review'
        AND s.status = 'evaluated'
    )                           AS pending_review_count,
    COUNT(s.id) FILTER (
        WHERE s.status = 'failed'
        OR s.status = 'extraction_failed'
    )                           AS error_count,
    ROUND(AVG(e.percentage), 1) AS avg_percentage,
    MIN(e.total_score)          AS min_score,
    MAX(e.total_score)          AS max_score

FROM assignments a
LEFT JOIN submissions s     ON s.assignment_id = a.id
LEFT JOIN evaluations e     ON e.submission_id = s.id
GROUP BY a.id;

-- ============================================================
-- SEED: Default teacher (update credentials in Settings)
-- ============================================================
INSERT INTO teachers (name, email)
VALUES ('Teacher', 'teacher@gradewise.local')
ON CONFLICT DO NOTHING;

-- ============================================================
-- SEED: Default app settings
-- ============================================================
INSERT INTO app_settings (key, value) VALUES
    ('app_version',          '1.0.0'),
    ('max_concurrent_evals', '3'),
    ('auto_delete_days',     '30'),
    ('default_export_format','pdf')
ON CONFLICT (key) DO NOTHING;
