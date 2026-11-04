# Test Suite: AST2600 RTC Clock & Timing Suite

**Module:** Firmware Core  
**Linked TA Doc:** WH3-1205  
**Generated:** 2026-10-06  

> Verification of RTC drift, NTP synchronization, and I2C register integrity.

---

## 1. [C1] RTC Clock Drift Verification under 1-Hour Stress Load

- **Priority:** P1
- **Type:** Automated

**Preconditions:** AST2600 BMC powered ON, NTP sync disabled, external PTP reference active

### Steps

1. **Action:** Read initial RTC epoch timestamp via IPMI get-sys-time  
   **Expected:** Returns valid Unix epoch (HTTP 200)

2. **Action:** Apply 100% CPU stress load on AST2600 for 60 minutes  
   **Expected:** Stress test completes without kernel panic

3. **Action:** Compare RTC clock against external PTP reference clock  
   **Expected:** Total drift is <= 50ms over 1 hour

**Expected Outcome:** RTC drift remains within the strict 50ms threshold under thermal load.

### Robot Framework Script

```robot
*** Settings ***
Documentation     RTC Clock Drift Verification
Library           RequestsLibrary

*** Test Cases ***
TC_RTC_001_Clock_Drift_Verification
    [Tags]    P1    Firmware    RTC
    Given BMC System Is Operational    192.168.1.100
    When Apply Stress Load For 60 Minutes
    Then Verify RTC Drift Is Less Than    50    ms
```

---

## 2. [C2] NTP Synchronization Failover Test

- **Priority:** P2
- **Type:** Automated

**Preconditions:** AST2600 running, primary NTP server configured at 192.168.1.1

### Steps

1. **Action:** Verify NTP sync status via timedatectl  
   **Expected:** NTP synchronized: yes

2. **Action:** Block primary NTP server via iptables  
   **Expected:** NTP sync lost within 60s

3. **Action:** Verify failover to secondary NTP server  
   **Expected:** Fallback NTP server synced within 120s

**Expected Outcome:** System correctly fails over to secondary NTP within acceptable timeframe.

---

## 3. [C3] I2C Bus Stress Register Integrity Check

- **Priority:** P3
- **Type:** Manual

**Preconditions:** AST2600 operational, I2C bus tools installed

### Steps

1. **Action:** Run i2cdetect -y 0 to list devices  
   **Expected:** All expected I2C addresses visible

2. **Action:** Write/read test pattern to RTC I2C register 0x00  
   **Expected:** Data integrity maintained

**Expected Outcome:** No I2C bus errors or register corruption after stress test.

---

