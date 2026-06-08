/**
 * Builds a financials summary from a quote payload.
 * Used by PDF generation (both at finalize time and for on-demand regeneration).
 *
 * This is a simplified version that uses sell prices as cost estimates
 * when actual cost data isn't available (no exchange-rate / override lookup).
 */
export function buildQuoteFinancials(quote: any, discount = 0) {
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
  const finalTotalPriceExclGst = subtotalExclGst - discount;
  const totalInclGst = Math.ceil(finalTotalPriceExclGst * 1.1);
  const gstAmount = totalInclGst - finalTotalPriceExclGst;

  // Simplified cost estimates (used when no landed-cost lookup is available)
  const boatCost = quote.variant?.cost || boatBasePrice * 0.7;
  const optionsCost =
    (quote.selectedOptions || []).reduce((a: number, o: any) => a + (o.cost || (o.sellPriceExclGst || 0) * 0.7), 0) +
    (quote.customOptions || []).reduce((a: number, o: any) => a + (o.cost || (o.sellPriceExclGst || 0) * 0.8), 0);
  const motorCost =
    (quote.motor?.cost || (quote.motor?.sellPriceExclGst || 0) * 0.85) +
    (quote.motor?.accessories || []).reduce((a: number, acc: any) => a + (acc.cost || (acc.sellPriceExclGst || 0) * 0.7), 0);
  const trailerCost = quote.trailer?.cost || (quote.trailer?.sellPriceExclGst || 0) * 0.8;
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
