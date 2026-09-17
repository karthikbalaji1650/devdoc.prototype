*** Settings ***
Documentation     AST2600 RTC Clock & Timing Suite
Library           RequestsLibrary

*** Test Cases ***

*** Settings ***
Documentation     RTC Clock Drift Verification
Library           RequestsLibrary

*** Test Cases ***
TC_RTC_001_Clock_Drift_Verification
    [Tags]    P1    Firmware    RTC
    Given BMC System Is Operational    192.168.1.100
    When Apply Stress Load For 60 Minutes
    Then Verify RTC Drift Is Less Than    50    ms

C2_NTP_Synchronization_Failover_Test
    [Tags]    P2    Firmware    NTP
    Log    Test: NTP Synchronization Failover Test