import type { JiraIssue, ReleaseMasterItem, IncidentItem } from '../types/operations';

export const INITIAL_JIRA_ISSUES: JiraIssue[] = [
  {
    key: 'WH3-1205',
    summary: 'WebUI HPM Firmware Upgrade Failure Investigation & Fix',
    issueType: 'Bug',
    status: 'Done',
    priority: 'Highest',
    storyPoints: 5,
    assignee: 'Manivannan Thangavel',
    fixVersion: 'v13.03.01',
    linkedDocTitle: 'WebUI HPM Firmware Upgrade Failure Investigation & Fix'
  },
  {
    key: 'WH3-1206',
    summary: 'Add preserve_config presence check on /api/maintenance/flash endpoint',
    issueType: 'Story',
    status: 'Done',
    priority: 'High',
    storyPoints: 3,
    assignee: 'Judia Lumina',
    fixVersion: 'v13.03.01',
    linkedDocTitle: 'WebUI HPM Firmware Upgrade Failure Investigation & Fix'
  },
  {
    key: 'WH3-1210',
    summary: 'Dual-Image Bank switching verification under simulated network loss',
    issueType: 'Task',
    status: 'In Review',
    priority: 'High',
    storyPoints: 5,
    assignee: 'Vaishnavi Aasaithambi',
    fixVersion: 'v13.03.01',
    linkedDocTitle: 'Platform Firmware & REST API Test Management Matrix'
  },
  {
    key: 'WH3-1214',
    summary: 'REST API Cybersecurity Fuzzing test suite integration into CI/CD',
    issueType: 'Story',
    status: 'Done',
    priority: 'Medium',
    storyPoints: 3,
    assignee: 'Judia Lumina',
    fixVersion: 'v13.03.01',
    linkedDocTitle: 'Firmware Security & REST API Test Execution Report'
  },
  {
    key: 'WH3-1220',
    summary: 'WebSocket real-time sensor polling load optimization for AST2600',
    issueType: 'Story',
    status: 'In Progress',
    priority: 'Medium',
    storyPoints: 8,
    assignee: 'Manivannan Thangavel',
    fixVersion: 'v13.04.00'
  }
];

export const INITIAL_RELEASE_MASTER: ReleaseMasterItem[] = [
  {
    id: 'rel-13-03-01',
    releaseVersion: 'BMC Firmware Revision 13.03.01 (Security & Fix Patch)',
    targetReleaseDate: '2026-08-16',
    releaseStatus: 'Approved for GA',
    jiraTicketsCount: 4,
    totalStoryPoints: 16,
    completedStoryPoints: 16,
    technicalAnalysisDocId: 'wh3-1205-sample',
    technicalAnalysisDocTitle: 'WH3-1205: WebUI HPM Firmware Upgrade Failure Investigation & Fix',
    testReportDocId: 'tr-2026-qa-sample',
    testReportDocTitle: 'TR-2026-0813: Firmware Security & REST API Test Execution Report',
    releaseGateVerdict: 'GO',
    signoffOwner: 'Manivannan Thangavel (Manager) & Vaishnavi Aasaithambi (Technical Lead)'
  },
  {
    id: 'rel-13-04-00',
    releaseVersion: 'BMC Firmware Revision 13.04.00 (WebSocket Streaming GA)',
    targetReleaseDate: '2026-09-01',
    releaseStatus: 'Planning',
    jiraTicketsCount: 8,
    totalStoryPoints: 34,
    completedStoryPoints: 12,
    technicalAnalysisDocId: 'adr-0042',
    technicalAnalysisDocTitle: 'ADR 0042: Migration from REST Polling to WebSocket State Streaming',
    testReportDocId: 'test-case-matrix-2026',
    testReportDocTitle: 'TM-2026-AST2600: Platform Firmware & REST API Test Management Matrix',
    releaseGateVerdict: 'PENDING_QA',
    signoffOwner: 'Judia Lumina (Team Lead)'
  }
];

export const INITIAL_INCIDENTS: IncidentItem[] = [
  {
    id: 'INC-2026-0813',
    title: 'Dual-Flash Image Upload Halt on Rev 13.03 during WebUI flash',
    severity: 'P2 - Critical',
    status: 'Resolved',
    affectedSystem: 'WebUI HPM Flashing / spx_restservice',
    rootCause: 'Missing preserve_config parameter in initial HTTPS payload caused backend daemon to reject preparation request.',
    owner: 'Manivannan Thangavel',
    reportedDate: '2026-08-13 14:15',
    resolvedDate: '2026-08-13 18:20',
    ttrHours: 4.1,
    jiraTicket: 'WH3-1205'
  },
  {
    id: 'INC-2026-0810',
    title: 'Sensor reading telemetry timeout under 100+ concurrent WebUI sessions',
    severity: 'P3 - Major',
    status: 'Resolved',
    affectedSystem: 'AST2600 REST Sensor Daemon',
    rootCause: 'HTTP polling frequency induced high CPU load; mitigated by increasing client cache interval.',
    owner: 'Vaishnavi Aasaithambi',
    reportedDate: '2026-08-10 09:30',
    resolvedDate: '2026-08-10 16:45',
    ttrHours: 7.25,
    jiraTicket: 'WH3-1180'
  },
  {
    id: 'INC-2026-0801',
    title: 'IPMI cipher suite 0 vulnerability detection in cybersecurity scan',
    severity: 'P1 - Blocker',
    status: 'Resolved',
    affectedSystem: 'IPMI RMCP+ Authentication Daemon',
    rootCause: 'Legacy cipher suite 0 was enabled by default in default flash image configuration.',
    owner: 'Judia Lumina',
    reportedDate: '2026-08-01 11:00',
    resolvedDate: '2026-08-01 15:30',
    ttrHours: 4.5,
    jiraTicket: 'WH3-1150'
  }
];
