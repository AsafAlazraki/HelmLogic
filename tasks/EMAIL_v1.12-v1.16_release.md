Subject: HelmLogic — v1.12 → v1.16 shipped tonight + v1.17 this week

Hi team,

Big drop tonight — **v1.12 through v1.16 went to production as a single joint release**. 52 stories in one push.

**What's new**

- **Service Quoting end-to-end** — quoting a service job is now a first-class workflow alongside boat quoting: view, edit, status lifecycle, customer-facing PDF, send via email.
- **Catalog editing** — the catalog is now editable inline. Click a cell, change it, done. Plus org-level pricing overrides, column tooltips, CSV export per tab, and a Trailers read-view.
- **Rule engine** — Fit-up tier auto-classification is now fully rule-based, replacing the v1.11 motor-HP heuristic. Admins can author classification rules in the UI.
- **34-ticket backlog drain in v1.16** — every user-reported polish item (Hypalon labels, inc-GST sub-lines, no-trailer pill, dealer-fit headings, archive view on Recent Proposals, larger images + logos, motor & dealer-fit compatibility editors, photo curation, inventory badges, and more) either shipped or got a clean product decision.
- **PDF quality pass** — blank-page bug killed, Investment Summary now fits ~50% more rows per page, and long content blocks flow naturally across pages instead of each one claiming its own page.

**Roadmap clean-up**

The Submitted column on the Roadmap had been growing — 22 items sitting there with no target. We drained it tonight: real platform features landed in v1.18, v1.21, v2.0, or v2.2; how-to questions and operator-config concerns got dropped (e.g. "Dealer Fit options on all models" — that's already configurable via the editor we shipped in v1.16). Every story on the Roadmap is now scheduled, not parked.

**v1.17 — releasing this week**

We're not pausing. v1.17 is already in build and on track to ship in the next few days. Theme: **"Catalog editing at scale + bug sweep"** — multi-row select with bulk price adjust, paste-from-spreadsheet upload, cross-tab catalog filter, plus a sweep of the awaiting-repro bug list.

**Heads-up on tomorrow's meeting**

I've got a customer kick-off engagement session running right before our BFJ catch-up. I'll do my best to make it on time — apologies in advance if I'm a couple of minutes late.

Cheers,
Asaf
