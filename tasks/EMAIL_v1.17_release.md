Subject: HelmLogic, v1.17 shipped today

Hi team,

v1.17 is live in production as of this morning. Theme: catalog editing at scale.

**What's new at a glance**

Multi-row select with bulk markup on the Motors and Trailers tables. Paste-from-spreadsheet (works with Excel and Google Sheets, auto-detects the key column, shows a diff before writing). A single cross-tab search box at the top of Catalog Manager that filters every table at once. Plus the internal scaffolding (importer registry, pricing-derivation lib, stale-rate detector) that makes onboarding the next vendor a one-config-block job.

**👉 Open the Roadmap to see every story that shipped and click any v1.17 column for the full per-ticket breakdown.** The User Guide in the app walks the new flows step by step.

**Bumps from earlier this week**

Bill's permission error after the trailer step is fixed (the security rules for the new fit-up rule engine just hadn't been republished after the v1.16 merge). The `$[object Object]` price display on a console card was a self-inflicted issue from a data-migration script. Both are resolved, both have new automated tests that catch the class of problem in the future so they can't slip silently again.

**Roadmap clean-up**

A handful of bugs that were waiting on customer repros stay parked at v1.17, two NSM-Hub migration stories carry to v1.18 while we wait on the service-account, and the rest of Phase B was either resolved in v1.17 or absorbed into the new paste-from-spreadsheet flow. Quick reminder while you're in the Roadmap: configuration of the platform, dealer-fit options per model, motor compatibility ranges, marketing copy, that stays with you as operators. We're building the platform. You make it sing by setting those up.

**v1.18, next week**

Catalog Manager polish round plus first cuts of customer-facing surfaces. Same cadence.

On the side, we're going to start playing with the Shopify API to get to know it. Nothing shippable in v1.18, just exploratory work to understand how the integration would look so when it lands on the Roadmap properly later we're not learning from scratch.

Cheers,
Asaf
