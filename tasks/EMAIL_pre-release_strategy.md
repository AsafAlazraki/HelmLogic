Subject: HelmLogic, this week's release + where we go next

Hi team,

This week's release is a big one, and it marks a turning point worth pausing on.

**What's landing**

With this release we close off almost the entire roadmap that's been sitting on the system. Not just the planned columns, we've also pulled in the backlog and worked through it. Customer records, the sales workspace, contracts, reporting, quote-to-contract lifecycle, variations, deposits, margin controls, pricing-at-scale tooling. The bulk of what we set out to build is now built and tested on our dev environment.

That's a milestone. A year of planned features, substantially done.

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
