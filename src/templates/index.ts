import type { DocumentModel, TemplateType } from '../types/document';
import { sampleTechnicalAnalysisDoc, blankTechnicalAnalysisDoc } from './technicalAnalysisTemplate';
import { sampleTestReportDoc, blankTestReportDoc } from './testReportTemplate';

export interface TemplateOption {
  id: string;
  name: string;
  category: TemplateType;
  description: string;
  iconName: string;
  badge: string;
  getSampleDoc: () => DocumentModel;
  getBlankDoc: () => DocumentModel;
}

export const TEMPLATE_REGISTRY: TemplateOption[] = [
  {
    id: 'technical-analysis',
    name: 'Technical Analysis Document',
    category: 'technical-analysis',
    description: 'Deep-dive investigation, root cause analysis, code diffs, architectural comparisons, and verification matrices.',
    iconName: 'FileCode2',
    badge: 'Popular for Devs',
    getSampleDoc: () => JSON.parse(JSON.stringify(sampleTechnicalAnalysisDoc)),
    getBlankDoc: () => JSON.parse(JSON.stringify(blankTechnicalAnalysisDoc))
  },
  {
    id: 'test-report',
    name: 'Impact Analysis',
    category: 'test-report',
    description: 'Purpose and scope, source-code impact, regression analysis, validation, deployment risk, and release recommendation.',
    iconName: 'CheckCircle2',
    badge: 'QA & Release',
    getSampleDoc: () => JSON.parse(JSON.stringify(sampleTestReportDoc)),
    getBlankDoc: () => JSON.parse(JSON.stringify(blankTestReportDoc))
  },
];

export const getDefaultDocument = (): DocumentModel => {
  return JSON.parse(JSON.stringify(sampleTechnicalAnalysisDoc));
};
