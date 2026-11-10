*** Settings ***
Documentation     AST2600 RTC Clock & Timing
Library           RequestsLibrary

*** Test Cases ***

TC-001_Drift_check_under_load
    [Tags]    High    RTC    Drift
    Log    Test: Drift  check	under load

TC-003_Candidate
    [Tags]    Medium    
    Log    Test: Candidate

TC-004 Own code
    Log    custom