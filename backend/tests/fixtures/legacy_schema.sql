-- TEST FIXTURE ONLY. The table definitions the retired sql/init.sql created
-- (without its sample rows), so the tests can build a database the way
-- the old docker-compose did and prove that Alembic adopts it (0001) and then
-- drops the seven unused tables (0006). Nothing runs this outside the tests.
--

CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    title VARCHAR(255),
    department VARCHAR(255),
    role VARCHAR(64) NOT NULL DEFAULT 'firmware-lead',
    avatar_bg VARCHAR(64) DEFAULT 'from-blue-600 to-indigo-600',
    initials VARCHAR(8) DEFAULT 'MT',
    created_at TIMESTAMP
    WITH
        TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
    id VARCHAR(64) PRIMARY KEY,
    user_id VARCHAR(64) NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    expires_at TIMESTAMP
    WITH
        TIME ZONE NOT NULL,
        created_at TIMESTAMP
    WITH
        TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS incidents (
    id VARCHAR(64) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    severity VARCHAR(32) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'Investigating',
    affected_system VARCHAR(255),
    root_cause TEXT,
    owner VARCHAR(255),
    reported_date TIMESTAMP
    WITH
        TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        resolved_date TIMESTAMP
    WITH
        TIME ZONE,
        ttr_hours NUMERIC(6, 2),
        jira_ticket VARCHAR(64)
);

CREATE TABLE IF NOT EXISTS release_master (
    id VARCHAR(64) PRIMARY KEY,
    release_version VARCHAR(255) NOT NULL,
    target_release_date DATE NOT NULL,
    release_status VARCHAR(64) NOT NULL,
    jira_tickets_count INT DEFAULT 0,
    total_story_points INT DEFAULT 0,
    completed_story_points INT DEFAULT 0,
    technical_analysis_doc_id VARCHAR(64),
    technical_analysis_doc_title VARCHAR(255),
    test_report_doc_id VARCHAR(64),
    test_report_doc_title VARCHAR(255),
    release_gate_verdict VARCHAR(32) NOT NULL DEFAULT 'GO',
    signoff_owner VARCHAR(255),
    created_at TIMESTAMP
    WITH
        TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reviewers_log (
    id VARCHAR(64) PRIMARY KEY,
    doc_id VARCHAR(64) NOT NULL,
    doc_title VARCHAR(255) NOT NULL,
    doc_number VARCHAR(64) NOT NULL,
    reviewer_name VARCHAR(255) NOT NULL,
    reviewer_role VARCHAR(64) NOT NULL,
    review_status VARCHAR(32) NOT NULL DEFAULT 'APPROVED',
    review_date DATE NOT NULL,
    comments TEXT,
    created_at TIMESTAMP
    WITH
        TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS gantt_tasks (
    id VARCHAR(64) PRIMARY KEY,
    jira_key VARCHAR(32) NOT NULL,
    title VARCHAR(255) NOT NULL,
    assignee VARCHAR(255) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'To Do',
    priority VARCHAR(32) NOT NULL DEFAULT 'High',
    start_day INT NOT NULL DEFAULT 1,
    duration_days INT NOT NULL DEFAULT 5,
    progress_percent INT NOT NULL DEFAULT 0,
    category VARCHAR(64) NOT NULL DEFAULT 'Firmware',
    created_at TIMESTAMP
    WITH
        TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS documents (
    id VARCHAR(64) PRIMARY KEY,
    doc_number VARCHAR(64) NOT NULL,
    title VARCHAR(255) NOT NULL,
    subtitle VARCHAR(255),
    author VARCHAR(255),
    department VARCHAR(255),
    doc_date DATE,
    version VARCHAR(32) DEFAULT '1.0',
    classification VARCHAR(32) DEFAULT 'INTERNAL ONLY',
    status VARCHAR(32) DEFAULT 'APPROVED',
    template_type VARCHAR(64) DEFAULT 'technical-analysis',
    document_json JSONB NOT NULL,
    -- Soft delete, mirroring the app's own Doc Bin convention: the API
    -- never destroys a document, it just stops returning it.
    deleted_at TIMESTAMP
    WITH
        TIME ZONE,
        updated_at TIMESTAMP
    WITH
        TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS test_suites (
    id VARCHAR(64) PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    module VARCHAR(64) DEFAULT 'Firmware Core',
    ta_doc_id VARCHAR(64),
    ta_doc_number VARCHAR(64),
    created_at TIMESTAMP
    WITH
        TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS test_cases (
    id VARCHAR(64) PRIMARY KEY,
    suite_id VARCHAR(64) REFERENCES test_suites(id) ON DELETE CASCADE,
    custom_id VARCHAR(64) NOT NULL UNIQUE,
    title VARCHAR(255) NOT NULL,
    preconditions TEXT,
    steps JSONB NOT NULL DEFAULT '[]'::jsonb,
    expected_result TEXT,
    priority VARCHAR(16) DEFAULT 'P2',
    type VARCHAR(32) DEFAULT 'Automated',
    robot_code TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS test_runs (
    id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    suite_id VARCHAR(64) REFERENCES test_suites (id) ON DELETE CASCADE,
    environment VARCHAR(64) DEFAULT 'Staging VM',
    status VARCHAR(32) DEFAULT 'Completed',
    passed_count INT DEFAULT 0,
    failed_count INT DEFAULT 0,
    blocked_count INT DEFAULT 0,
    executed_at TIMESTAMP
    WITH
        TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
