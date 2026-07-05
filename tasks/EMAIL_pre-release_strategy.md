Subject: HelmLogic, this week's release + where we go next

Hi team,

This week's release is a big one, and it marks a turning point worth pausing on.

**What's landing**

With this release we close off the entire buildable feature roadmap that's been sitting on the system. Not just the planned columns, we pulled in the backlog and worked through it too. Customer records and the sales workspace, contracts, reporting, the full quote-to-contract lifecycle, variations, deposits, payment schedules, margin controls, pricing-at-scale tooling, global search, notifications, the platform and security foundations. Everything that could be built as a feature is now built and tested on our dev environment.

That's a real milestone. A year of planned feature work, done.

**What's deliberately NOT in that "done"**

I want to be straight about what remains, because it's not feature gaps, it's three buckets that genuinely can't be closed by writing more code right now:

1. **Dependency-blocked.** The NSM-Hub migration and the Revolution data pieces need access we don't have yet. The Shopify integration needs real keys. These wait on external access, not on us.

2. **Operational and launch.** Training plans, the comms rollout, pulling existing customer and quote data across, the migration cutoff, decommissioning the old tool. Real work, but it's launch logistics, not software to build.

3. **Legal and decisions.** Privacy policy, refund policy, cooling-off text, e-signature provider choice, which states we operate in. These are calls for us and our advisors to make, then encode.

So the honest headline: the feature build is done; what's left is access, logistics, and decisions.

**There is still work to do, and the nature of it changes now**

Closing the feature roadmap doesn't mean we're finished. It means we shift gears. From here the focus moves off "build the next feature" and onto three things running in parallel:

1. **Heavy UAT testing.** We need the team actually using the system in anger, running real quotes, real contracts, real customers, and telling us where it bites. This is the most important thing we can do now. Features are only worth what survives real use.

2. **UI and UX refinement.** Rather than new functionality, we shift to the pretty stuff: the polish, the touch-ups, the flows that work but could feel better. This is where the product goes from "does everything" to "feels great to use".

3. **Shopify.** We've done the groundwork understanding the API. Now we push on it properly as a parallel effort alongside the UX work.

**Working with BFJ on data**

A key part of the next phase: we'd like to start working with BFJ to get the right accesses and begin playing around with pulling data to and from their systems. This is going to be a substantial exercise, so the sooner we can get hands on real access and start experimenting, the better. Getting ahead of it now means we're not scrambling later.

**Responsiveness, after we're happy**

Once we're confident the desktop experience is solid through UAT, we look at responsiveness: refining the app for tablet, and eventually mobile. That's deliberately sequenced after UAT. No point making it pretty on a phone before we know the core flows are right.

**Sub-dealer functionality needs attention**

One honest flag: the sub-dealer functionality hasn't really been tested by the team, and large parts of it haven't been touched. As we move into UAT we need to make sure that's actively exercised. It's a meaningful part of the model and it can't stay an assumption. Let's get eyes and hands on it.

**A question for down the track: offline capability**

Something to put on the radar, not the plan: do we want HelmLogic to work offline? A salesperson at a boat show with patchy reception, building a quote without a connection, is a real scenario. If the answer is yes, it's a big piece of work. It touches data sync, conflict resolution, local storage, and a lot of the assumptions the app currently makes about always being connected. To be clear, this is something we'd only scope after everything else is done. Not now, not next, but worth a conscious decision later rather than discovering we want it once we're committed elsewhere. Flagging it so it's a deliberate choice when the time comes.

**👉 The Roadmap tells the whole story.** Open it and you'll see how much has gone green. It's the best way to see what's shipped, what's left, and where we're heading next.

Cheers,
Asaf
