# Bug Report — [SHORT DESCRIPTIVE TITLE]

> Copy this file, rename it to something like `bug-2026-04-14-motor-hp-badge.md`,
> and drop it in the current release's `testing/vX.Y/bugs-found.md` collection
> (or link it from there). Fill in every field — blanks make triage slow.

---

## Summary

| Field | Value |
|---|---|
| **Bug ID** | BUG-v1.3-NN (increment within current release) |
| **Reporter** | [Your name] |
| **Date reported** | YYYY-MM-DD |
| **Severity** | Critical / Major / Minor / Cosmetic |
| **Environment** | Dev / Prod |
| **Browser / OS** | e.g. Chrome 128 on macOS 14 |
| **User role** | e.g. Managing Director (Bill Hull), Sub-Dealer, Admin |
| **Organisation** | e.g. Northside Marine |
| **Build / commit** | If known — `git rev-parse HEAD` on the deployed branch |

### Severity guide
- **Critical** — Blocks a core user flow (can't log in, quote won't finalize, page crashes with "SOMETHING WENT WRONG"). Requires immediate fix; blocks release.
- **Major** — A significant feature is broken or returns wrong data (wrong price on a proposal, stock item won't save, wrong customer shown). Release blocker unless a workaround exists.
- **Minor** — Feature works but behaves oddly (filter doesn't clear, toast doesn't appear, button label is wrong). Should be fixed before next release.
- **Cosmetic** — Visual only (spacing, alignment, colour, truncated text on small screen). Nice to have.

---

## Steps to Reproduce

1. Log in as [user] at [URL]
2. Navigate to [exact path — e.g. Highfield module → Catalog → Classic → CL340]
3. [Next action]
4. [Next action]
5. Observe bug

**Reproduction rate:** Always / Intermittent (X of Y attempts) / Once only

---

## Expected Behavior

What should have happened, in plain English. Quote the handbook section if relevant
(e.g. "Per HANDBOOK Part 5 §3, motor HP badge should display `2 × 300 HP` for twin-engine configs").

## Actual Behavior

What actually happened. Be specific — "button didn't work" is useless; "clicking Save
shows a green toast but the location field reverts to the old value after 2 seconds" is useful.

---

## Evidence

### Screenshots / Video
- [Attach screenshot of the broken state]
- [Attach screenshot of Firestore doc if data was wrong]
- [Link to screen recording for interaction bugs]

### Console Errors
Paste the full browser console output from the moment the bug occurred. Include the
red error lines AND any warnings that appeared just before.

```
[paste console output here]
```

### Network Errors
Any failing requests (4xx/5xx) in the Network panel relevant to this bug?

```
[method] [url] → [status]
```

### Firestore Document Paths Affected
Which documents were read/written wrong? Full paths help engineering reproduce.

- `users/{uid}/quotes/{qid}` — field `sectionPdfUrls.boat` expected a URL, got `null`
- `modules/{moduleId}` — field `trailerDealerFitCategories` missing

---

## Workaround

Is there a way for the user to get around this bug right now? (e.g. "Refresh the page
and re-enter the data; it persists on the second save.") If there's no workaround,
write "None — user is blocked."

---

## Related

- **Related bugs:** BUG-v1.2-07, BUG-v1.3-02
- **Related test case:** TC-v1.3-15
- **Related release note:** RELEASE_NOTES_v1.3.md §"HP Badge Wrong for Multi-Engine Motors"
- **GitHub issue / PR:** (link if one exists)

---

## Triage Notes (filled in by engineering)

- **Owner:**
- **Status:** New / Triaging / In Progress / Fixed / Wontfix / Duplicate
- **Fix commit:**
- **Verified fixed:** YYYY-MM-DD by [tester name] — re-ran TC-v1.3-NN, all pass.
