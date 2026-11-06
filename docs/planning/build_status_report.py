"""Builds the SRS status report (SRS-DevdocStudio-Status-Report.pdf) from the
gap-analysis spreadsheet, so the two always agree: statuses, notes and totals
come from the .xlsx; the summary text, plan and decisions are below.

    python3 docs/planning/build_status_report.py docs/planning/SRS-DevdocStudio-Gap-Analysis.xlsx /tmp/report.html
    node docs/planning/print_status_report.mjs /tmp/report.html docs/planning/SRS-DevdocStudio-Status-Report.pdf

Update HEADER, KEY_POINTS, PHASES and DECISIONS for each new report.
Requirement titles (TITLES) are the report's short names for each row."""

import html
import sys

import openpyxl

XLSX, OUT = sys.argv[1], sys.argv[2]
HEADER = "DevDoc Studio · SRS status report · 7 Nov 2026 · branch feature/remote-test-servers"

TITLES = {
    1: "List in-progress documents; open in editor", 2: "Users edit only their own documents",
    3: "Admin views all documents", 4: "Admin edits all documents",
    5: "Dashboard landing page with document stats", 6: "Sidebar entry for the document editor",
    7: "Sidebar: doc editor, data management, code editor", 8: "Data management restricted to admins",
    9: "Save document to the VS Code project folder", 10: "Download documents",
    11: "Admin audit log of user sessions", 12: "Hierarchy: Projects > Suites > Sections > Cases",
    13: "Test case fields (ID, steps, post-conditions, attachments)", 14: "Revision history for test cases",
    15: "Import/export test cases as CSV, XML, JSON", 16: "Create test runs from cases or whole suites",
    17: "Manual execution statuses", 18: "Attach Jira/GitHub issue IDs to failed results",
    19: "Register remote test servers (URL, auth, payload)", 20: "Trigger remote runs from the UI via REST",
    21: "Backend polling service (interval, states, metrics)", 22: "Real-time UI updates without refresh",
    23: "Metrics dashboard (completion %, donut, velocity)", 24: "Downloadable summary reports (PDF, HTML, CSV)",
    25: "Compare runs to detect regressions", 26: "Run tests locally and in CI/CD",
    27: "Jenkins and Bitbucket integration", 28: "Scheduled runs",
    29: "Integrated code editor with AI generation", 30: "Connect existing code",
    31: "Consolidated manual + automated report", 32: "Share docs/test cases with the AI code editor",
    33: "Create releases, approve RC>Final, override gates, sign off",
    34: "Link releases to test runs; log blocking defects", 35: "Register build artifacts (checksums, URLs)",
    36: "View release status, metrics and release notes", 37: "Create a release with version, type, date, status",
    38: "Release phase milestones (freeze ... GA)", 39: "Multiple RC builds per release",
    40: "Image details per build (tag, SHA, URL, checksum)", 41: "Promote an RC image to Final",
    42: "Link test runs to RC images", 43: "Automatic release-readiness gates",
    44: "Link Jira/GitHub release blockers", 45: "Multi-role electronic sign-offs",
    46: "Immutable audit log for release actions", 71: "UI navigation under 1.5 s",
    72: "Polling supports 100 concurrent runs", 73: "5,000+ case suites load in under 500 ms",
    74: "HTTPS / TLS 1.3 in transit", 75: "Server API keys encrypted at rest (AES-256)",
    76: "JWT and OAuth2/SSO authentication",
}

wb = openpyxl.load_workbook(XLSX, data_only=True)
rs = wb["Requirement specifications"]
rows = {}
for r in range(5, 85):
    rid, status, note = rs.cell(r, 2).value, rs.cell(r, 8).value, rs.cell(r, 9).value
    if rid and status:
        rows[int(rid.split("-")[-1])] = (rid, status, note or "", rs.cell(r, 10).value or "")
summary = wb["Gap summary"]
# Area | Done | Built – not verified | Partial | Not started | Total | % Done
areas = [[summary.cell(r, c).value for c in range(1, 8)] for r in range(5, 10)]
total = areas[-1]
assert len(rows) == total[5] == 52, (len(rows), total)
BUILT = "Built – not verified"

e = html.escape
CLS = {"Done": "done", BUILT: "built", "Partial": "partial", "Not started": "not"}


def badge(status: str) -> str:
    return f'<span class="badge {CLS[status]}">{e(status)}</span>'


def counts(nums: list[int]) -> tuple[int, int, int, int]:
    s = [rows[n][1] for n in nums]
    return s.count("Done"), s.count(BUILT), s.count("Partial"), s.count("Not started")


def count_text(c: tuple[int, int, int, int]) -> str:
    return f"{c[0]} done · {c[1]} built, not verified · {c[2]} partial · {c[3]} not started"


def head(section: str, page: int) -> str:
    return f'<div class="runhead"><span>{e(HEADER.upper())}</span><b>{e(section.upper())} · {page} / 7</b></div>'


def table(nums: list[int]) -> str:
    out = ['<table class="reqs"><thead><tr><th class="n">#</th><th class="id">Req ID</th><th class="t">Requirement</th>'
           '<th class="s">Status</th><th>What exists today / what is missing</th></tr></thead><tbody>']
    for n in nums:
        rid, status, note, checked = rows[n]
        when = f"Checked {checked.removesuffix(' 2026')}" if checked else "Not checked"
        out.append(f'<tr><td class="n">{n}</td><td class="id">{e(rid)}</td><td class="t">{e(TITLES[n])}</td>'
                   f'<td class="s">{badge(status)}<span class="when">{e(when)}</span></td><td>{e(note)}</td></tr>')
    out.append("</tbody></table>")
    return "".join(out)


def status_page(page: int, section: str, title: str, nums: list[int], all_nums: list[int], extra: str = "") -> str:
    lo, hi = f"{all_nums[0]:03d}", f"{all_nums[-1]:03d}"
    return (f'<section class="page">{head(section, page)}<h1>{e(title)}</h1>'
            f'<p class="sub">DDS-SRS-{lo} – {hi} · {count_text(counts(all_nums))}</p>{table(nums)}{extra}</section>')


def bar(d: int, b: int, p: int, n: int) -> str:
    t = d + b + p + n
    segs = [(d, "done"), (b, "built"), (p, "partial"), (n, "not")]
    return '<div class="bar">' + "".join(
        f'<span class="{c}" style="width:{v / t * 100:.2f}%">{v}</span>' for v, c in segs if v) + "</div>"


tiles = (f'<div class="tiles"><div class="tile navy"><b>{total[5]}</b>Requirements in the SRS</div>'
         f'<div class="tile green"><b>{total[1]}</b>Done and verified</div>'
         f'<div class="tile blue"><b>{total[2]}</b>Built, not yet verified</div>'
         f'<div class="tile amber"><b>{total[3]}</b>Partially done</div>'
         f'<div class="tile red"><b>{total[4]}</b>Not started</div></div>')
area_rows = "".join(
    f'<tr class="{"total" if a[0] == "Total" else ""}"><td>{e("All requirements" if a[0] == "Total" else a[0].split(" (")[0])}</td>'
    f'<td class="prog">{bar(a[1], a[2], a[3], a[4])}</td><td>{a[1]}</td><td>{a[2]}</td><td>{a[3]}</td><td>{a[4]}</td><td>{a[5]}</td>'
    f'<td><b>{round(a[6] * 100)}%</b></td></tr>' for a in areas)

KEY_POINTS = [
    ("43 of 52 verified.", "Each has unit, API or browser tests that pass (docs/testing/srs-test-matrix.md)."),
    ("9 built, not verified:", "the real system they need was not tried - test PC (020, 021, 072), Jenkins / Bitbucket (026, 027), AI provider (029), Jira / GitHub (044), SSO provider (076), deployment (074)."),
    ("Bugs fixed:", "Export options menu ignored clicks (009, 010); run page Close, Rerun, Edit and Execute did nothing; output.xml import read the wrong status and made up times; skipped tests counted as blocked; runs and testers always named one fixed user."),
    ("Not ready to deploy.", "Deployment is not an SRS requirement; what it needs is listed on the right."),
]
key = "".join(f"<li><b>{e(a)}</b> {e(b)}</li>" for a, b in KEY_POINTS)
BEFORE_DEPLOYMENT = [
    ("Code editor password", "code-server has none; anyone who reaches the app can open it, terminal included."),
    ("TLS certificate", "Replace the self-signed one."),
    ("Secrets", "Set SECRETS_KEY and BRIDGE_TOKEN; replace the demo database password."),
    ("Server", "None yet; CI only builds the images."),
    ("Real systems", "Connect Jira, run one Jenkins job; test PC runs need a test PC implementing docs/test-pc-api.md."),
]
before = "".join(f"<tr><td class='t'>{e(a)}</td><td>{e(b)}</td></tr>" for a, b in BEFORE_DEPLOYMENT)
page1 = (f'<section class="page">{head("Summary", 1)}<h1>DevDoc Studio — SRS status report</h1>'
         '<p class="lead">Status of the 52 SRS requirements. <b>Done</b>: built and verified by passing tests, against the real system where '
         'one is involved. <b>Built, not verified</b>: passes its tests, but the real system it needs was not tried. Same data per row in '
         '<i>SRS-DevdocStudio-Gap-Analysis.xlsx</i>; tests per requirement in <i>docs/testing/srs-test-matrix.md</i>.</p>'
         f'{tiles}<table class="areas"><thead><tr><th>Area</th><th class="prog">Progress</th><th>Done</th><th>Built, not verified</th><th>Partial</th>'
         f'<th>Not started</th><th>Total</th><th>% Done</th></tr></thead><tbody>{area_rows}</tbody></table>'
         f'<div class="cols"><div><h2>Key points</h2><ol class="key">{key}</ol></div>'
         f'<div><h2>Before deployment (not SRS requirements)</h2><table class="reqs before"><tbody>{before}</tbody></table></div></div></section>')

PHASES = [
    ("0", "Quick wins & fixes", "Effort: S · Done", [8, 11, 7, 13, 18, 15, 24, 16],
     "Done: admin-only data management with backup and reset, sign-in history, full test case fields, issue IDs on failed results, CSV / XML / JSON import-export, run reports, and runs from picked cases or sections."),
    ("1", "Move test management to the backend", "Effort: L · Done", [12, 14, 73, 31, 25],
     "Done: test data is shared by all users; projects and sub-sections, test case history, fast large suites, combined reports, run comparison."),
    ("2", "Real test execution engine", "Effort: L · Built; real test PC and CI not verified", [19, 75, 20, 21, 22, 23, 72, 28, 26, 27],
     "Built: test servers with encrypted credentials, runs sent over REST, server-side polling (5 / 10 / 30 s) with progress, live updates, trend graphs, scheduled runs, CI tokens with Jenkins and Bitbucket pipeline files. Not verified: no real test PC yet; never run in a real Jenkins or Bitbucket."),
    ("3", "Release management", "Effort: L · Done except 044 (not verified)", [37, 38, 39, 40, 35, 34, 42, 43, 44, 45, 41, 33, 46, 36],
     "Done: releases and milestones, RC builds with image details, linked test runs, readiness checks, sign-offs, promotion to Final, release notes, audit log. Built, not verified: blockers read from Jira / GitHub (044), tested against simulated trackers only."),
    ("4", "Security & platform hardening", "Effort: M · Built; 074 and 076 not verified", [74, 76, 71, 30],
     "Done: fast navigation, connecting existing Git repositories, JWT access tokens. Built, not verified: HTTPS with TLS 1.3 (no real deployment or certificate yet) and single sign-on (no real provider yet)."),
]
phase_rows = "".join(
    f'<tr><td class="ph">{ph}</td><td class="focus"><b>{e(f)}</b><span>{e(eff)}</span></td>'
    f'<td class="chips">{"".join(f"<span class=chip-{CLS[rows[n][1]]}>{n:03d}</span>" for n in nums)}</td><td>{e(why)}</td></tr>'
    for ph, f, eff, nums, why in PHASES)
page2 = (f'<section class="page">{head("Action plan", 2)}<h1>Recommended order of work</h1>'
         '<p class="sub">Every requirement from the 2 Nov plan appears once below; green ones are done and verified, blue ones built but not yet verified against the real system. Effort: S = days, M = 1–2 weeks, L = several weeks.</p>'
         f'<table class="plan"><thead><tr><th class="ph">Phase</th><th class="focus">Focus</th><th class="chips">Requirements (colour = current status)</th>'
         f'<th>Why in this order</th></tr></thead><tbody>{phase_rows}</tbody></table>'
         '<p class="legend">Chip colours: <span class="chip-done">done</span> <span class="chip-built">built, not verified</span> '
         '<span class="chip-partial">partial</span> <span class="chip-not">not started</span>. Left: verify the blue ones; deployment (page 1).</p></section>')

DECISIONS = [
    ("Background job queue", "Decided: a background job inside the API (no separate queue), with Redis locks so several API instances never repeat work. Polls runs, fires schedules, syncs blockers."),
    ("Test PC / hardware API", "Defined: docs/test-pc-api.md (start a run, report a run). The real test PC needs to implement it."),
    ("Jira, Jenkins, Bitbucket access", "Built against their public APIs; still needed: an account on each to try it against the real systems."),
    ("SSO provider", "Built for any OpenID Connect provider (Entra ID, Okta, Google, Keycloak); still to choose which one, and register the app with it."),
    ("JWT vs. sessions", "Decided: both. The browser keeps the session cookie; scripts and tools use JWTs, which are revoked when their session signs out."),
    ("Priority scale", "Decided: Low / Medium / High / Critical (013)."),
    ("Deployment target", "Still needed, for a real TLS certificate and the server's secrets. HTTPS itself is built."),
]
dec = "".join(f"<tr><td class='n'>{i}</td><td class='t'>{e(a)}</td><td>{e(b)}</td></tr>" for i, (a, b) in enumerate(DECISIONS, 1))
dec_html = ('<h2>Decisions</h2><table class="reqs dec"><thead><tr><th class="n">#</th><th class="t">Decision</th><th>Where it stands</th></tr></thead>'
            f'<tbody>{dec}</tbody></table>')

pages = [
    page1, page2,
    status_page(3, "Status · Document editor & UI", "Document Editor & UI", list(range(1, 12)), list(range(1, 12))),
    status_page(4, "Status · Test manager", "Test Manager", list(range(12, 23)), list(range(12, 33))),
    status_page(5, "Status · Test manager", "Test Manager (continued)", list(range(23, 33)), list(range(12, 33))),
    status_page(6, "Status · Release management", "Release Management", list(range(33, 47)), list(range(33, 47))),
    status_page(7, "Status · Non-functional & decisions", "Non-functional requirements", list(range(71, 77)), list(range(71, 77)), dec_html),
]

CSS = """
@page { size: A4 landscape; margin: 0; }
* { box-sizing: border-box; }
body { margin: 0; font-family: Helvetica, Arial, sans-serif; color: #1a2233; font-size: 9.2pt; }
.page { width: 297mm; height: 210mm; padding: 9mm 14mm; page-break-after: always; overflow: hidden; position: relative; }
.runhead { display: flex; justify-content: space-between; font-size: 6.6pt; letter-spacing: .06em; color: #6b7280; padding-bottom: 3mm; border-bottom: 1px solid #1f3864; margin-bottom: 4mm; }
.runhead b { color: #1f3864; }
h1 { color: #1f3864; font-size: 17pt; margin: 2mm 0 1.5mm; }
h2 { color: #1f3864; font-size: 11pt; margin: 5mm 0 2mm; }
.lead, .sub { color: #4b5563; margin: 0 0 4mm; }
.sub { font-size: 8pt; }
.tiles { display: flex; gap: 4mm; margin-bottom: 3mm; }
.tile { flex: 1; border: 1px solid #e5e7eb; border-top: 2px solid; border-radius: 3mm; padding: 3mm 4mm; font-size: 7pt; text-transform: uppercase; color: #6b7280; }
.tile b { display: block; font-size: 17pt; text-transform: none; }
.tile.navy { border-top-color: #1f3864; } .tile.navy b { color: #1f3864; }
.tile.green { border-top-color: #16a34a; } .tile.green b { color: #16a34a; }
.tile.amber { border-top-color: #d97706; } .tile.amber b { color: #c2410c; }
.tile.red { border-top-color: #dc2626; } .tile.red b { color: #dc2626; }
.tile.blue { border-top-color: #2563eb; } .tile.blue b { color: #1e40af; }
.when { display: block; font-size: 6.2pt; color: #6b7280; margin-top: .8mm; }
.cols { display: grid; grid-template-columns: 1fr 1.25fr; gap: 7mm; }
.before .t { width: 40mm; }
table { width: 100%; border-collapse: collapse; }
thead th { background: #1f3864; color: #fff; text-align: left; font-size: 6.8pt; text-transform: uppercase; letter-spacing: .04em; padding: 2mm 2.5mm; }
tbody td { border-bottom: 1px solid #e5e7eb; padding: 1.35mm 2.5mm; vertical-align: top; }
.areas td { vertical-align: middle; } .areas .prog { width: 50%; } .areas tr.total td { font-weight: bold; }
.bar { display: flex; height: 3.6mm; border-radius: 1mm; overflow: hidden; }
.bar span { display: flex; align-items: center; justify-content: center; color: #fff; font-size: 6pt; font-weight: bold; }
.bar .done { background: #16a34a; } .bar .built { background: #2563eb; } .bar .partial { background: #d97706; } .bar .not { background: #dc2626; }
.key { margin: 0; padding-left: 5mm; } .key li { margin-bottom: 1.6mm; line-height: 1.35; }
.reqs .n { width: 8mm; color: #9ca3af; } .reqs .id { width: 24mm; font-family: Menlo, monospace; font-size: 7.4pt; }
.reqs .t { width: 66mm; font-weight: bold; } .reqs .s { width: 30mm; }
.dec .t { width: 55mm; }
.badge { display: inline-block; font-size: 6.6pt; font-weight: bold; padding: .5mm 1.8mm; border-radius: 1mm; white-space: nowrap; }
.badge.done { background: #c6efce; color: #006100; } .badge.built { background: #dbeafe; color: #1e40af; } .badge.partial { background: #ffeb9c; color: #7f6000; } .badge.not { background: #ffc7ce; color: #9c0006; }
.plan .ph { width: 13mm; text-align: center; } .plan td.ph { font-size: 15pt; font-weight: bold; color: #1f3864; }
.plan .focus { width: 42mm; } .plan .focus span { display: block; font-size: 7pt; color: #6b7280; margin-top: .8mm; }
.plan .chips { width: 62mm; }
[class^=chip-] { display: inline-block; font-family: Menlo, monospace; font-size: 6.8pt; font-weight: bold; padding: .5mm 1.5mm; margin: 0 1mm 1mm 0; border-radius: 1mm; }
.chip-done { background: #c6efce; color: #006100; } .chip-built { background: #dbeafe; color: #1e40af; } .chip-partial { background: #ffeb9c; color: #7f6000; } .chip-not { background: #ffc7ce; color: #9c0006; }
.legend { font-size: 7.4pt; color: #6b7280; margin-top: 3mm; }
"""
with open(OUT, "w", encoding="utf-8") as f:
    f.write(f'<!doctype html><html><head><meta charset="utf-8"><title>DevDoc Studio SRS status report</title><style>{CSS}</style></head><body>{"".join(pages)}</body></html>')
print("wrote", OUT)
