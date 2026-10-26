export type TemplateType = 
  | 'technical-analysis' 
  | 'test-report' 
  | 'adr' 
  | 'rca' 
  | 'custom';

export type DocClassification = 'CONFIDENTIAL' | 'INTERNAL ONLY' | 'PUBLIC';
export type DocStatus = 'DRAFT' | 'IN_REVIEW' | 'APPROVED' | 'PUBLISHED';

export interface DocumentMetadata {
  id: string;
  title: string;
  subtitle?: string;
  docNumber: string; // e.g. "WH3-1205" or "TR-2026-08"
  author: string;
  department?: string;
  date: string;
  version: string;
  classification: DocClassification;
  status: DocStatus;
  templateType: TemplateType;
  logoUrl?: string; // Base64 data URI or image URL
  logoPosition?: 'left' | 'center' | 'right';
  tags?: string[];
}

export type SectionType = 
  | 'richText'
  | 'table'
  | 'codeDiff'
  | 'testCases'
  | 'verificationMatrix'
  | 'keyValues'
  | 'callout';

export interface KeyValuePair {
  key: string;
  value: string;
}

export interface TableData {
  headers: string[];
  rows: string[][];
}

export interface CodeSnippet {
  filename: string;
  language: string;
  description?: string;
  code?: string;
  oldCode?: string;
  newCode?: string;
  isDiff?: boolean;
}

export interface TestCaseItem {
  id: string;
  title: string;
  objective: string;
  steps: string[];
  expectedResult: string;
  status: 'PASSED' | 'FAILED' | 'BLOCKED' | 'PENDING';
  actualResult?: string;
  notes?: string;
  evidenceImage?: string;
  evidenceImageName?: string;
}

export interface VerificationMatrixItem {
  id: string;
  rootCause: string;
  fixLocation: string;
  resolution: string;
  status: 'PASSED' | 'FAILED' | 'PENDING';
}

export interface CalloutData {
  type: 'info' | 'warning' | 'tip' | 'success';
  title?: string;
  text: string;
}

export interface DocSection {
  id: string;
  title: string;
  level: 1 | 2 | 3;
  type: SectionType;
  description?: string;
  content?: string;
  keyValues?: KeyValuePair[];
  tableData?: TableData;
  codeSnippet?: CodeSnippet;
  testCases?: TestCaseItem[];
  verificationMatrix?: VerificationMatrixItem[];
  callout?: CalloutData;
}

export interface DocumentModel {
  metadata: DocumentMetadata;
  sections: DocSection[];
}
