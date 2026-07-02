Subject: HelmLogic, where to from here

Hi team,

We've hit a real turning point, so this is a longer one. It covers what's landing, what we're deliberately not doing yet, the decisions we need to make, and the things we still need to understand before we commit to them. Please read to the end, there are a few calls I need from the group.

## What's landing

With this release we close off the entire buildable feature roadmap that's been sitting on the system. Not just the planned columns, we pulled in the backlog and worked through it too. Customer records and the sales workspace, contracts, reporting, the full quote-to-contract lifecycle, variations, deposits, payment schedules, margin controls, pricing-at-scale tooling, global search, notifications, and the platform and security foundations. Everything that could be built as a feature is now built and tested on our dev environment.

That's a real milestone. A year of planned feature work, done.

## Before we push to production

A couple of technical gates need to clear first, and they're deploy-time infrastructure rather than code:

- The new cross-module screens (reporting, global search, customer detail, my-work) need a handful of database indexes created, and one security rule republished. Without them those screens load but sit empty. We found this by running a real record all the way through the system, which is exactly the kind of thing that surfaces once you actually use it end to end. The fixes are ready; they just need to be applied.

- We should do a proper pass of user acceptance testing before we call it live, not just confirm the screens open. More on that below.

## A known bug we're on

There's a bug where you can't edit a quote that someone else created. I've started digging into it and I think I've found why (it comes down to how the app looks up the quote's owner), and I'll get onto the fix this weekend. Flagging it because it matters for any dealership where more than one person touches a quote, which is most of them.

## What's deliberately NOT done, and why

This isn't feature gaps. It's work that genuinely can't be closed by writing more code right now. It falls into clear buckets:

**Dependency-blocked (waiting on access, not on us)**
- The NSM-Hub migration pieces still need a service account we don't have.
- The Revolution data work needs access to Revolution.
- Shopify needs real store keys before we can do anything beyond the research we've already done.
- Email sending is blocked on the Office 365 SMTP setup being sorted (see decisions below).

**Operational and launch**
- Training plan, training sessions per role, the comms rollout to the sales team.
- Pulling existing customer and quote data across (see the migration note below).
- The migration cutoff date, and the plan to decommission or parallel-run the old tool.

**Legal and decisions (calls for us to make, then encode)**
- Privacy policy, refund policy, cooling-off text per state.
- E-signature provider choice.
- Which Australian states we actually operate in.
- Insurance review, tax invoice template, email signature standard.

## Decisions I need from the group

These are blocking or near-blocking, and they're ours to make:

1. **SMTP / email sending.** Right now the app can generate and queue every email (quotes, variations, reminders) but actual sending is switched off until we sort the sending setup, most likely Office 365 SMTP. We need to decide the sender domain, get the SMTP path working, and sign off before we flip it on. Until then, no email leaves the system. This is probably the single most visible thing still dark.

2. **E-signature provider.** Variations and contracts have a signing flow. We need to choose whether we lean on a provider or keep the lightweight in-app signature we've built. That choice shapes the contract flow.

3. **Which states, and the compliance text that follows.** Cooling-off periods, disclosures, and tax-invoice wording are state-specific. We need the list of states first, then the legal text.

## Things we need to UNDERSTAND before we commit

These aren't decisions yet, they're scoping exercises. I don't want us committing to any of them before we understand the shape of the work:

1. **Data into Shopify, and the timelines.** We've done the groundwork on the Shopify API. What we don't yet have is a clear picture of what data flows which way, how often, and by when. Before we scope a build we need to understand: what do we push to Shopify, what do we pull back, how live does it need to be, and what's the realistic timeline. That conversation should start now so we're not guessing later.

2. **Responsiveness.** We know we'll want tablet and eventually mobile. What we haven't done is define the requirement: which screens, which devices, how the quote builder should behave on a small screen. That's a real design exercise and it's deliberately sequenced after UAT, but we should start capturing the requirements so it's ready when we get there.

3. **Offline.** A salesperson at a boat show with patchy reception is a real scenario. If we want the app to work offline, it's a big piece of work touching sync, conflict resolution, and local storage, and it changes assumptions the app currently makes about always being connected. This is the one to scope only after everything else is done. Not now, not next. But we should consciously decide whether it's in or out rather than discovering it late.

The common thread: for each of these, the first job is to understand the requirement, not to build. I'd rather spend a week getting the requirement right than a month building the wrong thing.

## The data migration exercise (existing ServiceHub)

Separate from the service-quoting we've been building, there's the existing ServiceHub that already holds live data. Moving that across is its own exercise, and it sits alongside pulling customer and quote history out of Revolution. This is a meaningful piece of work in its own right and it needs owners, a cutoff date, and a parallel-run plan. Let's not let it hide inside "launch tasks", it deserves its own line.

## How we can move faster

A fair question is what would let us close more of the above without waiting. A few concrete things:

- For the deploy-time infrastructure (rules, indexes, and eventually the migration scripts), giving the build process the right deployment access would let those apply directly instead of being handed over manually each time. Worth deciding how much of that we want automated versus gated behind a human.
- For the access-blocked items (Shopify keys, Revolution access, the NSM-Hub service account, SMTP credentials), the blocker is genuinely getting the access. The moment we have it, that work moves.
- For the decisions and legal items, the blocker is a conversation and a sign-off, not effort. The faster we make those calls, the faster they encode.

## UAT and sub-dealer

Two things I want to stress for the next phase:

- **Heavy UAT.** The most valuable thing we can do now is have the team run real quotes, real customers, real contracts, and tell us where it bites. Features are only worth what survives real use, and we've already seen that end-to-end testing finds things screen-by-screen testing doesn't.

- **Sub-dealer functionality.** This hasn't really been tested by the team, and large parts of it haven't been touched. As we move into UAT it has to be actively exercised. It's a meaningful part of the model and it can't stay an assumption.

## Where to from here

The feature build is done. From here it's three tracks in parallel: UAT and polish on what we've built, the access and decisions that unblock the rest, and the scoping work on Shopify, responsiveness, and offline so we understand them before we commit. The migration and the multi-user quote bug are live workstreams. And the SMTP call is the thing most worth making this week.

👉 The Roadmap tells the whole story. Open it and you'll see how much has gone green, and the handful of things that are deliberately still open with a reason next to each.

Cheers,
Asaf
