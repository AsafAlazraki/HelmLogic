
'use client';

/**
 * v1.11 expansion-2 — Seed dummy fit-up data (one-shot).
 *
 * Demo unblocker. Populates the active user's organisation with a real
 * fit-up library so a salesperson can walk a quote end-to-end through
 * Step 5 with items + packages + categories + customer descriptions +
 * image placeholders + a couple of cross-references already populated.
 *
 * Idempotent — checks existing item names + package names before
 * creating. Re-clicks are safe. Removed in the close-out cleanup
 * commit (alongside the other v1.11 one-shots).
 *
 * Item set (15 items, 3 tiers, 6 categories):
 *   Rigging:     Anchor Bracket, Bow Roller, Cleat Hardware
 *   Electronics: VHF Radio, GPS Chartplotter, Depth/Fish Finder
 *   Safety:      Safety Pack, EPIRB Mount
 *   Sound:       Stereo + Speakers, JL Audio Sub
 *   Plumbing:    Livewell, Freshwater Tank
 *   Trim:        Vinyl Floor, Bow Cushion Set, LED Underwater Lights
 *
 * Packages (3): Coastal Setup, Offshore Power Pack, First-Time Owner Kit.
 *
 * Items are catalogue-wide (no module/brand/range/model/variant
 * restrictions) so they render in EVERY quote — keeps the demo
 * frictionless. A real dealer admin can narrow scope later.
 *
 * Image placeholders use placehold.co (no auth, no rate-limit issues
 * for low-volume demo use; native <img> per CLAUDE.md lesson).
 */

import { useState } from 'react';
import { addDoc, collection, doc, getDocs, query, serverTimestamp } from 'firebase/firestore';
import { useFirestore, useMemoFirebase } from '@/firebase';
import { useDoc } from '@/firebase/firestore/use-doc';
import { useUser } from '@/firebase/auth/use-user';
import { Button } from '@/components/ui/button';
import { Database, Loader2, Check } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface SeedItem {
    name: string;
    tier: 'simple' | 'medium' | 'complex';
    category: string;
    cost: number;
    sellPrice: number;
    customerDescription: string;
    notes?: string;
    imageUrl: string;
}

interface SeedPackage {
    name: string;
    description: string;
    /** match keys are item names; resolved to ids at seed time */
    itemNames: string[];
}

function img(label: string, tone: '0a3b6e/ffffff' | '6e2917/ffffff' | '0f5132/ffffff' | '583c87/ffffff' | '8a0034/ffffff' | '4a4a4a/ffffff'): string {
    const text = encodeURIComponent(label);
    return `https://placehold.co/400x300/${tone}?text=${text}`;
}

const SEED_ITEMS: SeedItem[] = [
    // Rigging — simple
    { name: 'Anchor Bracket Install',  tier: 'simple',  category: 'Rigging',     cost: 140, sellPrice: 250,  customerDescription: 'Bow anchor bracket installation and bolt-through.',         imageUrl: img('Anchor Bracket', '0a3b6e/ffffff') },
    { name: 'Bow Roller Upgrade',      tier: 'simple',  category: 'Rigging',     cost: 100, sellPrice: 180,  customerDescription: 'Heavy-duty bow roller upgrade with stainless hardware.',     imageUrl: img('Bow Roller', '0a3b6e/ffffff') },
    { name: 'Cleat Hardware Kit',      tier: 'simple',  category: 'Rigging',     cost:  60, sellPrice: 120,  customerDescription: 'Pop-up cleat set, stainless steel, bow/stern.',              imageUrl: img('Cleats', '0a3b6e/ffffff') },
    // Electronics — medium / complex
    { name: 'VHF Radio Install',       tier: 'medium',  category: 'Electronics', cost: 360, sellPrice: 650,  customerDescription: 'Fixed-mount VHF radio with antenna and powered helm wiring.', imageUrl: img('VHF Radio', '6e2917/ffffff') },
    { name: 'GPS Chartplotter Install',tier: 'complex', category: 'Electronics', cost: 780, sellPrice: 1400, customerDescription: 'Multi-function GPS chartplotter at the helm, full installation.', imageUrl: img('GPS Plotter', '6e2917/ffffff') },
    { name: 'Depth/Fish Finder Install', tier: 'medium', category: 'Electronics', cost: 320, sellPrice: 580, customerDescription: 'Transom-mount depth + fish finder with helm display.',          imageUrl: img('Fish Finder', '6e2917/ffffff') },
    // Safety — simple
    { name: 'Safety Pack — Coastal',   tier: 'simple',  category: 'Safety',      cost: 180, sellPrice: 320,  customerDescription: 'Coastal safety pack — flares, life jackets, V-sheet, dewatering bucket, fire extinguisher.', imageUrl: img('Safety Pack', '0f5132/ffffff') },
    { name: 'EPIRB Mount + Registration', tier: 'simple', category: 'Safety',    cost: 110, sellPrice: 190,  customerDescription: 'EPIRB bracket mount and AMSA registration assistance.',          imageUrl: img('EPIRB', '0f5132/ffffff') },
    // Sound — medium / complex
    { name: 'Stereo + Speakers Kit',   tier: 'medium',  category: 'Sound',       cost: 480, sellPrice: 890,  customerDescription: 'Marine-rated stereo head unit + four speakers with helm controls.', imageUrl: img('Stereo', '583c87/ffffff') },
    { name: 'JL Audio Sub Install',    tier: 'complex', category: 'Sound',       cost: 920, sellPrice: 1650, customerDescription: 'JL Audio M-series subwoofer install with sealed enclosure.',     imageUrl: img('Sub Audio', '583c87/ffffff') },
    // Plumbing — medium
    { name: 'Livewell Plumbing',       tier: 'medium',  category: 'Plumbing',    cost: 400, sellPrice: 720,  customerDescription: 'Pressurised livewell with aerator and overflow plumbing.',     imageUrl: img('Livewell', '8a0034/ffffff') },
    { name: 'Freshwater Tank Install', tier: 'medium',  category: 'Plumbing',    cost: 320, sellPrice: 580,  customerDescription: '20L pressurised freshwater tank and transom shower outlet.',  imageUrl: img('Freshwater', '8a0034/ffffff') },
    // Trim — complex / simple
    { name: 'Vinyl Floor Install',     tier: 'complex', category: 'Trim',        cost: 1200, sellPrice: 2200, customerDescription: 'Marine vinyl floor lay throughout cockpit + bow.',             imageUrl: img('Vinyl Floor', '4a4a4a/ffffff') },
    { name: 'Bow Cushion Set',         tier: 'simple',  category: 'Trim',        cost: 240, sellPrice: 440,  customerDescription: 'Removable bow cushion set in matching upholstery.',           imageUrl: img('Bow Cushions', '4a4a4a/ffffff') },
    { name: 'LED Underwater Lights',   tier: 'complex', category: 'Trim',        cost: 720, sellPrice: 1250, customerDescription: 'Through-hull underwater LED lighting with helm-side control.', imageUrl: img('LED Lights', '4a4a4a/ffffff') },
];

const SEED_PACKAGES: SeedPackage[] = [
    {
        name: 'Coastal Setup',
        description: 'Anchor + safety + VHF — the standard inshore + nearshore handover pack.',
        itemNames: ['Anchor Bracket Install', 'Safety Pack — Coastal', 'EPIRB Mount + Registration', 'VHF Radio Install'],
    },
    {
        name: 'Offshore Power Pack',
        description: 'Everything you need before crossing the bar — comms, navigation, depth, and EPIRB.',
        itemNames: ['GPS Chartplotter Install', 'Depth/Fish Finder Install', 'EPIRB Mount + Registration', 'VHF Radio Install'],
    },
    {
        name: 'First-Time Owner Kit',
        description: 'Hardware, comfort, and safety basics for an owner picking up their first boat.',
        itemNames: ['Cleat Hardware Kit', 'Safety Pack — Coastal', 'Bow Roller Upgrade', 'Bow Cushion Set'],
    },
];

export function V111SeedFitUpDummyDataButton() {
    const firestore = useFirestore();
    const { user } = useUser();
    const { toast } = useToast();

    const userProfileRef = useMemoFirebase(
        () => user ? doc(firestore, 'users', user.uid) : null,
        [firestore, user],
    );
    const { data: userProfile } = useDoc<{ organisationId?: string; appRole?: string; displayName?: string }>(userProfileRef);
    const organisationId = userProfile?.organisationId;

    const [running, setRunning] = useState(false);
    const [done, setDone] = useState(false);

    const apply = async () => {
        if (!organisationId) {
            toast({
                variant: 'destructive',
                title: 'No organisation found',
                description: 'Your user profile has no organisationId. Sign in as an org member first.',
            });
            return;
        }
        setRunning(true);
        try {
            // (A) Items — idempotent by name.
            const existingItemsSnap = await getDocs(query(collection(firestore, 'organisations', organisationId, 'fitUpItems')));
            const existingItemsByName = new Map<string, string>();  // name → id
            existingItemsSnap.forEach(d => {
                const data = d.data() as { name?: string };
                if (data.name) existingItemsByName.set(data.name.trim().toLowerCase(), d.id);
            });

            let itemsCreated = 0;
            let itemsSkipped = 0;
            const itemNameToId = new Map<string, string>(existingItemsByName);
            for (const seed of SEED_ITEMS) {
                const key = seed.name.toLowerCase();
                if (existingItemsByName.has(key)) {
                    itemsSkipped++;
                    continue;
                }
                const ref = await addDoc(collection(firestore, 'organisations', organisationId, 'fitUpItems'), {
                    name: seed.name,
                    tier: seed.tier,
                    category: seed.category,
                    cost: seed.cost,
                    sellPrice: seed.sellPrice,
                    customerDescription: seed.customerDescription,
                    notes: seed.notes ?? null,
                    imageUrl: seed.imageUrl,
                    // Catalogue-wide — empty allowlists at every level so the
                    // items show on every quote (demo-friendly default).
                    moduleIds: [],
                    brandIds: [],
                    rangeIds: [],
                    modelIds: [],
                    variantIds: [],
                    oftenPairedWith: [],
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                });
                itemNameToId.set(key, ref.id);
                itemsCreated++;
            }

            // (B) Packages — idempotent by name. Resolve member item ids
            //     from the post-seed name map (covers both seeded + pre-existing).
            const existingPackagesSnap = await getDocs(query(collection(firestore, 'organisations', organisationId, 'fitUpPackages')));
            const existingPackageNames = new Set<string>();
            existingPackagesSnap.forEach(d => {
                const data = d.data() as { name?: string };
                if (data.name) existingPackageNames.add(data.name.trim().toLowerCase());
            });

            let packagesCreated = 0;
            let packagesSkipped = 0;
            for (const pkg of SEED_PACKAGES) {
                if (existingPackageNames.has(pkg.name.toLowerCase())) {
                    packagesSkipped++;
                    continue;
                }
                const itemIds = pkg.itemNames
                    .map(n => itemNameToId.get(n.toLowerCase()))
                    .filter((v): v is string => Boolean(v));
                if (itemIds.length === 0) {
                    // Shouldn't happen unless a package references a non-seeded name;
                    // skip silently to avoid a zero-member package.
                    continue;
                }
                await addDoc(collection(firestore, 'organisations', organisationId, 'fitUpPackages'), {
                    name: pkg.name,
                    description: pkg.description,
                    itemIds,
                    createdAt: serverTimestamp(),
                    updatedAt: serverTimestamp(),
                });
                packagesCreated++;
            }

            toast({
                title: 'Demo fit-up data seeded',
                description: `${itemsCreated} item${itemsCreated === 1 ? '' : 's'} created · ${itemsSkipped} skipped · ${packagesCreated} package${packagesCreated === 1 ? '' : 's'} created · ${packagesSkipped} skipped.`,
            });
            setDone(true);
        } catch (err) {
            console.error(err);
            toast({ variant: 'destructive', title: 'Seed failed', description: String(err) });
        } finally {
            setRunning(false);
        }
    };

    return (
        <div className="flex items-start gap-3 p-3 rounded-xl border-2 border-dashed border-violet-300 bg-violet-50/40">
            <Database className="h-4 w-4 text-violet-700 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-violet-900">One-shot: seed dummy fit-up data for the active org</p>
                <p className="text-[10px] text-violet-800/80">
                    Populates 15 fit-up items across 6 categories (Rigging / Electronics / Safety / Sound / Plumbing / Trim) and 3 packages
                    (Coastal Setup / Offshore Power Pack / First-Time Owner Kit). Catalogue-wide (no module restrictions) so they show on every quote.
                    Idempotent. <strong>Use this to demo the end-to-end fit-up flow.</strong> Removed in the close-out cleanup.
                </p>
            </div>
            <Button
                size="sm"
                variant={done ? 'outline' : 'default'}
                onClick={apply}
                disabled={running || !organisationId}
                className="rounded-xl shrink-0"
                title={!organisationId ? 'No organisationId on your user profile' : undefined}
            >
                {running ? (
                    <>
                        <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> Seeding…
                    </>
                ) : done ? (
                    <>
                        <Check className="h-3.5 w-3.5 mr-1" /> Seeded
                    </>
                ) : (
                    'Seed demo data'
                )}
            </Button>
        </div>
    );
}
