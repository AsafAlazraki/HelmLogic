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

Production readiness

Whether and when we put this live is a decision for the business, not a call I'm making or pushing. What I can do is be clear about what would need to be true first, so that decision is an informed one. That short list:

- Email and SMTP. Every email the system needs (quotes, variations, reminders) is ready, but sending stays switched off until we sort the Office 365 setup and sign off the sender domain. This is the most visible thing still dark and the one most worth sorting this week.
- The existing ServiceHub data migration. Live data in the current ServiceHub needs to come across. It's its own exercise with its own owner, cutoff date and parallel run plan, and shouldn't hide inside "launch tasks."
- The multi user quote bug. You can't currently edit a quote someone else created. I've found why and I'm fixing it this weekend. Worth being clear on one thing: migrating off the existing app is a big piece of work, and the two systems will run side by side through it, so this fix has to go into both places, the new build and the existing app, not just here. It matters for any dealership where more than one person touches a deal.
- UAT. The most valuable thing we can do now is use the system in anger, real quotes, real customers, real contracts, and find where it bites. End to end use finds what screen by screen checking doesn't.
- Shopify data timelines, and the data model change that comes with it. We've done the groundwork on the API. Two things we need next. First, a real read on timing: when data starts flowing to and from Shopify, and what that depends on. Second, and more significant, Shopify is not just an API hookup. Bringing it in means a significant change to our underlying data model, so it has to be planned and resourced as a data project in its own right, not slotted in as a connector. The sooner we get hands on real access the sooner we can put dates and a proper shape against it.
- Responsiveness and offline. Two requirements we need to actually pin down rather than assume. How responsive does this need to be on tablet and phone, and do we need it to work offline at a boat show with patchy reception. Both change the shape of the work, so I'd rather we decide them deliberately than discover them late.

Then, the growth layer

Once it's solid and live, the roadmap reshapes toward getting it adopted and used well. I've deliberately left these as headings for us to shape together rather than scoping them myself:

- Marketing.
- Enablement and training.
- Sub dealer rollouts. This is a meaningful part of the model and it hasn't been properly exercised yet, so it earns real attention in this phase.
- The bigger integrations, Shopify and Revolution, once access is sorted.

New scope worth putting on the roadmap now

Two pieces I think we should consciously add to the plan for the next phase rather than let them arrive by accident. Both need shaping together, so I'm flagging them as scope, not specifying them here.

- An agentic rules engine. Today a lot of our quoting logic (compatibility, pricing, promotions, classification) lives in code or in an operator's head. The next step is a proper rules engine that can hold that logic as configuration and apply it, and act on it, automatically. This is the piece that moves us from a system people drive manually to one that can make and apply decisions for them.
- A fuller notification system. We shipped the foundation this cycle. The scope worth adding is the layer on top: proactive, agentic notifications that surface what needs attention (a quote gone cold, a deposit overdue, a milestone reached) rather than waiting for someone to go looking. It pairs naturally with the rules engine above.

The modules, and where their data comes from

This one deserves its own section, because it's the biggest piece of work still ahead and it's easy to underestimate. Finishing the original roadmap is not the finish line. There is a whole set of modules across the org dashboard that still need to be designed and built, boat modules, fit up modules, trailer modules, and others beyond those. Every one needs a deliberate decision about what we actually do with it: build it, rebuild it, replace it, or fold it into something else. There are a lot of them, and this is a real body of work in its own right, not leftover polish.

The important part is the order. We can't make that call on a module in the abstract. It follows from one thing first, identifying where that module's data comes from and in what format. Until we've pinned the source and the shape of the data feeding a module, deciding what happens to it is guesswork. So the real next body of work is a proper pass, module by module across the dashboard, data source and format first, then the decision on each. I'll lay that out so we can work through it together rather than me pre judging any of it.

That order is exactly why the Shopify question sits at the front of everything. Since bringing Shopify in reshapes our underlying data model, we have a genuine sequencing decision: do we start working through the modules now, or do we hold until the Shopify data is pulled in and the new data model has settled. Doing that work on a data model that is about to change risks doing it twice. I don't think we answer that on the fly. It's one of the most important calls in front of us and it sets the shape and the order of everything that follows.

A few calls to make

Some things wait on decisions rather than work: the e-signature approach, which states we operate in and the compliance text that follows, and the sender domain and SMTP setup above. The faster we make those calls, the faster they clear.

Where this leaves us

The roadmap we set out to build is done and proven. That's a real milestone, and it's worth marking. But it's a chapter, not the end of the book. Ahead of us are production readiness whenever the business decides to go there, then the module by module pass, with the Shopify data question sitting right at the front of how we sequence it. The reshaped roadmap should reflect all of that, and I'd like us to shape it together rather than me guessing at the order.

Proud of where this has landed.

Cheers,
Asaf
