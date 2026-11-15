# Software Requirements Specification: Dev-doc Studio

Converted on 14 Nov 2026 from `Software Requirements specificatios-DevdocStudio.numbers`
(the original, kept beside this file). Requirement wording is copied from the original
unchanged, including its typos. The original is the source of truth; this copy exists so
the requirements can be read and searched without Numbers.

**How it was converted.** Numbers files cannot be opened with the tools available, so the
text was decoded straight from the file. Two things could not be recovered that way:

- The **Req type**, **Req classification** and **Verification method** columns. The file
  holds their drop-down lists, but the decoded text does not say which row uses which value.
  They are left out.
- The **Module** column is per row. It comes from the Gap Analysis workbook that was
  written from this file (now removed from `docs/planning/`), not from the decoded text.
  If a module looks wrong, trust the original.

Product name: **Dev-doc Studio**. 80 requirement IDs exist. 001–046 and 071–076 have text;
047–070 and 077–080 are empty rows in the original.

## Functional requirements

### Document editor and application shell

| ID | Module | Requirement |
|---|---|---|
| DDS-SRS-001 | Document editor | As an user, I shall be able to see the list of documents which are currently in progress, able to select and view it in the editor |
| DDS-SRS-002 | Document editor | As an user, I shall be able to edit only my documents |
| DDS-SRS-003 | Document editor | As an admin, I shall be able to view list the documents, able to select and view it in the editor |
| DDS-SRS-004 | Document editor | As an admin, I shall be able to edit all the documents |
| DDS-SRS-005 | UI | After the login, dashboard shall be the landing page, that populates data like, todal number of documents created, total approved documents, documents under review, Google drive upload status |
| DDS-SRS-006 | Document editor | Application shall provide an menu option in a sidebar to launch the document editor |
| DDS-SRS-007 | Document editor | Application shall implements a sidebar menu option to launch doc editor, data management, code editor |
| DDS-SRS-008 | Database / UI | Application shall resticts the database management access to only admins |
| DDS-SRS-009 | Document editor | As an user, I shall be able to save the created document local to application instance and able to view it in the Vscode projects folder |
| DDS-SRS-010 | Document editor | As an user, I shall be able to download the document from DocStudio |
| DDS-SRS-011 | UI | As an admin, I shall be able to view the user active status like the active session timings as an audit log |

### Test manager

| ID | Module | Requirement |
|---|---|---|
| DDS-SRS-012 | Test manager | Test manager shall support hierarchical structure (Projects → Suites → Sections/Sub-sections → Test Cases). |
| DDS-SRS-013 | Test manager | Test case details: Each test case must contain: Unique ID (auto-generated, e.g., TC-104). Title, Pre-conditions, Type (Automated/Manual), Priority (Low, Medium, High, Critical). Detailed Steps (Step Description, Expected Result). Post-conditions & Attachments (screenshots, log files). |
| DDS-SRS-014 | Test manager | Tool shall provide option to Track revision history for test case modifications. |
| DDS-SRS-015 | Test manager | Support shall be available to Import/Export test cases in CSV, XML, and JSON formats. |
| DDS-SRS-016 | Test manager | Test Run Creation: Users can create a Test Run by selecting specific test cases or entire suites/sub-sections. |
| DDS-SRS-017 | Test manager | Manual Execution: Testers can update individual test case statuses within a run (Passed, Failed, Blocked, Retest, Untested, Skipped). |
| DDS-SRS-018 | Test manager | Defect Integration: Option to attach issue IDs (e.g., Jira, GitHub Issues) to failed test results. |
| DDS-SRS-019 | Test manager | Server Configuration: Ability to register remote execution test servers with API Endpoint URL, Auth Credentials (API Key/OAuth/Basic), and Payload parameters. |
| DDS-SRS-020 | Test manager | Triggering Runs: Trigger remote test execution directly from the web interface via REST API. |
| DDS-SRS-021 | Test manager | Polling Service: The backend background worker service must poll the remote server API periodically (configurable interval, e.g., every 5, 10, or 30 seconds). Fetch job status (e.g., QUEUED, RUNNING, COMPLETED, FAILED). Parse test completion metrics: total tests, completed count, passed count, failed count, and execution percentage ((Completed / Total) * 100). |
| DDS-SRS-022 | Test manager | Real-time UI Update: Push live updates to the UI without requiring full page refresh. |
| DDS-SRS-023 | Test manager | Metrics Dashboard: Display visual progress indicators (completion %, donut charts for pass/fail distribution, velocity trend graphs). |
| DDS-SRS-024 | Test manager | Test Summary Reports: Generate downloadable reports (PDF, HTML, CSV) summarizing test execution results. - If possible, follow a template |
| DDS-SRS-025 | Test manager | Historical Trends: Compare past test runs against current runs to detect regressions. |
| DDS-SRS-026 | Test manager | Tool shall support to run tests at local, CI/CD |
| DDS-SRS-027 | Test manager | Tool shall integrates Jenkins, bitbucket for CI/CD based testing |
| DDS-SRS-028 | Test manager | Tool shall provide option to make scheduled run |
| DDS-SRS-029 | Test manager | Tool shall integrates an code editor & support AI tool for test case generation and test script development |
| DDS-SRS-030 | Test manager | Tool shall support to connect existing code |
| DDS-SRS-031 | Test manager | User shall be able to access manual test cases, automated test cases and test report for the test run shall be combined and a consolidated report can be generated |
| DDS-SRS-032 | Test manager | Tooll shall provide option to share the requirements, technical documents, test cases to AI enabled code editor environment to generate test cases/ scripts |

### Release management

| ID | Module | Requirement |
|---|---|---|
| DDS-SRS-033 | Release Management | Tool shall provide option to Creates releases, approves RC-to-Final transitions, overrides gate criteria, and issues final sign-offs. |
| DDS-SRS-034 | Release Management | Releases shall be linked to Test Runs to release candidates, logs blocking defects, and updates verification status. |
| DDS-SRS-035 | Release Management | Option to registers build artifacts (RC/Final image checksums, URLs). |
| DDS-SRS-036 | Release Management | User shall be able to views release status, completion metrics, and release notes. |
| DDS-SRS-037 | Release Management | Users can create a new Release with attributes: Release Version (e.g., v2.4.0). Release Type (Major, Minor, Patch, Hotfix). Target Date & Customer Segment/Tenant. Status (Planned, In Progress, RC Frozen, Approved, Deployed, Cancelled) |
| DDS-SRS-038 | Release Management | Support phase milestones: Code Freeze, RC Build Generation, QA Regression Window, Final Sign-off, and General Availability (GA). |
| DDS-SRS-039 | Release Management | Ability to register multiple sequential Release Candidate builds (e.g., v2.4.0-RC100, v2.4.0-RC101) per release. |
| DDS-SRS-040 | Release Management | Track image details for each RC and Final build: Image Name / Tag (e.g., registry.example.com/app:v2.4.0-rc1). Commit SHA / Branch tag. Download URL / Artifact Repository location (Artifactory, Nexus, AWS ECR). Cryptographic Checksum (SHA-256). Build Timestamp and CI/CD Pipeline Build ID. |
| DDS-SRS-041 | Release Management | A specific RC image can be designated and promoted to Final Image status once all exit criteria are met |
| DDS-SRS-042 | Release Management | Link single or multiple Test Runs directly to specific RC images to measure test coverage. |
| DDS-SRS-043 | Release Management | Automatic evaluation of release readiness based on customizable rules: Minimum pass rate threshold (e.g., Pass Rate > 98%). Zero open Critical or Blocker defects. 100 % execution completion of designated Mandatory Regression Test Suites |
| DDS-SRS-044 | Release Management | Link Jira/GitHub issues marked as release blockers. |
| DDS-SRS-045 | Release Management | Require multi-role electronic sign-offs (e.g., QA Lead, Dev Lead, Product Owner) before promoting an RC to Final. |
| DDS-SRS-046 | Release Management | Record immutable audit logs for build promotions, status changes, gate overrides, and sign-offs. |

## Non-functional requirements

| ID | Requirement |
|---|---|
| DDS-SRS-071 | UI response time for navigation must be under 1.5 seconds. |
| DDS-SRS-072 | The polling service must support tracking at least 100 concurrent test runs without performance degradation. |
| DDS-SRS-073 | Database query responses for fetching test suites with 5,000+ cases must complete within < 500ms using indexing. |
| DDS-SRS-074 | Data in transit must be encrypted via HTTPS/TLS 1.3. |
| DDS-SRS-075 | API key storage for external test servers must be encrypted at rest (AES-256). |
| DDS-SRS-076 | Authentication supporting JWT tokens and OAuth2/SSO integration. |

## Empty rows in the original

DDS-SRS-047 to 070 and DDS-SRS-077 to 080 have an ID and no text.

## What the original does not mention

Searched the whole decoded file for: incident, RCA, root cause, problem, outage, ticket,
post-mortem, severity, alert, escalation, landing hub, hub, home, overview.
**No match** for any of them. The nearest words are "defect" (requirements 018, 034 and
043: failed test results and release blockers) and "bug fixes" (in the template text),
which are not about incidents.

The template text on the second sheet (categories such as "Security", "Capacity",
"Maintainability") is the generic SRS template the table was started from; it holds no
requirements of its own.
