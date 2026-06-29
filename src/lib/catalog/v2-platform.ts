/**
 * v2-platform.ts — platform feature helpers.
 *
 * v2.0:
 *   5.1.1 Flexible Quoting Units — hull-only / engine-only / trailer-only.
 *   5.5.1 Universal Activity Log — normalised activity entry shape.
 * v2.1:
 *   5.2.1 Brand & Dealer Isolation (RBAC) — scope guard.
 *   5.3.1 Brand Onboarding Without Code — onboarding step model.
 * Unscheduled (platform/compliance):
 *   5.4.1 Customer Access Control · 5.5.2 T&C Versioning ·
 *   5.5.3 State-Specific Compliance · 5.5.4 Privacy / Data Deletion.
 */

// 5.1.1 Flexible Quoting Units
export type QuotingUnit = 'full' | 'hull-only' | 'engine-only' | 'trailer-only';
export const QUOTING_UNIT_LABEL: Record<QuotingUnit, string> = {
    'full': 'Full package', 'hull-only': 'Hull only', 'engine-only': 'Engine only', 'trailer-only': 'Trailer only',
};
export function unitIncludesSection(unit: QuotingUnit, section: 'hull' | 'motor' | 'trailer'): boolean {
    if (unit === 'full') return true;
    if (unit === 'hull-only') return section === 'hull';
    if (unit === 'engine-only') return section === 'motor';
    if (unit === 'trailer-only') return section === 'trailer';
    return false;
}

// 5.5.1 Universal Activity Log
export interface ActivityEntry { id: string; entity: string; entityId: string; action: string; byName?: string; at: number; }
export function normaliseActivity(raw: any, entity: string): ActivityEntry {
    const ms = raw?.timestamp?.toDate?.()?.getTime?.() ?? (raw?.timestamp?.seconds ? raw.timestamp.seconds * 1000 : (typeof raw?.at === 'number' ? raw.at : 0));
    return { id: raw?.id ?? '', entity, entityId: raw?.entityId ?? raw?.quoteId ?? '', action: raw?.type ?? raw?.action ?? 'event', byName: raw?.byName, at: ms };
}

// 5.2.1 Brand & Dealer Isolation (RBAC)
export function canAccessOrgData(userOrgId: string, dataOrgId: string, subDealerOrgIds: string[] = []): boolean {
    if (userOrgId === dataOrgId) return true;
    return subDealerOrgIds.includes(dataOrgId);
}

// 5.3.1 Brand Onboarding Without Code
export interface OnboardingStep { key: string; label: string; done: boolean }
export function onboardingProgress(steps: OnboardingStep[]): number {
    if (!steps?.length) return 0;
    return steps.filter(s => s.done).length / steps.length;
}

// 5.4.1 Customer Access Control
export function customerVisibleTo(customer: any, userOrgId: string, subDealerOrgIds: string[] = []): boolean {
    return canAccessOrgData(userOrgId, customer?.organisationId ?? '', subDealerOrgIds);
}

// 5.5.2 T&C Versioning
export interface TermsVersion { version: number; effectiveFrom: any; body: string }
export function latestTerms(versions: TermsVersion[]): TermsVersion | null {
    if (!versions?.length) return null;
    return [...versions].sort((a, b) => b.version - a.version)[0];
}

// 5.5.3 State-Specific Compliance
export const AU_STATES = ['NSW', 'VIC', 'QLD', 'SA', 'WA', 'TAS', 'NT', 'ACT'] as const;
export type AuState = typeof AU_STATES[number];
export function complianceTextFor(state: AuState, registry: Record<string, string>): string {
    return registry?.[state] ?? '';
}

// 5.5.4 Privacy / Data Deletion
export interface DeletionRequest { customerId: string; requestedAt: any; status: 'pending' | 'completed' }
export function isDeletionPending(req?: DeletionRequest): boolean { return req?.status === 'pending'; }
