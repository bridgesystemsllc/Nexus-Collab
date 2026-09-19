# KarEve Day-1 UAT Checklist

User Acceptance Testing script for the initial Nexus Collab deployment.

## Overview

This document is a pass/fail operator script for validating the Nexus Collab deployment before production cutover. Complete all checks and record results before approving for production use.

**Tester**: _______________  
**Date**: _______________  
**Environment**: ☐ Staging / ☐ Production  
**Version**: _______________

---

## Pre-Test Setup

### Environment Access

- [ ] **PASS** / **FAIL** — Can access the deployment URL
- [ ] **PASS** / **FAIL** — SSL certificate is valid (no browser warnings)
- [ ] **PASS** / **FAIL** — Page loads without JavaScript errors (check console)

### Test Account

- [ ] Test account created with ADMIN role
- [ ] Test account email: _______________
- [ ] Microsoft Entra SSO configured for test tenant

---

## 1. Authentication & Login

### 1.1 Microsoft SSO Login

| Step | Action | Expected Result | Pass/Fail |
|------|--------|-----------------|-----------|
| 1.1.1 | Navigate to application URL | Login page displayed | ☐ |
| 1.1.2 | Click "Sign in with Microsoft" | Redirects to Microsoft login | ☐ |
| 1.1.3 | Enter valid credentials | Returns to app, logged in | ☐ |
| 1.1.4 | Verify user name in header | Correct name displayed | ☐ |

### 1.2 Session Persistence

| Step | Action | Expected Result | Pass/Fail |
|------|--------|-----------------|-----------|
| 1.2.1 | Refresh the page | Still logged in | ☐ |
| 1.2.2 | Close browser, reopen | Still logged in | ☐ |
| 1.2.3 | Wait 5 minutes, interact | Still logged in | ☐ |

### 1.3 Logout

| Step | Action | Expected Result | Pass/Fail |
|------|--------|-----------------|-----------|
| 1.3.1 | Click user menu → Logout | Redirected to login page | ☐ |
| 1.3.2 | Try to access protected page | Redirected to login | ☐ |

---

## 2. Tenant Smoke Test

### 2.1 Organization Verification

| Step | Action | Expected Result | Pass/Fail |
|------|--------|-----------------|-----------|
| 2.1.1 | Check organization name | Correct org displayed | ☐ |
| 2.1.2 | Navigate to Settings | Settings page loads | ☐ |
| 2.1.3 | Check Account section | Profile shows correct email | ☐ |

### 2.2 Multi-Tenant Isolation (if applicable)

| Step | Action | Expected Result | Pass/Fail |
|------|--------|-----------------|-----------|
| 2.2.1 | Search for other org's data | No results (data isolated) | ☐ |
| 2.2.2 | Try direct URL to other org | Access denied or 404 | ☐ |

---

## 3. Core Modules Open

Verify each module loads without errors.

### 3.1 Navigation

| Module | Route | Loads Without Error | Pass/Fail |
|--------|-------|---------------------|-----------|
| Dashboard | `/` or `/dashboard` | ☐ | ☐ |
| Tasks | `/tasks` | ☐ | ☐ |
| Projects | `/projects` | ☐ | ☐ |
| Documents | `/documents` | ☐ | ☐ |
| Cowork | `/cowork` | ☐ | ☐ |
| People | `/people` | ☐ | ☐ |
| Settings | `/settings` | ☐ | ☐ |

### 3.2 Module Functionality (Smoke Test)

| Step | Action | Expected Result | Pass/Fail |
|------|--------|-----------------|-----------|
| 3.2.1 | Create a test task | Task appears in list | ☐ |
| 3.2.2 | Create a test project | Project appears in list | ☐ |
| 3.2.3 | Upload a test document | Document uploads successfully | ☐ |
| 3.2.4 | View People directory | Member list loads | ☐ |

---

## 4. Health Endpoint

### 4.1 Health Check

```bash
curl -s https://[DEPLOYMENT_URL]/health | jq
```

| Check | Expected | Actual | Pass/Fail |
|-------|----------|--------|-----------|
| Response code | 200 | _____ | ☐ |
| `ok` field | `true` | _____ | ☐ |
| `version` field | Present | _____ | ☐ |
| `time` field | ISO timestamp | _____ | ☐ |

**Expected response shape:**
```json
{
  "ok": true,
  "version": "0.1.0",
  "time": "2024-01-15T14:30:00.000Z"
}
```

### 4.2 System Readiness (Admin Only)

| Step | Action | Expected Result | Pass/Fail |
|------|--------|-----------------|-----------|
| 4.2.1 | Navigate to Settings → System | System tab visible (admin) | ☐ |
| 4.2.2 | View readiness panel | All required checks green | ☐ |
| 4.2.3 | Verify database check | ✓ Database connected | ☐ |
| 4.2.4 | Verify session check | ✓ Session configured | ☐ |
| 4.2.5 | Verify encryption check | ✓ Token encryption set | ☐ |

---

## 5. No Live Charges

### 5.1 Stripe Configuration

| Check | Expected | Actual | Pass/Fail |
|-------|----------|--------|-----------|
| Environment | Staging/Test mode | _____ | ☐ |
| Stripe key prefix | `sk_test_` | _____ | ☐ |

### 5.2 Payment Flow (Test Mode)

| Step | Action | Expected Result | Pass/Fail |
|------|--------|-----------------|-----------|
| 5.2.1 | Navigate to Billing (if applicable) | Page loads | ☐ |
| 5.2.2 | Verify test mode indicator | "Test mode" shown OR no billing | ☐ |
| 5.2.3 | **DO NOT** enter real card details | — | — |

> **⚠️ CRITICAL**: UAT testing must use Stripe test mode. Never enter real payment information during UAT.

---

## 6. Admin Functions

### 6.1 RBAC Verification

| Step | Action | Expected Result | Pass/Fail |
|------|--------|-----------------|-----------|
| 6.1.1 | Access Settings → Access & Permissions | Page loads (admin only) | ☐ |
| 6.1.2 | View roles list | Built-in roles displayed | ☐ |
| 6.1.3 | View audit log | Audit entries visible | ☐ |

### 6.2 Non-Admin Restrictions

| Step | Action | Expected Result | Pass/Fail |
|------|--------|-----------------|-----------|
| 6.2.1 | Log in as MEMBER role | Login succeeds | ☐ |
| 6.2.2 | Try to access Settings → System | Tab not visible | ☐ |
| 6.2.3 | Try to access Settings → Access | Tab not visible | ☐ |

---

## 7. Error Handling

### 7.1 Graceful Errors

| Step | Action | Expected Result | Pass/Fail |
|------|--------|-----------------|-----------|
| 7.1.1 | Navigate to invalid URL | 404 page or redirect | ☐ |
| 7.1.2 | API returns error | User-friendly message | ☐ |
| 7.1.3 | No stack traces in UI | Errors are sanitized | ☐ |

### 7.2 Console Errors

| Check | Expected | Pass/Fail |
|-------|----------|-----------|
| No JavaScript errors on page load | Clean console | ☐ |
| No React errors/warnings | Clean console | ☐ |
| No failed network requests (except expected) | Network tab clean | ☐ |

---

## Results Summary

| Section | Total Checks | Passed | Failed |
|---------|--------------|--------|--------|
| 1. Authentication | — | — | — |
| 2. Tenant Smoke | — | — | — |
| 3. Core Modules | — | — | — |
| 4. Health Endpoint | — | — | — |
| 5. No Live Charges | — | — | — |
| 6. Admin Functions | — | — | — |
| 7. Error Handling | — | — | — |
| **TOTAL** | — | — | — |

---

## Sign-Off

### UAT Result: ☐ PASS / ☐ FAIL

**Issues Found** (if any):
1. _______________
2. _______________
3. _______________

**Tester Signature**: _______________  
**Date**: _______________

**Ready for Production Cutover**: ☐ YES / ☐ NO

> **Note**: Production cutover is managed by Ahmad T3. Notify Ahmad when UAT is complete and approved.
