*** Settings ***
Documentation     Dual-Flash WebUI Upgrade & REST API Suite
Library           RequestsLibrary

*** Test Cases ***

C4_Dual-Flash_HPM_Image_Upload_with_preserve_config_Flag
    [Tags]    P1    API    Flash
    Log    Test: Dual-Flash HPM Image Upload with preserve_config Flag

C5_REST_API_Authentication_Token_Expiry_Handling
    [Tags]    P2    API    Security
    Log    Test: REST API Authentication Token Expiry Handling