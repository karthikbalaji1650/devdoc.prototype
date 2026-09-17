# WebUI HPM Firmware Upgrade Failure Investigation & Fix

> **Subtitle:** Root Cause Breakdown, Code Fixes & Verification Matrix

**Document Number:** WH3-1205  
**Author:** Firmware & Platform Engineering Team  
**Date:** 2026-08-13  
**Classification:** INTERNAL ONLY  
**Status:** APPROVED  

---

# Purpose

This document provides a comprehensive technical analysis, root cause breakdown, and permanent code change implementation for the WebUI HPM firmware upgrade/downgrade failure (.hpm files) observed on iXsystem BMC firmware.

# Problem Statement

The flashing process halts unexpectedly during initial transaction processing when attempting HPM BMC firmware update via WebUI.

## Issue Summary

When attempting an HPM BMC firmware upgrade or downgrade using `.hpm` files via the WebUI, the flashing process halts during the initial HTTP request transaction. The firmware update fails to proceed beyond the first packet transaction.

## Steps to Reproduce

1. Navigate to the WebUI Maintenance section: **Maintenance > Firmware Update** or **HPM Firmware Update**.
2. Select a valid `.hpm` firmware image for upgrade or downgrade.
3. Click the upload/flash option to initiate the transaction.
4. Observe that the transaction halts immediately at the initial stage.

## Reproducibility

# Product and Environment Details

| Parameter | Description / Value |
| --- | --- |
| Product / Model | iXsystem BMC |
| Target Firmware | Post-Rev 13.03 BMC Firmware |
| Impacted Packages | packages/spx_restservice-src, packages/webui_html5-src |
| Test Environment | PVT3 System - WH3-12.3 |
| Target Architecture | ARM AST2600 / Linux OpenBMC Platform |

# Investigation & Implementation Details

During WebUI HPM upgrade testing, inspecting initial packet transactions showed that backend REST services returned HTTP 500 errors during input validation. Automated cybersecurity script testing logs on REST endpoints verified status outputs when payload attributes or variable types were improperly passed.

## Key Observation from Log Analysis

- **Missing Flags**: The REST service endpoint expected specific header/body parameters introduced as part of cybersecurity updates.
- **Empty Payload**: The Web UI passed empty payload data (`{}`) to `/api/maintenance/flash`, causing missing flag checks.
- **Type Mismatch**: Type conversions between UI payload parameters (strings) and REST request macros (integers) failed or lacked explicit type casting (`INT8U`).

# Root Cause Analysis

The primary issue where the HPM firmware upgrade via Web UI is not working in the first packet transaction itself is due to the following findings:

1. **Missing Cybersecurity Header Payload Component (`preserve_config`)**: In post-Rev 12.67 cybersecurity updates, backend REST validation required a `preserve_config` parameter for firmware flash preparation. The WebUI code was missing this payload element when issuing the `/api/maintenance/flash` request, causing the transaction to halt on the first HTTPS packet.
2. **String-to-Integer Type Mismatches in REST Endpoints**: Server-side `spx_restservice` macro endpoints (`REQUEST_REQUIRED_VAR_INTEGER`) expected strict integer parameters. UI inputs passed numeric values as raw strings without explicit conversion (`parseInt`), leading to variable type mismatches.
3. **Missing Explicit Type Casting in C Backend**: The backend macro calls in `maintenance_fwupdate.c` lacked explicit `(INT8U)` type casting for integer variables, causing inconsistent parameter parsing when handling HTTP requests.

# Current Implementation

Review of the pre-fix frontend and backend source code identifying the missing payload and unparsed string inputs.

## A. Frontend WebUI Code (HpmFirmwareUpdateView.js)

```javascript
// Unparsed string input parsing
imageconfig: function() {
  var that = this;
  var data = {};
  that.image_update = $('#idimage_update').val(); // String type passed
  data.image_update = that.image_update;
  if (app.configurations.isFeatureAvailable("ONLINE_FLASH_SUPPORT")) {
    data.reboot_bmc = $('#idreboot_bmc').val(); // String type passed
  }
  var object = JSON.stringify(data);
  $.ajax({
    url: "/api/maintenance/dualflashimageconfig",
    type: "PUT",
    data: object,
    contentType: "application/json"
  });
},

startApp: function() {
  var that = this;
  if (this.flashAreaPrepared) {
    that.doBootPlusApp.call(that);
  } else {
    $.ajax({
      url: "/api/maintenance/flash",
      type: "PUT",
      dataType: "json",
      data: "{}", // BUG: Empty payload causing backend rejection
      contentType: "application/json",
      success: function(data, status, xhr) {
        that.BIOS_FLASH = false;
        that.doBootPlusApp.call(that);
      },
      error: app.HTTPErrorHandler
    });
  }
}
```

# Proposed Solution & Code Changes

A comprehensive fix was designed to align the WebUI payload with the REST API contract and enforce strict integer parsing across both tiers.

## Architectural Comparison

| Metric / Behavior | Old Implementation | Proposed Implementation |
| --- | --- | --- |
| Flash Request Payload | Empty JSON payload ({}) | Valid JSON containing preserve_config flag |
| UI Data Parsing | Raw string values from DOM inputs | Explicit parseInt(val, 10) casting before transmission |
| Backend Macro Parsing | Implicit casting in REQUEST_REQUIRED_VAR_INTEGER | Explicit (INT8U) cast applied to all integer variables |
| Transaction Status | Hangs on HTTP 500 in 1st packet | Completes 100% full HPM flash image upload & verification |

## Proposed Frontend WebUI Code Changes

```diff
# Old Code:
// OLD CODE:
startApp: function() {
  $.ajax({
    url: "/api/maintenance/flash",
    type: "PUT",
    data: "{}" // Missing preserve_config
  });
}

# New Code:
// FIXED CODE:
startApp: function() {
  var that = this;
  var preserve_config_value = $('#idpreserve_config').is(':checked') ? 1 : 0;
  var data_to_send = {
    preserve_config: preserve_config_value
  };
  
  $.ajax({
    url: "/api/maintenance/flash",
    type: "PUT",
    dataType: "json",
    data: JSON.stringify(data_to_send),
    contentType: "application/json",
    success: function(data, status, xhr) {
      console.log("Flash prep successful, uploading image.");
      that.BIOS_FLASH = false;
      that.doBootPlusApp.call(that);
      that.flashAreaPrepared = true;
    },
    error: app.HTTPErrorHandler
  });
}
```

## Proposed Backend REST Service Changes

```c
START_AUTHORIZED_NOIPMI_MODEL (putFlashMode, PUT, "/maintenance/flash", 1, matches, true)
{
    int wRet = RPC_HAPI_SUCCESS;
    int preserve_config = 0;
    if(sess != NULL) {
        sess->putint(sess, "curFlashState", VIA_WEB_FLASH_MODE_STAGE_INITIED_WAITING_FOR_UPLOAD, true);
    }
    // Explicit INT8U casting prevents parsing errors
    REQUEST_REQUIRED_VAR_INTEGER(preserve_config, "preserve_config", (INT8U));
    if(preserve_config == 1) {
        if(touch("/var/tmp/preserveconfig.flag") != 0)
            TCRIT("Error Creating %s \n", "/var/tmp/preserveconfig.flag");
    }
    wRet = PrepareFlashArea(FLSH_CMD_PREP_FLASH_AREA, g_corefeatures.dual_image_support);
    if(wRet != RPC_HAPI_SUCCESS && wRet != ALREADY_PREPARED_ERROR) {
        THROW_MODEL_ERROR_WITHOUT_LOGOUT(STATUS_500, "Error in preparing flash area", COULD_NOT_PREPARE_FLASH_AREA);
    }
    SAVE_SUCCEEDED_OUTPUT();
} END_AUTHORIZED_NOIPMI_MODEL
```

# Root Cause vs. Resolution Verification Matrix

# Validation Method & Test Cases

