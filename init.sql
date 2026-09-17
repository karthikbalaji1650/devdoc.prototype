-- ==========================================================
-- Engineering Platform Suite: PostgreSQL Database Schema
-- Database: platform_db
-- ==========================================================

-- 1. Users & Authentication Table
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

-- Seed Initial Demo Users
INSERT INTO
    users (
        id,
        name,
        email,
        password_hash,
        title,
        department,
        role,
        avatar_bg,
        initials
    )
VALUES (
        'usr-01',
        'Manivannan Thangavel',
        'manivannan_thangavel@sanmina.com',
        '$2a$12$e8Ym...demo',
        'SW Engg Manager',
        'Platform Systems Engineering',
        'firmware-lead',
        'from-blue-600 to-indigo-600',
        'MT'
    ),
    (
        'usr-02',
        'Vaishnavi Aasaithambi',
        'vaishnavi.aasaithambi@sanmina.com',
        '$2a$12$e8Ym...demo',
        'Technical Lead',
        'Platform Systems Engineering',
        'technical-lead',
        'from-purple-600 to-pink-600',
        'SC'
    ),
    (
        'usr-03',
        'Aravind Samivel',
        'aravind.samivel@sanmina.com',
        '$2a$12$e8Ym...demo',
        'Senior Engineer',
        'Platform Systems Engineering',
        'senior-engineer',
        'from-emerald-600 to-teal-600',
        'AR'
    ) ON CONFLICT (id) DO NOTHING;

-- 2. Option 1: Incidents & RCA Table
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

INSERT INTO
    incidents (
        id,
        title,
        severity,
        status,
        affected_system,
        root_cause,
        owner,
        reported_date,
        resolved_date,
        ttr_hours,
        jira_ticket
    )
VALUES (
        'INC-2026-0813',
        'Dual-Flash Image Upload Halt on Rev 13.03 during WebUI flash',
        'P2 - Critical',
        'Resolved',
        'WebUI HPM Flashing / spx_restservice',
        'Missing preserve_config parameter in initial HTTPS payload caused backend daemon to reject preparation request.',
        'Mani Thangavel',
        '2026-08-13 14:15:00+00',
        '2026-08-13 18:20:00+00',
        4.10,
        'WH3-1205'
    ),
    (
        'INC-2026-0810',
        'Sensor reading telemetry timeout under 100+ concurrent WebUI sessions',
        'P3 - Major',
        'Resolved',
        'AST2600 REST Sensor Daemon',
        'HTTP polling frequency induced high CPU load; mitigated by increasing client cache interval.',
        'Sarah Chen',
        '2026-08-10 09:30:00+00',
        '2026-08-10 16:45:00+00',
        7.25,
        'WH3-1180'
    ),
    (
        'INC-2026-0801',
        'IPMI cipher suite 0 vulnerability detection in cybersecurity scan',
        'P1 - Blocker',
        'Resolved',
        'IPMI RMCP+ Authentication Daemon',
        'Legacy cipher suite 0 was enabled by default in default flash image configuration.',
        'David Rodriguez',
        '2026-08-01 11:00:00+00',
        '2026-08-01 15:30:00+00',
        4.50,
        'WH3-1150'
    ) ON CONFLICT (id) DO NOTHING;

-- 3. Option 2: JIRA Releases & Release Master Table
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

INSERT INTO
    release_master (
        id,
        release_version,
        target_release_date,
        release_status,
        jira_tickets_count,
        total_story_points,
        completed_story_points,
        technical_analysis_doc_id,
        technical_analysis_doc_title,
        test_report_doc_id,
        test_report_doc_title,
        release_gate_verdict,
        signoff_owner
    )
VALUES (
        'rel-13-03-01',
        'BMC Firmware Revision 13.03.01 (Security & Fix Patch)',
        '2026-08-16',
        'Approved for GA',
        4,
        16,
        16,
        'wh3-1205-sample',
        'WH3-1205: WebUI HPM Firmware Upgrade Failure Investigation & Fix',
        'tr-2026-qa-sample',
        'TR-2026-0813: Firmware Security & REST API Test Execution Report',
        'GO',
        'Mani Thangavel (Staff Architect) & David Rodriguez (QA Lead)'
    ),
    (
        'rel-13-04-00',
        'BMC Firmware Revision 13.04.00 (WebSocket Streaming GA)',
        '2026-09-01',
        'Planning',
        8,
        34,
        12,
        'adr-0042',
        'ADR 0042: Migration from REST Polling to WebSocket State Streaming',
        'test-case-matrix-2026',
        'TM-2026-AST2600: Platform Firmware & REST API Test Management Matrix',
        'PENDING_QA',
        'Sarah Chen (Release Lead)'
    ) ON CONFLICT (id) DO NOTHING;

-- 4. Option 3: Document Reviewers Log Table
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

INSERT INTO
    reviewers_log (
        id,
        doc_id,
        doc_title,
        doc_number,
        reviewer_name,
        reviewer_role,
        review_status,
        review_date,
        comments
    )
VALUES (
        'rev-01',
        'wh3-1205-sample',
        'WebUI HPM Firmware Upgrade Failure Investigation & Fix',
        'WH3-1205',
        'Dr. Arthur Vance',
        'Lead Architect',
        'APPROVED',
        '2026-08-14',
        'C backend explicit (INT8U) casting and preserve_config JSON payload verified. Architecture changes approved.'
    ),
    (
        'rev-02',
        'wh3-1205-sample',
        'WebUI HPM Firmware Upgrade Failure Investigation & Fix',
        'WH3-1205',
        'David Rodriguez',
        'Security Officer',
        'APPROVED',
        '2026-08-14',
        'Cybersecurity fuzzing tests passed with 0 memory leaks. Flag creation permissions verified.'
    ),
    (
        'rev-03',
        'wh3-1205-sample',
        'WebUI HPM Firmware Upgrade Failure Investigation & Fix',
        'WH3-1205',
        'Sarah Chen',
        'QA Director',
        'APPROVED',
        '2026-08-15',
        'PVT3 dual-image regression validation passed on hardware testbench.'
    ) ON CONFLICT (id) DO NOTHING;

-- 5. Option 4: Project Tasks & Gantt Chart Table
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

INSERT INTO
    gantt_tasks (
        id,
        jira_key,
        title,
        assignee,
        status,
        priority,
        start_day,
        duration_days,
        progress_percent,
        category
    )
VALUES (
        'tsk-01',
        'WH3-1205',
        'Dual-Flash HPM REST upgrade investigation & C backend fix',
        'Mani Thangavel',
        'Done',
        'Highest',
        1,
        5,
        100,
        'Firmware'
    ),
    (
        'tsk-02',
        'WH3-1206',
        'WebUI preserve_config payload validation & test scripts',
        'Firmware Team',
        'Done',
        'High',
        4,
        4,
        100,
        'REST API'
    ),
    (
        'tsk-03',
        'WH3-1210',
        'Dual-Image Bank switching stress & power-cycle verification',
        'Sarah Chen',
        'In Review',
        'High',
        8,
        6,
        90,
        'QA & Testing'
    ),
    (
        'tsk-04',
        'WH3-1214',
        'Cybersecurity REST API Fuzzing test execution & sign-off',
        'David Rodriguez',
        'Done',
        'Medium',
        11,
        4,
        100,
        'Security'
    ) ON CONFLICT (id) DO NOTHING;

-- 6. DocCraft Saved Documents Table
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
    updated_at TIMESTAMP
    WITH
        TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ==========================================================
-- 7. Option 5: Test Case Management (TestRail Alternative)
-- ==========================================================

-- Test Suites Table
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

INSERT INTO
    test_suites (
        id,
        title,
        description,
        module,
        ta_doc_id,
        ta_doc_number
    )
VALUES (
        'suite-01',
        'AST2600 RTC Clock & Timing Suite',
        'Verification of RTC drift, NTP synchronization, and low-level I2C register integrity.',
        'Firmware Core',
        'wh3-1205-sample',
        'WH3-1205'
    ),
    (
        'suite-02',
        'Dual-Flash WebUI Upgrade & REST API Suite',
        'End-to-end HPM flashing, image bank switching, and REST endpoint payload validation.',
        'REST API & WebUI',
        'wh3-1205-sample',
        'WH3-1205'
    ) ON CONFLICT (id) DO NOTHING;

-- Test Cases Table (TestRail Fields + Robot Script)
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

INSERT INTO
    test_cases (
        id,
        suite_id,
        custom_id,
        title,
        preconditions,
        steps,
        expected_result,
        priority,
        type,
        robot_code
    )
VALUES (
        'tc-01',
        'suite-01',
        'TC-RTC-001',
        'RTC Clock Drift Verification under 1-Hour Load',
        'AST2600 BMC powered ON, NTP sync disabled',
        '[{"step": 1, "action": "Read initial RTC epoch timestamp via IPMI", "expected": "Returns valid epoch timestamp"}, {"step": 2, "action": "Apply 100% CPU stress load on AST2600 for 60 minutes", "expected": "Stress test completes without kernel panic"}, {"step": 3, "action": "Compare RTC clock against external PTP reference", "expected": "Total drift is <= 50ms"}]',
        'RTC drift remains under 50ms threshold',
        'P1',
        'Automated',
        '*** Settings ***
Documentation     RTC Clock Drift Verification under 1-Hour Load
Library           RequestsLibrary
Library           SSHLibrary

*** Test Cases ***
TC_RTC_001_Clock_Drift_Verification
    [Documentation]    Ensures RTC drift does not exceed 50ms.
    [Tags]             P1    Firmware    RTC
    Given BMC System Is Operational    192.168.1.100
    When Apply Stress Load For 60 Minutes
    Then Verify RTC Drift Is Less Than    50    ms'
    ),
    (
        'tc-02',
        'suite-02',
        'TC-HPM-002',
        'Dual-Flash HPM Image Upload with preserve_config Flag',
        'Secondary SPI Flash active, WebUI admin logged in',
        '[{"step": 1, "action": "POST /api/v1/system/firmware/upload with preserve_config=true", "expected": "HTTP 200 OK with session ID"}, {"step": 2, "action": "Execute flash bank switch command", "expected": "Flash daemon writes image to inactive bank"}, {"step": 3, "action": "Reboot BMC and verify active flash bank", "expected": "System boots from primary bank with preserved network config"}]',
        'Firmware image flashes successfully and retains IP settings',
        'P1',
        'Automated',
        '*** Settings ***
Documentation     Dual-Flash HPM Image Upload Validation
Library           RequestsLibrary

*** Test Cases ***
TC_HPM_002_Preserve_Config_Flash
    [Documentation]    Validates preserve_config parameter in HPM upload payload.
    [Tags]             P1    REST_API    Firmware
    ${headers}=    Create Dictionary    Content-Type=application/json
    ${body}=       Create Dictionary    preserve_config=${TRUE}    image_bank=inactive
    ${resp}=       POST On Session    bmc    /api/v1/system/firmware/upload    json=${body}    headers=${headers}
    Should Be Equal As Strings    ${resp.status_code}    200'
    ) ON CONFLICT (id) DO NOTHING;

-- Test Runs & Executions Table
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

INSERT INTO
    test_runs (
        id,
        name,
        suite_id,
        environment,
        status,
        passed_count,
        failed_count,
        blocked_count
    )
VALUES (
        'run-01',
        'v13.03.01 Patch Regression Run',
        'suite-01',
        'Hardware-in-the-Loop VM',
        'Completed',
        12,
        1,
        0
    ),
    (
        'run-02',
        'AST2600 RTC Stress Burn-in',
        'suite-02',
        'AST2600 Staging Hardware',
        'Completed',
        8,
        0,
        0
    ) ON CONFLICT (id) DO NOTHING;