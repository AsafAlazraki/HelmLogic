/**
 * inventory-allocation.ts (v1.21 — Story 2.5.3).
 *
 * Link a stock item to a contract so it's marked allocated and can't be
 * double-sold. Writes onto the inventory doc (inventory/{id}):
 *   allocatedContractId, allocatedQuoteId, allocatedAt, allocatedByName,
 *   status -> 'Allocated'
 *
 * Releasing an allocation (contract cancelled) clears the fields + flips
 * status back to its prior value.
 */

export interface AllocationPatch {
    allocatedContractId: string;
    allocatedQuoteId: string;
    allocatedAt: any;
    allocatedByName: string;
    status: string;
}

/** Build the patch to allocate a stock item to a contract. */
export function buildAllocationPatch(input: {
    contractId: string;
    quoteId: string;
    byName: string;
    now: Date;
}): AllocationPatch {
    return {
        allocatedContractId: input.contractId,
        allocatedQuoteId: input.quoteId,
        allocatedAt: input.now,
        allocatedByName: input.byName,
        status: 'Allocated',
    };
}

/** Build the patch to release an allocation (contract cancelled / unlinked). */
export function buildReleasePatch(restoreStatus: string = 'In Stock'): Record<string, any> {
    return {
        allocatedContractId: null,
        allocatedQuoteId: null,
        allocatedAt: null,
        allocatedByName: null,
        status: restoreStatus,
    };
}

/** True when a stock item is already allocated to a contract. */
export function isAllocated(item: any): boolean {
    return !!item?.allocatedContractId;
}
