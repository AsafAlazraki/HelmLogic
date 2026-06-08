# Mark's "accurate · audited · beautiful" checklist

Email from Mark McWilliams, 8/06/2026. 8 items to tick off before the v1.11 launch.

## The 8 items

1. **Proposal formed correctly** — all sections present, customer's name in the right places
2. **Images right during config** — no trailers showing when selecting hull material/colour
3. **All correct FFO** (Factory-Fitted Options) on Step 2
4. **Engine + rigging options** — Step 3 motor + Step 5 fit-up/rigging
5. **Trailer options** — Step 4 trailer + accessories
6. **DFOs** (Dealer-Fit Options) — Step 5 dealer-fit
7. **Rego + compliance** — Step 4 trailer rego (state-aware) + Step 6 summary
8. **Fit-out costs** — Step 5 Simple / Medium / Complex tier packages

## Verification plan

A new spec `tests/bm-email-checklist.spec.ts` drives the full Classic CL380 build end-to-end and asserts visibility on every step + downloads the PDF + sniffs it for customer name + section markers. Single test, one screenshot per checkpoint, PDF saved as `bm-checklist.pdf`.

## Docs

- `tasks/RELEASE_NOTES_v1.11.0.md` — add a "Mark's checklist" tick-off section near the top so future readers can see what shipped vs the BM signoff criteria.
- `tasks/USER_GUIDE_v1.11.0.md` — add a "How to walk a customer through a quote" mini-runbook keyed to the same 8 items.
