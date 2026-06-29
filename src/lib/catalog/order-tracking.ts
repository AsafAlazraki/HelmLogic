/**
 * order-tracking.ts (v1.24 — Story 2.5.1).
 *
 * Factory order lifecycle tracking for a contract's allocated unit.
 * Writes onto the contract doc (or a dedicated order field): the order
 * state + key dates so the dealer can see where a factory order is.
 *
 * State machine:
 *   ordered -> in-production -> shipped -> arrived -> delivered
 *   (any -> cancelled)
 */

export type OrderState = 'ordered' | 'in-production' | 'shipped' | 'arrived' | 'delivered' | 'cancelled';

export const ORDER_STATE_LABEL: Record<OrderState, string> = {
    'ordered': 'Ordered',
    'in-production': 'In production',
    'shipped': 'Shipped',
    'arrived': 'Arrived',
    'delivered': 'Delivered',
    'cancelled': 'Cancelled',
};

export const ORDER_STATE_SEQUENCE: OrderState[] = ['ordered', 'in-production', 'shipped', 'arrived', 'delivered'];

const ALLOWED: Record<OrderState, OrderState[]> = {
    'ordered': ['in-production', 'cancelled'],
    'in-production': ['shipped', 'cancelled'],
    'shipped': ['arrived', 'cancelled'],
    'arrived': ['delivered', 'cancelled'],
    'delivered': [],
    'cancelled': [],
};

export function canTransitionOrderState(from: OrderState, to: OrderState): boolean {
    return (ALLOWED[from] ?? []).includes(to);
}

/** 0-1 progress fraction for a progress bar (cancelled = 0). */
export function orderProgress(state: OrderState): number {
    if (state === 'cancelled') return 0;
    const idx = ORDER_STATE_SEQUENCE.indexOf(state);
    if (idx < 0) return 0;
    return (idx + 1) / ORDER_STATE_SEQUENCE.length;
}
