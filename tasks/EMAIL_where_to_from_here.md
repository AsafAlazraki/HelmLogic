Subject: HelmLogic, the build is essentially done. Where to from here.

Hi team,

Big milestone. The feature roadmap we set out to build on HelmLogic is essentially done. 244 stories are shipped and tested on our dev environment, spanning everything from the original quoting engine through customers, contracts, deposits, variations, payment schedules, margin controls, pricing at scale, global search and the notification foundation. A year of planned feature work, built.

And it isn't just built, it's verified. This week I ran the full lifecycle end to end against live data, customer to quote to contract to deposit to variation, plus the cross module reads that feed reporting and search, and it passes clean. The security rules and database indexes are published and confirmed. So "done" here means proven, not assumed.

Open the Roadmap and you'll see it. It's gone green. That's the best way to take in how much has landed.

So here's the shift. The roadmap has been a feature build list, and that phase is basically finished. It now needs to become a map of the stages that take us from "built" to "live and growing." Before we get there, I want to be straight about what is deliberately NOT inside that "done", because it isn't feature gaps, it's a defined tail of things that can't be closed by writing more code right now.

What's not in "done"

- Dependency blocked. The existing ServiceHub migration (Epic 11.3), the Revolution pieces (settlement reconciliation and pulling existing quote and contract data), and Shopify all wait on external access we don't have yet, not on us. To be clear, this is the existing ServiceHub that already holds live data, not the service quoting we built inside HelmLogic.
- Operational and launch. Pulling the existing customer list across, the migration cutoff, the parallel run and decommission of the old tool, the training plan and sessions, the announcement to the team. Real work, but logistics rather than software.
- Legal and decisions. Privacy and refund policy, cooling off text per state, e-signature provider choice, which states we operate in, insurance review, and the email and tax invoice templates that follow from those calls.
- Live field feedback. Real use is already throwing off feedback, and there's a fresh batch of it sitting in the Submitted column now (PDF layout tweaks, catalog requests, a few extra Highfield models, a couple of small bugs). It needs triage and prioritising, which is a call for us rather than something I should quietly slot into releases.

First, get it into people's hands properly

Before the growth stuff, a short list that has to be right for go live:

- Email and SMTP. Every email the system needs (quotes, variations, reminders) is ready, but sending stays switched off until we sort the Office 365 setup and sign off the sender domain. This is the most visible thing still dark and the one most worth sorting this week.
- The existing ServiceHub data migration. Live data in the current ServiceHub needs to come across. It's its own exercise with its own owner, cutoff date and parallel run plan, and shouldn't hide inside "launch tasks."
- The multi user quote bug. You can't currently edit a quote someone else created. I've found why and I'm fixing it this weekend. It matters for any dealership where more than one person touches a deal.
- UAT. The most valuable thing we can do now is use the system in anger, real quotes, real customers, real contracts, and find where it bites. End to end use finds what screen by screen checking doesn't.
- Shopify data timelines. We've done the groundwork on the API. What we need next is a real read on timing: when data starts flowing to and from Shopify, and what that depends on. The sooner we get hands on real access the sooner we can put dates against it.
- Responsiveness and offline. Two requirements we need to actually pin down rather than assume. How responsive does this need to be on tablet and phone, and do we need it to work offline at a boat show with patchy reception. Both change the shape of the work, so I'd rather we decide them deliberately than discover them late.

Then, the growth layer

Once it's solid and live, the roadmap reshapes toward getting it adopted and used well. I've deliberately left these as headings for us to shape together rather than scoping them myself:

- Marketing.
- Enablement and training.
- Sub dealer rollouts. This is a meaningful part of the model and it hasn't been properly exercised yet, so it earns real attention in this phase.
- The bigger integrations, Shopify and Revolution, once access is sorted.

A few calls to make

Some things wait on decisions rather than work: the e-signature approach, which states we operate in and the compliance text that follows, and the sender domain and SMTP setup above. The faster we make those calls, the faster they clear.

One bit of context on timing. I've got a customer kick off engagement session just before tomorrow's meeting with BFJ, so I'll come into that meeting straight off the back of real customer conversation, which should sharpen what we prioritise on the data and access side.

Where this leaves us

The build is essentially done and proven. The next stages are production readiness first, then growth. The reshaped roadmap should reflect that, and I'd like us to shape those stages together rather than me guessing at them.

Proud of where this has landed. Let's get it live.

Cheers,
Asaf
