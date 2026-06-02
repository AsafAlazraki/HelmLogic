'use client';

import { useMemo, useState, useEffect } from 'react';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { useUser } from '@/firebase/auth/use-user';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useCollection } from '@/firebase/firestore/use-collection';
import { doc, collection, collectionGroup, query, where, getDocs, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { HelmLogicLoading } from '@/components/helmlogic-loading';
import {
    ArrowLeft,
    Anchor,
    Zap,
    DollarSign,
    User,
    Check,
    CheckCircle2,
    ChevronDown,
    Layers,
    Eye,
    Printer,
    Calculator,
    TrendingUp,
    Save,
    Loader2,
    Truck,
    ClipboardList,
    ListChecks,
    Copy,
    Ruler,
    FileText,
    Activity,
    UserPlus,
    Send,
    Sparkles,
    Lock,
    LockOpen,
    GitBranch,
    Edit3,
    Percent,
    Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
} from "@/components/ui/sheet";
import { Input } from '@/components/ui/input';
import { useQuoteAuditLog, type AuditEventType, type QuoteAuditEvent } from '@/lib/quote-audit-log';
import { isEmailSendEnabled } from '@/lib/email-send';
import { SendQuoteDialog } from '@/components/send-quote-dialog';
import { PersonaliseContentSheet } from '@/components/personalise-content-sheet';
import { QuotePreviewSheet } from '@/components/quote-preview-sheet';
import { CreateScenarioDialog } from '@/components/create-scenario-dialog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
    getLifecycleState,
    transitionQuoteLifecycle,
    LIFECYCLE_STATES,
    LIFECYCLE_STATE_LABEL,
    LIFECYCLE_STATE_DESC,
    LIFECYCLE_STATE_TINT,
    type LifecycleState,
} from '@/lib/quote-lifecycle';
import { useSiblingScenarios } from '@/lib/quote-scenarios';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { ProposalPrint } from './proposal-print';

interface ProposalViewProps {
    quoteId?: string;
    quoteNumber?: string;
    hideNav?: boolean;
}

function formatOptionDisplayLabel(name: string): { base: string; color: string | null } {
    const normalized = name.replace(/\s*&\s*/g, ' & ').replace(/\s+/g, ' ').trim();
    const parenMatch = normalized.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
    if (!parenMatch) return { base: normalized, color: null };
    const base = parenMatch[1].trim();
    const firstColor = parenMatch[2].split('/')[0].trim();
    const color = firstColor
        ? firstColor.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ')
        : null;
    return { base, color };
}

export function formatCurrency(amount: number) {
    return new Intl.NumberFormat('en-AU', {
        style: 'currency',
        currency: 'AUD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
    }).format(amount);
}

function SectionCard({ icon: Icon, label, children }: { icon: any; label: string; children: React.ReactNode }) {
    return (
        <div className="bg-white rounded-3xl border-2 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b bg-slate-50/50 flex items-center gap-2.5">
                <Icon className="h-3.5 w-3.5 text-primary shrink-0" />
                <h3 className="text-[9px] font-black uppercase tracking-[0.35em] text-slate-500">{label}</h3>
            </div>
            {children}
        </div>
    );
}

function MetaItem({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-0.5">{label}</p>
            <p className="font-black text-sm text-slate-900 leading-tight">{value}</p>
        </div>
    );
}

function PricingRow({ label, value, bold, accent, showIfZero }: { label: string; value: number; bold?: boolean; accent?: boolean; showIfZero?: boolean }) {
    if (value === 0 && !showIfZero) return null;
    return (
        <div className={cn(
            "flex items-center justify-between py-2.5 px-3 rounded-xl transition-colors",
            accent ? "bg-primary/5 border border-primary/20" : "hover:bg-slate-50/80"
        )}>
            <span className={cn("text-[10px] uppercase tracking-wider", bold ? "font-black text-slate-900" : "font-bold text-slate-500")}>{label}</span>
            <span className={cn("font-black text-sm tabular-nums", accent ? "text-primary" : bold ? "text-slate-900" : "text-slate-700")}>{formatCurrency(value)}</span>
        </div>
    );
}

export function ProposalView({ quoteId, quoteNumber, hideNav }: ProposalViewProps) {
    const router = useRouter();
    const firestore = useFirestore();
    const { user } = useUser();
    const { toast } = useToast();

    const [isAuditOpen, setIsAuditOpen] = useState(false);
    /** v1.8 (story 1.4.1.c) — Activity sheet shows the per-quote audit
     *  log captured by 1.4.1.b's logAuditEvent calls (created /
     *  finalised / sent / locked / unlocked / version-forked /
     *  content-overridden / discount-changed). Read-only.
     *  The actual subscription (`useQuoteAuditLog`) is below the
     *  `quote` declaration since it depends on the resolved owner uid. */
    const [isActivityOpen, setIsActivityOpen] = useState(false);

    /** v1.8 (story 1.3.1.b.iii) — Fork-on-edit popup state. Opens when
     *  the operator clicks "Create v{N+1}" on a locked quote. Confirm
     *  → forkLockedQuote() → redirect. Per CONVENTIONS.md popup-for-
     *  confirmations rule. */
    const [isForkOpen, setIsForkOpen] = useState(false);
    const [isForking, setIsForking] = useState(false);

    /** v1.8 (story 1.3.1.c) — Manual-unlock popup state. Admin-only
     *  emergency override (the AlertDialog itself is hidden when the
     *  operator doesn't have can_access_settings). Reuses the same
     *  popup-for-confirmations pattern. */
    const [isUnlockOpen, setIsUnlockOpen] = useState(false);
    const [isUnlocking, setIsUnlocking] = useState(false);

    /** v1.8 (story 1.2.4.c) — Send Quote dialog state. Opens from the
     *  Send button in the header. Disabled when email infra is not yet
     *  wired (NEXT_PUBLIC_EMAIL_SEND_ENABLED flag — gating the BUTTON,
     *  not the pipeline). */
    const [isSendOpen, setIsSendOpen] = useState(false);
    const sendEnabled = useMemo(() => isEmailSendEnabled(), []);

    /** v1.8 (story 1.2.3.c) — Personalise Content side sheet state.
     *  Opens from the Personalise button. Hidden when the quote is
     *  locked (lock state owns the broader edit gate). */
    const [isPersonaliseOpen, setIsPersonaliseOpen] = useState(false);
    /** v1.9 (story 1.8.4) — Preview sheet open state. Renders the same
     *  PDF the Download button produces via renderQuotePdf(); blob lives
     *  inside the sheet, so the operator can verify before download/send. */
    const [isPreviewOpen, setIsPreviewOpen] = useState(false);
    /** v1.9 (story 1.1.3) — Create Scenario dialog open state. Confirm
     *  → createQuoteScenario() → redirect to the new sibling quote. */
    const [isScenarioOpen, setIsScenarioOpen] = useState(false);
    const [localDiscount, setLocalDiscount] = useState<number>(0);
    const [isSaving, setIsSaving] = useState(false);
    const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);

    // User profile for org-wide lookup
    const userProfileRef = useMemoFirebase(() => user ? doc(firestore, 'users', user.uid) : null, [firestore, user]);
    const { data: userProfile } = useDoc<any>(userProfileRef);

    const userQuotesRef = useMemoFirebase(() => user ? collection(firestore, `users/${user.uid}/quotes`) : null, [firestore, user]);

    // Primary: own quotes path (works for all existing quotes where current user is owner)
    const ownQuoteRef = useMemoFirebase(() =>
        (user && quoteId) ? doc(firestore, `users/${user.uid}/quotes`, quoteId) : null,
    [firestore, user?.uid, quoteId]);
    const { data: ownQuote, loading: ownQuoteLoading } = useDoc<any>(ownQuoteRef);

    // Org-wide fallback: when own-quote lookup fails, search all org members' quotes
    const [orgFallbackQuote, setOrgFallbackQuote] = useState<any>(null);
    const [orgFallbackLoading, setOrgFallbackLoading] = useState(false);

    useEffect(() => {
        if (ownQuote || ownQuoteLoading || !quoteId || !user || !userProfile?.organisationId) return;

        const searchOrgQuotes = async () => {
            setOrgFallbackLoading(true);
            try {
                // Find all users in the same org
                const usersSnap = await getDocs(query(
                    collection(firestore, 'users'),
                    where('organisationId', '==', userProfile.organisationId)
                ));

                // Try to find the quote under each user
                for (const userDoc of usersSnap.docs) {
                    if (userDoc.id === user.uid) continue; // Already checked own quotes
                    try {
                        const quoteRef = doc(firestore, `users/${userDoc.id}/quotes`, quoteId);
                        const quoteSnap = await getDoc(quoteRef);
                        if (quoteSnap.exists()) {
                            setOrgFallbackQuote({ id: quoteSnap.id, ...quoteSnap.data() });
                            break;
                        }
                    } catch {
                        // Permission denied for this user's quotes — skip
                    }
                }
            } catch (error) {
                console.error('Org quote search failed:', error);
            } finally {
                setOrgFallbackLoading(false);
            }
        };

        searchOrgQuotes();
    }, [ownQuote, ownQuoteLoading, quoteId, user, userProfile?.organisationId, firestore]);

    const quote = ownQuote || orgFallbackQuote;
    /** v1.8 (story 1.4.1.c) — live audit-log subscription. */
    const auditOwnerUid = (quote?.createdByUid ?? user?.uid) as string | null | undefined;
    const { data: auditEvents } = useQuoteAuditLog(auditOwnerUid, quote?.id ?? null);
    /** v1.9 (story 1.1.3) — sibling-scenarios live subscription. Returns
     *  the ordered list [root, ...scenarios] under the current quote's
     *  family tree. `null` until the audit-owner uid resolves. */
    const { data: siblingScenarios } = useSiblingScenarios(auditOwnerUid ?? null, quote ?? null);
    const isLoadingQuote = !quote && (ownQuoteLoading || orgFallbackLoading);

    const orgRef = useMemoFirebase(() => quote?.organisationId ? doc(firestore, 'organisations', quote.organisationId) : null, [firestore, quote?.organisationId]);
    const { data: organisation } = useDoc<any>(orgRef);

    const strategyRef = useMemoFirebase(() => {
        if (!quote?.organisationId || !quote?.vendorId) return null;
        return doc(firestore, `organisations/${quote.organisationId}/pricingStrategies/${quote.vendorId}`);
    }, [firestore, quote?.organisationId, quote?.vendorId]);
    const { data: strategy } = useDoc<any>(strategyRef);

    const ratesQuery = useMemoFirebase(() =>
        quote?.organisationId ? collection(firestore, `organisations/${quote.organisationId}/exchangeRates`) : null,
        [firestore, quote?.organisationId]);
    const { data: exchangeRates } = useCollection<any>(ratesQuery);

    const activeExchangeRate = useMemo(() => {
        if (!exchangeRates || !quote?.vendorCurrency) return 1;
        const rate = exchangeRates.find((r: any) => r.code === quote.vendorCurrency);
        return rate?.rate || 1;
    }, [exchangeRates, quote?.vendorCurrency]);

    useEffect(() => {
        if (quote) setLocalDiscount(quote.discountExclGst || 0);
    }, [quote?.id]);

    const getLandedCost = (itemId: string, baseCostUsd: number) => {
        if (!strategy?.itemValues?.[itemId]) return baseCostUsd / (activeExchangeRate || 1);
        const vals = strategy.itemValues[itemId];
        const costOverride = vals['base_cost_override'];
        const usdBase = (costOverride !== undefined && costOverride !== '' && costOverride !== null) ? parseFloat(costOverride) : baseCostUsd;
        const discountUsd = parseFloat(vals['factory_discount_usd'] || '0');
        const dutyPercent = parseFloat(vals['exchange_duty_percent'] || '0');
        const totalUsd = (usdBase || 0) - discountUsd;
        const baseAud = activeExchangeRate > 0 ? totalUsd / activeExchangeRate : totalUsd;
        const withDuty = baseAud * (1 + (dutyPercent / 100));
        const seaFreightCost = parseFloat(vals['op_sea_freight_cost_aud'] || '0');
        const roadFreightCost = parseFloat(vals['op_road_freight_cost_aud'] || '0');
        const handlingCost = parseFloat(vals['op_handling_cost_aud'] || '0');
        const preDelCost = parseFloat(vals['op_predel_cost_aud'] || '0');
        return withDuty + seaFreightCost + roadFreightCost + handlingCost + preDelCost;
    };

    const financials = useMemo(() => {
        if (!quote) return null;
        const boatBasePrice = quote.variant?.sellPriceExclGst || 0;
        const optionsTotal = (quote.selectedOptions || []).reduce((a: number, o: any) => a + (o.sellPriceExclGst || 0), 0)
            + (quote.customOptions || []).reduce((a: number, o: any) => a + (o.sellPriceExclGst || 0), 0);
        const regoTotal = (quote.registration?.boatRegoPrice || 0)
            + (quote.registration?.stickerPrice || 0)
            + (quote.registration?.tenderToPrice || 0)
            + (quote.registration?.trailerRegoPrice || 0);
        const motorTotal = (quote.motor?.sellPriceExclGst || 0)
            + (quote.motor?.accessories || []).reduce((a: number, acc: any) => a + (acc.sellPriceExclGst || 0), 0);
        const trailerTotal = (quote.trailer?.sellPriceExclGst || 0)
            + (quote.trailer?.options || []).reduce((a: number, o: any) => a + (o.sellPriceExclGst || 0), 0);
        const dealerFitTotal = (quote.dealerFit || []).reduce((a: number, sel: any) =>
            a + (sel.items || []).reduce((b: number, i: any) => b + (i.sellPriceExclGst || 0), 0), 0);
        const subtotalExclGst = boatBasePrice + optionsTotal + regoTotal + motorTotal + trailerTotal + dealerFitTotal;
        const finalTotalPriceExclGst = subtotalExclGst - localDiscount;
        const gstAmount = finalTotalPriceExclGst * 0.1;
        const totalInclGst = finalTotalPriceExclGst + gstAmount;
        const boatCost = getLandedCost(quote.variant?.id, quote.variant?.cost || 0);
        const optionsCost = (quote.selectedOptions || []).reduce((a: number, o: any) => a + getLandedCost(o.id, o.cost || 0), 0)
            + (quote.customOptions || []).reduce((a: number, o: any) => a + (o.cost || (o.sellPriceExclGst * 0.8)), 0);
        const motorCost = (quote.motor?.cost || (quote.motor?.sellPriceExclGst * 0.85))
            + (quote.motor?.accessories || []).reduce((a: number, acc: any) => a + (acc.cost || (acc.sellPriceExclGst * 0.7)), 0);
        const trailerCost = (quote.trailer?.cost || (quote.trailer?.sellPriceExclGst * 0.8));
        const dealerFitCost = dealerFitTotal * 0.6;
        const totalDealCostExclGst = boatCost + optionsCost + motorCost + trailerCost + dealerFitCost + regoTotal;
        const grossProfit = finalTotalPriceExclGst - totalDealCostExclGst;
        const marginPercent = finalTotalPriceExclGst > 0 ? (grossProfit / finalTotalPriceExclGst) * 100 : 0;
        return {
            boatBasePrice, optionsTotal, regoTotal, motorTotal, trailerTotal, dealerFitTotal,
            subtotalExclGst, finalTotalPriceExclGst, gstAmount, totalInclGst,
            boatCost, optionsCost, motorCost, trailerCost, dealerFitCost,
            totalDealCostExclGst, grossProfit, marginPercent
        };
    }, [quote, strategy, activeExchangeRate, localDiscount, organisation]);

    /** v1.8 (story 1.3.1.c) — admin gate for the manual-unlock action.
     *  Mirrors the can_access_settings check used by /manage and the
     *  sidebar Settings link. HelmLogic Admins bypass org-role checks. */
    const canManuallyUnlock = useMemo(() => {
        if (userProfile?.appRole === 'HelmLogic Admin') return true;
        const roleId = userProfile?.organisationRole;
        if (!roleId || !organisation?.permissions?.[roleId]) return false;
        return !!organisation.permissions[roleId].can_access_settings;
    }, [userProfile, organisation]);

    /** v1.8 (story 1.3.1.c) — Manually unlock a locked quote. Admin
     *  override path — used when the operator needs to edit a locked
     *  quote directly without forking (e.g. typo correction on a sent
     *  quote where re-sending isn't appropriate). Caller must already
     *  pass the canManuallyUnlock gate before reaching this handler. */
    async function handleUnlockConfirm() {
        if (!user || !quote || !auditOwnerUid) return;
        setIsUnlocking(true);
        try {
            const { unlockQuote } = await import('@/lib/quote-lock');
            await unlockQuote(firestore, auditOwnerUid, quote.id, {
                byUid: user.uid,
                byName: userProfile?.displayName || user.displayName || user.email || 'Someone',
            });
            toast({
                title: 'Quote unlocked',
                description: 'Edits are now allowed. Re-locks automatically on next Send.',
            });
            setIsUnlockOpen(false);
        } catch (e: any) {
            toast({
                variant: 'destructive',
                title: 'Unlock failed',
                description: e?.message ?? 'See console.',
            });
            console.error('[unlock-quote]', e);
        } finally {
            setIsUnlocking(false);
        }
    }

    /** v1.8 (story 1.3.1.b.iii) — Fork a locked quote into a fresh
     *  editable v{N+1} doc. Calls forkLockedQuote() (which writes the
     *  new doc, copies contentOverrides, fires version-forked auditLog
     *  events on both ends), then redirects the operator to the new
     *  quote. Per CONVENTIONS.md popup-for-confirmations rule. */
    async function handleForkConfirm() {
        if (!user || !quote || !auditOwnerUid) return;
        setIsForking(true);
        try {
            const { forkLockedQuote } = await import('@/lib/quote-lock');
            const { childQuoteId, childVersion } = await forkLockedQuote(
                firestore,
                auditOwnerUid,
                quote.id,
                {
                    byUid: user.uid,
                    byName: userProfile?.displayName || user.displayName || user.email || 'Someone',
                },
            );
            toast({
                title: `Created v${childVersion}`,
                description: `New editable copy ready.`,
            });
            setIsForkOpen(false);
            // v1.9 (story 1.3.3) — fire SharePoint sync on the new v{N}
            // child. Fire-and-forget; helper is a no-op when env flag
            // is off / org has no SharePoint config.
            void (async () => {
                if (!auditOwnerUid) return;
                const { syncQuoteToSharePoint } = await import('@/lib/sharepoint-sync');
                await syncQuoteToSharePoint({
                    firestore,
                    ownerUid: auditOwnerUid,
                    quoteId: childQuoteId,
                });
            })();
            // Redirect — the new doc lives at /proposals/{newId}.
            router.push(`/proposals/${childQuoteId}`);
        } catch (e: any) {
            toast({
                variant: 'destructive',
                title: 'Fork failed',
                description: e?.message ?? 'See console.',
            });
            console.error('[fork-quote]', e);
        } finally {
            setIsForking(false);
        }
    }

    async function handleSaveDiscount(newDiscount: number) {
        if (!user || !quote) return;
        // v1.10 fix — fail fast + honestly on locked quotes. Without this
        // guard the updateDoc fires, the optimistic toast says "Saved",
        // but the v1.8 firestore rule rejects the write (discountExclGst
        // isn't in the lock whitelist) and the change reverts on next
        // load. Surfaces as a class of "HL Error on saving project" pain.
        if (quote.isLocked === true) {
            toast({
                variant: 'destructive',
                title: 'Quote is locked',
                description: 'Discounts can\'t be changed on a locked quote. Create v2 to make changes.',
            });
            return;
        }
        setIsSaving(true);
        try {
            const ownerUid = quote.createdByUid || user.uid;
            const previousDiscount = quote.discountExclGst ?? 0;
            const ref = doc(firestore, `users/${ownerUid}/quotes`, quote.id);
            await updateDoc(ref, { discountExclGst: newDiscount, lastUpdateAt: serverTimestamp() });
            // v1.8 (story 1.4.1.b) — capture lifecycle event so the
            // Activity tab can surface the discount change with from/to.
            if (previousDiscount !== newDiscount) {
                const { logAuditEvent } = await import('@/lib/quote-audit-log');
                await logAuditEvent(firestore, ownerUid, quote.id, {
                    eventType: 'discount-changed',
                    byUid: user.uid,
                    byName: userProfile?.displayName || user.email || 'Someone',
                    metadata: {
                        fromValue: previousDiscount,
                        toValue: newDiscount,
                    },
                });
            }
            toast({ title: "Discount Saved", description: "The proposal has been updated successfully." });
        } catch {
            toast({ title: "Error", description: "Failed to save discount.", variant: "destructive" });
        } finally {
            setIsSaving(false);
        }
    }

    /** v1.9 (story 1.4.1) — Lifecycle picker click handler. */
    const handleLifecycleTransition = async (next: LifecycleState) => {
        if (!quote?.id || !auditOwnerUid || !user) return;
        try {
            await transitionQuoteLifecycle(firestore, auditOwnerUid, quote.id, next, {
                byUid: user.uid,
                byName: userProfile?.displayName || user.displayName || user.email || 'Someone',
            });
            toast({
                title: `Status: ${next}`,
                description: 'Lifecycle state updated and logged to the Activity tab.',
            });
            // v1.9 (story 1.3.3) — re-sync SharePoint when the quote
            // hits a TERMINAL lifecycle state (Accepted / Rejected /
            // Lost / Expired). Keeps the SharePoint copy current with
            // any operator edits that happened between Send and the
            // terminal-state pick. Fire-and-forget — no toast bloat.
            const TERMINAL: LifecycleState[] = ['accepted', 'rejected', 'lost', 'expired'];
            if (TERMINAL.includes(next)) {
                void (async () => {
                    const { syncQuoteToSharePoint } = await import('@/lib/sharepoint-sync');
                    await syncQuoteToSharePoint({
                        firestore,
                        ownerUid: auditOwnerUid,
                        quoteId: quote.id,
                    });
                })();
            }
        } catch (e: any) {
            console.error('[lifecycle-transition] failed', e);
            toast({
                variant: 'destructive',
                title: 'Could not update status',
                description: e?.message ?? 'See console.',
            });
        }
    };

    const handleDownloadPdf = async () => {
        if (!quote || !financials) return;
        setIsGeneratingPdf(true);
        try {
            // v1.8 (story 1.5.0) — single-source PDF render pipeline.
            // Was 80+ lines of duplicated content-block resolve + image
            // preload + URL swap + @react-pdf render; now one call.
            // Same client-side flow, no behaviour change.
            const { renderQuotePdf } = await import('@/lib/render-quote-pdf');
            const { blob } = await renderQuotePdf({
                firestore,
                quote,
                organisation,
                financials,
            });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Quote-${quote.quoteNumber}-${quote.modelName ?? 'Proposal'}.pdf`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        } catch (err) {
            console.error('PDF generation failed:', err);
            toast({ title: 'PDF generation failed', description: 'Please try again.', variant: 'destructive' });
        } finally {
            setIsGeneratingPdf(false);
        }
    };

    if (isLoadingQuote) return <HelmLogicLoading label="Loading Proposal" />;
    if (!quote) return <div className="p-20 text-center font-black uppercase text-slate-300">Proposal not found.</div>;
    const f = financials!;

    return (
        <div className="min-h-screen bg-slate-50/50 pb-20">
            <style jsx global>{`
                @media print {
                    .no-print { display: none !important; }
                    .web-view { display: none !important; }
                    body { background: white !important; margin: 0 !important; padding: 0 !important; }
                }
            `}</style>

            <div className="web-view">
                {/* Top Navigation */}
                {!hideNav && (
                    <div className="sticky top-0 z-50 bg-white/95 backdrop-blur-xl border-b shadow-sm no-print w-full px-6 sm:px-10 h-16 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0">
                            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-xl border-2 shrink-0" onClick={() => router.back()}>
                                <ArrowLeft className="h-4 w-4" />
                            </Button>
                            <div className="w-px h-6 bg-slate-200 shrink-0" />
                            <div className="min-w-0">
                                <p className="text-[8px] font-black uppercase tracking-[0.3em] text-muted-foreground leading-none mb-0.5">Proposal</p>
                                <p className="text-sm font-black uppercase tracking-tight leading-none truncate">{quote.quoteNumber}</p>
                            </div>
                            {/* v1.9 (story 1.4.1) — Lifecycle picker. Stock
                                quotes keep the simple type badge (no
                                customer-facing lifecycle). Proposal quotes
                                surface a click-to-transition Popover whose
                                trigger is the lifecycle-state badge. */}
                            {quote.status === 'stock' ? (
                                <Badge className="text-[8px] font-black uppercase tracking-widest px-2.5 shrink-0 hidden sm:inline-flex bg-emerald-50 text-emerald-700 border-emerald-200">
                                    stock
                                </Badge>
                            ) : (
                                <Popover>
                                    <PopoverTrigger asChild>
                                        <button
                                            type="button"
                                            className={cn(
                                                'rounded-md border text-[8px] font-black uppercase tracking-widest px-2.5 py-0.5 shrink-0 hidden sm:inline-flex items-center gap-1 transition-opacity hover:opacity-80',
                                                LIFECYCLE_STATE_TINT[getLifecycleState(quote)],
                                            )}
                                            aria-label="Change quote lifecycle state"
                                        >
                                            {LIFECYCLE_STATE_LABEL[getLifecycleState(quote)]}
                                            <ChevronDown className="h-3 w-3 opacity-70" />
                                        </button>
                                    </PopoverTrigger>
                                    <PopoverContent align="start" className="w-72 p-1">
                                        <div className="px-3 py-2 border-b mb-1">
                                            <p className="text-[9px] font-black uppercase tracking-widest text-muted-foreground">Quote lifecycle</p>
                                            <p className="text-[10px] text-slate-500 mt-0.5">Pick the current sales-journey state. Every change is captured in the Activity log.</p>
                                        </div>
                                        {LIFECYCLE_STATES.map((s) => {
                                            const isCurrent = s === getLifecycleState(quote);
                                            return (
                                                <button
                                                    key={s}
                                                    type="button"
                                                    onClick={() => handleLifecycleTransition(s)}
                                                    disabled={isCurrent}
                                                    className={cn(
                                                        'w-full text-left px-2 py-2 rounded-md flex items-start gap-2 hover:bg-slate-50 disabled:opacity-100 disabled:cursor-default',
                                                    )}
                                                >
                                                    <Check className={cn('h-3.5 w-3.5 mt-0.5 shrink-0', isCurrent ? 'text-emerald-600' : 'text-transparent')} />
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className={cn(
                                                                'text-[10px] font-black uppercase tracking-widest px-1.5 py-0.5 rounded border',
                                                                LIFECYCLE_STATE_TINT[s],
                                                            )}>
                                                                {LIFECYCLE_STATE_LABEL[s]}
                                                            </span>
                                                        </div>
                                                        <p className="text-[10px] text-slate-500 mt-0.5 leading-tight">{LIFECYCLE_STATE_DESC[s]}</p>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </PopoverContent>
                                </Popover>
                            )}
                            {/* v1.8 (story 1.3.1.b.i) — Lock badge. Renders next
                                to the status badge whenever the quote has been
                                locked. Shows version + lock reason inline so
                                the operator sees at a glance why edits are
                                disabled. Tooltip surfaces the lock actor +
                                timestamp. Hidden on mobile (sm:inline-flex)
                                to match the status-badge breakpoint. */}
                            {/* v1.9 (story 1.1.3) — Scenario label chip.
                                Renders next to the lifecycle picker whenever
                                the quote is a scenario (has scenarioLabel
                                set). Tells the operator at a glance which
                                option they're looking at in the family. */}
                            {quote.scenarioLabel && (
                                <Badge className="text-[8px] font-black uppercase tracking-widest px-2.5 shrink-0 hidden sm:inline-flex bg-indigo-50 text-indigo-700 border-indigo-200 gap-1">
                                    <Layers className="h-2.5 w-2.5" />
                                    {quote.scenarioLabel}
                                </Badge>
                            )}
                            {quote.isLocked === true && (
                                <Badge
                                    title={(() => {
                                        const at = quote.lockedAt?.toDate?.();
                                        const reason = quote.lockedReason ?? 'manual';
                                        const by = quote.lockedByName ?? 'Someone';
                                        const ts = at ? at.toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
                                        return `Locked (${reason}) by ${by}${ts ? ` on ${ts}` : ''}. Click "Create v2" to fork.`;
                                    })()}
                                    className="text-[8px] font-black uppercase tracking-widest px-2.5 shrink-0 hidden sm:inline-flex bg-amber-50 text-amber-700 border-amber-200 gap-1"
                                >
                                    <Lock className="h-2.5 w-2.5" />
                                    Locked
                                    {typeof quote.version === 'number' && quote.version > 0 && (
                                        <span className="text-amber-500">· v{quote.version}</span>
                                    )}
                                    {quote.lockedReason && (
                                        <span className="text-amber-500">· {quote.lockedReason}</span>
                                    )}
                                </Badge>
                            )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-9 px-4 rounded-xl font-black uppercase text-[9px] tracking-widest gap-1.5 hover:bg-slate-100 relative"
                                onClick={() => setIsActivityOpen(true)}
                            >
                                <Activity className="h-3.5 w-3.5 text-primary" />
                                <span className="hidden sm:inline">Activity</span>
                                {(auditEvents?.length ?? 0) > 0 && (
                                    <span className="ml-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full bg-primary/15 text-primary text-[9px] font-black">
                                        {auditEvents!.length}
                                    </span>
                                )}
                            </Button>
                            <Button
                                variant="ghost"
                                size="sm"
                                className="h-9 px-4 rounded-xl font-black uppercase text-[9px] tracking-widest gap-1.5 hover:bg-slate-100"
                                onClick={() => setIsAuditOpen(true)}
                            >
                                <Calculator className="h-3.5 w-3.5 text-primary" />
                                <span className="hidden sm:inline">Audit</span>
                            </Button>
                            {/* v1.8 (story 1.3.1.b.ii) — Duplicate hidden when
                                locked. The Create v2 button below replaces it
                                semantically: it forks the locked quote in
                                place with parentQuoteId tracking instead of
                                routing through the quote-flow. */}
                            {quote.isLocked !== true && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-9 px-4 rounded-xl font-black uppercase text-[9px] tracking-widest gap-1.5 hover:bg-slate-100"
                                    onClick={() => router.push(
                                        `/modules/${quote.moduleSlug}/quote/${quote.modelId}` +
                                        `?range=${quote.rangeId}&vendor=${quote.vendorId}&duplicate=${quote.id}`
                                    )}
                                >
                                    <Copy className="h-3.5 w-3.5 text-primary" />
                                    <span className="hidden sm:inline">Duplicate</span>
                                </Button>
                            )}
                            {/* v1.8 (story 1.3.1.b.iii) — Create v2 button.
                                Visible only when locked. Opens fork-on-edit
                                popup → forkLockedQuote() → redirect to the
                                new editable v{N+1} doc. Per CONVENTIONS.md
                                "popups for confirmations" rule. */}
                            {quote.isLocked === true && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-9 px-4 rounded-xl font-black uppercase text-[9px] tracking-widest gap-1.5 hover:bg-amber-50 text-amber-700"
                                    onClick={() => setIsForkOpen(true)}
                                    disabled={isForking}
                                >
                                    {isForking ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                        <GitBranch className="h-3.5 w-3.5" />
                                    )}
                                    <span className="hidden sm:inline">
                                        {isForking ? 'Creating…' : `Create v${(quote.version ?? 1) + 1}`}
                                    </span>
                                </Button>
                            )}
                            {/* v1.8 (story 1.2.3.c) — Personalise button. Visible
                                only when the quote is unlocked (the override layer
                                is editing state, and locked quotes are read-only).
                                Opens the Personalise side sheet. */}
                            {quote.isLocked !== true && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-9 px-4 rounded-xl font-black uppercase text-[9px] tracking-widest gap-1.5 hover:bg-slate-100"
                                    onClick={() => setIsPersonaliseOpen(true)}
                                >
                                    <Sparkles className="h-3.5 w-3.5 text-primary" />
                                    <span className="hidden sm:inline">Personalise</span>
                                </Button>
                            )}
                            {/* v1.8 (story 1.2.4.c) — Send Quote button. Always
                                visible. Disabled until NEXT_PUBLIC_EMAIL_SEND_ENABLED=true
                                AND customer has an email AND quote isn't a
                                stock item (mode === 'inventory'). Tooltip
                                explains the gate. */}
                            {(() => {
                                const emailEnabled = sendEnabled;
                                const hasRecipient = !!quote.customer?.email;
                                const disabled = !emailEnabled || !hasRecipient;
                                const tooltip = !emailEnabled
                                    ? 'Email sending is awaiting infrastructure setup (sender domain + provider). Templates can be authored now in /manage.'
                                    : !hasRecipient
                                        ? 'Set a customer email on the quote before sending.'
                                        : 'Send the quote to the customer';
                                return (
                                    <Button
                                        variant={disabled ? 'outline' : 'default'}
                                        size="sm"
                                        className={cn(
                                            'h-9 px-4 rounded-xl font-black uppercase text-[9px] tracking-widest gap-1.5',
                                            disabled && 'bg-slate-100 text-slate-400 hover:bg-slate-100 cursor-not-allowed',
                                        )}
                                        onClick={() => { if (!disabled) setIsSendOpen(true); }}
                                        disabled={disabled}
                                        title={tooltip}
                                    >
                                        <Send className="h-3.5 w-3.5" />
                                        <span className="hidden sm:inline">Send Quote</span>
                                    </Button>
                                );
                            })()}
                            {/* v1.9 (story 1.1.3) — Create Scenario button.
                                Opens CreateScenarioDialog → spawns a sibling
                                quote under the same root + redirects. Hidden
                                on stock quotes (the lifecycle / sibling
                                concept doesn't apply to inventory rows). */}
                            {quote.status !== 'stock' && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-9 px-4 rounded-xl font-black uppercase text-[9px] tracking-widest gap-1.5 hover:bg-slate-100"
                                    onClick={() => setIsScenarioOpen(true)}
                                >
                                    <Layers className="h-3.5 w-3.5 text-indigo-600" />
                                    <span className="hidden sm:inline">Scenario</span>
                                </Button>
                            )}
                            {/* v1.9 (story 1.8.4) — Preview button. Opens
                                QuotePreviewSheet which renders the same PDF
                                renderQuotePdf() produces, inline in an iframe.
                                Sits before Download so the operator's eye flows
                                Preview → Download (or Preview → Send). */}
                            <Button
                                variant="outline"
                                size="sm"
                                className="h-9 px-4 rounded-xl font-black uppercase text-[9px] tracking-widest gap-1.5"
                                onClick={() => setIsPreviewOpen(true)}
                            >
                                <Eye className="h-3.5 w-3.5" />
                                <span className="hidden sm:inline">Preview</span>
                            </Button>
                            <Button
                                size="sm"
                                className="h-9 px-5 rounded-xl font-black uppercase text-[9px] tracking-widest gap-1.5"
                                onClick={handleDownloadPdf}
                                disabled={isGeneratingPdf}
                            >
                                {isGeneratingPdf
                                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    : <Printer className="h-3.5 w-3.5" />
                                }
                                <span className="hidden sm:inline">{isGeneratingPdf ? 'Generating…' : 'Download PDF'}</span>
                            </Button>
                        </div>
                    </div>
                )}

                <div className="max-w-6xl mx-auto px-4 sm:px-8 py-8 md:py-12 space-y-6 md:space-y-8">
                    {/* HERO */}
                    <div className="relative rounded-[2rem] md:rounded-[3rem] overflow-hidden border-2 bg-white shadow-xl">
                        {quote.coverImageUrl && (
                            <div className="absolute inset-0 z-0">
                                <Image src={quote.coverImageUrl} alt="" fill className="object-cover opacity-15" />
                                <div className="absolute inset-0 bg-gradient-to-r from-white via-white/70 to-white/10" />
                            </div>
                        )}
                        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-2">
                            {/* Left: Identity */}
                            <div className="p-8 md:p-12 flex flex-col justify-between gap-8">
                                <div className="space-y-6">
                                    {/* Logo */}
                                    {organisation?.primaryLogoUrl ? (
                                        <div className="relative h-10 w-32">
                                            <Image src={organisation.primaryLogoUrl} alt="" fill className="object-contain object-left" />
                                        </div>
                                    ) : (
                                        <div className="flex items-center gap-2">
                                            <div className="h-9 w-9 bg-primary rounded-xl flex items-center justify-center">
                                                <Anchor className="h-4 w-4 text-white" />
                                            </div>
                                            <span className="font-black uppercase text-sm tracking-tight">{organisation?.name}</span>
                                        </div>
                                    )}

                                    <div className="space-y-2">
                                        <div className="text-[9px] font-black uppercase tracking-[0.4em] text-primary">{quote.rangeName} Range</div>
                                        <h1 className="text-4xl md:text-5xl font-black uppercase tracking-tighter italic text-slate-900 leading-none">{quote.modelName}</h1>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{quote.modelCode}</p>
                                    </div>

                                    {quote.variant && (
                                        <div className="flex items-center gap-2.5">
                                            {quote.variant.colorCode && (
                                                <div className="h-5 w-5 rounded-full border-2 border-white shadow" style={{ backgroundColor: quote.variant.colorCode }} />
                                            )}
                                            <div className="px-3 py-1.5 bg-slate-100 rounded-full">
                                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-700">
                                                    {quote.variant.name && quote.variant.name !== 'Standard'
                                                        ? quote.variant.name
                                                        : `${quote.variant.material} \u2022 ${quote.variant.colorName}`}
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                <div className="flex flex-wrap gap-x-6 gap-y-3 pt-6 border-t border-slate-100">
                                    <MetaItem label="Quote #" value={quote.quoteNumber} />
                                    <MetaItem label="Date" value={quote.createdAt?.toDate?.()?.toLocaleDateString() || new Date().toLocaleDateString()} />
                                    <MetaItem label="Consultant" value={quote.createdByName || '—'} />
                                </div>
                            </div>

                            {/* Right: Image + Price */}
                            <div className="flex flex-col items-stretch justify-between p-6 md:p-10 bg-slate-50/40 border-t-2 lg:border-t-0 lg:border-l-2 border-slate-100 gap-4">
                                {(quote.variant?.imageUrl || quote.coverImageUrl) && (
                                    <div className="relative w-full h-48 md:h-56 rounded-2xl overflow-hidden border-2 bg-white shadow-lg">
                                        <Image src={quote.variant?.imageUrl || quote.coverImageUrl} alt="" fill className="object-contain p-4 mix-blend-multiply" />
                                    </div>
                                )}
                                <div className="bg-slate-900 rounded-2xl p-5 md:p-6 text-white text-right shadow-xl">
                                    <p className="text-[8px] font-black uppercase tracking-widest opacity-50 mb-1">Total Package Excl. GST</p>
                                    <p className="text-3xl md:text-4xl font-black tabular-nums">{formatCurrency(f.finalTotalPriceExclGst)}</p>
                                    <p className="text-[8px] font-black uppercase tracking-widest opacity-40 mt-1">incl. GST {formatCurrency(f.totalInclGst)}</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* CONTENT GRID — sidebar drops below on mobile */}
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 md:gap-8">
                        {/* Main column */}
                        <div className="lg:col-span-2 space-y-6">
                            {/* Client */}
                            <SectionCard icon={User} label="Client Profile">
                                <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <MetaItem label="Name" value={quote.customer.name} />
                                    <MetaItem label="Email" value={quote.customer.email || '—'} />
                                    {quote.customer.phone && <MetaItem label="Phone" value={quote.customer.phone} />}
                                    {quote.customer.company && <MetaItem label="Company" value={quote.customer.company} />}
                                </div>
                            </SectionCard>

                            {/* Technical Specifications — leads with substance */}
                            {quote.specifications?.otherSpecs?.length > 0 && (
                                <SectionCard icon={Ruler} label="Technical Specifications">
                                    <div className="divide-y">
                                        {quote.specifications.otherSpecs.map((spec: any, i: number) => (
                                            <div key={i} className={cn("flex items-center justify-between px-6 py-3", i % 2 === 0 ? "" : "bg-slate-50/40")}>
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{spec.label}</span>
                                                <span className="font-black text-sm text-slate-900">{spec.value}</span>
                                            </div>
                                        ))}
                                    </div>
                                </SectionCard>
                            )}

                            {/* Standard Features */}
                            {quote.standardFeatures?.length > 0 && (
                                <SectionCard icon={ListChecks} label="Standard Features">
                                    <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-2">
                                        {quote.standardFeatures.map((feat: string, i: number) => (
                                            <div key={i} className="flex items-start gap-2.5">
                                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0 mt-0.5" />
                                                <span className="text-[11px] font-bold text-slate-600 leading-tight">{feat}</span>
                                            </div>
                                        ))}
                                    </div>
                                </SectionCard>
                            )}

                            {/* Factory Options — grouped by category */}
                            {(quote.selectedOptions?.length > 0 || quote.customOptions?.length > 0) && (() => {
                                const allOptions = [
                                    ...(quote.selectedOptions || []).filter((o: any) => !o.isStandard),
                                    ...(quote.customOptions || []),
                                ];
                                const groups = allOptions.reduce((acc: Record<string, any[]>, opt: any) => {
                                    const cat = opt.category || 'General Options';
                                    if (!acc[cat]) acc[cat] = [];
                                    acc[cat].push(opt);
                                    return acc;
                                }, {});
                                const groupEntries = Object.entries(groups);
                                if (groupEntries.length === 0) return null;
                                return (
                                    <SectionCard icon={Layers} label="Factory Options">
                                        <div>
                                            {groupEntries.map(([cat, opts], gi) => (
                                                <div key={cat}>
                                                    <div className={cn("px-6 py-2.5 bg-slate-50/70 flex items-center gap-2", gi > 0 ? "border-t" : "")}>
                                                        <span className="text-[9px] font-black uppercase tracking-[0.3em] text-primary">{cat}</span>
                                                        <span className="text-[8px] font-black text-slate-400">{opts.length}</span>
                                                    </div>
                                                    {opts.map((opt: any, i: number) => (
                                                        <div key={opt.id || i} className="flex items-center justify-between px-6 py-3.5 border-t border-slate-50 hover:bg-slate-50/40 transition-colors">
                                                            <div className="flex items-center gap-3 min-w-0">
                                                                {opt.imageUrl
                                                                    ? <div className="h-9 w-9 relative bg-white rounded-lg border shrink-0 overflow-hidden"><Image src={opt.imageUrl} alt="" fill className="object-contain p-1 mix-blend-multiply" /></div>
                                                                    : <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                                                                }
                                                                {(() => { const { base, color } = formatOptionDisplayLabel(opt.name); return <p className="text-sm font-black uppercase tracking-tight text-slate-900 truncate">{base}{color && <span className="text-primary ml-1">({color})</span>}</p>; })()}
                                                            </div>
                                                            <span className="font-black text-xs text-slate-700 tabular-nums shrink-0 pl-4">
                                                                {opt.sellPriceExclGst ? formatCurrency(opt.sellPriceExclGst) : <span className="text-slate-300">Incl.</span>}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            ))}
                                        </div>
                                    </SectionCard>
                                );
                            })()}

                            {/* Motor */}
                            {quote.motor && (
                                <SectionCard icon={Zap} label="Power & Propulsion">
                                    <div className="p-6 space-y-4">
                                        {/* Motor header */}
                                        <div className="flex items-center gap-5">
                                            {quote.motor.imageUrl && (
                                                <div className="h-20 w-20 relative bg-slate-50 rounded-2xl border-2 p-2 shrink-0">
                                                    <Image src={quote.motor.imageUrl} alt="" fill className="object-contain mix-blend-multiply" />
                                                </div>
                                            )}
                                            <div className="flex-1 min-w-0">
                                                {quote.motor.brandLogoUrl && (
                                                    <div className="relative h-5 w-20 mb-1.5">
                                                        <Image src={quote.motor.brandLogoUrl} alt={quote.motor.brand || ''} fill className="object-contain object-left" />
                                                    </div>
                                                )}
                                                <p className="font-black text-lg text-slate-950 uppercase italic tracking-tighter leading-tight">{quote.motor.name}</p>
                                                <p className="text-[9px] font-black uppercase text-primary tracking-widest mt-0.5">{quote.motor.brand}</p>
                                                {quote.motor.model && quote.motor.model !== quote.motor.name && (
                                                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide mt-0.5">{quote.motor.model}</p>
                                                )}
                                            </div>
                                            <span className="font-black text-lg tabular-nums shrink-0">{formatCurrency(quote.motor.sellPriceExclGst || 0)}</span>
                                        </div>

                                        {/* Motor Specifications */}
                                        {(() => {
                                            const specs = [
                                                { label: 'HP Rating', value: quote.motor.hpRating || quote.motor['HP Rating'] },
                                                { label: 'Shaft Length', value: quote.motor.shaftLength || quote.motor['Shaft Length'] },
                                                { label: 'Control', value: quote.motor.control || quote.motor['Control'] },
                                                { label: 'Starting', value: quote.motor.starting || quote.motor['Starting'] },
                                                { label: 'Tilt & Trim', value: quote.motor.tiltTrim || quote.motor['Tilt & Trim'] },
                                                { label: 'Fuel Tank', value: quote.motor.fuelTank || quote.motor['Fuel Tank'] },
                                                { label: 'Propeller', value: quote.motor.prop || quote.motor['Prop'] },
                                                { label: 'Warranty', value: quote.motor.warranty || quote.motor['Warranty'] },
                                            ].filter(s => s.value);
                                            if (specs.length === 0) return null;
                                            return (
                                                <div className="pt-3 border-t">
                                                    <p className="text-[8px] font-black uppercase tracking-[0.3em] text-slate-400 mb-2">Motor Specifications</p>
                                                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                                        {specs.map((spec, i) => (
                                                            <div key={i} className="px-3 py-2.5 bg-slate-50 rounded-xl">
                                                                <p className="text-[8px] font-black uppercase tracking-widest text-slate-400 mb-0.5">{spec.label}</p>
                                                                <p className="text-[11px] font-black text-slate-900 leading-tight">{spec.value}</p>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })()}

                                        {/* Accessories — grouped by category */}
                                        {(() => {
                                            const accessories = quote.motor.accessories || [];
                                            if (accessories.length === 0) return null;
                                            const groups = accessories.reduce((acc: Record<string, any[]>, a: any) => {
                                                const cat = a.category || 'Accessories';
                                                if (!acc[cat]) acc[cat] = [];
                                                acc[cat].push(a);
                                                return acc;
                                            }, {});
                                            const accessoriesTotal = accessories.reduce((a: number, acc: any) => a + (acc.sellPriceExclGst || 0), 0);
                                            return (
                                                <div className="pt-3 border-t space-y-3">
                                                    {Object.entries(groups).map(([cat, items]) => (
                                                        <div key={cat}>
                                                            <p className="text-[8px] font-black uppercase tracking-[0.3em] text-slate-400 mb-1.5">{cat}</p>
                                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                                                {(items as any[]).map((acc: any, i: number) => (
                                                                    <div key={i} className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-xl">
                                                                        <span className="text-[10px] font-black uppercase tracking-wide text-slate-700">{acc.name}</span>
                                                                        <span className="text-[10px] font-black text-slate-500 tabular-nums">
                                                                            {acc.sellPriceExclGst ? formatCurrency(acc.sellPriceExclGst) : <span className="text-slate-300">Incl.</span>}
                                                                        </span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            );
                                        })()}

                                        {/* Motor Subtotal */}
                                        {f.motorTotal > 0 && (
                                            <div className="pt-3 border-t flex items-center justify-between px-1">
                                                <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Motor Total</span>
                                                <span className="font-black text-sm tabular-nums text-slate-900">{formatCurrency(f.motorTotal)}</span>
                                            </div>
                                        )}
                                    </div>
                                </SectionCard>
                            )}

                            {/* Trailer */}
                            {quote.trailer && (
                                <SectionCard icon={Truck} label="Trailer Package">
                                    <div className="p-6 space-y-4">
                                        <div className="flex items-center justify-between">
                                            <div>
                                                <p className="font-black text-sm text-slate-950 uppercase italic tracking-tighter">{quote.trailer.name}</p>
                                                {quote.trailer.description && <p className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">{quote.trailer.description}</p>}
                                            </div>
                                            <span className="font-black text-sm tabular-nums">{formatCurrency(quote.trailer.sellPriceExclGst || 0)}</span>
                                        </div>
                                        {quote.trailer.options?.length > 0 && (
                                            <div className="pt-3 border-t space-y-1.5">
                                                <p className="text-[8px] font-black uppercase tracking-[0.3em] text-slate-400 mb-2">Trailer Options</p>
                                                {quote.trailer.options.map((opt: any, i: number) => (
                                                    <div key={i} className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-xl">
                                                        <span className="text-[10px] font-black uppercase tracking-wide text-slate-600">{opt.name}</span>
                                                        <span className="text-[10px] font-black text-slate-700 tabular-nums">{formatCurrency(opt.sellPriceExclGst || 0)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                </SectionCard>
                            )}

                            {/* Dealer Fit */}
                            {quote.dealerFit?.length > 0 && (
                                <SectionCard icon={ClipboardList} label="Dealer Accessories & Preparation">
                                    <div className="divide-y">
                                        {quote.dealerFit.map((group: any, gi: number) => (
                                            group.items?.map((item: any, ii: number) => (
                                                <div key={`${gi}-${ii}`} className="flex items-center justify-between px-6 py-3 hover:bg-slate-50/50 transition-colors">
                                                    {/* v1.10 fix — fall back to code/SKU then to 'Dealer Fit Item' so legacy snapshots (pre-fix) never render blank. */}
                                                    <p className="text-sm font-bold text-slate-700 uppercase tracking-tight">{item.name || item.code || 'Dealer Fit Item'}</p>
                                                    <span className="font-black text-xs tabular-nums text-slate-700">{formatCurrency(item.sellPriceExclGst || 0)}</span>
                                                </div>
                                            ))
                                        ))}
                                    </div>
                                </SectionCard>
                            )}

                            {/* Registration */}
                            {quote.registration && (
                                quote.registration.boatRego || quote.registration.sticker || quote.registration.tenderTo || quote.registration.trailerRego
                            ) && (
                                <SectionCard icon={FileText} label="Registration & Compliance">
                                    <div className="divide-y">
                                        {quote.registration.boatRego && (
                                            <div className="flex items-center justify-between px-6 py-3.5 hover:bg-slate-50/40 transition-colors">
                                                <div>
                                                    <p className="text-sm font-black uppercase tracking-tight text-slate-900">Boat Registration</p>
                                                    <p className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">12 Month Registration</p>
                                                </div>
                                                <span className="font-black text-sm tabular-nums">{formatCurrency(quote.registration.boatRegoPrice || 0)}</span>
                                            </div>
                                        )}
                                        {quote.registration.sticker && (
                                            <div className="flex items-center justify-between px-6 py-3.5 hover:bg-slate-50/40 transition-colors">
                                                <div>
                                                    <p className="text-sm font-black uppercase tracking-tight text-slate-900">Boat Sticker</p>
                                                    <p className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">Registration Sticker</p>
                                                </div>
                                                <span className="font-black text-sm tabular-nums">{formatCurrency(quote.registration.stickerPrice || 0)}</span>
                                            </div>
                                        )}
                                        {quote.registration.tenderTo && (
                                            <div className="flex items-center justify-between px-6 py-3.5 hover:bg-slate-50/40 transition-colors">
                                                <div>
                                                    <p className="text-sm font-black uppercase tracking-tight text-slate-900">Tender-To Sticker</p>
                                                    <p className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">Vessel Tender Registration</p>
                                                </div>
                                                <span className="font-black text-sm tabular-nums">{formatCurrency(quote.registration.tenderToPrice || 0)}</span>
                                            </div>
                                        )}
                                        {quote.registration.trailerRego && (
                                            <div className="flex items-center justify-between px-6 py-3.5 hover:bg-slate-50/40 transition-colors">
                                                <div>
                                                    <p className="text-sm font-black uppercase tracking-tight text-slate-900">Trailer Registration</p>
                                                    <p className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">12 Month Registration</p>
                                                </div>
                                                <span className="font-black text-sm tabular-nums">{formatCurrency(quote.registration.trailerRegoPrice || 0)}</span>
                                            </div>
                                        )}
                                    </div>
                                </SectionCard>
                            )}
                        </div>

                        {/* Sidebar — Investment Summary */}
                        <div className="lg:col-span-1">
                            <div className="bg-white rounded-3xl border-2 shadow-xl overflow-hidden lg:sticky lg:top-20 no-print">
                                <div className="px-6 py-5 border-b bg-slate-900 flex items-center gap-3">
                                    <DollarSign className="h-4 w-4 text-primary" />
                                    <h3 className="text-[9px] font-black uppercase tracking-[0.35em] text-white">Investment Summary</h3>
                                </div>
                                <div className="p-4 space-y-1">
                                    <PricingRow label="Vessel Base" value={f.boatBasePrice} bold showIfZero />
                                    <PricingRow label="Options" value={f.optionsTotal} />
                                    <PricingRow label="Power Pack" value={f.motorTotal} showIfZero />
                                    <PricingRow label="Trailer" value={f.trailerTotal} />
                                    <PricingRow label="Dealer Fit" value={f.dealerFitTotal} />
                                    <PricingRow label="Registration" value={f.regoTotal} />

                                    {localDiscount > 0 && (
                                        <div className="mx-1 p-3 bg-emerald-50 rounded-xl border border-emerald-100 flex items-center justify-between">
                                            <span className="text-[9px] font-black uppercase text-emerald-600">Discount Applied</span>
                                            <span className="text-sm font-black text-emerald-600">-{formatCurrency(localDiscount)}</span>
                                        </div>
                                    )}

                                    <div className="pt-3 mt-2 border-t space-y-2">
                                        <div className="flex justify-between px-3">
                                            <span className="text-[9px] font-black uppercase text-slate-400">Excl. GST</span>
                                            <span className="font-black text-sm tabular-nums">{formatCurrency(f.finalTotalPriceExclGst)}</span>
                                        </div>
                                        <div className="flex justify-between px-3">
                                            <span className="text-[9px] font-black uppercase text-slate-400">GST (10%)</span>
                                            <span className="font-black text-sm tabular-nums">{formatCurrency(f.gstAmount)}</span>
                                        </div>
                                        <div className="bg-primary text-white rounded-2xl p-5 flex items-center justify-between shadow-lg shadow-primary/20 mt-2">
                                            <span className="text-[9px] font-black uppercase tracking-widest">Grand Total</span>
                                            <span className="text-2xl font-black italic tabular-nums">{formatCurrency(f.totalInclGst)}</span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Print Component */}
            <ProposalPrint quote={quote} organisation={organisation} financials={f} />

            {/* Audit Sheet */}
            <Sheet open={isAuditOpen} onOpenChange={setIsAuditOpen}>
                <SheetContent className="sm:max-w-lg p-0 flex flex-col h-full bg-slate-50 border-l-4">
                    <SheetHeader className="px-8 py-7 border-b bg-white relative overflow-hidden shrink-0">
                        <div className="absolute top-0 right-0 p-4 opacity-5"><Calculator className="h-24 w-24" /></div>
                        <div className="flex items-center gap-2 text-primary font-black uppercase text-[9px] tracking-[0.2em] mb-2">
                            <Calculator className="h-3.5 w-3.5" />Strategic Performance Audit
                        </div>
                        <SheetTitle className="text-2xl font-black uppercase italic tracking-tighter leading-none">Yield Analysis</SheetTitle>
                        <SheetDescription className="text-[9px] font-bold uppercase text-slate-400 mt-1 tracking-widest">
                            Verified Financial Accuracy & Realized Margins
                        </SheetDescription>
                    </SheetHeader>

                    <div className="flex-1 overflow-y-auto p-6 space-y-6">
                        {/* KPI Cards */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="bg-white rounded-2xl border-2 p-5 space-y-1.5 shadow-sm">
                                <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Net Profit</p>
                                <p className={cn("text-2xl font-black tracking-tighter", f.grossProfit >= 0 ? "text-emerald-600" : "text-rose-600")}>
                                    {formatCurrency(f.grossProfit)}
                                </p>
                                <Badge className={cn("text-[9px] font-black", f.marginPercent >= 20 ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600")}>
                                    {f.marginPercent.toFixed(1)}% margin
                                </Badge>
                            </div>
                            <div className="bg-white rounded-2xl border-2 p-5 space-y-1.5 shadow-sm">
                                <p className="text-[8px] font-black uppercase tracking-widest text-slate-400">Landed Cost</p>
                                <p className="text-2xl font-black text-slate-900 tracking-tighter">{formatCurrency(f.totalDealCostExclGst)}</p>
                                <div className="flex items-center gap-1"><TrendingUp className="h-2.5 w-2.5 text-slate-300" /><p className="text-[7px] font-bold uppercase text-slate-400">Target ≥20% margin</p></div>
                            </div>
                        </div>

                        {/* Discount Engine */}
                        <div className="bg-white rounded-2xl border-2 overflow-hidden shadow-sm border-emerald-100">
                            <div className="px-5 py-4 border-b bg-emerald-50/50 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <DollarSign className="h-3.5 w-3.5 text-emerald-600" />
                                    <span className="text-[9px] font-black uppercase tracking-widest text-emerald-900">Discount Adjustment</span>
                                </div>
                                {isSaving && <Loader2 className="h-3 w-3 animate-spin text-emerald-600" />}
                            </div>
                            <div className="p-5 space-y-3">
                                <div className="flex gap-3">
                                    <div className="relative flex-1">
                                        <div className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">$</div>
                                        <Input
                                            type="number"
                                            value={localDiscount || ''}
                                            onChange={(e) => setLocalDiscount(Number(e.target.value))}
                                            className="pl-8 h-11 rounded-xl border-2 font-black text-sm"
                                            placeholder="0"
                                            disabled={quote.isLocked === true}
                                            title={quote.isLocked === true
                                                ? 'Locked — create a new version to change pricing.'
                                                : undefined}
                                        />
                                    </div>
                                    <Button
                                        className="h-11 rounded-xl px-5 bg-slate-900 hover:bg-primary font-black uppercase tracking-widest text-[9px]"
                                        onClick={() => handleSaveDiscount(localDiscount)}
                                        disabled={isSaving || quote.isLocked === true}
                                    >
                                        <Save className="h-3.5 w-3.5 mr-1.5" />Sync
                                    </Button>
                                </div>
                                {/* v1.8 (story 1.3.1.b.ii) — locked-quote
                                    explainer replaces the standard help text. */}
                                {quote.isLocked === true ? (
                                    <p className="text-[8px] font-bold text-amber-700 uppercase italic flex items-center gap-1.5">
                                        <Lock className="h-2.5 w-2.5" />
                                        Quote is locked — pricing changes need a new version (v{(quote.version ?? 1) + 1}).
                                    </p>
                                ) : (
                                    <p className="text-[8px] font-bold text-slate-400 uppercase italic">Adjusts sell price and recalculates all margins.</p>
                                )}
                            </div>
                        </div>

                        {/* Line Item Variance */}
                        <div className="space-y-3">
                            <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400 px-1">Line Item Cost vs. Sell</h4>
                            <div className="bg-white rounded-2xl border-2 divide-y overflow-hidden shadow-sm">
                                {[
                                    { label: 'Vessel & Freight', cost: f.boatCost, sell: f.boatBasePrice },
                                    { label: 'Factory Addons', cost: f.optionsCost, sell: f.optionsTotal },
                                    { label: 'Propulsion', cost: f.motorCost, sell: f.motorTotal },
                                    { label: 'Trailer', cost: f.trailerCost, sell: f.trailerTotal },
                                    { label: 'Dealer Fitout', cost: f.dealerFitCost, sell: f.dealerFitTotal },
                                ].filter(r => r.sell > 0).map((row, i) => (
                                    <div key={i} className="px-5 py-4 flex items-center justify-between hover:bg-slate-50 transition-all">
                                        <p className="text-xs font-black uppercase text-slate-700">{row.label}</p>
                                        <div className="flex gap-6 text-right">
                                            <div>
                                                <p className="text-[7px] font-black text-rose-400 uppercase">Cost</p>
                                                <p className="text-xs font-black text-rose-600 tabular-nums">{formatCurrency(row.cost)}</p>
                                            </div>
                                            <div>
                                                <p className="text-[7px] font-black text-emerald-400 uppercase">Sell</p>
                                                <p className="text-xs font-black text-slate-900 tabular-nums">{formatCurrency(row.sell)}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </SheetContent>
            </Sheet>

            {/* v1.8 (story 1.4.1.c) — Activity Sheet. Read-only audit
                log for the quote. Events: created / finalised / sent /
                locked / unlocked / version-forked / content-overridden
                / discount-changed. Filter / search / export deferred
                to v1.9 per CONVENTIONS.md "don't expand release scope". */}
            <Sheet open={isActivityOpen} onOpenChange={setIsActivityOpen}>
                <SheetContent className="sm:max-w-md p-0 flex flex-col h-full bg-slate-50 border-l-4">
                    <SheetHeader className="px-8 py-7 border-b bg-white relative overflow-hidden shrink-0">
                        <div className="absolute top-0 right-0 p-4 opacity-5"><Activity className="h-24 w-24" /></div>
                        <div className="flex items-center justify-between gap-3">
                            <div>
                                <div className="flex items-center gap-2 text-primary font-black uppercase text-[9px] tracking-[0.2em] mb-2">
                                    <Activity className="h-3.5 w-3.5" />Quote Activity
                                </div>
                                <SheetTitle className="text-2xl font-black uppercase italic tracking-tighter leading-none">Audit Trail</SheetTitle>
                                <SheetDescription className="text-[9px] font-bold uppercase text-slate-400 mt-1 tracking-widest">
                                    Every Lifecycle Event, Newest First
                                </SheetDescription>
                            </div>
                            {/* v1.8 (story 1.3.1.c) — Manual unlock button.
                                Admin-only (gated on can_access_settings, same
                                gate as the /manage page). Visible only when
                                the quote is currently locked. Override path
                                for emergency edits — fork-on-edit (Create v2)
                                is the standard path. */}
                            {quote.isLocked === true && canManuallyUnlock && (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setIsUnlockOpen(true)}
                                    disabled={isUnlocking}
                                    className="h-8 px-3 rounded-lg font-black uppercase tracking-widest text-[9px] border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100 gap-1.5 shrink-0"
                                >
                                    {isUnlocking
                                        ? <Loader2 className="h-3 w-3 animate-spin" />
                                        : <LockOpen className="h-3 w-3" />}
                                    Unlock
                                </Button>
                            )}
                        </div>
                    </SheetHeader>

                    <div className="flex-1 overflow-y-auto p-6 space-y-6">
                        {/* v1.9 (story 1.1.3) — Sibling-scenarios sub-section.
                            Renders the root + every scenario under it as a
                            click-to-navigate list. Hidden when there's only
                            one quote in the family (no siblings to navigate
                            to). Current quote is highlighted. */}
                        {siblingScenarios && siblingScenarios.length > 1 && (
                            <div className="space-y-2">
                                <div className="flex items-center gap-2 px-1">
                                    <Layers className="h-3.5 w-3.5 text-indigo-600" />
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-600">
                                        Scenarios <span className="text-slate-400">· {siblingScenarios.length} in family</span>
                                    </p>
                                </div>
                                <ul className="space-y-1.5">
                                    {siblingScenarios.map((s) => {
                                        const displayLabel = s.scenarioLabel
                                            ? s.scenarioLabel
                                            : (s.isRoot ? 'Original' : s.quoteNumber);
                                        const lc = s.lifecycleState ?? 'draft';
                                        const lcTint = LIFECYCLE_STATE_TINT[lc as LifecycleState] ?? LIFECYCLE_STATE_TINT.draft;
                                        return (
                                            <li key={s.id}>
                                                <button
                                                    type="button"
                                                    onClick={() => {
                                                        if (s.isCurrent) return;
                                                        router.push(`/proposals/${s.quoteNumber}`);
                                                    }}
                                                    disabled={s.isCurrent}
                                                    className={cn(
                                                        'w-full rounded-xl border-2 p-3 bg-white shadow-sm flex items-center justify-between gap-3 transition-all',
                                                        s.isCurrent
                                                            ? 'border-indigo-300 ring-1 ring-indigo-200 cursor-default'
                                                            : 'hover:border-slate-300 hover:bg-slate-50',
                                                    )}
                                                >
                                                    <div className="min-w-0 flex-1 text-left">
                                                        <div className="flex items-center gap-1.5">
                                                            <p className="text-xs font-black uppercase tracking-tight text-slate-800 truncate">
                                                                {displayLabel}
                                                            </p>
                                                            {s.isCurrent && (
                                                                <span className="text-[8px] font-black uppercase tracking-widest text-indigo-700 bg-indigo-100 rounded px-1.5 py-0.5">Current</span>
                                                            )}
                                                            {s.isRoot && !s.scenarioLabel && (
                                                                <span className="text-[8px] font-black uppercase tracking-widest text-slate-500 bg-slate-100 rounded px-1.5 py-0.5">Root</span>
                                                            )}
                                                        </div>
                                                        <p className="text-[10px] text-slate-500 mt-0.5 truncate">{s.quoteNumber}</p>
                                                    </div>
                                                    <div className="flex items-center gap-1.5 shrink-0">
                                                        <span className={cn('text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded border', lcTint)}>
                                                            {LIFECYCLE_STATE_LABEL[lc as LifecycleState] ?? lc}
                                                        </span>
                                                        {s.isLocked && (
                                                            <Lock className="h-3 w-3 text-amber-600" />
                                                        )}
                                                    </div>
                                                </button>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        )}

                        {!auditEvents || auditEvents.length === 0 ? (
                            <div className="rounded-2xl border-2 border-dashed bg-white p-8 text-center space-y-2">
                                <Clock className="h-8 w-8 text-slate-300 mx-auto" />
                                <p className="text-sm font-semibold text-slate-700">No activity yet</p>
                                <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                                    {(auditEvents === undefined)
                                        ? 'Loading…'
                                        : 'This quote was created before the v1.8 audit log shipped, or hasn\'t had a lifecycle event yet. Activity is captured automatically from now on — finalize, send, lock, override, or change the discount and you\'ll see entries appear here.'}
                                </p>
                            </div>
                        ) : (
                            <ol className="space-y-3">
                                {auditEvents.map(evt => (
                                    <ActivityRow key={evt.id} event={evt} />
                                ))}
                            </ol>
                        )}
                    </div>
                </SheetContent>
            </Sheet>

            {/* v1.8 (story 1.3.1.b.iii) — Fork-on-edit popup. Confirms
                the operator wants to create a new version of a locked
                quote. Override path is the only way to mutate a locked
                quote in v1.8 (manual unlock by admin in 1.3.1.c is the
                other escape hatch). */}
            <AlertDialog open={isForkOpen} onOpenChange={setIsForkOpen}>
                <AlertDialogContent className="max-w-md">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <GitBranch className="h-4 w-4 text-amber-600" />
                            Create a new version?
                        </AlertDialogTitle>
                        <AlertDialogDescription asChild>
                            <div className="space-y-2 text-xs text-slate-600">
                                <p>
                                    Quote <strong>{quote.quoteNumber}</strong> (v{quote.version ?? 1}) is locked
                                    {quote.lockedReason === 'sent' && quote.customer?.name
                                        ? <> &mdash; sent to <strong>{quote.customer.name}</strong></>
                                        : null}
                                    {quote.lockedAt?.toDate
                                        ? <> on {quote.lockedAt.toDate().toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</>
                                        : null}.
                                </p>
                                <p className="font-semibold pt-1">Creating v{(quote.version ?? 1) + 1} will:</p>
                                <ul className="list-disc pl-5 space-y-0.5">
                                    <li>Duplicate this quote into a fresh editable doc</li>
                                    <li>Carry over <strong>everything</strong> &mdash; SKU, options, motor, trailer, customer details, content overrides</li>
                                    <li>Reset the audit log on the new version (fresh trail starting now)</li>
                                    <li>Leave <strong>this</strong> quote locked and untouched</li>
                                </ul>
                                <p className="text-[11px] text-slate-500 pt-1">
                                    You&apos;ll be redirected to the new version after creation.
                                </p>
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isForking}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => { e.preventDefault(); handleForkConfirm(); }}
                            disabled={isForking}
                            className="bg-amber-600 hover:bg-amber-700 gap-1.5"
                        >
                            {isForking ? (
                                <>
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    Creating&hellip;
                                </>
                            ) : (
                                <>
                                    <GitBranch className="h-3.5 w-3.5" />
                                    Yes, create v{(quote.version ?? 1) + 1}
                                </>
                            )}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* v1.8 (story 1.3.1.c) — Manual unlock popup. Admin-only
                emergency override; the entry button is gated on
                canManuallyUnlock so this dialog only ever opens when
                the operator passed the can_access_settings check. */}
            <AlertDialog open={isUnlockOpen} onOpenChange={setIsUnlockOpen}>
                <AlertDialogContent className="max-w-md">
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2">
                            <LockOpen className="h-4 w-4 text-amber-600" />
                            Unlock this quote?
                        </AlertDialogTitle>
                        <AlertDialogDescription asChild>
                            <div className="space-y-2 text-xs text-slate-600">
                                <p>
                                    Manually unlocking <strong>{quote.quoteNumber}</strong> bypasses the standard fork-on-edit flow. Use this only for emergency corrections (typos, contact updates) where forking would create unnecessary version history.
                                </p>
                                <p className="font-semibold pt-1">After unlock:</p>
                                <ul className="list-disc pl-5 space-y-0.5">
                                    <li>The quote becomes editable again</li>
                                    <li>The unlock event is logged to Activity (with your name)</li>
                                    <li>Re-locks automatically the next time the quote is sent</li>
                                </ul>
                                <p className="text-[11px] text-slate-500 pt-1">
                                    For most edits, prefer <strong>Create v{(quote.version ?? 1) + 1}</strong> &mdash; it preserves the original sent version for audit.
                                </p>
                            </div>
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isUnlocking}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={(e) => { e.preventDefault(); handleUnlockConfirm(); }}
                            disabled={isUnlocking}
                            className="bg-amber-600 hover:bg-amber-700 gap-1.5"
                        >
                            {isUnlocking ? (
                                <>
                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    Unlocking&hellip;
                                </>
                            ) : (
                                <>
                                    <LockOpen className="h-3.5 w-3.5" />
                                    Yes, unlock
                                </>
                            )}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* v1.8 (story 1.2.4.c) — Send Quote dialog. The actual
                send pipeline + first-Send auto-lock + auditLog 'sent'
                + 1.3.1 lock all fire inside the dialog's confirm
                handler. Mounted regardless of sendEnabled so the
                child component can manage its own open/closed state,
                but the trigger button is what gates UX-side. */}
            {auditOwnerUid && user && (
                <SendQuoteDialog
                    open={isSendOpen}
                    onOpenChange={setIsSendOpen}
                    ownerUid={auditOwnerUid}
                    quote={quote}
                    organisation={organisation}
                    financials={f}
                    senderUid={user.uid}
                    senderName={userProfile?.displayName || user.displayName || user.email || 'Someone'}
                />
            )}

            {/* v1.8 (story 1.2.3.c) — Personalise Content side sheet.
                Edits per-quote content-block overrides at
                users/{ownerUid}/quotes/{quoteId}/contentOverrides/{blockType}.
                Locked blocks are filtered out inside the sheet. */}
            {auditOwnerUid && quote?.organisationId && (
                <PersonaliseContentSheet
                    open={isPersonaliseOpen}
                    onOpenChange={setIsPersonaliseOpen}
                    orgId={quote.organisationId}
                    ownerUid={auditOwnerUid}
                    quoteId={quote.id}
                    actorName={userProfile?.displayName || user?.displayName || user?.email || 'Someone'}
                />
            )}

            {/* v1.9 (story 1.8.4) — Inline PDF preview. Renders the same
                renderQuotePdf() pipeline as Download/Send and embeds the
                resulting Blob in an iframe inside a side Sheet. The
                sheet's own Download button reuses the in-memory blob. */}
            {financials && (
                <QuotePreviewSheet
                    open={isPreviewOpen}
                    onOpenChange={setIsPreviewOpen}
                    quote={quote}
                    organisation={organisation}
                    financials={financials}
                />
            )}

            {/* v1.9 (story 1.1.3) — Create Scenario dialog. Spawns a
                sibling quote under the same root with the operator-supplied
                label, then router.pushes to the new quoteNumber. */}
            {auditOwnerUid && user && quote && (
                <CreateScenarioDialog
                    open={isScenarioOpen}
                    onOpenChange={setIsScenarioOpen}
                    ownerUid={auditOwnerUid}
                    fromQuote={{ id: quote.id, quoteNumber: quote.quoteNumber, scenarioLabel: quote.scenarioLabel ?? null }}
                    actor={{
                        byUid: user.uid,
                        byName: userProfile?.displayName || user.displayName || user.email || 'Someone',
                    }}
                />
            )}
        </div>
    );
}

/* ──────────────────────────────────────────────────────────────────
 * v1.8 (story 1.4.1.c) — Activity row helper.
 * ────────────────────────────────────────────────────────────────── */

const ACTIVITY_META: Record<AuditEventType, { icon: any; label: string; tint: string }> = {
    'created':            { icon: UserPlus,    label: 'Quote created',          tint: 'bg-blue-50 text-blue-700 border-blue-200' },
    'finalised':          { icon: CheckCircle2, label: 'Finalised',              tint: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    'sent':               { icon: Send,        label: 'Sent to customer',       tint: 'bg-violet-50 text-violet-700 border-violet-200' },
    'locked':             { icon: Lock,        label: 'Locked',                 tint: 'bg-amber-50 text-amber-700 border-amber-200' },
    'unlocked':           { icon: LockOpen,    label: 'Unlocked',               tint: 'bg-slate-50 text-slate-700 border-slate-200' },
    'version-forked':     { icon: GitBranch,   label: 'Forked to new version',  tint: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
    'content-overridden': { icon: Edit3,       label: 'Content personalised',   tint: 'bg-cyan-50 text-cyan-700 border-cyan-200' },
    'discount-changed':   { icon: Percent,     label: 'Discount changed',       tint: 'bg-rose-50 text-rose-700 border-rose-200' },
    'lifecycle-transitioned': { icon: Activity, label: 'Status updated',         tint: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
    'scenario-created':   { icon: Layers,      label: 'Scenario created',       tint: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
};

function ActivityRow({ event }: { event: QuoteAuditEvent }) {
    const meta = ACTIVITY_META[event.eventType] ?? {
        icon: Activity,
        label: event.eventType,
        tint: 'bg-slate-50 text-slate-700 border-slate-200',
    };
    const Icon = meta.icon;
    const at = event.at?.toDate?.();
    const summary = renderSummary(event);
    return (
        <li className={cn('rounded-2xl border-2 p-4 bg-white shadow-sm flex items-start gap-3')}>
            <div className={cn('shrink-0 h-9 w-9 rounded-lg border-2 flex items-center justify-center', meta.tint)}>
                <Icon className="h-4 w-4" />
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2 flex-wrap">
                    <p className="text-[11px] font-black uppercase tracking-widest text-slate-700">{meta.label}</p>
                    {at && (
                        <p className="text-[10px] text-slate-400">{at.toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</p>
                    )}
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                    by <span className="font-semibold text-slate-700">{event.byName || 'Someone'}</span>
                </p>
                {summary && <p className="text-[11px] text-slate-600 mt-1.5">{summary}</p>}
            </div>
        </li>
    );
}

function renderSummary(event: QuoteAuditEvent): string | null {
    const m = event.metadata ?? {};
    switch (event.eventType) {
        case 'discount-changed':
            return `From $${Number(m.fromValue ?? 0).toLocaleString()} → $${Number(m.toValue ?? 0).toLocaleString()}`;
        case 'content-overridden':
            return m.blockType ? `Block: ${m.blockType}` : null;
        case 'version-forked':
            return m.parentQuoteId
                ? `Forked from quote ${m.parentQuoteId.slice(0, 8)}…`
                : (m.childQuoteId ? `Forked into quote ${m.childQuoteId.slice(0, 8)}…` : null);
        case 'sent':
            return m.sentEmailId ? `Send id: ${m.sentEmailId.slice(0, 8)}…` : null;
        case 'locked':
            return m.lockReason ? `Reason: ${m.lockReason}` : null;
        case 'lifecycle-transitioned':
            return m.fromLifecycle && m.toLifecycle
                ? `${m.fromLifecycle} → ${m.toLifecycle}`
                : null;
        case 'scenario-created':
            return m.scenarioLabel
                ? `Label: "${m.scenarioLabel}"`
                : null;
        default:
            return m.note ?? null;
    }
}
