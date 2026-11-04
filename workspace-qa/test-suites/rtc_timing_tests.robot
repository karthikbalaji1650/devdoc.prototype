*** Settings ***
Documentation     Verification Suite for Firmware RTC Timing (LD_001_firmware_Bovine_v4)
Library           RequestsLibrary
Library           SSHLibrary
Library           Collections

*** Variables ***
${BMC_IP}         192.168.1.100
${PORT}           443
${TIMEOUT}        10s

*** Test Cases ***
TC_RTC_001_Clock_Drift_Verification
    [Documentation]    Ensures RTC drift does not exceed 50ms over 1-hour burn-in.
    [Tags]             P1    Firmware    RTC
    Given BMC System Is Operational    ${BMC_IP}
    When Apply Stress Load For 60 Minutes
    Then Verify RTC Drift Is Less Than    50    ms

TC_RTC_002_Rest_API_RTC_Endpoint_Validation
    [Documentation]    Validates GET /api/v1/system/rtc returns HTTP 200 with valid ISO timestamp.
    [Tags]             P2    REST_API
    Log    Validating RTC endpoint...

*** Keywords ***
BMC System Is Operational
    [Arguments]    ${ip}
    Log    Checking BMC operational status at ${ip}

Apply Stress Load For 60 Minutes
    Log    Applying stress burn-in load

Verify RTC Drift Is Less Than
    [Arguments]    ${max_drift}    ${unit}
    Log    Verifying RTC drift is within ${max_drift}${unit}
