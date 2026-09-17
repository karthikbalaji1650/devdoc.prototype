import type { DocumentModel, DocSection } from '../types/document';

const impactSections: DocSection[] = [
  {
    id: 'sec-purpose-scope', title: 'Purpose & Scope', level: 1, type: 'richText',
    content: 'This document identifies the technical, functional, operational, and regression impact of the HPM firmware flash change. The scope covers the WebUI request flow, backend REST service, supported BMC hardware, validation coverage, deployment readiness, and recovery planning.'
  },
  {
    id: 'sec-change-summary', title: 'Change Summary', level: 1, type: 'richText',
    content: 'This impact analysis evaluates the BMC firmware HPM flash fix for the first-packet transaction failure. The change adds the required `preserve_config` request field, normalizes numeric WebUI payloads, and applies explicit integer casting in the backend REST service.'
  },
  {
    id: 'sec-impact-overview', title: 'Impact Overview', level: 1, type: 'table', tableData: {
      headers: ['Impact Area', 'Current State', 'Expected Change', 'Impact Level'],
      rows: [
        ['WebUI HPM update', 'Flash request can stop on packet 1.', 'Send a validated preserve_config flag.', 'High'],
        ['REST API contract', 'Integer parameters may arrive as strings.', 'Parse and cast values before validation.', 'High'],
        ['Firmware image data', 'Image contents and transfer format are unchanged.', 'No image format change.', 'Low'],
        ['Upgrade and reboot flow', 'Dependent on successful flash preparation.', 'Continue through the existing path.', 'Medium']
      ]
    }
  },
  {
    id: 'sec-source-code-impact', title: 'Source Code Impact', level: 1, type: 'table', tableData: {
      headers: ['Source / Module', 'Change Required', 'Behavioral Impact', 'Owner'],
      rows: [
        ['HpmFirmwareUpdateView.js', 'Add preserve_config and parse numeric inputs.', 'WebUI sends a REST-compatible request.', 'WebUI Engineering'],
        ['maintenance_fwupdate.c', 'Apply explicit integer casting during parsing.', 'Backend validates values consistently.', 'Platform Engineering'],
        ['API contract / tests', 'Update payload examples and endpoint coverage.', 'Future changes retain the required contract.', 'QA / API Owner']
      ]
    }
  },
  {
    id: 'sec-affected-components', title: 'Affected Components & Scope', level: 1, type: 'table', tableData: {
      headers: ['Component', 'Scope of Change', 'Out of Scope'],
      rows: [
        ['WebUI HpmFirmwareUpdateView', 'Request payload and numeric input parsing.', 'Other maintenance views.'],
        ['REST maintenance service', 'preserve_config validation and integer casting.', 'Unrelated REST endpoints.'],
        ['HPM firmware transfer', 'Validation of the existing upload path.', 'Firmware image build process.'],
        ['Supported hardware', 'PVT3 AST2600 BMC validation.', 'New hardware enablement.']
      ]
    }
  },
  {
    id: 'sec-functional-impact', title: 'Functional Impact', level: 1, type: 'table', tableData: {
      headers: ['Workflow', 'Before Change', 'After Change', 'User Impact'],
      rows: [
        ['HPM firmware upgrade', 'May fail during the first packet transaction.', 'Flash preparation completes and upload continues.', 'Upgrade can complete normally.'],
        ['Preserve configuration', 'Value is missing or not normalized.', 'Value is sent as an explicit 0 or 1 flag.', 'Existing choice is honored.'],
        ['Firmware downgrade', 'Uses the same vulnerable preparation path.', 'Uses the corrected request contract.', 'No new downgrade steps required.']
      ]
    }
  },
  {
    id: 'sec-regression-impact', title: 'Regression Impact', level: 1, type: 'table', tableData: {
      headers: ['Regression Area', 'Coverage Required', 'Expected Result', 'Status'],
      rows: [
        ['Upgrade and downgrade', 'Run both HPM image directions.', 'Both operations complete without packet-1 failure.', 'PASSED'],
        ['Dual-image bank switching', 'Verify active bank after reboot.', 'Target bank becomes active and remains bootable.', 'PASSED'],
        ['Configuration preservation', 'Test preserve_config enabled and disabled.', 'Selected behavior is retained after flash.', 'PASSED'],
        ['IPMI and sensor health', 'Run IPMI version and SDR checks after reboot.', 'Management access and sensors remain healthy.', 'PASSED']
      ]
    }
  },
  {
    id: 'sec-risk-assessment', title: 'Risk Assessment & Mitigation', level: 1, type: 'table', tableData: {
      headers: ['Risk', 'Likelihood', 'Consequence', 'Mitigation / Control'],
      rows: [
        ['Invalid preserve_config value reaches the backend.', 'Low', 'Flash preparation is rejected.', 'Send only 0 or 1 from a controlled input.'],
        ['Change affects existing upgrade behavior.', 'Medium', 'Upgrade flow regresses on supported hardware.', 'Run positive, negative, downgrade, and reboot coverage.'],
        ['Backend and WebUI contracts drift.', 'Low', 'Future clients fail validation.', 'Keep the field documented and covered by API tests.']
      ]
    }
  },
  {
    id: 'sec-dependencies', title: 'Dependencies & Compatibility', level: 1, type: 'richText',
    content: '- **Dependencies:** WebUI maintenance package, REST maintenance service, and target BMC firmware.\n- **Compatibility:** Existing HPM images, dual-image behavior, and IPMI workflows remain unchanged.\n- **Operational requirement:** Capture the pre-change firmware version and preserve the recovery image before deployment.'
  },
  {
    id: 'sec-validation-plan', title: 'Validation Plan', level: 1, type: 'testCases', testCases: [
      {
        id: 'IA-TC-01', title: 'Validate flash preparation payload',
        objective: 'Confirm the WebUI sends preserve_config and the REST endpoint accepts the request.',
        steps: ['Start an HPM update from the WebUI.', 'Inspect the request body.', 'Verify the response and flash preparation state.'],
        expectedResult: 'The request contains a valid preserve_config value and returns HTTP 200.', status: 'PASSED',
        actualResult: 'HTTP 200 returned; flash preparation completed.', notes: 'Validated on PVT3 AST2600 hardware.'
      },
      {
        id: 'IA-TC-02', title: 'Validate end-to-end upgrade and reboot',
        objective: 'Confirm the change does not interrupt upload, bank switching, or reboot.',
        steps: ['Upload the target HPM image.', 'Monitor progress to 100%.', 'Reboot and verify the target firmware version.'],
        expectedResult: 'The image uploads completely and the BMC reports the target version.', status: 'PASSED',
        actualResult: 'Upgrade completed and target firmware version verified.', notes: 'No HTTP 500 errors observed.'
      }
    ]
  },
  {
    id: 'sec-rollback-plan', title: 'Rollback & Recovery Plan', level: 1, type: 'richText',
    content: 'If validation fails, stop rollout and retain the previous firmware image. Restore the previous build using the existing BMC recovery or alternate-bank procedure, then verify WebUI access, IPMI access, sensor health, and firmware version.'
  },
  {
    id: 'sec-deployment-impact', title: 'Deployment & Operational Impact', level: 1, type: 'richText',
    content: '- **Deployment order:** Update the backend service and WebUI package together so the request contract remains aligned.\n- **Downtime:** The BMC reboot required by the firmware update remains unchanged.\n- **Monitoring:** Watch flash progress, HTTP responses, reboot completion, active firmware bank, and post-upgrade health checks.\n- **Support impact:** No new user workflow or configuration migration is required.'
  },
  {
    id: 'sec-open-issues', title: 'Open Issues & Assumptions', level: 1, type: 'table', tableData: {
      headers: ['Item', 'Type', 'Description', 'Disposition'],
      rows: [
        ['PVT3 hardware validation', 'Assumption', 'Target validation environment represents supported AST2600 hardware.', 'Confirm before broad rollout.'],
        ['Recovery image availability', 'Prerequisite', 'Previous firmware image must remain available during deployment.', 'Required release condition.'],
        ['No image format change', 'Assumption', 'The change affects request handling only.', 'Verify in release artifact review.']
      ]
    }
  },
  {
    id: 'sec-signoff', title: 'Approval & Release Recommendation', level: 1, type: 'callout', callout: {
      type: 'success', title: 'Impact Accepted - Ready for Release',
      text: 'The change is limited to the HPM flash request contract and input handling. Validation confirms the intended upgrade path, with rollback coverage available through the existing recovery workflow.'
    }
  }
];

export const sampleTestReportDoc: DocumentModel = {
  metadata: {
    id: 'tr-2026-qa-sample', title: 'Firmware HPM Flash Impact Analysis',
    subtitle: 'Change Scope, Risk Assessment, Validation & Release Recommendation', docNumber: 'IA-2026-0813',
    author: 'Platform Engineering & Quality Assurance', department: 'Engineering Change Management', date: '2026-08-13',
    version: '2.1', classification: 'INTERNAL ONLY', status: 'APPROVED', templateType: 'test-report',
    tags: ['Impact Analysis', 'Firmware', 'REST API', 'Risk Review', 'Release-Gate']
  },
  sections: impactSections
};

export const blankTestReportDoc: DocumentModel = {
  metadata: {
    id: 'test-report-blank', title: 'Impact Analysis',
    subtitle: 'Change Scope, Risk Assessment, Validation & Release Recommendation', docNumber: 'IA-2026-001',
    author: 'Engineering Owner', department: 'Engineering Change Management', date: new Date().toISOString().split('T')[0],
    version: '1.0', classification: 'INTERNAL ONLY', status: 'DRAFT', templateType: 'test-report',
    tags: ['Impact Analysis', 'Change Review']
  },
  sections: impactSections.map(section => {
    if (section.type === 'richText') return { ...section, content: 'Describe the change, its impact, validation requirements, and operational considerations.' };
    if (section.type === 'table') {
      const tableData = section.tableData || { headers: ['Parameter', 'Value'], rows: [['', '']] };
      return { ...section, tableData: { headers: tableData.headers, rows: [new Array(tableData.headers.length).fill('')] } };
    }
    if (section.type === 'testCases') return { ...section, testCases: [{ id: 'IA-TC-01', title: 'Primary validation scenario', objective: 'Verify the intended behavior after the change.', steps: ['Prepare the test environment.', 'Execute the changed workflow.', 'Inspect the result and evidence.'], expectedResult: 'The changed workflow completes successfully with no unacceptable regression.', status: 'PENDING' as const }] };
    return { ...section, callout: { type: 'info' as const, title: 'Pending Review', text: 'Record the final recommendation, approval status, and release conditions.' } };
  })
};
