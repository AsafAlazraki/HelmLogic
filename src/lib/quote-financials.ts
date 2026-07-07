/**
 * Builds a financials summary from a quote payload.
 * Used by PDF generation (both at finalize time and for on-demand regeneration).
 *
 * This is a simplified version that uses sell prices as cost estimates
 * when actual cost data isn't available (no exchange-rate / override lookup).
 *
 * FFR-33 (2026-07-07, ruling: NSM's Display Sheet is the spec): quotes
 * created under `pricingConvention: 'display-sheet-v2'` are computed in
 * INC-GST money exactly like NSM's own sheet — the hull ladder figure,
 * PD tier, motor retail, rigging, prop, trailer and every option are
 * ALREADY GST-inclusive in the Master Price File (their own column is
 * titled "RRP + Freight Inc GST"), so they sum RAW and the ex-GST figure
 * is back-derived as total / 1.1. Older quotes are immutable snapshots
 * and keep the original ex-GST convention below.
 */
export function buildQuoteFinancials(quote: any, discount = 0) {
  if (quote?.pricingConvention === 'display-sheet-v2') {
    return buildDisplaySheetFinancials(quote, discount);
  }
  return buildLegacyFinancials(quote, discount);
}

/**
 * Display-Sheet parity (FFR-33). Composition, per
 * tasks/mpf-audit/analysis/display-sheet-composition.md:
 *   PACKAGE(inc) = hull ladder (hand-rounded inc figure)
 *                + boat rego + trailer rego            (GST-free, raw)
 *                + PD tier sell                        (inc, snapshot)
 *                + motor retail + accessories          (inc, raw)
 *                + rigging kit installed + prop        (inc, raw — carried
 *                  as motor accessory lines by the flow)
 *                + trailer + trailer options           (inc, raw)
 *                + factory/custom options              (inc, raw)
 *                + dealer fit + fit-up                 (inc, raw)
 *   exGst = PACKAGE / 1.1 ; gst = PACKAGE - exGst.
 * Every component is a SNAPSHOT of the MPF sell — never recomputed
 * (their per-line rounding is heterogeneous). Discounts apply to the
 * inc-GST total, floored at 0 (FFR-8 clamp preserved).
 */
function buildDisplaySheetFinancials(quote: any, discount = 0) {
  const num = (v: any) => (typeof v === 'number' && isFinite(v) ? v : 0);
  // Hull: the ladder figure is the hand-rounded INC value when present;
  // legacy variants without priceIncGst fall back to ex * 1.1.
  const hullInc = num(quote.variant?.priceIncGst) ||
    Math.round(num(quote.variant?.sellPriceExclGst) * 1.1 * 100) / 100;
  const pdTierInc = num(quote.pdTier?.sellIncGst);
  const optionsInc =
    (quote.selectedOptions || []).reduce((a: number, o: any) => a + num(o.sellPriceExclGst), 0) +
    (quote.customOptions || []).reduce((a: number, o: any) => a + num(o.sellPriceExclGst), 0);
  const regoTotal =
    num(quote.registration?.boatRegoPrice) + num(quote.registration?.stickerPrice) +
    num(quote.registration?.tenderToPrice) + num(quote.registration?.trailerRegoPrice);
  const motorInc = num(quote.motor?.sellPriceExclGst) +
    (quote.motor?.accessories || []).reduce((a: number, acc: any) => a + num(acc.sellPriceExclGst), 0);
  const trailerInc = num(quote.trailer?.sellPriceExclGst) +
    (quote.trailer?.options || []).reduce((a: number, o: any) => a + num(o.sellPriceExclGst), 0);
  const dealerFitInc = (quote.dealerFit || []).reduce(
    (a: number, sel: any) => a + (sel.items || []).reduce((b: number, i: any) => b + num(i.sellPriceExclGst), 0), 0);
  const fitUpInc = (quote.fitUpSelections || []).reduce((a: number, sel: any) => {
    const qty = Math.max(1, sel.quantity ?? 1);
    const unit = sel.priceOverride != null ? sel.priceOverride
      : (sel.sellPrice != null ? sel.sellPrice : (sel.cost || 0));
    return a + qty * unit;
  }, 0);

  const packageInc = hullInc + pdTierInc + optionsInc + regoTotal + motorInc + trailerInc + dealerFitInc + fitUpInc;
  const totalInclGst = Math.max(0, Math.round((packageInc - discount) * 100) / 100);
  const finalTotalPriceExclGst = Math.round((totalInclGst / 1.1) * 100) / 100;
  const gstAmount = Math.round((totalInclGst - finalTotalPriceExclGst) * 100) / 100;
  const ex = (inc: number) => Math.round((inc / 1.1) * 100) / 100;

  // Costs are ex-GST catalog properties (unchanged semantics).
  const boatCost = quote.variant?.cost ?? ex(hullInc) * 0.7;
  const optionsCost =
    (quote.selectedOptions || []).reduce((a: number, o: any) => a + (o.cost ?? num(o.sellPriceExclGst) / 1.1 * 0.7), 0) +
    (quote.customOptions || []).reduce((a: number, o: any) => a + (o.cost ?? num(o.sellPriceExclGst) / 1.1 * 0.8), 0);
  const motorCost = (quote.motor?.cost ?? num(quote.motor?.sellPriceExclGst) / 1.1 * 0.85) +
    (quote.motor?.accessories || []).reduce((a: number, acc: any) => a + (acc.cost ?? num(acc.sellPriceExclGst) / 1.1 * 0.7), 0);
  const trailerCost = quote.trailer?.cost ?? num(quote.trailer?.sellPriceExclGst) / 1.1 * 0.8;
  const pdTierCost = num(quote.pdTier?.totalCtd);
  const dealerFitCost = ex(dealerFitInc) * 0.6;
  const fitUpCost = (quote.fitUpSelections || []).reduce((a: number, sel: any) => {
    const qty = Math.max(1, sel.quantity ?? 1);
    const unit = sel.cost != null ? sel.cost : (sel.sellPrice || 0) * 0.6;
    return a + qty * unit;
  }, 0);
  const totalDealCostExclGst = boatCost + optionsCost + motorCost + trailerCost + pdTierCost + dealerFitCost + fitUpCost + regoTotal;
  const grossProfit = finalTotalPriceExclGst - totalDealCostExclGst;
  const marginPercent = finalTotalPriceExclGst > 0 ? (grossProfit / finalTotalPriceExclGst) * 100 : 0;

  return {
    pricingConvention: 'display-sheet-v2',
    boatBasePrice: ex(hullInc),
    boatBasePriceInc: hullInc,
    pdTierTotal: ex(pdTierInc),
    pdTierTotalInc: pdTierInc,
    optionsTotal: ex(optionsInc),
    regoTotal,
    motorTotal: ex(motorInc),
    trailerTotal: ex(trailerInc),
    dealerFitTotal: ex(dealerFitInc),
    fitUpTotal: ex(fitUpInc),
    subtotalExclGst: ex(packageInc),
    finalTotalPriceExclGst,
    gstAmount,
    totalInclGst,
    boatCost,
    optionsCost,
    motorCost,
    trailerCost,
    dealerFitCost,
    fitUpCost,
    totalDealCostExclGst,
    grossProfit,
    marginPercent,
  };
}

function buildLegacyFinancials(quote: any, discount = 0) {
  const boatBasePrice = quote.variant?.sellPriceExclGst || 0;
  const optionsTotal =
    (quote.selectedOptions || []).reduce((a: number, o: any) => a + (o.sellPriceExclGst || 0), 0) +
    (quote.customOptions || []).reduce((a: number, o: any) => a + (o.sellPriceExclGst || 0), 0);
  const regoTotal =
    (quote.registration?.boatRegoPrice || 0) +
    (quote.registration?.stickerPrice || 0) +
    (quote.registration?.tenderToPrice || 0) +
    (quote.registration?.trailerRegoPrice || 0);
  const motorTotal =
    (quote.motor?.sellPriceExclGst || 0) +
    (quote.motor?.accessories || []).reduce((a: number, acc: any) => a + (acc.sellPriceExclGst || 0), 0);
  const trailerTotal =
    (quote.trailer?.sellPriceExclGst || 0) +
    (quote.trailer?.options || []).reduce((a: number, o: any) => a + (o.sellPriceExclGst || 0), 0);
  const dealerFitTotal = (quote.dealerFit || []).reduce(
    (a: number, sel: any) => a + (sel.items || []).reduce((b: number, i: any) => b + (i.sellPriceExclGst || 0), 0),
    0
  );
  // v1.11 (Epic 9.2.2 + v1.11 expansion) — Fit-Up selections on a quote.
  // Stored as a flat array of FitUpSnapshot at finalize time (see
  // finalize-quote-dialog.tsx → fitUpSelections). Each snapshot captures
  // id + name + tier + cost + sellPrice + category + customerDescription
  // + notes (catalog fields) PLUS quantity + priceOverride + quoteNote
  // (per-quote fields). Line total = quantity × (priceOverride ??
  // sellPrice ?? cost). Older quotes (pre-v1.11-expansion) don't have
  // quantity/priceOverride — default to qty=1, no override, which
  // matches the original semantics.
  const fitUpTotal = (quote.fitUpSelections || []).reduce(
    (a: number, sel: any) => {
      const qty = Math.max(1, sel.quantity ?? 1);
      const unit = sel.priceOverride != null
        ? sel.priceOverride
        : (sel.sellPrice != null ? sel.sellPrice : (sel.cost || 0));
      return a + (qty * unit);
    },
    0,
  );

  const subtotalExclGst = boatBasePrice + optionsTotal + regoTotal + motorTotal + trailerTotal + dealerFitTotal + fitUpTotal;
  // FFR-8 fix (bug 1): clamp over-discounts — the final ex-GST total floors
  // at 0 (never negative), and GST is computed from the floored value.
  const finalTotalPriceExclGst = Math.max(0, subtotalExclGst - discount);
  const totalInclGst = Math.ceil(finalTotalPriceExclGst * 1.1);
  const gstAmount = totalInclGst - finalTotalPriceExclGst;

  // Simplified cost estimates (used when no landed-cost lookup is available).
  // FFR-8 fix (bug 2): use nullish coalescing (??) so an explicit catalog
  // cost of 0 is honoured — only missing (undefined/null) costs fall back
  // to the 0.7 / 0.8 / 0.85 heuristics.
  const boatCost = quote.variant?.cost ?? boatBasePrice * 0.7;
  const optionsCost =
    (quote.selectedOptions || []).reduce((a: number, o: any) => a + (o.cost ?? (o.sellPriceExclGst || 0) * 0.7), 0) +
    (quote.customOptions || []).reduce((a: number, o: any) => a + (o.cost ?? (o.sellPriceExclGst || 0) * 0.8), 0);
  const motorCost =
    (quote.motor?.cost ?? (quote.motor?.sellPriceExclGst || 0) * 0.85) +
    (quote.motor?.accessories || []).reduce((a: number, acc: any) => a + (acc.cost ?? (acc.sellPriceExclGst || 0) * 0.7), 0);
  const trailerCost = quote.trailer?.cost ?? (quote.trailer?.sellPriceExclGst || 0) * 0.8;
  const dealerFitCost = dealerFitTotal * 0.6;
  // v1.11 (+ expansion) — Fit-Up cost: prefer the per-snapshot cost
  // field (catalogued explicitly), otherwise 60% of catalog sell as a
  // fallback (matches the dealerFit cost-fallback heuristic). Multiplied
  // by quantity. Per-quote price overrides do NOT affect cost — cost is
  // a catalog property.
  const fitUpCost = (quote.fitUpSelections || []).reduce(
    (a: number, sel: any) => {
      const qty = Math.max(1, sel.quantity ?? 1);
      const unit = sel.cost != null ? sel.cost : (sel.sellPrice || 0) * 0.6;
      return a + (qty * unit);
    },
    0,
  );
  const totalDealCostExclGst = boatCost + optionsCost + motorCost + trailerCost + dealerFitCost + fitUpCost + regoTotal;
  const grossProfit = finalTotalPriceExclGst - totalDealCostExclGst;
  const marginPercent = finalTotalPriceExclGst > 0 ? (grossProfit / finalTotalPriceExclGst) * 100 : 0;

  return {
    boatBasePrice,
    optionsTotal,
    regoTotal,
    motorTotal,
    trailerTotal,
    dealerFitTotal,
    fitUpTotal,
    subtotalExclGst,
    finalTotalPriceExclGst,
    gstAmount,
    totalInclGst,
    boatCost,
    optionsCost,
    motorCost,
    trailerCost,
    dealerFitCost,
    fitUpCost,
    totalDealCostExclGst,
    grossProfit,
    marginPercent,
  };
}
