
'use client';

/**
 * Seed Everything (one-shot demo button).
 *
 * Creates a COMPLETE, self-contained demo so a salesperson can run a
 * boat quote END TO END with zero pre-existing data:
 *
 *   - Boat vendor   data-warehouse/demo-highfield               (Boat Brand)
 *   - Range         .../ranges/demo-classic
 *   - Model         .../models/demo-cl260   (specs + optional features)
 *   - 2 variants    .../variants/demo-cl260-{white-pvc, grey-hyp}
 *   - Motor vendor  data-warehouse/demo-yamaha                  (Motor Brand)
 *   - 2 motors      .../masterDataSet/{demo-f150, demo-f250}
 *   - Module        modules/demo-highfield-module  (moduleType: catalog,
 *                     mainVendorId → boat vendor, associatedVendorIds →
 *                     motor vendor, dealer-fit categories)
 *   - Dealer fit    2 global categories + 4 org dealerFitSelections
 *   - Fit-up        8 items + 2 packages (catalogue-wide)
 *   - Org wiring    enabledModuleSubscriptions += module,
 *                     permissions[role] = full, exchangeRates/USD
 *
 * Everything uses FIXED demo-* ids and setDoc(merge) / arrayUnion so
 * re-clicks are safe and NOTHING touches real Highfield / Yamaha data.
 * Prices are in AUD (vendor currency AUD → no FX conversion) so the
 * demo numbers read literally.
 *
 * Removed in the close-out cleanup commit.
 */

import { useState } from 'react';
import {
    arrayUnion,
    collection,
    doc,
    serverTimestamp,
    setDoc,
    Timestamp,
} from 'firebase/firestore';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useUser } from '@/firebase/auth/use-user';
import { Button } from '@/components/ui/button';
import { Rocket, Loader2, Check, ArrowRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { useParams } from 'next/navigation';

// ── Fixed demo ids ──────────────────────────────────────────────────
const BOAT_VENDOR = 'demo-highfield';
const MOTOR_VENDOR = 'demo-yamaha';
const MODULE_ID = 'demo-highfield-module';
const RANGE_ID = 'demo-classic';
const MODEL_ID = 'demo-cl260';
const VARIANT_PVC = 'demo-cl260-white-pvc';
const VARIANT_HYP = 'demo-cl260-grey-hyp';

function img(label: string, tone = '0a3b6e/ffffff'): string {
    return `https://placehold.co/600x400/${tone}?text=${encodeURIComponent(label)}`;
}

const FITUP_ITEMS = [
    { id: 'demo-fitup-anchor', name: 'Anchor Bracket Install', tier: 'simple', category: 'Rigging', cost: 140, sellPrice: 250, customerDescription: 'Bow anchor bracket installation.', imageUrl: img('Anchor', '0a3b6e/ffffff') },
    { id: 'demo-fitup-vhf', name: 'VHF Radio Install', tier: 'medium', category: 'Electronics', cost: 360, sellPrice: 650, customerDescription: 'Fixed-mount VHF radio with antenna.', imageUrl: img('VHF', '6e2917/ffffff') },
    { id: 'demo-fitup-gps', name: 'GPS Chartplotter Install', tier: 'complex', category: 'Electronics', cost: 780, sellPrice: 1400, customerDescription: 'Multi-function GPS chartplotter at the helm.', imageUrl: img('GPS', '6e2917/ffffff') },
    { id: 'demo-fitup-safety', name: 'Safety Pack — Coastal', tier: 'simple', category: 'Safety', cost: 180, sellPrice: 320, customerDescription: 'Coastal safety pack — flares, PFDs, V-sheet.', imageUrl: img('Safety', '0f5132/ffffff') },
    { id: 'demo-fitup-stereo', name: 'Stereo + Speakers Kit', tier: 'medium', category: 'Sound', cost: 480, sellPrice: 890, customerDescription: 'Marine stereo + four speakers.', imageUrl: img('Stereo', '583c87/ffffff') },
    { id: 'demo-fitup-livewell', name: 'Livewell Plumbing', tier: 'medium', category: 'Plumbing', cost: 400, sellPrice: 720, customerDescription: 'Pressurised livewell with aerator.', imageUrl: img('Livewell', '8a0034/ffffff') },
    { id: 'demo-fitup-floor', name: 'Vinyl Floor Install', tier: 'complex', category: 'Trim', cost: 1200, sellPrice: 2200, customerDescription: 'Marine vinyl floor throughout cockpit.', imageUrl: img('Floor', '4a4a4a/ffffff') },
    { id: 'demo-fitup-led', name: 'LED Underwater Lights', tier: 'complex', category: 'Trim', cost: 720, sellPrice: 1250, customerDescription: 'Through-hull underwater LED lighting.', imageUrl: img('LED', '4a4a4a/ffffff') },
] as const;

const FITUP_PACKAGES = [
    { id: 'demo-pkg-coastal', name: 'Coastal Setup', description: 'Anchor + safety + VHF inshore handover pack.', itemIds: ['demo-fitup-anchor', 'demo-fitup-safety', 'demo-fitup-vhf'], packagePrice: 1050 },
    { id: 'demo-pkg-offshore', name: 'Offshore Power Pack', description: 'Comms + navigation for crossing the bar.', itemIds: ['demo-fitup-gps', 'demo-fitup-vhf', 'demo-fitup-safety'], packagePrice: null },
] as const;

export function SeedEverythingButton() {
    const firestore = useFirestore();
    const { user } = useUser();
    const { toast } = useToast();
    const params = useParams<{ orgSlug?: string }>();

    const userProfileRef = useMemoFirebase(
        () => user ? doc(firestore, 'users', user.uid) : null,
        [firestore, user],
    );
    const { data: userProfile } = useDoc<{ organisationId?: string; organisationRole?: string }>(userProfileRef);
    const organisationId = userProfile?.organisationId;
    const roleId = userProfile?.organisationRole;

    const [running, setRunning] = useState(false);
    const [done, setDone] = useState(false);

    const apply = async () => {
        if (!organisationId) {
            toast({ variant: 'destructive', title: 'No organisation found', description: 'Your profile has no organisationId.' });
            return;
        }
        setRunning(true);
        try {
            const now = serverTimestamp();

            // ── 1. Boat vendor ──────────────────────────────────────
            await setDoc(doc(firestore, 'data-warehouse', BOAT_VENDOR), {
                name: 'Highfield (Demo)', slug: 'demo-highfield',
                vendorType: 'Boat Brand', currency: 'AUD',
                logoUrl: img('Highfield', '0a3b6e/ffffff'), updatedAt: now,
            }, { merge: true });

            // ── 2. Range ────────────────────────────────────────────
            await setDoc(doc(firestore, 'data-warehouse', BOAT_VENDOR, 'ranges', RANGE_ID), {
                name: 'Classic (Demo)', slug: 'demo-classic', code: 'CL',
                vendorId: BOAT_VENDOR, order: 1,
                description: 'Demo Classic range.', updatedAt: now,
            }, { merge: true });

            // ── 3. Model (specs + optional features) ────────────────
            const modelPath = doc(firestore, 'data-warehouse', BOAT_VENDOR, 'ranges', RANGE_ID, 'models', MODEL_ID);
            await setDoc(modelPath, {
                name: 'CL260', modelCode: 'CL260', slug: 'demo-cl260',
                rangeId: RANGE_ID, vendorId: BOAT_VENDOR,
                sellPriceExclGst: 45000,
                coverImageUrl: img('Highfield CL260', '0a3b6e/ffffff'),
                galleryImageUrls: [],
                availableMaterials: ['PVC', 'HYP'],
                standardFeatures: [],
                specifications: {
                    motorConfigurations: [{
                        type: 'Single',
                        engines: [{ label: 'Single Engine', minHp: 90, maxHp: 300, recommendedHp: 250 }],
                    }],
                    otherSpecs: [
                        { label: 'Length', value: '2.6m' },
                        { label: 'Max Persons', value: '5' },
                    ],
                },
                optionalFeatures: [
                    { id: 'demo-opt-ttop', name: 'T-Top Console', category: 'Consoles', code: 'TTOP', cost: 2200, sellPriceExclGst: 3200, applicableVariantIds: [], isStandard: false, imageUrl: img('T-Top', '4a4a4a/ffffff'), associatedSeatId: 'demo-opt-seats' },
                    { id: 'demo-opt-seats', name: 'Premium Seats (2-person)', category: 'Seats', code: 'SEAT2', cost: 900, sellPriceExclGst: 1400, applicableVariantIds: [], isStandard: false, imageUrl: img('Seats', '4a4a4a/ffffff') },
                    { id: 'demo-opt-bimini', name: 'Bimini Top', category: 'Canopy', code: 'BIM', cost: 600, sellPriceExclGst: 980, applicableVariantIds: [], isStandard: false, imageUrl: img('Bimini', '4a4a4a/ffffff') },
                ],
                trailerConfig: {
                    name: 'Dunbier Demo Trailer', sellPriceExclGst: 4200,
                    imageUrl: img('Trailer', '4a4a4a/ffffff'), optionalFeatures: [],
                },
                registration: { price12Months: 320, trailerPrice12Months: 95 },
                updatedAt: now,
            }, { merge: true });

            // ── 4. Variants ─────────────────────────────────────────
            await setDoc(doc(modelPath, 'variants', VARIANT_PVC), {
                sku: 'CL260-WHITE-PVC', name: 'CL260 - White (PVC)',
                material: 'PVC', colorCode: 'W', colorName: 'White',
                cost: 31000, sellPriceExclGst: 45000,
                imageUrl: img('CL260 White', '0a3b6e/ffffff'), updatedAt: now,
            }, { merge: true });
            await setDoc(doc(modelPath, 'variants', VARIANT_HYP), {
                sku: 'CL260-GREY-HYP', name: 'CL260 - Grey (Hypalon)',
                material: 'HYP', colorCode: 'G', colorName: 'Grey',
                cost: 34000, sellPriceExclGst: 49000,
                imageUrl: img('CL260 Grey', '6e2917/ffffff'), updatedAt: now,
            }, { merge: true });

            // ── 5. Motor vendor ─────────────────────────────────────
            await setDoc(doc(firestore, 'data-warehouse', MOTOR_VENDOR), {
                name: 'Yamaha (Demo)', slug: 'demo-yamaha',
                vendorType: 'Motor Brand', currency: 'AUD',
                logoUrl: img('Yamaha', '6e2917/ffffff'), updatedAt: now,
            }, { merge: true });

            // ── 6. Motors (masterDataSet) ───────────────────────────
            await setDoc(doc(firestore, 'data-warehouse', MOTOR_VENDOR, 'masterDataSet', 'demo-f150'), {
                'Model Name': 'Yamaha F150', MODEL: 'F150', 'HP Rating': '150',
                steeringType: 'Forward Control', category: 'Outboard',
                sellPriceExclGst: 18500,
                priceLevels: { hull_cash: 18500, hull_trade: 16800, hull_subdealer: 16000, hull_commercial: 17200, hull_boating_alliance: 16500 },
                SummaryImage: img('Yamaha F150', '6e2917/ffffff'),
                masterAccessories: [
                    { id: 'demo-acc-prop', name: 'Stainless Propeller', category: 'Propeller', sellPriceExclGst: 450, cost: 300, isStandard: false },
                    { id: 'demo-acc-rig', name: 'Rigging Kit', category: 'Rigging', sellPriceExclGst: 380, cost: 240, isStandard: true },
                ],
                updatedAt: now,
            }, { merge: true });
            await setDoc(doc(firestore, 'data-warehouse', MOTOR_VENDOR, 'masterDataSet', 'demo-f250'), {
                'Model Name': 'Yamaha F250', MODEL: 'F250', 'HP Rating': '250',
                steeringType: 'Forward Control', category: 'Outboard',
                sellPriceExclGst: 28500,
                priceLevels: { hull_cash: 28500, hull_trade: 26200, hull_subdealer: 25000, hull_commercial: 27000, hull_boating_alliance: 25800 },
                SummaryImage: img('Yamaha F250', '6e2917/ffffff'),
                masterAccessories: [
                    { id: 'demo-acc-prop2', name: 'Stainless Propeller XL', category: 'Propeller', sellPriceExclGst: 550, cost: 360, isStandard: false },
                    { id: 'demo-acc-rig2', name: 'Rigging Kit', category: 'Rigging', sellPriceExclGst: 420, cost: 270, isStandard: true },
                ],
                updatedAt: now,
            }, { merge: true });

            // ── 7. Module (catalog) ─────────────────────────────────
            await setDoc(doc(firestore, 'modules', MODULE_ID), {
                name: 'Highfield Boats (Demo)', slug: 'demo-highfield-module',
                moduleType: 'catalog',
                mainVendorId: BOAT_VENDOR,
                associatedVendorIds: [MOTOR_VENDOR],
                associatedModuleIds: [],
                moduleDealerFitCategories: ['Safety', 'Electronics'],
                motorDealerFitCategories: ['Motor Rigging'],
                trailerDealerFitCategories: [],
                logoUrl: img('Highfield', '0a3b6e/ffffff'),
                coverImageUrl: img('Highfield Boats', '0a3b6e/ffffff'),
                isActive: true, updatedAt: now,
            }, { merge: true });

            // ── 8. Dealer fit (global categories + org selections) ──
            await setDoc(doc(firestore, 'dealerFitCategories', 'demo-cat-safety'), { name: 'Safety', order: 1, updatedAt: now }, { merge: true });
            await setDoc(doc(firestore, 'dealerFitCategories', 'demo-cat-electronics'), { name: 'Electronics', order: 2, updatedAt: now }, { merge: true });

            const dfSelections = [
                { id: 'demo-df-pfd', name: 'Lifejackets (set of 4)', categoryId: 'demo-cat-safety', actSell: 340, actCtd: 180, desc: 'Adult PFD Level 100 × 4' },
                { id: 'demo-df-flares', name: 'Flare Kit', categoryId: 'demo-cat-safety', actSell: 120, actCtd: 70, desc: 'Coastal flare kit (in-date)' },
                { id: 'demo-df-sounder', name: 'Fishfinder Bundle', categoryId: 'demo-cat-electronics', actSell: 890, actCtd: 560, desc: 'Transom fishfinder + transducer' },
                { id: 'demo-df-stereo', name: 'Bluetooth Stereo', categoryId: 'demo-cat-electronics', actSell: 460, actCtd: 280, desc: 'Marine BT stereo + 2 speakers' },
            ];
            for (const s of dfSelections) {
                await setDoc(doc(firestore, 'organisations', organisationId, 'dealerFitSelections', s.id), {
                    name: s.name, type: 'item', categoryId: s.categoryId,
                    items: [{
                        vendorId: BOAT_VENDOR, rowId: s.id,
                        data: { Description: s.desc, 'Act Sell': s.actSell, 'Act CTD': s.actCtd, imageLink: img(s.name, '0f5132/ffffff') },
                    }],
                    updatedAt: now,
                }, { merge: true });
            }

            // ── 9. Fit-up items + packages ──────────────────────────
            for (const it of FITUP_ITEMS) {
                await setDoc(doc(firestore, 'organisations', organisationId, 'fitUpItems', it.id), {
                    name: it.name, tier: it.tier, category: it.category,
                    cost: it.cost, sellPrice: it.sellPrice,
                    customerDescription: it.customerDescription, notes: null,
                    imageUrl: it.imageUrl,
                    moduleIds: [], brandIds: [], rangeIds: [], modelIds: [], variantIds: [],
                    oftenPairedWith: [], updatedAt: now,
                }, { merge: true });
            }
            for (const pk of FITUP_PACKAGES) {
                await setDoc(doc(firestore, 'organisations', organisationId, 'fitUpPackages', pk.id), {
                    name: pk.name, description: pk.description,
                    itemIds: [...pk.itemIds], packagePrice: pk.packagePrice,
                    updatedAt: now,
                }, { merge: true });
            }

            // ── 10. Org wiring (subscription + permissions + FX) ────
            const orgPatch: Record<string, any> = {
                enabledModuleSubscriptions: arrayUnion(MODULE_ID),
                dataWarehouseSubscriptions: arrayUnion(BOAT_VENDOR, MOTOR_VENDOR),
                updatedAt: now,
            };
            if (roleId) {
                orgPatch.permissions = { [roleId]: { can_access_module: true, can_access_settings: true } };
            }
            await setDoc(doc(firestore, 'organisations', organisationId), orgPatch, { merge: true });

            await setDoc(doc(firestore, 'organisations', organisationId, 'exchangeRates', 'USD'), {
                code: 'USD', rate: 1.5, source: 'demo seed', updatedAt: Timestamp.now(),
            }, { merge: true });
            // AUD passthrough (vendor currency is AUD → rate 1).
            await setDoc(doc(firestore, 'organisations', organisationId, 'exchangeRates', 'AUD'), {
                code: 'AUD', rate: 1, source: 'demo seed', updatedAt: Timestamp.now(),
            }, { merge: true });

            toast({
                title: '✅ Demo seeded end-to-end',
                description: 'Highfield Boats (Demo) module is on your dashboard. Open it → CL260 → build a full quote.',
            });
            setDone(true);
        } catch (err) {
            console.error('[seed-everything] failed', err);
            toast({ variant: 'destructive', title: 'Seed failed', description: String(err) });
        } finally {
            setRunning(false);
        }
    };

    const orgSlug = params?.orgSlug;

    return (
        <div className="rounded-2xl border-2 border-dashed border-primary/40 bg-primary/5 p-4 flex items-start gap-4">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                <Rocket className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-sm font-black uppercase tracking-tight">Seed the full demo (one click)</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
                    Creates a complete end-to-end demo: <strong>Highfield Boats (Demo)</strong> module with a CL260 boat (2 colours),
                    Yamaha F150 + F250 motors, a demo trailer, dealer-fit options, and a full fit-up catalogue (8 items + 2 packages).
                    Everything is wired to your org under <code>demo-*</code> ids — it never touches real data. Re-clicks are safe.
                </p>
                {done && orgSlug && (
                    <Link
                        href={`/${orgSlug}/modules/${MODULE_ID}`}
                        className="inline-flex items-center gap-1.5 mt-2 text-xs font-black uppercase tracking-widest text-primary hover:underline"
                    >
                        Open the demo module <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                )}
            </div>
            <Button
                onClick={apply}
                disabled={running || !organisationId}
                className="rounded-xl shrink-0"
                title={!organisationId ? 'No organisationId on your profile' : undefined}
            >
                {running ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Seeding…</>
                ) : done ? (
                    <><Check className="h-4 w-4 mr-2" /> Seeded — re-run</>
                ) : (
                    <><Rocket className="h-4 w-4 mr-2" /> Seed everything</>
                )}
            </Button>
        </div>
    );
}
