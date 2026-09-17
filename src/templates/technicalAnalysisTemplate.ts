import type { DocumentModel } from '../types/document';

export const sampleTechnicalAnalysisDoc: DocumentModel = {
  metadata: {
    id: 'wh3-1205-sample',
    title: 'WebUI HPM Firmware Upgrade Failure Investigation & Fix',
    subtitle: 'Root Cause Breakdown, Code Fixes & Verification Matrix',
    docNumber: 'WH3-1205',
    author: 'Manivannan Thangavel',
    department: 'Platform Systems Engineering',
    date: '2026-08-13',
    version: '1.0',
    classification: 'INTERNAL ONLY',
    status: 'APPROVED',
    templateType: 'technical-analysis',
    logoUrl: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 60" fill="none"><rect width="40" height="40" y="10" rx="8" fill="%232563EB"/><path d="M14 24h12v12H14z" fill="white"/><path d="M20 18v6m0 12v6m-6-12H8m24 0h-6" stroke="white" stroke-width="2" stroke-linecap="round"/><text x="50" y="38" fill="%231E3A8A" font-family="Arial" font-weight="bold" font-size="20">FIRMWARE</text></svg>',
    logoPosition: 'center',
    tags: ['BMC', 'Firmware', 'REST API', 'HPM Upgrade', 'Cybersecurity']
  },
  sections: [
    {
      id: 'sec-purpose',
      title: 'Purpose',
      level: 1,
      type: 'richText',
      content: 'This document provides a comprehensive technical analysis, root cause breakdown, and permanent code change implementation for the WebUI HPM firmware upgrade/downgrade failure (.hpm files) observed on iXsystem BMC firmware.'
    },
    {
      id: 'sec-problem-stmt',
      title: 'Problem Statement',
      level: 1,
      type: 'richText',
      content: 'The flashing process halts unexpectedly during initial transaction processing when attempting HPM BMC firmware update via WebUI.'
    },
    {
      id: 'sec-issue-summary',
      title: 'Issue Summary',
      level: 2,
      type: 'richText',
      content: 'When attempting an HPM BMC firmware upgrade or downgrade using `.hpm` files via the WebUI, the flashing process halts during the initial HTTP request transaction. The firmware update fails to proceed beyond the first packet transaction.'
    },
    {
      id: 'sec-steps-repro',
      title: 'Steps to Reproduce',
      level: 2,
      type: 'richText',
      content: '1. Navigate to the WebUI Maintenance section: **Maintenance > Firmware Update** or **HPM Firmware Update**.\n2. Select a valid `.hpm` firmware image for upgrade or downgrade.\n3. Click the upload/flash option to initiate the transaction.\n4. Observe that the transaction halts immediately at the initial stage.'
    },
    {
      id: 'sec-reproducibility',
      title: 'Reproducibility',
      level: 2,
      type: 'callout',
      callout: {
        type: 'warning',
        title: '100% Reproducibility',
        text: 'Always reproduced on iXsystem BMC firmware SW 13.03 across all PVT3 hardware configurations.'
      }
    },
    {
      id: 'sec-prod-env',
      title: 'Product and Environment Details',
      level: 1,
      type: 'table',
      tableData: {
        headers: ['Parameter', 'Description / Value'],
        rows: [
          ['Product / Model', 'iXsystem BMC'],
          ['Target Firmware', 'Post-Rev 13.03 BMC Firmware'],
          ['Impacted Packages', 'packages/spx_restservice-src, packages/webui_html5-src'],
          ['Test Environment', 'PVT3 System - WH3-12.3'],
          ['Target Architecture', 'ARM AST2600 / Linux OpenBMC Platform']
        ]
      }
    },
    {
      id: 'sec-investigation',
      title: 'Investigation & Implementation Details',
      level: 1,
      type: 'richText',
      content: 'During WebUI HPM upgrade testing, inspecting initial packet transactions showed that backend REST services returned HTTP 500 errors during input validation. Automated cybersecurity script testing logs on REST endpoints verified status outputs when payload attributes or variable types were improperly passed.'
    },
    {
      id: 'sec-obs-logs',
      title: 'Key Observation from Log Analysis',
      level: 2,
      type: 'richText',
      content: '- **Missing Flags**: The REST service endpoint expected specific header/body parameters introduced as part of cybersecurity updates.\n- **Empty Payload**: The Web UI passed empty payload data (`{}`) to `/api/maintenance/flash`, causing missing flag checks.\n- **Type Mismatch**: Type conversions between UI payload parameters (strings) and REST request macros (integers) failed or lacked explicit type casting (`INT8U`).'
    },
    {
      id: 'sec-rca',
      title: 'Root Cause Analysis',
      level: 1,
      type: 'richText',
      content: 'The primary issue where the HPM firmware upgrade via Web UI is not working in the first packet transaction itself is due to the following findings:\n\n1. **Missing Cybersecurity Header Payload Component (`preserve_config`)**: In post-Rev 12.67 cybersecurity updates, backend REST validation required a `preserve_config` parameter for firmware flash preparation. The WebUI code was missing this payload element when issuing the `/api/maintenance/flash` request, causing the transaction to halt on the first HTTPS packet.\n2. **String-to-Integer Type Mismatches in REST Endpoints**: Server-side `spx_restservice` macro endpoints (`REQUEST_REQUIRED_VAR_INTEGER`) expected strict integer parameters. UI inputs passed numeric values as raw strings without explicit conversion (`parseInt`), leading to variable type mismatches.\n3. **Missing Explicit Type Casting in C Backend**: The backend macro calls in `maintenance_fwupdate.c` lacked explicit `(INT8U)` type casting for integer variables, causing inconsistent parameter parsing when handling HTTP requests.'
    },
    {
      id: 'sec-current-impl',
      title: 'Current Implementation',
      level: 1,
      type: 'richText',
      content: 'Review of the pre-fix frontend and backend source code identifying the missing payload and unparsed string inputs.'
    },
    {
      id: 'sec-cur-frontend-code',
      title: 'A. Frontend WebUI Code (HpmFirmwareUpdateView.js)',
      level: 2,
      type: 'codeDiff',
      codeSnippet: {
        filename: 'packages/webui_html5-src/data/app/views/maintenance/HpmFirmwareUpdateView.js',
        language: 'javascript',
        description: 'Original code passing unparsed strings and empty payload',
        code: `// Unparsed string input parsing\nimageconfig: function() {\n  var that = this;\n  var data = {};\n  that.image_update = $('#idimage_update').val(); // String type passed\n  data.image_update = that.image_update;\n  if (app.configurations.isFeatureAvailable("ONLINE_FLASH_SUPPORT")) {\n    data.reboot_bmc = $('#idreboot_bmc').val(); // String type passed\n  }\n  var object = JSON.stringify(data);\n  $.ajax({\n    url: "/api/maintenance/dualflashimageconfig",\n    type: "PUT",\n    data: object,\n    contentType: "application/json"\n  });\n},\n\nstartApp: function() {\n  var that = this;\n  if (this.flashAreaPrepared) {\n    that.doBootPlusApp.call(that);\n  } else {\n    $.ajax({\n      url: "/api/maintenance/flash",\n      type: "PUT",\n      dataType: "json",\n      data: "{}", // BUG: Empty payload causing backend rejection\n      contentType: "application/json",\n      success: function(data, status, xhr) {\n        that.BIOS_FLASH = false;\n        that.doBootPlusApp.call(that);\n      },\n      error: app.HTTPErrorHandler\n    });\n  }\n}`
      }
    },
    {
      id: 'sec-prop-sol',
      title: 'Proposed Solution & Code Changes',
      level: 1,
      type: 'richText',
      content: 'A comprehensive fix was designed to align the WebUI payload with the REST API contract and enforce strict integer parsing across both tiers.'
    },
    {
      id: 'sec-arch-comp',
      title: 'Architectural Comparison',
      level: 2,
      type: 'table',
      tableData: {
        headers: ['Metric / Behavior', 'Old Implementation', 'Proposed Implementation'],
        rows: [
          ['Flash Request Payload', 'Empty JSON payload ({})', 'Valid JSON containing preserve_config flag'],
          ['UI Data Parsing', 'Raw string values from DOM inputs', 'Explicit parseInt(val, 10) casting before transmission'],
          ['Backend Macro Parsing', 'Implicit casting in REQUEST_REQUIRED_VAR_INTEGER', 'Explicit (INT8U) cast applied to all integer variables'],
          ['Transaction Status', 'Hangs on HTTP 500 in 1st packet', 'Completes 100% full HPM flash image upload & verification']
        ]
      }
    },
    {
      id: 'sec-prop-code-frontend',
      title: 'Proposed Frontend WebUI Code Changes',
      level: 2,
      type: 'codeDiff',
      codeSnippet: {
        filename: 'packages/webui_html5-src/data/app/views/maintenance/HpmFirmwareUpdateView.js',
        language: 'javascript',
        description: 'Fixed startApp and startHPM with valid preserve_config payload',
        isDiff: true,
        oldCode: `// OLD CODE:\nstartApp: function() {\n  $.ajax({\n    url: "/api/maintenance/flash",\n    type: "PUT",\n    data: "{}" // Missing preserve_config\n  });\n}`,
        newCode: `// FIXED CODE:\nstartApp: function() {\n  var that = this;\n  var preserve_config_value = $('#idpreserve_config').is(':checked') ? 1 : 0;\n  var data_to_send = {\n    preserve_config: preserve_config_value\n  };\n  \n  $.ajax({\n    url: "/api/maintenance/flash",\n    type: "PUT",\n    dataType: "json",\n    data: JSON.stringify(data_to_send),\n    contentType: "application/json",\n    success: function(data, status, xhr) {\n      console.log("Flash prep successful, uploading image.");\n      that.BIOS_FLASH = false;\n      that.doBootPlusApp.call(that);\n      that.flashAreaPrepared = true;\n    },\n    error: app.HTTPErrorHandler\n  });\n}`
      }
    },
    {
      id: 'sec-prop-code-backend',
      title: 'Proposed Backend REST Service Changes',
      level: 2,
      type: 'codeDiff',
      codeSnippet: {
        filename: 'packages/spx_restservice-src/spx/maintenance_fwupdate.c',
        language: 'c',
        description: 'Updated REST macro bindings with explicit (INT8U) casting',
        code: `START_AUTHORIZED_NOIPMI_MODEL (putFlashMode, PUT, "/maintenance/flash", 1, matches, true)\n{\n    int wRet = RPC_HAPI_SUCCESS;\n    int preserve_config = 0;\n    if(sess != NULL) {\n        sess->putint(sess, "curFlashState", VIA_WEB_FLASH_MODE_STAGE_INITIED_WAITING_FOR_UPLOAD, true);\n    }\n    // Explicit INT8U casting prevents parsing errors\n    REQUEST_REQUIRED_VAR_INTEGER(preserve_config, "preserve_config", (INT8U));\n    if(preserve_config == 1) {\n        if(touch("/var/tmp/preserveconfig.flag") != 0)\n            TCRIT("Error Creating %s \\n", "/var/tmp/preserveconfig.flag");\n    }\n    wRet = PrepareFlashArea(FLSH_CMD_PREP_FLASH_AREA, g_corefeatures.dual_image_support);\n    if(wRet != RPC_HAPI_SUCCESS && wRet != ALREADY_PREPARED_ERROR) {\n        THROW_MODEL_ERROR_WITHOUT_LOGOUT(STATUS_500, "Error in preparing flash area", COULD_NOT_PREPARE_FLASH_AREA);\n    }\n    SAVE_SUCCEEDED_OUTPUT();\n} END_AUTHORIZED_NOIPMI_MODEL`
      }
    },
    {
      id: 'sec-matrix',
      title: 'Root Cause vs. Resolution Verification Matrix',
      level: 1,
      type: 'verificationMatrix',
      verificationMatrix: [
        {
          id: '1',
          rootCause: 'Missing preserve_config payload component halts initial HTTPS transaction.',
          fixLocation: 'HpmFirmwareUpdateView.js (startApp)',
          resolution: 'Constructing and stringifying data_to_send.preserve_config allows backend validation to succeed.',
          status: 'PASSED'
        },
        {
          id: '2',
          rootCause: 'String-to-integer conversion mismatch in UI endpoints.',
          fixLocation: 'HpmFirmwareUpdateView.js (imageconfig)',
          resolution: 'parseInt() converts string inputs before JSON body formatting.',
          status: 'PASSED'
        },
        {
          id: '3',
          rootCause: 'Missing explicit casting macro arguments in C backend.',
          fixLocation: 'maintenance_fwupdate.c (putFlashMode)',
          resolution: 'Explicit (INT8U) casting resolves variable parsing issues across all REST models.',
          status: 'PASSED'
        }
      ]
    },
    {
      id: 'sec-validation',
      title: 'Validation Method & Test Cases',
      level: 1,
      type: 'testCases',
      testCases: [
        {
          id: 'TC-01',
          title: 'WebUI HPM Firmware Upgrade',
          objective: 'Verify that .hpm firmware upgrade completes successfully via WebUI without hanging.',
          steps: [
            'Navigate to WebUI: Maintenance > HPM Firmware Update.',
            'Select a valid .hpm firmware upgrade image.',
            'Click start flash and monitor network tab payload.',
            'Check whether the HPM firmware update succeeds.'
          ],
          expectedResult: 'Firmware upload completes 100% without hanging on packet 1. Device reboots with target firmware version.',
          status: 'PASSED',
          actualResult: 'Passed on PVT3 System with firmware revision 13.03.01.',
          notes: 'No HTTP 500 errors observed.'
        },
        {
          id: 'TC-02',
          title: 'HPM Firmware via IPMI Command Line',
          objective: 'Confirm upgrade operations execute successfully via IPMI tool.',
          steps: [
            'Navigate to directory of HPM file "bmc-WH-13.03.0.0-full.hpm"',
            'Execute: ipmitool -U admin -P admin -I lanplus -H 172.17.45.150 hpm upgrade bmc-WH-13.03.0.0-full.hpm -z 0x1000 force',
            'Verify return code and status output.'
          ],
          expectedResult: 'Firmware update successful without hanging. Exit code 0.',
          status: 'PASSED',
          actualResult: 'IPMI flashing executed successfully in 3m 42s.',
          notes: 'Dual image redundancy verified.'
        },
        {
          id: 'TC-03',
          title: 'Cybersecurity REST Test Suite',
          objective: 'Ensure automated REST payload validation passes without service crash or buffer overrun.',
          steps: [
            'Run automated REST fuzzing and schema verification test suite.',
            'Send malformed payload and verify graceful error handling (HTTP 400).',
            'Send valid payload and verify HTTP 200.'
          ],
          expectedResult: 'All REST test cases pass. Zero daemon crashes or memory leaks.',
          status: 'PASSED',
          actualResult: 'Passed 48/48 security test vectors.',
          notes: 'Covered under SPX security test harness.'
        }
      ]
    }
  ]
};

export const blankTechnicalAnalysisDoc: DocumentModel = {
  metadata: {
    id: 'tech-analysis-blank',
    title: 'Technical Analysis Document',
    subtitle: 'System Investigation, Root Cause Analysis & Solution Architecture',
    docNumber: 'TECH-2026-001',
    author: 'Author Name',
    department: 'Engineering Team',
    date: new Date().toISOString().split('T')[0],
    version: '1.0',
    classification: 'INTERNAL ONLY',
    status: 'DRAFT',
    templateType: 'technical-analysis',
    tags: ['Architecture', 'Analysis', 'Bugfix']
  },
  sections: [
    {
      id: 'sec-purpose',
      title: 'Purpose',
      level: 1,
      type: 'richText',
      content: 'Describe the purpose of this technical analysis and the scope of the system or component under review.'
    },
    {
      id: 'sec-problem-stmt',
      title: 'Problem Statement',
      level: 1,
      type: 'richText',
      content: 'Summarize the problem, symptoms observed, and impacted business or technical workflows.'
    },
    {
      id: 'sec-steps-repro',
      title: 'Steps to Reproduce',
      level: 2,
      type: 'richText',
      content: '1. Step 1\n2. Step 2\n3. Step 3'
    },
    {
      id: 'sec-env',
      title: 'Product & Environment Details',
      level: 1,
      type: 'table',
      tableData: {
        headers: ['Parameter', 'Description / Value'],
        rows: [
          ['System / Component', 'Specify system name'],
          ['Environment', 'Production / Staging / Testbench'],
          ['Software Version', 'v1.0.0'],
          ['Impacted Modules', 'Specify impacted files or modules']
        ]
      }
    },
    {
      id: 'sec-rca',
      title: 'Root Cause Analysis',
      level: 1,
      type: 'richText',
      content: 'Detail the underlying technical cause identified through investigation, log traces, or debugging.'
    },
    {
      id: 'sec-code-changes',
      title: 'Proposed Code Changes',
      level: 1,
      type: 'codeDiff',
      codeSnippet: {
        filename: 'src/module.ts',
        language: 'typescript',
        description: 'Implementation change',
        code: '// Add code change here'
      }
    },
    {
      id: 'sec-matrix',
      title: 'Root Cause vs. Resolution Matrix',
      level: 1,
      type: 'verificationMatrix',
      verificationMatrix: [
        {
          id: '1',
          rootCause: 'Primary root cause description',
          fixLocation: 'filename:line',
          resolution: 'Explanation of how the fix resolves the root cause',
          status: 'PENDING'
        }
      ]
    },
    {
      id: 'sec-validation',
      title: 'Validation & Testing',
      level: 1,
      type: 'testCases',
      testCases: [
        {
          id: 'TC-01',
          title: 'Verification Test Case',
          objective: 'Verify the fix resolves the issue without regressions.',
          steps: ['Execute test scenario', 'Inspect outputs'],
          expectedResult: 'Expected behavior occurs successfully.',
          status: 'PENDING'
        }
      ]
    }
  ]
};
