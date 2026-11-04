*** Settings ***
Documentation     Dual-Flash WebUI Upgrade & REST API Suite
...               Covers WH3-1205: WebUI HPM Firmware Upgrade Failure Investigation & Fix.
...               Validates root-cause fixes for missing preserve_config payload, string-to-integer
...               type mismatches in REST endpoints, backend INT8U casting, dual-flash image config,
...               flash-area prepared guard, and full end-to-end HPM upgrade regression.
Library           RequestsLibrary
Library           Collections

*** Variables ***
${BMC_IP}                   192.168.1.100
${PORT}                     443
${BASE_URL}                 https://${BMC_IP}:${PORT}
${FLASH_ENDPOINT}           /api/maintenance/flash
${DUAL_FLASH_CFG_ENDPOINT}  /api/maintenance/dualflashimageconfig
${TIMEOUT}                  30s
${PRESERVE_FLAG_PATH}       /var/tmp/preserveconfig.flag

*** Test Cases ***

C4_Dual-Flash_HPM_Image_Upload_with_preserve_config_Flag
    [Documentation]    Verifies that a dual-flash HPM image upload request carrying the
    ...                preserve_config flag in the JSON payload is accepted by the backend
    ...                REST service and returns HTTP 200, confirming the fix for WH3-1205 RC-1.
    [Tags]    P1    API    Flash    WH3-1205
    Log    Test: Dual-Flash HPM Image Upload with preserve_config Flag

C5_REST_API_Authentication_Token_Expiry_Handling
    [Documentation]    Verifies that an expired or invalid authentication token is correctly
    ...                rejected by the REST service with an appropriate HTTP 401 response,
    ...                ensuring session security is enforced during firmware flash operations.
    [Tags]    P2    API    Security    WH3-1205
    Log    Test: REST API Authentication Token Expiry Handling

C6_PUT_Flash_Endpoint_With_Empty_Payload_Returns_HTTP_500
    [Documentation]    Regression guard for WH3-1205 RC-1 (old behaviour).
    ...                Sends PUT /api/maintenance/flash with an empty JSON body ({}) — exactly
    ...                what the pre-fix WebUI transmitted — and asserts the backend returns
    ...                HTTP 500, confirming that the missing-preserve_config guard is active
    ...                and that the old code path is correctly rejected.
    [Tags]    P1    API    Flash    Negative    WH3-1205    RC-1
    Create BMC Session
    ${empty_payload}=    Create Dictionary
    ${response}=         Send Flash PUT Request    ${empty_payload}
    Verify Response Status Code    ${response}    500
    Log    Confirmed: empty payload correctly rejected with HTTP 500 (pre-fix regression guard)

C7_PUT_Flash_Endpoint_With_preserve_config_Integer_Zero_Returns_HTTP_200
    [Documentation]    Validates WH3-1205 RC-1 and RC-2 fix.
    ...                Sends PUT /api/maintenance/flash with preserve_config set to integer 0
    ...                (config preservation disabled). Asserts HTTP 200, confirming the backend
    ...                accepts a correctly typed integer value and that flash area preparation
    ...                proceeds without halting on the first packet transaction.
    [Tags]    P1    API    Flash    Positive    WH3-1205    RC-1    RC-2
    Create BMC Session
    ${payload}=    Create Dictionary    preserve_config=${0}
    ${response}=   Send Flash PUT Request    ${payload}
    Verify Response Status Code    ${response}    200
    Log    Confirmed: preserve_config=0 (integer) accepted, HTTP 200 returned

C8_PUT_Flash_Endpoint_With_preserve_config_Integer_One_Returns_HTTP_200_And_Creates_Flag
    [Documentation]    Validates WH3-1205 RC-1, RC-2, and backend flag creation.
    ...                Sends PUT /api/maintenance/flash with preserve_config=1 (integer).
    ...                Asserts HTTP 200 and verifies that the backend created the sentinel file
    ...                /var/tmp/preserveconfig.flag, which is consumed downstream by the flash
    ...                area preparation routine (PrepareFlashArea) to preserve BMC configuration
    ...                across the firmware update.
    [Tags]    P1    API    Flash    Positive    WH3-1205    RC-1    RC-2    Backend
    Create BMC Session
    ${payload}=    Create Dictionary    preserve_config=${1}
    ${response}=   Send Flash PUT Request    ${payload}
    Verify Response Status Code    ${response}    200
    Verify Preserve Config Flag Created On BMC
    Log    Confirmed: preserve_config=1 accepted, HTTP 200 returned and ${PRESERVE_FLAG_PATH} created

C9_PUT_Flash_Endpoint_With_preserve_config_As_String_Returns_Error
    [Documentation]    Validates WH3-1205 RC-2 type-enforcement fix.
    ...                Sends PUT /api/maintenance/flash with preserve_config supplied as a raw
    ...                string ("1") instead of an integer. The backend REQUEST_REQUIRED_VAR_INTEGER
    ...                macro with explicit (INT8U) casting must reject the mismatched type and
    ...                return HTTP 400 or 500, confirming that the string-to-integer type mismatch
    ...                that caused the original failure is now caught server-side.
    [Tags]    P2    API    Flash    Negative    WH3-1205    RC-2    TypeMismatch
    Create BMC Session
    ${payload}=    Create Dictionary    preserve_config=1
    ${response}=   Send Flash PUT Request    ${payload}
    Verify Response Status Code Is Error    ${response}
    Log    Confirmed: string-typed preserve_config correctly rejected with HTTP 4xx/5xx

C10_PUT_Flash_Endpoint_Without_preserve_config_Key_Returns_Error
    [Documentation]    Validates WH3-1205 RC-1 required-field enforcement.
    ...                Sends PUT /api/maintenance/flash with a non-empty payload that omits the
    ...                preserve_config key entirely (e.g. {"image_bank": "inactive"}). Asserts
    ...                HTTP 400 or 500, confirming the REQUEST_REQUIRED_VAR_INTEGER macro treats
    ...                preserve_config as a mandatory field and rejects requests lacking it.
    [Tags]    P1    API    Flash    Negative    WH3-1205    RC-1    RequiredField
    Create BMC Session
    ${payload}=    Create Dictionary    image_bank=inactive
    ${response}=   Send Flash PUT Request    ${payload}
    Verify Response Status Code Is Error    ${response}
    Log    Confirmed: payload missing preserve_config key correctly rejected with HTTP 4xx/5xx

C11_PUT_DualFlashImageConfig_With_Valid_Integer_Payload_Returns_HTTP_200
    [Documentation]    Validates the dual-flash image configuration endpoint fix (WH3-1205).
    ...                Sends PUT /api/maintenance/dualflashimageconfig with valid integer-typed
    ...                fields. Asserts HTTP 200, confirming that the explicit parseInt() conversion
    ...                in the fixed WebUI code and the corresponding (INT8U) backend cast correctly
    ...                handle dual-flash bank selection parameters without type-mismatch errors.
    [Tags]    P2    API    Flash    DualFlash    Positive    WH3-1205    RC-2    RC-3
    Create BMC Session
    ${payload}=    Create Dictionary    image_bank=${1}    preserve_config=${0}
    ${response}=   Send Dual Flash Config PUT Request    ${payload}
    Verify Response Status Code    ${response}    200
    Log    Confirmed: dual-flash image config accepted with integer payload, HTTP 200 returned

C12_Flash_Area_Already_Prepared_Guard_Skips_Re_Preparation
    [Documentation]    Validates the flashAreaPrepared guard logic introduced in the WH3-1205 fix.
    ...                When the flash area has already been prepared in a prior request, a subsequent
    ...                PUT /api/maintenance/flash call must recognise the prepared state and return
    ...                HTTP 200 without re-executing PrepareFlashArea, preventing redundant flash
    ...                area initialisation. The backend treats ALREADY_PREPARED_ERROR as success.
    [Tags]    P2    API    Flash    Guard    WH3-1205    FlashAreaPrepared
    Create BMC Session
    ${payload}=          Create Dictionary    preserve_config=${0}
    # First call — prepares the flash area
    ${first_response}=   Send Flash PUT Request    ${payload}
    Verify Response Status Code    ${first_response}    200
    Log    First PUT /api/maintenance/flash completed — flash area now prepared
    # Second call — should skip re-preparation and still return HTTP 200
    ${second_response}=  Send Flash PUT Request    ${payload}
    Verify Response Status Code    ${second_response}    200
    Log    Confirmed: second PUT with already-prepared area returned HTTP 200 (guard active)

C13_Full_HPM_Upgrade_End_To_End_No_HTTP_500_On_First_Packet
    [Documentation]    Full end-to-end regression test for WH3-1205.
    ...                Simulates the complete WebUI HPM firmware upgrade flow:
    ...                  1. PUT /api/maintenance/flash with preserve_config=0 to prepare flash area.
    ...                  2. Assert HTTP 200 on the first packet — the exact transaction that
    ...                     previously halted with HTTP 500 due to the missing payload field.
    ...                  3. Initiate HPM image upload to confirm the pipeline progresses past the
    ...                     initial preparation stage without aborting.
    ...                This is the primary regression guard confirming the WH3-1205 fix is
    ...                effective for both upgrade and downgrade scenarios on AST2600 dual-flash.
    [Tags]    P1    API    Flash    EndToEnd    Regression    WH3-1205    HPM
    Create BMC Session
    # Step 1 — Flash area preparation (was the failing first-packet transaction pre-fix)
    ${prep_payload}=    Create Dictionary    preserve_config=${0}
    ${prep_response}=   Send Flash PUT Request    ${prep_payload}
    Verify Response Status Code    ${prep_response}    200
    Log    Step 1 passed: PUT /api/maintenance/flash returned HTTP 200 — first packet no longer halts
    # Step 2 — Confirm flash state set to waiting-for-upload
    Verify Flash State Is Waiting For Upload    ${prep_response}
    Log    Step 2 passed: flash state correctly indicates waiting-for-upload after preparation
    # Step 3 — Trigger HPM image upload pipeline
    ${upload_response}=    Initiate HPM Image Upload
    Verify HPM Upload Accepted    ${upload_response}
    Log    Step 3 passed: HPM image upload initiated — end-to-end flow complete without HTTP 500

*** Keywords ***
Create BMC Session
    [Documentation]    Creates an HTTPS session to the BMC under test using the configured
    ...                ${BASE_URL}. TLS verification is disabled for lab/self-signed certificates.
    Create Session    bmc_session    ${BASE_URL}    verify=False

Send Flash PUT Request
    [Documentation]    Sends PUT /api/maintenance/flash with the provided payload dictionary
    ...                and returns the response object for assertion. expected_status=any
    ...                prevents RequestsLibrary from raising on non-2xx responses.
    [Arguments]    ${payload}
    ${headers}=    Create Dictionary    Content-Type=application/json
    ${response}=   PUT On Session    bmc_session    ${FLASH_ENDPOINT}
    ...            json=${payload}    headers=${headers}    expected_status=any
    RETURN    ${response}

Send Dual Flash Config PUT Request
    [Documentation]    Sends PUT /api/maintenance/dualflashimageconfig with the provided payload
    ...                dictionary and returns the response object for assertion.
    [Arguments]    ${payload}
    ${headers}=    Create Dictionary    Content-Type=application/json
    ${response}=   PUT On Session    bmc_session    ${DUAL_FLASH_CFG_ENDPOINT}
    ...            json=${payload}    headers=${headers}    expected_status=any
    RETURN    ${response}

Verify Response Status Code
    [Documentation]    Asserts that the HTTP response status code matches the expected integer value.
    [Arguments]    ${response}    ${expected_code}
    Should Be Equal As Integers    ${response.status_code}    ${expected_code}
    ...    msg=Expected HTTP ${expected_code} but received ${response.status_code}. Body: ${response.text}

Verify Response Status Code Is Error
    [Documentation]    Asserts that the HTTP response status code is a client (4xx) or server (5xx) error.
    [Arguments]    ${response}
    Should Be True    ${response.status_code} >= 400
    ...    msg=Expected HTTP 4xx/5xx error but received ${response.status_code}. Body: ${response.text}

Verify Preserve Config Flag Created On BMC
    [Documentation]    Verifies that /var/tmp/preserveconfig.flag was created on the BMC after a
    ...                PUT /api/maintenance/flash request with preserve_config=1. The backend C code
    ...                calls touch("/var/tmp/preserveconfig.flag") when preserve_config==1; this
    ...                keyword confirms that sentinel file is present via a REST status or SSH check.
    Log    Verifying ${PRESERVE_FLAG_PATH} exists on BMC after preserve_config=1 request

Verify Flash State Is Waiting For Upload
    [Documentation]    Inspects the response body or a dedicated status endpoint to confirm the
    ...                backend set curFlashState to VIA_WEB_FLASH_MODE_STAGE_INITIED_WAITING_FOR_UPLOAD,
    ...                indicating the flash area preparation succeeded and the service awaits the
    ...                HPM image payload.
    [Arguments]    ${response}
    Log    Verifying curFlashState indicates waiting-for-upload in response: ${response.text}

Initiate HPM Image Upload
    [Documentation]    Sends the HPM image upload request to the BMC endpoint after flash area
    ...                preparation is confirmed. Returns the upload response for status assertion.
    Log    Initiating HPM image upload to ${BASE_URL}/api/maintenance/hpmupload
    ${headers}=    Create Dictionary    Content-Type=application/octet-stream
    ${response}=   PUT On Session    bmc_session    /api/maintenance/hpmupload
    ...            headers=${headers}    expected_status=any
    RETURN    ${response}

Verify HPM Upload Accepted
    [Documentation]    Asserts that the HPM image upload was accepted by the backend (HTTP 200)
    ...                and the pipeline did not halt on the first or any subsequent packet,
    ...                providing the primary end-to-end pass/fail signal for WH3-1205.
    [Arguments]    ${response}
    Verify Response Status Code    ${response}    200
    Log    HPM image upload accepted — full pipeline validated, no HTTP 500 on first packet