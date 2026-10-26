export type IncidentSeverity = 'P1 - Blocker' | 'P2 - Critical' | 'P3 - Major' | 'P4 - Minor';
export type IncidentStatus = 'Investigating' | 'Identified' | 'Monitoring' | 'Resolved';

export interface IncidentItem {
  id: string; // e.g. "INC-2026-0813"
  title: string;
  severity: IncidentSeverity;
  status: IncidentStatus;
  affectedSystem: string;
  rootCause: string;
  owner: string;
  reportedDate: string;
  resolvedDate?: string;
  ttrHours?: number;
  jiraTicket?: string; // e.g. "WH3-1205"
}

export interface JiraIssue {
  key: string; // e.g. "WH3-1205"
  summary: string;
  issueType: 'Bug' | 'Story' | 'Task' | 'Epic';
  status: 'To Do' | 'In Progress' | 'In Review' | 'Done';
  priority: 'High' | 'Highest' | 'Medium' | 'Low';
  storyPoints: number;
  assignee: string;
  fixVersion: string;
  linkedDocTitle?: string;
}

export interface ReleaseMasterItem {
  id: string;
  releaseVersion: string; // e.g. "BMC Firmware v13.03.01"
  targetReleaseDate: string;
  releaseStatus: 'Planning' | 'RC Testing' | 'Approved for GA' | 'Deployed';
  jiraTicketsCount: number;
  totalStoryPoints: number;
  completedStoryPoints: number;
  technicalAnalysisDocId: string;
  technicalAnalysisDocTitle: string;
  testReportDocId: string;
  testReportDocTitle: string;
  releaseGateVerdict: 'GO' | 'PENDING_QA' | 'NO-GO';
  signoffOwner: string;
}

export interface ReviewerLogItem {
  id: string;
  docId: string;
  docTitle: string;
  docNumber: string;
  reviewerName: string;
  reviewerRole: string;
  reviewStatus: 'APPROVED' | 'CHANGES_REQUESTED' | 'IN_REVIEW' | 'PENDING';
  reviewDate: string;
  comments: string;
  spreadsheetRowIdx?: number;
}

// Option 5: AI Test Case Management (TestRail Alternative)
export interface TestCaseStep {
  step: number;
  action: string;
  expected: string;
}

export type TestCaseStatus = 'Untested' | 'Passed' | 'Failed' | 'Blocked' | 'Skipped' | 'Retest';

export interface TestCaseItem {
  id: string;
  suiteId: string;
  customId: string; // e.g. "TC-RTC-001"
  title: string;
  preconditions: string;
  steps: TestCaseStep[];
  expectedResult: string;
  priority: 'P1' | 'P2' | 'P3' | 'P4';
  type: 'Automated' | 'Manual';
  labels?: string[];
  references?: string[]; // e.g. JIRA ticket IDs
  estimateMin?: number;
  automationCandidate?: boolean;
  robotCode?: string; // Executable Robot Framework syntax
  isFlagged?: boolean; // Flagged by user or AI for suite inclusion
  isDeleted?: boolean;
  createdAt: string;
  status?: TestCaseStatus;
  evidenceImage?: string; // data: URI screenshot, proof the expected outcome was observed
  evidenceImageName?: string;
}

export interface TestSection {
  id: string;
  suiteId: string;
  title: string;
  parentId?: string; // for subsections
  order: number;
}

export interface TestSuiteItem {
  id: string;
  title: string;
  description: string;
  module: string;
  taDocId?: string;
  taDocNumber?: string;
  createdAt: string;
  testCases?: TestCaseItem[];
  sections?: TestSection[];
}

export interface TestRunCaseResult {
  caseId: string;
  customId: string;
  title: string;
  status: TestCaseStatus;
  assignedTo?: string;
  testedBy?: string;
  testedAt?: string;
  comment?: string;
  labels?: string[];
}

export interface TestRunItem {
  id: string;
  name: string;
  suiteId: string;
  environment: string;
  status: 'Completed' | 'In Progress' | 'Failed';
  passedCount: number;
  failedCount: number;
  blockedCount: number;
  skippedCount?: number;
  untestedCount?: number;
  automationPassedCount?: number;
  automationFailedCount?: number;
  automationErrorCount?: number;
  executedAt: string;
  milestone?: string;
  assignedTo?: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  caseResults?: TestRunCaseResult[];
}

export interface MilestoneItem {
  id: string;
  name: string;
  description?: string;
  dueDate?: string;
  status: 'open' | 'completed';
  passedCount: number;
  failedCount: number;
  blockedCount: number;
  untestedCount: number;
  totalCount: number;
  testRunIds: string[];
  subMilestones?: MilestoneItem[];
}

