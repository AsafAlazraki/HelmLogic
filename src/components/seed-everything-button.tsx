
'use client';

/**
 * Seed Everything — smart audit + heal + pair (one-shot).
 *
 * Goal: make the EXISTING Highfield module quote end-to-end. Uses live
 * data where it exists, creates only what's missing, and PAIRS things up
 * so every boat model has a colour variant, a motor HP match, and a
 * trailer assignment — plus dealer-fit options and a full fit-up
 * catalogue at the org level.
 *
 * Runs in the browser against live Firestore (so it can read what's
 * already there). Strategy:
 *
 *   1. Resolve the boat vendor (known Highfield id → else first Boat Brand).
 *   2. Resolve the module (known id → else module with that mainVendorId
 *      → else create one).
 *   3. Motors: if a Motor Brand vendor with motor rows is already wired,
 *      USE IT. Else create a demo motor vendor (F150 + F250 with
 *      accessories) and wire it into module.associatedVendorIds.
 *   4. Trailers: if a trailer vendor with series/trailers is wired, USE
 *      the first trailer as the pairing target. Else create a demo
 *      trailer vendor + series + 2 trailers (with options) and wire it
 *      into module.trailerBrandVendorIds.
 *   5. Pair models: walk every range → model. For each model, ONLY when
 *      missing: create a default variant, add a motorConfigurations HP
 *      range, add a default trailerAssignment. Never overwrites existing.
 *   6. Org: dealer-fit categories + selections, fit-up items + packages,
 *      exchange rates, enabledModuleSubscriptions += module.
 *
 * Everything is additive / merge / arrayUnion and idempotent. Existing
 * boat data is never overwritten. New objects use demo-* ids so they're
 * easy to spot + remove. Reports a summary of what was used vs created.
 *
 * Removed in the close-out cleanup commit.
 */

import { useState } from 'react';
import {
    arrayUnion,
    collection,
    doc,
    getDoc,
    getDocs,
    limit,
    query,
    serverTimestamp,
    setDoc,
    Timestamp,
    where,
} from 'firebase/firestore';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useUser } from '@/firebase/auth/use-user';
import { Button } from '@/components/ui/button';
import { Rocket, Loader2, Check, ArrowRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import Link from 'next/link';
import { useParams } from 'next/navigation';

// ── Known real Highfield ids (CLAUDE.md) ────────────────────────────
const KNOWN_BOAT_VENDOR = 'LafOLpLb6QIFE856TiD4';
const KNOWN_MODULE = 'M1Yf3R9igpJDxJnOVr6f';

// ── Demo fallbacks (only created when nothing real exists) ──────────
const DEMO_MOTOR_VENDOR = 'demo-yamaha';
const DEMO_TRAILER_VENDOR = 'demo-trailers';
const DEMO_TRAILER_SERIES = 'demo-series';

function img(label: string, tone = '0a3b6e/ffffff'): string {
    return `https://placehold.co/600x400/${tone}?text=${encodeURIComponent(label)}`;
}

const FITUP_ITEMS = [
    { id: 'demo-fitup-anchor', name: 'Anchor Bracket Install', tier: 'simple', category: 'Rigging', cost: 140, sellPrice: 250, customerDescription: 'Bow anchor bracket installation.', imageUrl: img('Anchor') },
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

interface SeedResult {
    moduleId: string;
    boatVendorId: string;
    boatVendorSource: 'existing' | 'created';
    motorSource: 'existing' | 'created';
    trailerSource: 'existing' | 'created';
    modelsSeen: number;
    variantsCreated: number;
    motorConfigsAdded: number;
    trailerAssignmentsAdded: number;
}

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
    const [result, setResult] = useState<SeedResult | null>(null);

    /** Does this vendor have any motor rows (masterDataSet or dataSets)? */
    async function vendorHasMotors(vendorId: string): Promise<boolean> {
        try {
            const master = await getDocs(query(collection(firestore, 'data-warehouse', vendorId, 'masterDataSet'), limit(1)));
            if (!master.empty) return true;
            const dataSets = await getDocs(query(collection(firestore, 'data-warehouse', vendorId, 'dataSets'), limit(1)));
            if (!dataSets.empty) {
                const rows = await getDocs(query(collection(firestore, 'data-warehouse', vendorId, 'dataSets', dataSets.docs[0].id, 'rows'), limit(1)));
                return !rows.empty;
            }
        } catch { /* ignore */ }
        return false;
    }

    /** First {brandVendorId, seriesId, trailerId, code, name} for a vendor, or null. */
    async function firstTrailerOf(vendorId: string): Promise<{ brandVendorId: string; seriesId: string; trailerId: string; code: string; name: string } | null> {
        try {
            const series = await getDocs(query(collection(firestore, 'data-warehouse', vendorId, 'series'), limit(1)));
            if (series.empty) return null;
            const seriesId = series.docs[0].id;
            const trailers = await getDocs(query(collection(firestore, 'data-warehouse', vendorId, 'series', seriesId, 'trailers'), limit(1)));
            if (trailers.empty) return null;
            const t = trailers.docs[0];
            const td = t.data() as any;
            return { brandVendorId: vendorId, seriesId, trailerId: t.id, code: td.code || '', name: td.name || '' };
        } catch { return null; }
    }

    const apply = async () => {
        if (!organisationId) {
            toast({ variant: 'destructive', title: 'No organisation found', description: 'Your profile has no organisationId.' });
            return;
        }
        setRunning(true);
        try {
            const now = serverTimestamp();

            // ── 1. Resolve boat vendor ──────────────────────────────
            let boatVendorId = KNOWN_BOAT_VENDOR;
            let boatVendorSource: 'existing' | 'created' = 'existing';
            const knownVendorSnap = await getDoc(doc(firestore, 'data-warehouse', KNOWN_BOAT_VENDOR));
            if (!knownVendorSnap.exists()) {
                const boatVendors = await getDocs(query(collection(firestore, 'data-warehouse'), where('vendorType', '==', 'Boat Brand'), limit(1)));
                if (!boatVendors.empty) {
                    boatVendorId = boatVendors.docs[0].id;
                } else {
                    // No boat vendor at all — create a minimal Highfield demo vendor.
                    boatVendorId = 'demo-highfield';
                    boatVendorSource = 'created';
                    await setDoc(doc(firestore, 'data-warehouse', boatVendorId), {
                        name: 'Highfield (Demo)', slug: 'demo-highfield', vendorType: 'Boat Brand', currency: 'AUD', logoUrl: img('Highfield'), updatedAt: now,
                    }, { merge: true });
                    // Minimal range + model + variant so there's something to quote.
                    const rId = 'demo-classic';
                    await setDoc(doc(firestore, 'data-warehouse', boatVendorId, 'ranges', rId), { name: 'Classic (Demo)', slug: 'demo-classic', code: 'CL', vendorId: boatVendorId, order: 1, updatedAt: now }, { merge: true });
                    const mId = 'demo-cl260';
                    await setDoc(doc(firestore, 'data-warehouse', boatVendorId, 'ranges', rId, 'models', mId), {
                        name: 'CL260', modelCode: 'CL260', slug: 'demo-cl260', rangeId: rId, vendorId: boatVendorId, sellPriceExclGst: 45000,
                        coverImageUrl: img('Highfield CL260'), availableMaterials: ['PVC', 'HYP'], optionalFeatures: [], standardFeatures: [],
                        specifications: { motorConfigurations: [{ type: 'Single', engines: [{ label: 'Single Engine', minHp: 90, maxHp: 300, recommendedHp: 250 }] }], otherSpecs: [] },
                        registration: { price12Months: 320, trailerPrice12Months: 95 }, updatedAt: now,
                    }, { merge: true });
                    await setDoc(doc(firestore, 'data-warehouse', boatVendorId, 'ranges', rId, 'models', mId, 'variants', 'demo-cl260-white-pvc'), { sku: 'CL260-WHITE-PVC', name: 'CL260 - White (PVC)', material: 'PVC', colorCode: 'W', colorName: 'White', cost: 31000, sellPriceExclGst: 45000, imageUrl: img('CL260 White'), updatedAt: now }, { merge: true });
                    await setDoc(doc(firestore, 'data-warehouse', boatVendorId, 'ranges', rId, 'models', mId, 'variants', 'demo-cl260-grey-hyp'), { sku: 'CL260-GREY-HYP', name: 'CL260 - Grey (Hypalon)', material: 'HYP', colorCode: 'G', colorName: 'Grey', cost: 34000, sellPriceExclGst: 49000, imageUrl: img('CL260 Grey', '6e2917/ffffff'), updatedAt: now }, { merge: true });
                }
            }

            // ── 2. Resolve module ───────────────────────────────────
            let moduleId = KNOWN_MODULE;
            let moduleData: any = null;
            const knownModuleSnap = await getDoc(doc(firestore, 'modules', KNOWN_MODULE));
            if (knownModuleSnap.exists()) {
                moduleData = knownModuleSnap.data();
            } else {
                const byVendor = await getDocs(query(collection(firestore, 'modules'), where('mainVendorId', '==', boatVendorId), limit(1)));
                if (!byVendor.empty) {
                    moduleId = byVendor.docs[0].id;
                    moduleData = byVendor.docs[0].data();
                } else {
                    moduleId = 'demo-highfield-module';
                    await setDoc(doc(firestore, 'modules', moduleId), {
                        name: 'Highfield Boats (Demo)', slug: 'demo-highfield-module', moduleType: 'catalog',
                        mainVendorId: boatVendorId, associatedVendorIds: [], associatedModuleIds: [], trailerBrandVendorIds: [],
                        moduleDealerFitCategories: [], motorDealerFitCategories: [], trailerDealerFitCategories: [],
                        logoUrl: img('Highfield'), coverImageUrl: img('Highfield Boats'), isActive: true, updatedAt: now,
                    }, { merge: true });
                    moduleData = { mainVendorId: boatVendorId, associatedVendorIds: [], trailerBrandVendorIds: [] };
                }
            }

            // ── 3. Motors — use existing wired Motor Brand vendor, else create ──
            let motorSource: 'existing' | 'created' = 'created';
            const wiredVendorIds: string[] = [
                ...(moduleData?.associatedVendorIds || []),
                moduleData?.mainVendorId,
            ].filter(Boolean);
            let motorVendorWithData: string | null = null;
            for (const vid of wiredVendorIds) {
                const vSnap = await getDoc(doc(firestore, 'data-warehouse', vid));
                if (vSnap.exists() && (vSnap.data() as any).vendorType === 'Motor Brand' && await vendorHasMotors(vid)) {
                    motorVendorWithData = vid;
                    break;
                }
            }
            if (motorVendorWithData) {
                motorSource = 'existing';
            } else {
                // Create demo motor vendor + 2 motors, wire into the module.
                await setDoc(doc(firestore, 'data-warehouse', DEMO_MOTOR_VENDOR), { name: 'Yamaha (Demo)', slug: 'demo-yamaha', vendorType: 'Motor Brand', currency: 'AUD', logoUrl: img('Yamaha', '6e2917/ffffff'), updatedAt: now }, { merge: true });
                await setDoc(doc(firestore, 'data-warehouse', DEMO_MOTOR_VENDOR, 'masterDataSet', 'demo-f150'), {
                    'Model Name': 'Yamaha F150', MODEL: 'F150', 'HP Rating': '150', steeringType: 'Forward Control', category: 'Outboard', sellPriceExclGst: 18500,
                    priceLevels: { hull_cash: 18500, hull_trade: 16800, hull_subdealer: 16000, hull_commercial: 17200, hull_boating_alliance: 16500 },
                    SummaryImage: img('Yamaha F150', '6e2917/ffffff'),
                    masterAccessories: [
                        { id: 'demo-acc-prop', name: 'Stainless Propeller', category: 'Propeller', sellPriceExclGst: 450, cost: 300, isStandard: false },
                        { id: 'demo-acc-rig', name: 'Rigging Kit', category: 'Rigging', sellPriceExclGst: 380, cost: 240, isStandard: true },
                        { id: 'demo-acc-gauge', name: 'Digital Gauge', category: 'Other', sellPriceExclGst: 540, cost: 360, isStandard: false },
                    ], updatedAt: now,
                }, { merge: true });
                await setDoc(doc(firestore, 'data-warehouse', DEMO_MOTOR_VENDOR, 'masterDataSet', 'demo-f250'), {
                    'Model Name': 'Yamaha F250', MODEL: 'F250', 'HP Rating': '250', steeringType: 'Forward Control', category: 'Outboard', sellPriceExclGst: 28500,
                    priceLevels: { hull_cash: 28500, hull_trade: 26200, hull_subdealer: 25000, hull_commercial: 27000, hull_boating_alliance: 25800 },
                    SummaryImage: img('Yamaha F250', '6e2917/ffffff'),
                    masterAccessories: [
                        { id: 'demo-acc-prop2', name: 'Stainless Propeller XL', category: 'Propeller', sellPriceExclGst: 550, cost: 360, isStandard: false },
                        { id: 'demo-acc-rig2', name: 'Rigging Kit', category: 'Rigging', sellPriceExclGst: 420, cost: 270, isStandard: true },
                    ], updatedAt: now,
                }, { merge: true });
            }

            // ── 4. Trailers — use existing wired trailer, else create + wire ──
            // Real setups wire trailer vendors into associatedVendorIds (NOT
            // a separate trailerBrandVendorIds field), mixed with the motor +
            // MPF vendors. So scan BOTH, classify by vendorType === 'Trailer
            // Brand', and use the first that actually has a series/trailer.
            let trailerSource: 'existing' | 'created' = 'created';
            let pairingTrailer: { brandVendorId: string; seriesId: string; trailerId: string; code: string; name: string } | null = null;
            const trailerCandidateIds: string[] = [
                ...(moduleData?.trailerBrandVendorIds || []),
                ...(moduleData?.associatedVendorIds || []),
            ].filter(Boolean);
            for (const tvId of trailerCandidateIds) {
                const vSnap = await getDoc(doc(firestore, 'data-warehouse', tvId));
                if (!vSnap.exists() || (vSnap.data() as any).vendorType !== 'Trailer Brand') continue;
                const found = await firstTrailerOf(tvId);
                if (found) { pairingTrailer = found; break; }
            }
            if (pairingTrailer) {
                trailerSource = 'existing';
            } else {
                // Create a demo trailer vendor + series + 2 trailers (with options).
                await setDoc(doc(firestore, 'data-warehouse', DEMO_TRAILER_VENDOR), { name: 'Dunbier (Demo)', slug: 'demo-trailers', vendorType: 'Trailer Brand', currency: 'AUD', logoUrl: img('Dunbier', '4a4a4a/ffffff'), updatedAt: now }, { merge: true });
                await setDoc(doc(firestore, 'data-warehouse', DEMO_TRAILER_VENDOR, 'series', DEMO_TRAILER_SERIES), { name: 'Sportz Series', code: 'SPZ', updatedAt: now }, { merge: true });
                const trailerOptions = [
                    { id: 'demo-tr-spare', name: 'Spare Wheel + Bracket', description: 'Galvanised spare wheel with swing bracket.', sellExclGst: 280, cost: 160, isStandard: false },
                    { id: 'demo-tr-jockey', name: 'Jockey Wheel Upgrade', description: 'Heavy-duty swivel jockey wheel.', sellExclGst: 140, cost: 80, isStandard: true },
                    { id: 'demo-tr-led', name: 'LED Light Kit', description: 'Submersible LED trailer lights.', sellExclGst: 190, cost: 110, isStandard: true },
                ];
                await setDoc(doc(firestore, 'data-warehouse', DEMO_TRAILER_VENDOR, 'series', DEMO_TRAILER_SERIES, 'trailers', 'demo-trailer-single'), {
                    name: 'Single Axle Braked', code: 'SPZ-SA', brandName: 'Dunbier (Demo)', seriesName: 'Sportz Series',
                    imageUrl: img('Single Axle Trailer', '4a4a4a/ffffff'), sellPriceExclGst: 4200, cost: 2900,
                    priceLevels: { hull_cash: 4200, hull_trade: 3800 }, specifications: { axles: 'Single', braked: 'Yes', atm: '1600kg' },
                    optionalFeatures: trailerOptions, updatedAt: now,
                }, { merge: true });
                await setDoc(doc(firestore, 'data-warehouse', DEMO_TRAILER_VENDOR, 'series', DEMO_TRAILER_SERIES, 'trailers', 'demo-trailer-tandem'), {
                    name: 'Tandem Axle Braked', code: 'SPZ-TA', brandName: 'Dunbier (Demo)', seriesName: 'Sportz Series',
                    imageUrl: img('Tandem Axle Trailer', '4a4a4a/ffffff'), sellPriceExclGst: 6400, cost: 4400,
                    priceLevels: { hull_cash: 6400, hull_trade: 5800 }, specifications: { axles: 'Tandem', braked: 'Yes', atm: '2800kg' },
                    optionalFeatures: trailerOptions, updatedAt: now,
                }, { merge: true });
                pairingTrailer = { brandVendorId: DEMO_TRAILER_VENDOR, seriesId: DEMO_TRAILER_SERIES, trailerId: 'demo-trailer-single', code: 'SPZ-SA', name: 'Single Axle Braked' };
            }

            // ── 5. Wire module (additive) ───────────────────────────
            // arrayUnion() with no args throws, so only add the vendor
            // arrays when we actually created a demo vendor to wire in.
            const modulePatch: Record<string, any> = {
                moduleDealerFitCategories: arrayUnion('Safety', 'Electronics'),
                motorDealerFitCategories: arrayUnion('Motor Rigging'),
                updatedAt: now,
            };
            if (motorSource === 'created') modulePatch.associatedVendorIds = arrayUnion(DEMO_MOTOR_VENDOR);
            if (trailerSource === 'created') modulePatch.trailerBrandVendorIds = arrayUnion(DEMO_TRAILER_VENDOR);
            await setDoc(doc(firestore, 'modules', moduleId), modulePatch, { merge: true });

            // ── 6. Pair up every model ──────────────────────────────
            let modelsSeen = 0, variantsCreated = 0, motorConfigsAdded = 0, trailerAssignmentsAdded = 0;
            const rangesSnap = await getDocs(collection(firestore, 'data-warehouse', boatVendorId, 'ranges'));
            for (const rangeDoc of rangesSnap.docs) {
                const modelsSnap = await getDocs(collection(firestore, 'data-warehouse', boatVendorId, 'ranges', rangeDoc.id, 'models'));
                for (const modelDoc of modelsSnap.docs) {
                    modelsSeen++;
                    const m = modelDoc.data() as any;
                    const modelRef = modelDoc.ref;
                    const patch: Record<string, any> = {};

                    // (a) variant — create a default if the model has none.
                    const variantsSnap = await getDocs(query(collection(firestore, 'data-warehouse', boatVendorId, 'ranges', rangeDoc.id, 'models', modelDoc.id, 'variants'), limit(1)));
                    if (variantsSnap.empty) {
                        const base = m.sellPriceExclGst || 30000;
                        await setDoc(doc(modelRef, 'variants', 'demo-default-pvc'), { sku: `${(m.modelCode || m.name || 'MODEL')}-STD`, name: `${m.name || 'Model'} - Standard`, material: 'PVC', colorCode: 'STD', colorName: 'Standard', cost: Math.round(base * 0.7), sellPriceExclGst: base, imageUrl: m.coverImageUrl || img(m.name || 'Boat'), updatedAt: now }, { merge: true });
                        variantsCreated++;
                    }

                    // (b) motor config — add an HP range if missing.
                    const hasMotorCfg = Array.isArray(m?.specifications?.motorConfigurations) && m.specifications.motorConfigurations.length > 0 && m.specifications.motorConfigurations[0]?.engines?.length > 0;
                    if (!hasMotorCfg) {
                        patch.specifications = {
                            ...(m.specifications || {}),
                            motorConfigurations: [{ type: 'Single', engines: [{ label: 'Single Engine', minHp: 40, maxHp: 350, recommendedHp: 150 }] }],
                        };
                        motorConfigsAdded++;
                    }

                    // (c) trailer assignment — add a default if missing.
                    const hasTrailer = Array.isArray(m?.trailerAssignments) && m.trailerAssignments.length > 0;
                    if (!hasTrailer && pairingTrailer) {
                        patch.trailerAssignments = [{ isDefault: true, brandVendorId: pairingTrailer.brandVendorId, seriesId: pairingTrailer.seriesId, trailerId: pairingTrailer.trailerId, code: pairingTrailer.code, name: pairingTrailer.name }];
                        trailerAssignmentsAdded++;
                    }

                    if (Object.keys(patch).length > 0) {
                        patch.updatedAt = now;
                        await setDoc(modelRef, patch, { merge: true });
                    }
                }
            }

            // ── 7. Dealer fit (global categories + org selections) ──
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
                    items: [{ vendorId: boatVendorId, rowId: s.id, data: { Description: s.desc, 'Act Sell': s.actSell, 'Act CTD': s.actCtd, imageLink: img(s.name, '0f5132/ffffff') } }],
                    updatedAt: now,
                }, { merge: true });
            }

            // ── 8. Fit-up items + packages ──────────────────────────
            for (const it of FITUP_ITEMS) {
                await setDoc(doc(firestore, 'organisations', organisationId, 'fitUpItems', it.id), {
                    name: it.name, tier: it.tier, category: it.category, cost: it.cost, sellPrice: it.sellPrice,
                    customerDescription: it.customerDescription, notes: null, imageUrl: it.imageUrl,
                    moduleIds: [], brandIds: [], rangeIds: [], modelIds: [], variantIds: [], oftenPairedWith: [], updatedAt: now,
                }, { merge: true });
            }
            for (const pk of FITUP_PACKAGES) {
                await setDoc(doc(firestore, 'organisations', organisationId, 'fitUpPackages', pk.id), { name: pk.name, description: pk.description, itemIds: [...pk.itemIds], packagePrice: pk.packagePrice, updatedAt: now }, { merge: true });
            }

            // ── 9. Org wiring (subscription + permissions + FX) ─────
            const orgPatch: Record<string, any> = {
                enabledModuleSubscriptions: arrayUnion(moduleId),
                dataWarehouseSubscriptions: arrayUnion(boatVendorId, ...(motorSource === 'created' ? [DEMO_MOTOR_VENDOR] : []), ...(trailerSource === 'created' ? [DEMO_TRAILER_VENDOR] : [])),
                updatedAt: now,
            };
            if (roleId) orgPatch.permissions = { [roleId]: { can_access_module: true, can_access_settings: true } };
            await setDoc(doc(firestore, 'organisations', organisationId), orgPatch, { merge: true });
            await setDoc(doc(firestore, 'organisations', organisationId, 'exchangeRates', 'USD'), { code: 'USD', rate: 1.5, source: 'demo seed', updatedAt: Timestamp.now() }, { merge: true });
            await setDoc(doc(firestore, 'organisations', organisationId, 'exchangeRates', 'AUD'), { code: 'AUD', rate: 1, source: 'demo seed', updatedAt: Timestamp.now() }, { merge: true });

            const res: SeedResult = { moduleId, boatVendorId, boatVendorSource, motorSource, trailerSource, modelsSeen, variantsCreated, motorConfigsAdded, trailerAssignmentsAdded };
            setResult(res);
            toast({
                title: '✅ Synced end-to-end',
                description: `Module wired · motors ${motorSource} · trailers ${trailerSource} · ${modelsSeen} models paired (${variantsCreated} variants, ${motorConfigsAdded} motor-ranges, ${trailerAssignmentsAdded} trailers added) · fit-up + dealer-fit seeded.`,
            });
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
                <p className="text-sm font-black uppercase tracking-tight">Sync the full quote (one click)</p>
                <p className="text-[11px] text-muted-foreground leading-relaxed mt-0.5">
                    Audits your <strong>existing Highfield module</strong>, uses the real boats, and fills the gaps: wires motors
                    (with prop/rigging options) + trailers (with options), pairs every boat model to a colour variant, a motor
                    HP range, and a trailer, and seeds dealer-fit + a full fit-up catalogue. Uses existing motor/trailer data where
                    present, only creates what's missing. Additive + idempotent — never overwrites real data.
                </p>
                {result && (
                    <div className="mt-2 text-[11px] font-bold text-primary space-y-1">
                        <p>Motors: {result.motorSource} · Trailers: {result.trailerSource} · {result.modelsSeen} models paired</p>
                        {orgSlug && (
                            <Link href={`/${orgSlug}/modules/${result.moduleId}`} className="inline-flex items-center gap-1.5 uppercase tracking-widest hover:underline">
                                Open the Highfield module <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                        )}
                    </div>
                )}
            </div>
            <Button onClick={apply} disabled={running || !organisationId} className="rounded-xl shrink-0" title={!organisationId ? 'No organisationId on your profile' : undefined}>
                {running ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Syncing…</>
                ) : result ? (
                    <><Check className="h-4 w-4 mr-2" /> Synced — re-run</>
                ) : (
                    <><Rocket className="h-4 w-4 mr-2" /> Sync everything</>
                )}
            </Button>
        </div>
    );
}
