import type { DocumentModel } from '../types/document';

export const sampleSpreadsheetTestDoc: DocumentModel = {
  metadata: {
    id: 'test-case-matrix-2026',
    title: 'Platform Firmware & REST API Test Management Matrix',
    subtitle: 'Comprehensive Test Suite, Execution Grid & Release Certification',
    docNumber: 'TM-2026-AST2600',
    author: 'Vaishnavi Aasaithambi',
    department: 'SW engineering',
    date: '2026-08-14',
    version: '1.0',
    classification: 'INTERNAL ONLY',
    status: 'APPROVED',
    templateType: 'test-report',
    logoUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 60" fill="none"><rect width="40" height="40" y="10" rx="8" fill="%23059669"/><path d="M14 30l5 5 11-11" stroke="white" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><text x="50" y="38" fill="%23065F46" font-family="Arial" font-weight="bold" font-size="20">QA MATRIX</text></svg>',
    logoPosition: 'center',
    tags: ['Spreadsheet', 'Test Cases', 'QA Matrix', 'Excel Export', 'Firmware']
  },
  sections: [
    {
      id: 'sec-overview',
      title: 'Test Management Overview & Scope',
      level: 1,
      type: 'richText',
      content: 'This document provides the structured test case matrix for validating the **BMC Firmware Release 13.03.01 Patch**. All test cases can be edited in spreadsheet grid view or synchronized with Microsoft Excel and Google Sheets.'
    },
    {
      id: 'sec-env-setup',
      title: 'Target Test Environment & Hardware Specification',
      level: 1,
      type: 'table',
      tableData: {
        headers: ['Hardware / Component', 'Specification / Firmware Build', 'Test Node / Interface'],
        rows: [
          ['DUT Hardware Node', 'iXsystem PVT3 Dual-Socket AST2600', '172.17.45.150'],
          ['Target Firmware Build', 'Revision 13.03.01 (Security & Fix Patch)', 'Flash Bank A & B'],
          ['Test Automation Runner', 'PyTest Runner v8.2 + REST Security Fuzzer', 'Lab Node 01'],
          ['Browser Test Suite', 'Chrome v127, Firefox ESR 115, Edge v127', 'Selenium Grid']
        ]
      }
    },
    {
      id: 'sec-matrix',
      title: 'Spreadsheet Test Case Execution Matrix',
      level: 1,
      type: 'testCases',
      testCases: [
        {
          id: 'TC-SEC-01',
          title: 'REST Endpoint Cybersecurity Payload Validation',
          objective: 'Verify /api/maintenance/flash endpoint rejects malformed requests and validates preserve_config.',
          steps: [
            'Send PUT request with empty payload {} -> Expect HTTP 400 Bad Request.',
            'Send PUT request with string payload {"preserve_config": "true"} -> Expect HTTP 400.',
            'Send PUT request with integer payload {"preserve_config": 1} -> Expect HTTP 200 OK.'
          ],
          expectedResult: 'HTTP 200 OK received; /var/tmp/preserveconfig.flag created successfully on BMC.',
          status: 'PASSED',
          actualResult: 'HTTP status 200 returned in 42ms. Flag file verified via debug console.',
          notes: 'Passed automated security test suite.'
        },
        {
          id: 'TC-HPM-01',
          title: 'Full HPM Firmware Image Upload via WebUI',
          objective: 'Validate complete 64MB firmware image upload and flash progression without stalling.',
          steps: [
            'Log into WebUI at https://172.17.45.150 with admin credentials.',
            'Navigate to Maintenance > HPM Firmware Update.',
            'Select bmc-WH-13.03.01-full.hpm and click Upload.',
            'Monitor network websocket packets.'
          ],
          expectedResult: 'Progress bar advances smoothly without stalling on packet 1. Image validation passes.',
          status: 'PASSED',
          actualResult: 'Full upload completed in 1m 18s. Checksum validation verified SHA-256 integrity.',
          notes: 'Zero network packet drop.'
        },
        {
          id: 'TC-IPMI-01',
          title: 'HPM Flash Upgrade via IPMI Command Line Interface',
          objective: 'Confirm upgrade operations execute successfully using ipmitool standard.',
          steps: [
            'Navigate to directory of HPM file.',
            'Execute: ipmitool -U admin -P admin -I lanplus -H 172.17.45.150 hpm upgrade bmc-WH-13.03.01-full.hpm -z 0x1000 force',
            'Verify return code 0 and successful flash progression.'
          ],
          expectedResult: 'Firmware update successful without hanging. Exit code 0.',
          status: 'PASSED',
          actualResult: 'IPMI flashing executed successfully in 3m 42s.',
          notes: 'Dual image redundancy verified.'
        },
        {
          id: 'TC-DUAL-01',
          title: 'Dual-Image Bank Switching & Boot Verification',
          objective: 'Verify BMC activates secondary flash bank and boots into new firmware revision successfully.',
          steps: [
            'Trigger reboot after flash completion.',
            'Monitor serial console UART log during u-boot and kernel init.',
            'Query BMC version via IPMI mc info.'
          ],
          expectedResult: 'Active flash bank switches to Bank B. IPMI reports version 13.03.01.',
          status: 'PASSED',
          actualResult: 'Reboot completed in 84 seconds. Firmware version verified.',
          notes: 'Watchdog timer nominal.'
        },
        {
          id: 'TC-REG-01',
          title: 'Sensor & SDR Repository Integrity Regression',
          objective: 'Ensure thermal, voltage, and fan RPM sensor readings remain operational after upgrade.',
          steps: [
            'Run: ipmitool sdr elist full',
            'Compare sensor reading snapshot before vs after upgrade.'
          ],
          expectedResult: 'All 36 sensor readings report Normal Status with identical threshold calibrations.',
          status: 'PASSED',
          actualResult: '36/36 sensors nominal.',
          notes: 'No dropped SDR records.'
        },
        {
          id: 'TC-PERF-01',
          title: 'Sensor Polling Stress & High Concurrency Test',
          objective: 'Verify BMC handles 50 concurrent WebUI sessions without REST daemon restart.',
          steps: [
            'Spawn 50 concurrent WebSocket clients streaming sensor telemetry.',
            'Measure BMC AST2600 CPU load over 60 minutes.'
          ],
          expectedResult: 'CPU load remains under 12%. Zero dropped WebSocket frames.',
          status: 'PASSED',
          actualResult: 'Average CPU load 4.8%, max 8.2%. Zero disconnections.',
          notes: 'WebSocket optimization verified.'
        },
        {
          id: 'TC-DEF-01',
          title: 'Flash Recovery Mode on Corrupt Image Upload',
          objective: 'Verify watchdog auto-recovers to Golden Bank A when uploading a corrupted binary.',
          steps: [
            'Inject corrupted byte header into test image.',
            'Trigger flash upload and monitor recovery state.'
          ],
          expectedResult: 'Image checksum rejection with HTTP 422. Flash bank remains on Bank A.',
          status: 'PASSED',
          actualResult: 'Image rejected cleanly. Zero corruption on flash banks.',
          notes: 'Failsafe recovery active.'
        }
      ]
    },
    {
      id: 'sec-signoff',
      title: 'QA Sign-off & Production Release Verdict',
      level: 1,
      type: 'callout',
      callout: {
        type: 'success',
        title: 'Release Gate: PASSED (100% Core Coverage)',
        text: 'All 7 mandatory test categories have PASSED with 0 blocking defects. Build 13.03.01 is approved for production deployment.'
      }
    }
  ]
};
