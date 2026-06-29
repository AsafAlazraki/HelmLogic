/**
 * payment-schedule.ts (v1.23 — Story 2.4.3).
 *
 * Derive a per-contract payment schedule from the contract total + the
 * org's payment-milestone defaults (deposit % + N milestones + final %),
 * and track which lines are paid vs due.
 *
 * Org defaults shape (organisation.documentDefaults):
 *   depositPercent, paymentMilestones[{label,percentage}], finalPercent
 *
 * A schedule line is { label, percentage, amountIncGst, paid, paidAt }.
 * Deposits recorded against the contract (v1.20) mark the deposit line
 * paid; further milestone payments flip their lines.
 */

export interface PaymentScheduleLine {
    key: string;
    label: string;
    percentage: number;
    amountIncGst: number;
    paid: boolean;
    paidAt?: any | null;
}

export interface DocumentDefaultsLike {
    depositPercent?: number;
    paymentMilestones?: Array<{ label: string; percentage: number }>;
    finalPercent?: number;
}

/**
 * Build the schedule from a contract total (inc GST) + org defaults.
 * Percentages that don't sum to 100 are tolerated (the final line just
 * carries the remainder so the dollar amounts always reconcile to the
 * total).
 */
export function buildPaymentSchedule(totalIncGst: number, defaults: DocumentDefaultsLike): PaymentScheduleLine[] {
    const total = Number.isFinite(totalIncGst) ? totalIncGst : 0;
    const lines: PaymentScheduleLine[] = [];
    const depositPct = defaults.depositPercent ?? 10;
    lines.push({ key: 'deposit', label: 'Deposit', percentage: depositPct, amountIncGst: Math.round(total * depositPct / 100), paid: false });
    for (let i = 0; i < (defaults.paymentMilestones ?? []).length; i++) {
        const m = defaults.paymentMilestones![i];
        lines.push({ key: `milestone-${i}`, label: m.label, percentage: m.percentage, amountIncGst: Math.round(total * m.percentage / 100), paid: false });
    }
    // Final line carries the remainder so the schedule always reconciles
    // exactly to the contract total regardless of rounding / pct gaps.
    const allocated = lines.reduce((a, l) => a + l.amountIncGst, 0);
    const finalAmount = total - allocated;
    const finalPct = defaults.finalPercent ?? Math.max(0, 100 - lines.reduce((a, l) => a + l.percentage, 0));
    lines.push({ key: 'final', label: 'Balance on delivery', percentage: finalPct, amountIncGst: finalAmount, paid: false });
    return lines;
}

/** Total paid across the schedule (inc GST). */
export function totalPaid(lines: PaymentScheduleLine[]): number {
    return (lines ?? []).filter(l => l.paid).reduce((a, l) => a + l.amountIncGst, 0);
}

/** Outstanding balance (inc GST). */
export function outstandingBalance(lines: PaymentScheduleLine[]): number {
    return (lines ?? []).filter(l => !l.paid).reduce((a, l) => a + l.amountIncGst, 0);
}

/** Mark the deposit line paid once a deposit doc exists on the contract. */
export function applyDepositPaid(lines: PaymentScheduleLine[], depositPaidAt?: any): PaymentScheduleLine[] {
    return lines.map(l => l.key === 'deposit' ? { ...l, paid: true, paidAt: depositPaidAt ?? null } : l);
}
