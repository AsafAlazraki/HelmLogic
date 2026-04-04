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

  const subtotalExclGst = boatBasePrice + optionsTotal + regoTotal + motorTotal + trailerTotal + dealerFitTotal;
  const finalTotalPriceExclGst = subtotalExclGst - discount;
  const gstAmount = finalTotalPriceExclGst * 0.1;
  const totalInclGst = finalTotalPriceExclGst + gstAmount;

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
  const totalDealCostExclGst = boatCost + optionsCost + motorCost + trailerCost + dealerFitCost + regoTotal;
  const grossProfit = finalTotalPriceExclGst - totalDealCostExclGst;
  const marginPercent = finalTotalPriceExclGst > 0 ? (grossProfit / finalTotalPriceExclGst) * 100 : 0;

  return {
    boatBasePrice,
    optionsTotal,
    regoTotal,
    motorTotal,
    trailerTotal,
    dealerFitTotal,
    subtotalExclGst,
    finalTotalPriceExclGst,
    gstAmount,
    totalInclGst,
    boatCost,
    optionsCost,
    motorCost,
    trailerCost,
    dealerFitCost,
    totalDealCostExclGst,
    grossProfit,
    marginPercent,
  };
}
