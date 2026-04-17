# Test Case — [SHORT DESCRIPTIVE TITLE]

> Copy this template into the current release's `testing/vX.Y/test-cases.md` (or keep
> each test case in its own file if you prefer). Every test case gets a unique ID
> following the format `TC-vX.Y-NN` — e.g. `TC-v1.3-01`, `TC-v1.3-02`, and so on.

---

## Header

| Field | Value |
|---|---|
| **Test ID** | TC-vX.Y-NN |
| **Title** | [One-line description of what is being tested] |
| **Area / Feature** | e.g. Quote Builder Step 3 — Motor; Stock Management → Pending tab |
| **Release** | vX.Y |
| **Priority** | P0 (smoke) / P1 (must-pass) / P2 (should-pass) / P3 (nice-to-have) |
| **Type** | Smoke / Regression / New Feature / Exploratory / Performance |
| **Automated?** | Yes (link to spec file) / No — manual only |

---

## Preconditions

List everything that must be true before starting the test. If any of these fail,
the test is **Blocked**, not Failed.

- [ ] Logged in as [user] — e.g. Bill Hull (billh@nsmarine.com.au)
- [ ] On [starting URL or screen]
- [ ] Test data exists: [e.g. "Highfield CL340 has at least one PVC variant priced"]
- [ ] Module settings configured: [e.g. "Motor Dealer Fit Categories has `Rigging`, `Propeller`, `General`"]
- [ ] Any feature flags or role permissions needed

---

## Test Data

Specific values to use during the test — avoid ambiguity.

| Input | Value |
|---|---|
| Model | CL340 |
| Material | PVC |
| Colour | Grey |
| Motor | Yamaha F300XSB (twin config) |
| Customer | Test Customer, test@example.com |

---

## Steps

Number every step. Each step should be one user action. Don't chain unrelated actions
into a single step.

1. Navigate to Highfield module → Catalog tab
2. Click the **Classic** range card
3. Click **CL340** in the models grid
4. On Step 1 (Boat Base), click the **PVC** toggle
5. Select the **Grey** variant card
6. Click **Next**
7. [...continue through all steps]

---

## Expected Result

What should be visible / true / saved at the end of the test. Be explicit — the
tester should be able to mark pass/fail without judgment calls.

- Price total in the bottom bar updates to match the selected variant's `sellPriceExclGst` × `1.1` (rounded UP to whole dollars for Inc GST)
- Step indicator at top shows "Step 1 of 6" after the click
- No red error toasts, no console errors
- Firestore: `users/{uid}/quotes/{newQuoteId}` document created with `material: "PVC"`, `colourCode: "GREY"`

---

## Actual Result

*Fill in after running the test.*

- What actually happened?
- Note any deviations from expected, even minor ones.
- Include screenshot filenames if you captured any.

---

## Status

| Status | Meaning |
|---|---|
| **Not Run** | Test hasn't been executed yet |
| **Pass** | All expected behavior occurred, no deviations |
| **Fail** | One or more expected outcomes did not occur — file a bug report |
| **Blocked** | Could not run — preconditions not met or environment broken |
| **Skipped** | Intentionally not run this cycle (explain in Notes) |

**Current status:** Not Run

---

## Execution Log

| Run # | Date | Tester | Build / Commit | Status | Bug ID (if fail) | Duration |
|---|---|---|---|---|---|---|
| 1 | | | | | | |
| 2 | | | | | | |

---

## Notes

Any context worth preserving — flakiness patterns, timing issues, tips for future
runs, edge cases discovered while testing.
