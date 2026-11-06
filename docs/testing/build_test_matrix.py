"""Writes docs/testing/srs-test-matrix.md: for each SRS requirement, the tests
that check it, by level. Every test named here is looked up in the code; the
script fails if one does not exist, so the matrix cannot cite a test that
is not there.

    python3 docs/testing/build_test_matrix.py
"""

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
# The last full run of each suite (update after running them).
RUNS = {"backend": 327, "skipped": 13, "unit": 227, "browser": 87}
B, U, E = "backend/tests/", "frontend/src/", "frontend/e2e/"

# id: (unit tests, backend API tests, browser tests, verified?, note)
# A test is "file::name fragment"; the fragment must appear in that file.
M: dict[int, tuple[list[str], list[str], list[str], bool, str]] = {
    1: ([U + "services/permissions.test.ts::shows non-admins only in-progress documents"],
        [B + "test_documents.py::test_a_non_admin_only_sees_in_progress_documents"],
        [E + "app.spec.ts::non-admins only see documents that are still in progress"], True, ""),
    2: ([U + "services/permissions.test.ts::blocks a different non-admin user"],
        [B + "test_documents.py::test_refuses_to_let_someone_else_edit_it"],
        [E + "documents-srs.spec.ts::002: a non-admin cannot edit a document someone else wrote",
         E + "documents-srs.spec.ts::002: the same user can edit their own document"], True, ""),
    3: ([U + "services/permissions.test.ts::shows admins every document"],
        [B + "test_documents.py::test_an_admin_sees_every_document"],
        [E + "documents-srs.spec.ts::003: an admin sees documents in every status"], True, ""),
    4: ([U + "services/permissions.test.ts::lets an admin edit any document"],
        [B + "test_documents.py::test_lets_an_admin_edit_any_document_and_keep_its_author"],
        [E + "documents-srs.spec.ts::004: an admin edits a document someone else wrote"], True, ""),
    5: ([U + "services/documentStats.test.ts::is not approved until every reviewer has approved",
         U + "services/googleDriveStatusService.test.ts::returns the most recent export as latest"],
        [B + "test_collections.py::test_"],
        [E + "app.spec.ts::cards count distinct documents and agree with Recent Activity",
         E + "documents-srs.spec.ts::005: the dashboard shows the latest Google Drive upload"], True, ""),
    6: ([], [], [E + "app.spec.ts::is debounced, then saved to the server"], True, "Every editor test opens it from the sidebar entry."),
    7: ([], [], [E + "app.spec.ts::an admin gets a Data Management sidebar entry",
                 E + "test-management-srs.spec.ts::029: the Coder screen embeds the code editor"], True, ""),
    8: ([U + "services/permissions.test.ts::is admin-only"],
        [B + "test_admin.py::test_admins_only", B + "test_admin.py::test_reset_needs_the_exact_confirmation"],
        [E + "app.spec.ts::cannot reach data management", E + "app.spec.ts::an admin downloads a backup of the server"], True, ""),
    9: ([], [], [E + "documents-srs.spec.ts::009: the document is saved into the code editor",
                 E + "documents-srs.spec.ts::009: without the bridge"], True,
        "Fixed 6 Nov: the Export options menu ignored mouse clicks (since 17 Sep), so this action did not work."),
    10: ([U + "exporters/googleDocsExport.test.ts::"], [],
         [E + "documents-srs.spec.ts::010: Export Word downloads a .docx", E + "documents-srs.spec.ts::010: Save Draft Project downloads"], True,
         "Google Docs export tested against a simulated Google API. JSON download was broken by the menu bug until 6 Nov."),
    11: ([], [B + "test_session_audit.py::test_logins_and_logouts_are_recorded_newest_first",
              B + "test_session_audit.py::test_needs_a_session_and_an_admin"],
         [E + "session-audit.spec.ts::an admin sees real sign-ins from other browsers"], True, ""),
    12: ([U + "services/testSections.test.ts::nests sub-sections under their parent"],
         [B + "test_test_management.py::test_a_sub_section_needs_a_parent_in_the_same_suite",
          B + "test_test_management.py::test_snapshot_lists_projects"],
         [E + "test-management.spec.ts::suites are grouped by project",
          E + "test-management.spec.ts::a sub-section holds its own cases"], True, ""),
    13: ([U + "services/testCaseIds.test.ts::starts at TC-001", U + "services/testCasePriority.test.ts::"],
         [B + "test_test_management.py::test_saved_under_the_new_names_and_old_ones_are_converted"],
         [E + "test-management.spec.ts::a new case gets a sequential TC id",
          E + "test-management-srs.spec.ts::013: a case keeps every field the SRS lists"], True, ""),
    14: ([], [B + "test_test_management.py::test_every_change_is_a_revision_newest_first"],
         [E + "test-management.spec.ts::an edit becomes a revision"], True, ""),
    15: ([U + "services/testCaseExchange.test.ts::keeps every portable field"], [],
         [E + "test-management.spec.ts::and importing the file back adds copies", E + "test-management.spec.ts::a malformed file is rejected"], True, ""),
    16: ([U + "services/runCaseSelection.test.ts::"], [],
         [E + "test-management.spec.ts::a run can be made from a whole section, or from a filter"], True, ""),
    17: ([], [B + "test_test_management.py::test_owner_rules"],
         [E + "test-management-srs.spec.ts::017: each manual execution status"], True, ""),
    18: ([], [], [E + "test-management.spec.ts::issue IDs can be linked to a failed result and persist"], True, ""),
    19: ([U + "services/testServersApiService.test.ts::creates with POST and updates with PUT"],
         [B + "test_test_servers.py::test_admin_registers_a_server_and_the_secret_is_never_returned",
          B + "test_test_servers.py::test_oauth2_client_credentials"],
         [E + "test-servers.spec.ts::an admin registers, tests, edits and deletes a test server"], True, ""),
    20: ([U + "services/remoteExecutionService.test.ts::sends the run to a registered test server"],
         [B + "test_remote_runs.py::test_starts_the_run_on_the_server_with_credentials_and_payload"],
         [E + "remote-test-execution.spec.ts::Run Test sends the suite to a registered test server"], False,
         "Against a simulated test PC; no real test PC implements docs/test-pc-api.md yet."),
    21: ([], [B + "test_remote_runs.py::test_running_progress_is_stored_and_read_without_calling_the_server",
              B + "test_remote_runs.py::test_polls_on_the_servers_interval",
              B + "test_remote_runs.py::test_server_errors_are_retried_then_the_run_fails"],
         [E + "remote-test-execution.spec.ts::Run Test sends the suite to a registered test server"], False, "Against a simulated test PC."),
    22: ([U + "services/remoteExecutionService.test.ts::follows pushed status events, with no polling"],
         [B + "test_remote_runs.py::test_event_stream_pushes_each_change_until_the_run_finishes"],
         [E + "remote-test-execution.spec.ts::Run Test sends the suite to a registered test server"], True, ""),
    23: ([U + "services/runTrends.test.ts::sums executed cases per local day"], [],
         [E + "trends.spec.ts::Reports shows execution velocity and the pass-rate trend",
          E + "test-management-srs.spec.ts::023: a run shows a pass/fail donut and its pass %"], True, ""),
    24: ([U + "services/testRunReport.test.ts::HTML report carries the template sections"], [],
         [E + "test-management.spec.ts::a run downloads as CSV and HTML"], True, "PDF is the browser's print of the HTML report."),
    25: ([U + "services/runComparison.test.ts::classifies every case"], [],
         [E + "test-management.spec.ts::a run is compared with the suite"], True, ""),
    26: ([], [B + "test_ci.py::test_uploading_output_xml_records_a_completed_run"],
         [E + "ci.spec.ts::a CI token records pipeline results as a test run"], False, "Not run in a real CI pipeline."),
    27: ([], [B + "test_ci.py::test_a_pipeline_triggers_a_run_and_waits_for_its_outcome"],
         [E + "ci.spec.ts::a CI token records pipeline results as a test run"], False,
         "ci/devdoc-ci.sh was run with Jenkins and Bitbucket variables against a local API; never in real Jenkins or Bitbucket."),
    28: ([], [B + "test_schedules.py::test_a_due_schedule_starts_a_run_that_the_worker_completes"],
         [E + "remote-test-execution.spec.ts::a scheduled run fires on the server"], True, ""),
    29: ([U + "services/aiTestCaseGeneratorService.test.ts::uses the built-in generator", U + "components/coder/CoderView.test.ts::"],
         [B + "test_ai.py::test_"],
         [E + "test-management-srs.spec.ts::029: Generate via AI adds test cases",
          E + "test-management-srs.spec.ts::029: the Coder screen embeds the code editor"], False,
         "Built-in generator only; no Gemini or OpenAI key used. The editor's AI agent (Cline) is installed by hand."),
    30: ([], [B + "test_repos.py::test_connect_clones_with_the_token_as_a_header"],
         [E + "repos.spec.ts::a repository is connected, pulled and removed"], True, "Real git clone and pull through the real file bridge."),
    31: ([U + "services/testRunReport.test.ts::HTML splits results by type"], [],
         [E + "test-management.spec.ts::a run is compared with the suite"], True, ""),
    32: ([], [], [E + "test-management-srs.spec.ts::032: a suite is sent to the code editor",
                  E + "documents-srs.spec.ts::009: the document is saved into the code editor"], True, ""),
    33: ([], [B + "test_releases.py::test_create_with_all_attributes_and_default_milestones",
              B + "test_releases.py::test_override_needs_a_reason_and_a_manager",
              B + "test_releases.py::test_promotion_needs_gates_and_every_signoff"],
         [E + "release-master.spec.ts::a release manager takes an RC from registration to Final"], True, ""),
    34: ([], [B + "test_releases.py::test_gates_are_evaluated_from_linked_runs_and_blockers",
              B + "test_releases.py::test_034_a_build_without_linked_runs_is_pending"],
         [E + "release-master.spec.ts::a release manager takes an RC from registration to Final"], True, ""),
    35: ([], [B + "test_releases.py::test_checksum_commit_and_url_are_checked", B + "test_releases.py::test_040_every_image_detail_is_stored"],
         [E + "release-master.spec.ts::a release manager takes an RC from registration to Final"], True, ""),
    36: ([], [B + "test_releases.py::test_036_metrics_follow_the_release"],
         [E + "release-master.spec.ts::a release manager takes an RC from registration to Final"], True, ""),
    37: ([], [B + "test_releases.py::test_create_with_all_attributes_and_default_milestones", B + "test_releases.py::test_validation"],
         [E + "release-master.spec.ts::a release manager takes an RC from registration to Final"], True, ""),
    38: ([], [B + "test_releases.py::test_milestones_keep_their_dates"],
         [E + "release-master.spec.ts::a release manager takes an RC from registration to Final"], True, ""),
    39: ([], [B + "test_releases.py::test_sequential_rc_builds_with_image_details"],
         [E + "release-master.spec.ts::a release manager takes an RC from registration to Final"], True, ""),
    40: ([], [B + "test_releases.py::test_040_every_image_detail_is_stored"],
         [E + "release-master.spec.ts::a release manager takes an RC from registration to Final"], True, ""),
    41: ([], [B + "test_releases.py::test_promotion_needs_gates_and_every_signoff"],
         [E + "release-master.spec.ts::a release manager takes an RC from registration to Final"], True, ""),
    42: ([], [B + "test_releases.py::test_042_coverage_is_the_share_of_linked_results_executed"],
         [E + "release-master.spec.ts::a release manager takes an RC from registration to Final"], True, ""),
    43: ([], [B + "test_releases.py::test_pass_rate_and_mandatory_suites", B + "test_releases.py::test_gates_are_evaluated_from_linked_runs_and_blockers"],
         [E + "release-master.spec.ts::a release manager takes an RC from registration to Final"], True, ""),
    44: ([], [B + "test_trackers.py::test_sync_imports_matching_issues_and_feeds_the_gate",
              B + "test_trackers.py::test_jira_server_uses_api_v2_and_a_bearer_token"],
         [E + "trackers.spec.ts::release blockers are read from Jira by query and by key"], False, "Against simulated Jira and GitHub."),
    45: ([], [B + "test_releases.py::test_only_the_assigned_user_signs_off_a_role"],
         [E + "release-master.spec.ts::a release manager takes an RC from registration to Final"], True, ""),
    46: ([], [B + "test_releases.py::test_records_every_release_action_in_order", B + "test_releases.py::test_tampering_is_detected"],
         [E + "release-master.spec.ts::a release manager takes an RC from registration to Final"], True, ""),
    71: ([], [], [E + "navigation-perf.spec.ts::"], True, "Measured on a production build on the development machine."),
    72: ([], [B + "test_remote_runs.py::test_tracks_100_concurrent_runs_within_one_tick"], [], False,
         "Measured in-process against a simulated test server, not real lab load."),
    73: ([], [], [E + "test-management-perf.spec.ts::"], True, "Measured on the development machine."),
    74: ([], [], [], False, "Checked by hand on a throwaway Docker stack (self-signed certificate): TLS 1.3 negotiated, TLS 1.2 refused, HTTP redirected, Secure cookie, browser sign-in. No automated test; no real deployment."),
    75: ([], [B + "test_test_servers.py::test_secret_is_encrypted_in_storage_and_in_the_backup", B + "test_test_servers.py::test_round_trip_and_context_binding"],
         [], True, ""),
    76: ([U + "components/auth/LoginPage.test.tsx::offers the provider when the server has SSO"],
         [B + "test_sso_jwt.py::test_a_full_sign_in_with_pkce_state_and_nonce", B + "test_sso_jwt.py::test_a_jwt_works_on_any_route_until_the_session_ends"],
         [E + "sso.spec.ts::sign in with the provider, then use and revoke a JWT access token"], False, "Single sign-on against a simulated provider."),
}

missing = []
for n, (unit, api, e2e, _, _) in M.items():
    for ref in unit + api + e2e:
        file, frag = ref.split("::")
        path = ROOT / file
        if not path.exists() or frag not in path.read_text():
            missing.append(f"{n:03d}: {ref}")
if missing:
    sys.exit("Cited tests not found:\n" + "\n".join(missing))


def cell(refs: list[str]) -> str:
    if not refs:
        return "—"
    out = []
    for r in refs:
        file, frag = r.split("::")
        name = Path(file).name
        out.append(f"`{name}`" + (f" {frag.rstrip(':')}" if frag and not frag.endswith("test_") and frag else ""))
    return "<br>".join(out)


rows = []
for n in sorted(M):
    unit, api, e2e, verified, note = M[n]
    status = "Done" if verified else "Built – not verified"
    rows.append(f"| {n:03d} | {status} | {cell(unit)} | {cell(api)} | {cell(e2e)} | {note} |")

done = sum(1 for v in M.values() if v[3])
text = f"""# SRS test matrix

Which tests check each requirement in the Software Requirements Specification, by level:
**unit** (one function or component, in isolation), **API** (the backend over HTTP, with
in-memory storage), **browser** (the real app and API in Chromium). Generated by
`build_test_matrix.py`, which fails if any test named here does not exist.

{len(M)} requirements: {done} Done (verified), {len(M) - done} Built – not verified
(the real system it depends on has not been tried). "—" means no test at that level.

Test runs, 6 Nov 2026: backend {RUNS["backend"]} passed ({RUNS["skipped"]} skipped: they need a real Postgres
or the old Node API), frontend unit {RUNS["unit"]} passed, browser {RUNS["browser"]} passed (Chromium).

| ID | Status | Unit | API | Browser | Note |
|---|---|---|---|---|---|
""" + "\n".join(rows) + "\n"
(ROOT / "docs/testing/srs-test-matrix.md").write_text(text)
print(f"wrote docs/testing/srs-test-matrix.md: {done} done, {len(M) - done} not verified")
