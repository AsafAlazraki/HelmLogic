'use client';

/**
 * Content Blocks PDF Preview (v1.7 — story 1.8.7).
 *
 * Renders the full customer-facing ProposalPDFDocument inside an
 * in-browser PDFViewer using a hardcoded Highfield Sport 560
 * fixture, with one targeted live fetch: the cover image URL.
 * That comes from the org's actual Highfield Sport range in
 * data-warehouse so the hero photo is the real boat — not an
 * Unsplash stock photo. Falls back to the Unsplash placeholder
 * baked into the fixture if the lookup fails.
 *
 * Anchoring to a fixed Highfield path is intentional for v1.7 —
 * NSM is the primary user, Highfield is their main brand. v1.7.5
 * polish can generalise per org's enabled modules.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { collection, doc, getDoc, getDocs, limit, query } from 'firebase/firestore';
import { PDFViewer } from '@react-pdf/renderer';
import { useFirestore, useMemoFirebase, useUser } from '@/firebase/provider';
import { useDoc } from '@/firebase/firestore/use-doc';
import { ProposalPDFDocument } from '@/components/proposal-pdf';
import { Button } from '@/components/ui/button';
import { Loader2, Maximize2, Minimize2 } from 'lucide-react';
import {
    blockBelongsTo,
    type BlockType,
    type ContentBlock,
    type DocumentType,
} from '@/lib/content-blocks';
import { buildSampleQuoteFixture } from '@/lib/sample-quote-fixture';
import type { SalesTeamMember } from '@/lib/sales-team';
import { extractImgUrlsFromHtml, preloadImages, swapImgUrlsInHtml } from '@/lib/image-preload';

/** Hardcoded Highfield Sport range IDs (per CLAUDE.md). The preview
 *  fetches one model from this range and uses its real coverImageUrl. */
const HIGHFIELD_VENDOR_ID = 'LafOLpLb6QIFE856TiD4';
const SPORT_RANGE_ID = 'nQ2LE50z9Tbf2uss0Ote';

/** Real trailer-brand vendor IDs (see scripts/seed-trailers.ts:154–165).
 *  The preview walks these in order and uses the first trailer it finds
 *  with usable specs, so the demo reflects what's actually in the org's
 *  catalog rather than invented brand names. */
const TRAILER_BRAND_VENDOR_IDS = [
    'mackay-trailers',
    'redco-tinka-trailers',
    'gfab-trailers',
    'stacer-trailers',
    'dunbier-haines-bmt',
    'dunbier-trailers',
    'nsm-custom-trailers',
];

interface Props {
    /** v1.7 (1.8.12) — needed to resolve the current user's salesperson
     *  profile for the preview's salesperson-message section. */
    orgId: string;
    blocks: ContentBlock[] | null;
    documentType: DocumentType;
    organisationName?: string;
    primaryLogoUrl?: string | null;
    secondaryLogoUrl?: string | null;
    enabledModuleSubscriptions?: string[] | null;
    pdfSections?: import('@/lib/pdf-structure').PdfStructureSection[];
    /** v1.7 — header strip shown above the inline PDF (title + sub +
     *  Focus button). Set false to render the bare PDFViewer if the
     *  caller wants its own chrome. */
    showHeader?: boolean;
}

export function ContentBlocksPdfPreview({ orgId, blocks, documentType, organisationName, primaryLogoUrl, secondaryLogoUrl, pdfSections, showHeader = true }: Props) {
    const firestore = useFirestore();
    const { user } = useUser();
    const [heroImageUrl, setHeroImageUrl] = useState<string | null>(null);
    /** v1.7 — focus mode toggle: when true, preview takes over the
     *  full viewport with a top toolbar (mirrors the
     *  highfield-pricing-workspace focus pattern). */
    const [focusMode, setFocusMode] = useState(false);

    /** ESC closes focus mode. */
    useEffect(() => {
        if (!focusMode) return;
        const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFocusMode(false); };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [focusMode]);

    /** v1.7 (1.8.12) — preview uses the CURRENT user's salesperson profile
     *  so each salesman sees their own message + photo. If unauthored,
     *  the salesperson-message section is omitted (same as real PDFs). */
    const salespersonRef = useMemoFirebase(
        () => (user?.uid ? doc(firestore, `organisations/${orgId}/salesTeam/${user.uid}`) : null),
        [firestore, orgId, user?.uid],
    );
    const { data: salespersonProfile } = useDoc<SalesTeamMember>(salespersonRef);

    /** v1.7 round-4 — fetch real motor + trailer + vendor logo from
     *  Firestore so the preview shows what the customer would actually
     *  see. No Unsplash, no invented brands, no fake categories. Walks
     *  the canonical paths from the seed scripts:
     *    motor:   data-warehouse/{motorVendorId}/dataSets/{ds}/rows
     *    trailer: data-warehouse/{trailerVendorId}/series/{s}/trailers
     *    vendor:  data-warehouse/{vendorId} (logoUrl field) */
    const [realMotor, setRealMotor] = useState<any | null>(null);
    const [realTrailer, setRealTrailer] = useState<any | null>(null);
    const [realVendorLogoUrl, setRealVendorLogoUrl] = useState<string | null>(null);
    const [realVendorName, setRealVendorName] = useState<string | null>(null);
    /** v1.7 round-8 — surface fetcher status in the preview header so
     *  the user sees WHY motor / trailer photos may be missing (no real
     *  data seeded for that vendor in Firestore). Cleaner than digging
     *  through the browser console. */
    const [fetchStatus, setFetchStatus] = useState<{
        motor: 'pending' | 'found' | 'no-vendor' | 'no-rows' | 'error';
        trailer: 'pending' | 'found' | 'no-vendor' | 'no-rows' | 'error';
        vendorLogo: 'pending' | 'found' | 'missing';
    }>({ motor: 'pending', trailer: 'pending', vendorLogo: 'pending' });

    useEffect(() => {
        let cancelled = false;

        async function fetchHeroImage() {
            try {
                const snap = await getDocs(query(
                    collection(firestore, `data-warehouse/${HIGHFIELD_VENDOR_ID}/ranges/${SPORT_RANGE_ID}/models`),
                    limit(20),
                ));
                if (cancelled || snap.empty) return;
                const sport560 = snap.docs.find(d => {
                    const data = d.data();
                    const name = ((data.name ?? data.modelCode ?? '') as string).toLowerCase();
                    return /\b560\b|sp560/.test(name) && !!data.coverImageUrl;
                });
                const fallback = snap.docs.find(d => !!d.data().coverImageUrl);
                const pick = sport560 ?? fallback;
                if (pick && !cancelled) {
                    setHeroImageUrl(pick.data().coverImageUrl ?? null);
                }
            } catch (e) {
                console.warn('[preview] Sport 560 cover image fetch failed:', e);
            }
        }

        async function fetchHighfieldVendor() {
            try {
                const vDoc = await getDoc(doc(firestore, 'data-warehouse', HIGHFIELD_VENDOR_ID));
                if (cancelled || !vDoc.exists()) {
                    if (!cancelled) setFetchStatus(s => ({ ...s, vendorLogo: 'missing' }));
                    return;
                }
                const v = vDoc.data() as any;
                setRealVendorLogoUrl(v.logoUrl ?? null);
                setRealVendorName(v.name ?? null);
                if (!cancelled) setFetchStatus(s => ({ ...s, vendorLogo: v.logoUrl ? 'found' : 'missing' }));
            } catch (e) {
                console.warn('[preview] Highfield vendor fetch failed:', e);
                if (!cancelled) setFetchStatus(s => ({ ...s, vendorLogo: 'missing' }));
            }
        }

        async function fetchRealMotor() {
            try {
                const vendorsSnap = await getDocs(collection(firestore, 'data-warehouse'));
                if (cancelled) return;
                const motorVendorDoc = vendorsSnap.docs.find(d => (d.data() as any).vendorType === 'Motor Brand');
                if (!motorVendorDoc) {
                    console.warn('[preview] no vendor with vendorType=Motor Brand in data-warehouse');
                    if (!cancelled) setFetchStatus(s => ({ ...s, motor: 'no-vendor' }));
                    return;
                }
                const motorVendor = { id: motorVendorDoc.id, ...motorVendorDoc.data() } as any;

                const dataSetsSnap = await getDocs(collection(firestore, `data-warehouse/${motorVendor.id}/dataSets`));
                if (cancelled) return;
                if (dataSetsSnap.empty) {
                    console.warn(`[preview] no dataSets under data-warehouse/${motorVendor.id}`);
                    if (!cancelled) setFetchStatus(s => ({ ...s, motor: 'no-rows' }));
                    return;
                }

                for (const ds of dataSetsSnap.docs) {
                    if (cancelled) return;
                    const rowsSnap = await getDocs(query(
                        collection(firestore, `data-warehouse/${motorVendor.id}/dataSets/${ds.id}/rows`),
                        limit(80),
                    ));
                    if (rowsSnap.empty) continue;
                    const rows = rowsSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
                    // Prefer a motor in the Sport 560's HP envelope (75–100 HP).
                    const inEnvelope = rows.find(r => {
                        const hp = String(r['HP Rating'] ?? r.hpRating ?? '');
                        const m = hp.match(/(\d+)/);
                        const n = m ? parseInt(m[1], 10) : NaN;
                        return Number.isFinite(n) && n >= 75 && n <= 100 && (r.SummaryImage || r.imageUrl);
                    });
                    const withImage = rows.find(r => r.SummaryImage || r.imageUrl);
                    const pick = inEnvelope ?? withImage ?? rows[0];
                    if (!pick) continue;

                    const rawImg = (pick.SummaryImage as string | undefined) ?? pick.imageUrl ?? null;
                    const fullImg = !rawImg
                        ? null
                        : rawImg.startsWith('http')
                            ? rawImg
                            : `https://www.yamaha-motor.com.au${rawImg.startsWith('/') ? '' : '/'}${rawImg}`;
                    const name = (pick['Model Name'] ?? pick.ModelName ?? pick.Model ?? pick.Description ?? pick.name ?? 'Outboard') as string;
                    const sellPrice = (pick.priceLevels?.hull_cash ?? pick.sellPriceExclGst ?? 0) as number;
                    const accessories = ((pick.masterAccessories ?? []) as any[])
                        .filter(a => !a.isStandard)
                        .slice(0, 8)
                        .map(a => ({
                            name: a.name,
                            category: a.category ?? 'Other',
                            sellPriceExclGst: a.sellPriceExclGst ?? 0,
                            imageUrl: null,
                        }));

                    if (!cancelled) {
                        setRealMotor({
                            id: pick.id,
                            name,
                            brand: motorVendor.name ?? 'Yamaha',
                            brandLogoUrl: motorVendor.logoUrl ?? null,
                            imageUrl: fullImg,
                            sellPriceExclGst: sellPrice,
                            cost: pick.costPrice ?? pick.cost ?? Math.round(sellPrice * 0.7),
                            hpRating: pick['HP Rating'] ?? pick.hpRating,
                            shaftLength: pick['Shaft Length'] ?? pick.shaftLength ?? pick.Shaft,
                            control: pick.control ?? pick.Control,
                            starting: pick.starting ?? pick.Starting,
                            tiltTrim: pick.tiltTrim ?? pick['Tilt & Trim'],
                            fuelTank: pick.fuelTank ?? pick['Fuel Tank'],
                            prop: pick.prop ?? pick.propType ?? pick.Prop,
                            warranty: pick.warranty ?? pick.Warranty,
                            accessories,
                            accessoryItems: accessories.map((a: any) => ({ name: a.name, sellPriceExclGst: a.sellPriceExclGst })),
                        });
                        setFetchStatus(s => ({ ...s, motor: 'found' }));
                    }
                    return;
                }
                // Walked all dataSets, found no usable rows
                if (!cancelled) setFetchStatus(s => ({ ...s, motor: 'no-rows' }));
            } catch (e) {
                console.warn('[preview] real motor fetch failed:', e);
                if (!cancelled) setFetchStatus(s => ({ ...s, motor: 'error' }));
            }
        }

        async function fetchRealTrailer() {
            try {
                let anyVendorFound = false;
                let anyTrailersFound = false;
                for (const vid of TRAILER_BRAND_VENDOR_IDS) {
                    if (cancelled) return;
                    const vDoc = await getDoc(doc(firestore, 'data-warehouse', vid));
                    if (!vDoc.exists()) continue;
                    anyVendorFound = true;
                    const vendor = { id: vid, ...vDoc.data() } as any;

                    const seriesSnap = await getDocs(collection(firestore, `data-warehouse/${vid}/series`));
                    if (cancelled) return;
                    if (seriesSnap.empty) continue;

                    for (const s of seriesSnap.docs) {
                        if (cancelled) return;
                        const trailersSnap = await getDocs(query(
                            collection(firestore, `data-warehouse/${vid}/series/${s.id}/trailers`),
                            limit(40),
                        ));
                        if (trailersSnap.empty) continue;
                        anyTrailersFound = true;
                        const cands = trailersSnap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
                        // Prefer a trailer rated for ~5–6 m hulls with an image.
                        const sized = cands.find(t => {
                            const sz = t.specifications?.boatSizeMtr;
                            return typeof sz === 'number' && sz >= 5 && sz <= 6.5 && t.imageUrl;
                        });
                        const withImage = cands.find(t => t.imageUrl);
                        const pick = sized ?? withImage ?? cands[0];
                        if (!pick) continue;

                        if (!cancelled) {
                            setRealTrailer({
                                id: pick.id,
                                name: pick.name ?? pick.code ?? 'Trailer',
                                brand: vendor.name ?? vid,
                                brandLogoUrl: vendor.logoUrl ?? null,
                                imageUrl: pick.imageUrl ?? null,
                                sellPriceExclGst: pick.sellPriceExclGst ?? 0,
                                cost: pick.cost ?? Math.round((pick.sellPriceExclGst ?? 0) * 0.7),
                                catalog: {
                                    brandVendorId: vid,
                                    brandName: vendor.name ?? vid,
                                    seriesId: s.id,
                                    seriesName: (s.data() as any).name ?? '',
                                    trailerId: pick.id,
                                    code: pick.code ?? '',
                                    imageUrl: pick.imageUrl ?? null,
                                    specifications: pick.specifications ?? {},
                                },
                                options: ((pick.optionalFeatures ?? []) as any[]).slice(0, 6).map(o => ({
                                    id: o.id,
                                    name: o.name,
                                    sellPriceExclGst: o.sellExclGst ?? 0,
                                })),
                            });
                            setFetchStatus(s => ({ ...s, trailer: 'found' }));
                        }
                        return;
                    }
                }
                // Walked all 7 vendors, didn't find a usable trailer
                if (!cancelled) {
                    if (!anyVendorFound) {
                        console.warn('[preview] none of the 7 trailer-brand vendor IDs exist in data-warehouse');
                        setFetchStatus(s => ({ ...s, trailer: 'no-vendor' }));
                    } else if (!anyTrailersFound) {
                        console.warn('[preview] trailer brand vendors exist but no series/trailers under any of them');
                        setFetchStatus(s => ({ ...s, trailer: 'no-rows' }));
                    } else {
                        setFetchStatus(s => ({ ...s, trailer: 'no-rows' }));
                    }
                }
            } catch (e) {
                console.warn('[preview] real trailer fetch failed:', e);
                if (!cancelled) setFetchStatus(s => ({ ...s, trailer: 'error' }));
            }
        }

        // Run all four fetchers in parallel — they're independent.
        fetchHeroImage();
        fetchHighfieldVendor();
        fetchRealMotor();
        fetchRealTrailer();
        return () => { cancelled = true; };
    }, [firestore]);

    /** v1.7 round-9 — image preload state, populated by the effect
     *  declared after `contentBlocksMap` (so the dep array is valid). */
    const [imageDataUrls, setImageDataUrls] = useState<Map<string, string>>(new Map());

    /** v1.7 round-4 — pre-fetch the cover image as a base64 data URL so
     *  @react-pdf doesn't re-fetch + decode it on every regeneration of
     *  the document tree. The cover image is the heaviest asset on
     *  page 1; without this, the preview's first page lags every time
     *  a content block is edited (the inner pages don't because they
     *  have no remote images). Falls through to the URL form on any
     *  failure (CORS, 404, etc.). */
    const [coverDataUrl, setCoverDataUrl] = useState<string | null>(null);
    useEffect(() => {
        if (!heroImageUrl) {
            setCoverDataUrl(null);
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const resp = await fetch(heroImageUrl, { mode: 'cors' });
                if (!resp.ok) return;
                const blob = await resp.blob();
                const dataUrl: string = await new Promise((resolve, reject) => {
                    const r = new FileReader();
                    r.onloadend = () => resolve(r.result as string);
                    r.onerror = reject;
                    r.readAsDataURL(blob);
                });
                if (!cancelled) setCoverDataUrl(dataUrl);
            } catch (e) {
                // CORS or network — fall back to URL form, @react-pdf will fetch it.
            }
        })();
        return () => { cancelled = true; };
    }, [heroImageUrl]);

    /** Resolve content blocks → blockType → html map for the active
     *  documentType. No brand-override resolution in the preview path. */
    const contentBlocksMap = useMemo(() => {
        const m = new Map<BlockType, { html: string; updatedAt: number }>();
        for (const b of blocks ?? []) {
            if (!b.blockType) continue;
            if (!blockBelongsTo(b, documentType)) continue;
            const html = b.html ?? '';
            if (!html.trim()) continue;
            const t = (b.updatedAt as any)?.toMillis?.() ?? 0;
            const existing = m.get(b.blockType);
            if (!existing || t > existing.updatedAt) m.set(b.blockType, { html, updatedAt: t });
        }
        const result: Partial<Record<BlockType, string>> = {};
        m.forEach((v, k) => { result[k] = v.html; });
        return result;
    }, [blocks, documentType]);

    /** v1.7 round-5 — parallel map of author-customised PDF sub-headers
     *  (e.g. "OUR PROMISE TO YOU"). Empty / unset → SECTION_SUB default
     *  in proposal-pdf.tsx. */
    const contentBlockSubHeadersMap = useMemo(() => {
        const m = new Map<BlockType, { sub: string; updatedAt: number }>();
        for (const b of blocks ?? []) {
            if (!b.blockType) continue;
            if (!blockBelongsTo(b, documentType)) continue;
            const sub = (b.subHeader ?? '').trim();
            if (!sub) continue;
            const t = (b.updatedAt as any)?.toMillis?.() ?? 0;
            const existing = m.get(b.blockType);
            if (!existing || t > existing.updatedAt) m.set(b.blockType, { sub, updatedAt: t });
        }
        const result: Partial<Record<BlockType, string>> = {};
        m.forEach((v, k) => { result[k] = v.sub; });
        return result;
    }, [blocks, documentType]);

    /** v1.7 round-9 — preload every image URL the PDF will need into a
     *  base64 data URL map. Bypasses the @react-pdf-iframe-CORS issue
     *  that silently failed inline content-block images, motor photos,
     *  and trailer photos. The cover already had this since round-4;
     *  round-9 generalises to every image source on the customer PDF. */
    useEffect(() => {
        let cancelled = false;
        const inlineUrls = Object.values(contentBlocksMap).flatMap(html => extractImgUrlsFromHtml(html ?? ''));
        const candidates: (string | null | undefined)[] = [
            ...inlineUrls,
            realMotor?.imageUrl,
            realMotor?.brandLogoUrl,
            realTrailer?.imageUrl,
            realTrailer?.brandLogoUrl,
            realTrailer?.catalog?.imageUrl,
            realVendorLogoUrl,
            primaryLogoUrl ?? null,
            secondaryLogoUrl ?? null,
            salespersonProfile?.photoUrl ?? null,
        ];
        (async () => {
            const map = await preloadImages(candidates);
            if (!cancelled) setImageDataUrls(map);
        })();
        return () => { cancelled = true; };
    }, [contentBlocksMap, realMotor, realTrailer, realVendorLogoUrl, primaryLogoUrl, secondaryLogoUrl, salespersonProfile?.photoUrl]);

    /** v1.7 round-4 — fixture splices in real motor / trailer / vendor /
     *  cover-image data when the Firestore fetchers complete. Sections
     *  fall back to the placeholder fixture entries (which use real
     *  brand names + real category names) until the live data arrives.
     *  No Unsplash, no invented brands, no fake categories. */
    /** v1.7 round-9 — swap every URL field with its preloaded data URL
     *  (when available). Keeps the original URL when preload failed so
     *  @react-pdf can attempt the fetch itself (it'll silently no-op
     *  on failure, matching prior behaviour). */
    const swap = (u: string | null | undefined): string | null => {
        if (!u) return u ?? null;
        return imageDataUrls.get(u) ?? u;
    };

    const motorWithDataUrls = useMemo(() => {
        if (!realMotor) return realMotor;
        return {
            ...realMotor,
            imageUrl: swap(realMotor.imageUrl),
            brandLogoUrl: swap(realMotor.brandLogoUrl),
        };
    }, [realMotor, imageDataUrls]);

    const trailerWithDataUrls = useMemo(() => {
        if (!realTrailer) return realTrailer;
        return {
            ...realTrailer,
            imageUrl: swap(realTrailer.imageUrl),
            brandLogoUrl: swap(realTrailer.brandLogoUrl),
            catalog: realTrailer.catalog
                ? { ...realTrailer.catalog, imageUrl: swap(realTrailer.catalog.imageUrl) }
                : realTrailer.catalog,
        };
    }, [realTrailer, imageDataUrls]);

    const fixture = useMemo(
        () => buildSampleQuoteFixture({
            organisationName,
            primaryLogoUrl: swap(primaryLogoUrl),
            secondaryLogoUrl: swap(secondaryLogoUrl),
            vendorId: null,
            coverImageUrl: coverDataUrl ?? heroImageUrl ?? null,
            vendorName: realVendorName,
            vendorLogoUrl: swap(realVendorLogoUrl),
            motorOverride: motorWithDataUrls,
            trailerOverride: trailerWithDataUrls,
        }),
        [organisationName, primaryLogoUrl, secondaryLogoUrl, heroImageUrl, coverDataUrl, realVendorName, realVendorLogoUrl, motorWithDataUrls, trailerWithDataUrls, imageDataUrls],
    );

    /** v1.7 perf — debounce the PDF inputs. Editing in TipTap fires
     *  onUpdate per keystroke; auto-save propagates to Firestore which
     *  triggers a useCollection snapshot which recomputes contentBlocksMap
     *  which would normally rebuild the PDF on EVERY keystroke (rasterise
     *  + paginate + iframe reload = 1-3s each). Hold the inputs stable
     *  for 1500ms after the last change before pushing into the
     *  ProposalPDFDocument; the iframe regenerates once when the user
     *  stops editing. */
    const [stableMap, setStableMap] = useState(contentBlocksMap);
    const [stableSubHeaders, setStableSubHeaders] = useState(contentBlockSubHeadersMap);
    const [stableSections, setStableSections] = useState(pdfSections);
    const [stableProfile, setStableProfile] = useState(salespersonProfile ?? undefined);
    const [pendingUpdate, setPendingUpdate] = useState(false);
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    useEffect(() => {
        // Detect any input drift from the stable snapshot. If they match,
        // nothing to do (skip showing the indicator on initial mount).
        const sameSections = (stableSections?.length ?? 0) === (pdfSections?.length ?? 0)
            && (stableSections ?? []).every((s, i) => {
                const o = (pdfSections ?? [])[i];
                return o && o.id === s.id && o.order === s.order;
            });
        const mapKeys = Object.keys(contentBlocksMap);
        const stableKeys = Object.keys(stableMap);
        const sameMap = mapKeys.length === stableKeys.length
            && mapKeys.every(k => contentBlocksMap[k as BlockType] === stableMap[k as BlockType]);
        const subKeys = Object.keys(contentBlockSubHeadersMap);
        const stableSubKeys = Object.keys(stableSubHeaders);
        const sameSubs = subKeys.length === stableSubKeys.length
            && subKeys.every(k => contentBlockSubHeadersMap[k as BlockType] === stableSubHeaders[k as BlockType]);
        const sameProfile = (stableProfile?.messageHtml === salespersonProfile?.messageHtml)
            && (stableProfile?.photoUrl === salespersonProfile?.photoUrl)
            && (stableProfile?.role === salespersonProfile?.role)
            && (stableProfile?.signOff === salespersonProfile?.signOff);

        if (sameSections && sameMap && sameSubs && sameProfile) {
            setPendingUpdate(false);
            return;
        }
        setPendingUpdate(true);
        if (debounceRef.current) clearTimeout(debounceRef.current);
        debounceRef.current = setTimeout(() => {
            setStableMap(contentBlocksMap);
            setStableSubHeaders(contentBlockSubHeadersMap);
            setStableSections(pdfSections);
            setStableProfile(salespersonProfile ?? undefined);
            setPendingUpdate(false);
        }, 1500);
        return () => {
            if (debounceRef.current) clearTimeout(debounceRef.current);
        };
    }, [contentBlocksMap, contentBlockSubHeadersMap, pdfSections, salespersonProfile, stableMap, stableSubHeaders, stableSections, stableProfile]);

    /** Single document instance — useMemo-stabilised so the PDFViewer
     *  iframe only regenerates when the debounced inputs actually change. */
    /** v1.7 round-9 — final pre-render swap on the debounced inputs.
     *  Keeps the swap inside the memo so the PDFViewer iframe regenerates
     *  exactly when the data URLs become available, not on every map
     *  reference change. */
    const docElement = useMemo(
        () => {
            const mappedHtml: Partial<Record<BlockType, string>> = {};
            for (const [k, v] of Object.entries(stableMap)) {
                mappedHtml[k as BlockType] = v ? swapImgUrlsInHtml(v, imageDataUrls) : v;
            }
            const mappedProfile = stableProfile
                ? {
                      ...stableProfile,
                      photoUrl: stableProfile.photoUrl ? (imageDataUrls.get(stableProfile.photoUrl) ?? stableProfile.photoUrl) : stableProfile.photoUrl,
                      messageHtml: stableProfile.messageHtml ? swapImgUrlsInHtml(stableProfile.messageHtml, imageDataUrls) : stableProfile.messageHtml,
                  }
                : stableProfile;
            return (
                <ProposalPDFDocument
                    quote={fixture.quote}
                    organisation={fixture.organisation}
                    financials={fixture.financials}
                    contentBlocks={mappedHtml}
                    contentBlockSubHeaders={stableSubHeaders}
                    pdfSections={stableSections}
                    salespersonProfile={mappedProfile}
                />
            );
        },
        [fixture, stableMap, stableSubHeaders, stableSections, stableProfile, imageDataUrls],
    );

    return (
        <>
            <div className="rounded-[1.5rem] overflow-hidden border-2 shadow-sm bg-white">
                {showHeader && (
                    <div className="px-4 py-3 border-b bg-muted/5 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2">
                                <p className="text-[11px] font-black uppercase tracking-widest">
                                    {documentType === 'quote' ? 'Quote' : 'Contract'} PDF preview
                                </p>
                                {pendingUpdate && (
                                    <span className="inline-flex items-center gap-1 text-[10px] text-amber-700 font-medium">
                                        <Loader2 className="h-3 w-3 animate-spin" />
                                        Updating…
                                    </span>
                                )}
                            </div>
                            <p className="text-[10px] text-slate-500 mt-0.5">
                                All sections in render order · regenerates 1.5s after edits settle
                            </p>
                            {/* v1.7 round-8 — real-data fetcher status pills.
                                Surfaces WHY motor/trailer photos may be missing
                                (no real data seeded for that vendor in Firestore). */}
                            <div className="flex items-center gap-1.5 mt-1.5">
                                <FetchPill label="Vendor" status={fetchStatus.vendorLogo} />
                                <FetchPill label="Motor" status={fetchStatus.motor} />
                                <FetchPill label="Trailer" status={fetchStatus.trailer} />
                            </div>
                        </div>
                        <Button
                            size="sm"
                            onClick={() => setFocusMode(true)}
                            className="h-8 px-3 rounded-lg font-black uppercase tracking-widest text-[10px] shadow-sm bg-slate-900 text-white hover:bg-slate-800 gap-1.5 shrink-0"
                            title="Expand preview to full screen"
                        >
                            <Maximize2 className="h-3.5 w-3.5" />
                            Focus
                        </Button>
                    </div>
                )}
                {/* Inline PDF — only render when NOT in focus mode (avoids
                    double-rendering lag). When focus mode is on, this is
                    replaced with a static placeholder so the layout doesn't
                    collapse behind the overlay. */}
                <div className="p-3 bg-slate-100" style={{ minHeight: 640 }}>
                    {focusMode ? (
                        <div className="w-full h-full min-h-[640px] rounded-lg border bg-white flex items-center justify-center text-xs text-slate-400">
                            Preview is in focus mode (full screen) — close to return here
                        </div>
                    ) : (
                        <div className="w-full h-full min-h-[640px] rounded-lg overflow-hidden border">
                            <PDFViewer
                                style={{ width: '100%', height: '100%', minHeight: 640, border: 0 }}
                                showToolbar={false}
                            >
                                {docElement}
                            </PDFViewer>
                        </div>
                    )}
                </div>
            </div>

            {/* Full-screen focus mode — fixed overlay covering the viewport.
                Only THIS PDFViewer renders when focus is on (the inline one
                is replaced by a placeholder above). */}
            {focusMode && (
                <div className="fixed inset-0 z-50 bg-slate-950/95 flex flex-col">
                    <div className="flex items-center justify-between px-6 py-3 border-b border-slate-800 bg-slate-900 text-white">
                        <div className="flex items-center gap-3">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">PDF Preview · Focus mode</p>
                            <p className="text-xs text-slate-300">
                                {documentType === 'quote' ? 'Quote' : 'Contract'} · Sample: Highfield Sport 560
                            </p>
                        </div>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setFocusMode(false)}
                            className="h-9 px-4 rounded-lg font-black uppercase tracking-widest text-[10px] border-slate-700 bg-slate-800 hover:bg-slate-700 text-white gap-1.5"
                        >
                            <Minimize2 className="h-3.5 w-3.5" />
                            Exit focus
                        </Button>
                    </div>
                    <div className="flex-1 min-h-0">
                        <PDFViewer
                            style={{ width: '100%', height: '100%', border: 0 }}
                            showToolbar={true}
                        >
                            {docElement}
                        </PDFViewer>
                    </div>
                </div>
            )}
        </>
    );
}

/**
 * v1.7 round-8 — small status pill that tells the operator whether
 * the real-data fetcher found motor / trailer / vendor data in
 * Firestore. Green when data was loaded, amber when missing (with a
 * tooltip explaining why), grey while pending. Tells the user at a
 * glance why a motor / trailer photo is or isn't showing on the PDF.
 */
function FetchPill({
    label,
    status,
}: {
    label: string;
    status: 'pending' | 'found' | 'no-vendor' | 'no-rows' | 'missing' | 'error';
}) {
    const isGreen = status === 'found';
    const isGrey = status === 'pending';
    const tooltip =
        status === 'found'      ? `${label}: real data loaded from Firestore.` :
        status === 'pending'    ? `${label}: fetching…` :
        status === 'no-vendor'  ? `${label}: no matching vendor seeded in data-warehouse. Photo + specs in PDF will be empty / placeholder until you add one.` :
        status === 'no-rows'    ? `${label}: vendor exists but no rows under it. Photo + specs will be empty.` :
        status === 'missing'    ? `${label}: vendor doc missing or has no logoUrl.` :
                                  `${label}: fetch failed — see browser console.`;
    return (
        <span
            title={tooltip}
            className={
                'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest border ' +
                (isGreen
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : isGrey
                        ? 'bg-slate-50 text-slate-500 border-slate-200'
                        : 'bg-amber-50 text-amber-700 border-amber-200')
            }
        >
            <span className={'w-1.5 h-1.5 rounded-full ' + (isGreen ? 'bg-emerald-500' : isGrey ? 'bg-slate-400' : 'bg-amber-500')} />
            {label}
            {isGreen && ' ✓'}
            {!isGreen && !isGrey && ' missing'}
        </span>
    );
}
