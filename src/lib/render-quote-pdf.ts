/**
 * renderQuotePdf — single-source PDF render pipeline (v1.8 — story 1.5.0).
 *
 * Collapses the v1.7 PDF render pipeline that was duplicated across:
 *   - proposal-view.tsx#handleDownloadPdf (Customer "Download PDF" path)
 *   - finalize-quote-dialog.tsx (Finalize-snapshot path)
 *
 * Story 1.2.4 Send Quote will be a third call-site. Without this
 * extraction we'd be maintaining three drifting pipelines (the v1.4
 * trailer-snapshot lesson — pick-time pipelines that diverge silently
 * break PDF output for one path while the other works).
 *
 * Pipeline stages (in order):
 *   1. Resolve org-authored content blocks (with brand-override fallback)
 *   2. Resolve per-block sub-header overrides
 *   3. Pre-load every image URL the PDF will reference (cover, motor /
 *      trailer / brand logos, org logos, inline content-block images)
 *      as base64 data URLs via the v1.7 round-9 image-preload helper.
 *      Cross-origin images route through /api/image-proxy.
 *   4. Swap URLs in content-block HTML + on motor / trailer / cover /
 *      logo fields for their preloaded data-URL counterparts
 *   5. Render <ProposalPDFDocument> via @react-pdf/renderer.pdf().toBlob()
 *
 * All four runtime modules are dynamic-imported so this helper stays
 * code-split-friendly — the Send Quote dialog can include this without
 * pulling @react-pdf into the main bundle.
 *
 * v1.8 OUT OF SCOPE (deferred to v1.9):
 *   - Server-side rendering migration (Cloud Function + system-initiated
 *     emails). renderQuotePdf still runs client-side; v1.9 will ship a
 *     server-side variant of the same API for scheduled / system sends.
 *   - Caching the rendered blob (currently re-renders every call).
 */

import type { Firestore } from 'firebase/firestore';
import type { FirebaseStorage } from 'firebase/storage';

export interface RenderQuotePdfOptions {
    firestore: Firestore;
    /** Currently unused but reserved for v1.9 (server-side variant uploads
     *  the rendered blob directly into Storage). Keeping the signature
     *  stable here avoids a v1.9 call-site sweep. */
    storage?: FirebaseStorage;
    quote: any;
    organisation: any;
    financials: any;
    /** Defaults to 'quote'. Pass 'contract' once v1.8 contract-PDF flow lands. */
    documentType?: 'quote' | 'contract';
}

export interface RenderQuotePdfResult {
    blob: Blob;
}

export async function renderQuotePdf(opts: RenderQuotePdfOptions): Promise<RenderQuotePdfResult> {
    const { firestore, quote, organisation, financials, documentType = 'quote' } = opts;

    const [
        { pdf },
        { ProposalPDFDocument },
        { resolveContentBlocksForQuote, resolveContentBlockSubHeadersForQuote, resolveContentBlockStylesForQuote },
        { extractImgUrlsFromHtml, preloadImages, swapImgUrlsInHtml },
        { createElement },
        { doc, getDoc },
    ] = await Promise.all([
        import('@react-pdf/renderer'),
        import('@/components/proposal-pdf'),
        import('@/lib/content-blocks'),
        import('@/lib/image-preload'),
        import('react'),
        import('firebase/firestore'),
    ]);

    // v1.8 (1.2.3.c) — per-quote content override context. The resolver
    // checks users/{ownerUid}/quotes/{quoteId}/contentOverrides/{blockType}
    // and prefers per-quote html / subHeader over brand override / org
    // default. Locked blocks (`isLockedForQuotes === true`) short-circuit
    // the override layer inside the resolver. ownerUid resolves to
    // quote.createdByUid (auth-side denormalisation since v1.0); we fall
    // back to undefined when missing so legacy quotes still render.
    const quoteOverrideCtx = (quote.organisationId && quote.createdByUid && quote.id)
        ? { ownerUid: quote.createdByUid as string, quoteId: quote.id as string }
        : null;

    // 1 + 2. Resolve content blocks + sub-headers in parallel. Skip when
    // the quote has no organisationId (stock-only flows) — the PDF
    // renderer handles `undefined` cleanly via legacy fallbacks.
    // 1c (v1.10 cover-letter fix) — fetch the SalespersonProfile for the
    // quote's creator. Without this the 'salesperson-message' block in
    // proposal-pdf.tsx silently returns null (it's hard-gated on
    // salespersonProfile being present), which presented as the
    // "cover letter not appearing in Proposal" prod bug. Source-of-
    // truth is organisations/{orgId}/salesTeam/{quote.createdByUid}
    // per sales-team.ts. Keyed by the QUOTE'S creator (not the current
    // user) because a PDF rendered by anyone must still show the
    // salesperson assigned to that quote.
    const [contentBlocks, contentBlockSubHeaders, contentBlockStyles, salespersonProfile] = quote.organisationId
        ? await Promise.all([
            resolveContentBlocksForQuote(firestore, quote.organisationId, quote.vendorId ?? null, documentType, quoteOverrideCtx),
            resolveContentBlockSubHeadersForQuote(firestore, quote.organisationId, documentType, quoteOverrideCtx),
            // v1.11 follow-up — per-block presentation overrides (colors, alignment, sizes).
            resolveContentBlockStylesForQuote(firestore, quote.organisationId, documentType),
            quote.createdByUid
                ? getDoc(doc(firestore, 'organisations', quote.organisationId, 'salesTeam', quote.createdByUid))
                    .then(snap => (snap.exists() ? snap.data() as any : null))
                    .catch(() => null)
                : Promise.resolve(null),
        ])
        : [undefined, undefined, undefined, null];

    // 3. Collect every URL the PDF will reference, pre-load to data URLs.
    // Includes the salesperson photo + any inline images in their message
    // (mirrors the preview's image-preload coverage).
    const inlineUrls = contentBlocks
        ? Object.values(contentBlocks).flatMap(html => extractImgUrlsFromHtml(html ?? ''))
        : [];
    const salespersonInlineUrls = salespersonProfile?.messageHtml
        ? extractImgUrlsFromHtml(salespersonProfile.messageHtml)
        : [];
    const candidateUrls: (string | null | undefined)[] = [
        ...inlineUrls,
        ...salespersonInlineUrls,
        quote.coverImageUrl,
        quote.vendorLogoUrl,
        quote.motor?.imageUrl,
        quote.motor?.brandLogoUrl,
        quote.trailer?.imageUrl,
        quote.trailer?.brandLogoUrl,
        quote.trailer?.catalog?.imageUrl,
        organisation?.primaryLogoUrl,
        organisation?.secondaryLogoUrl,
        salespersonProfile?.photoUrl,
    ];
    // v1.11 follow-up — route preload through the resizing proxy so a 21MB
    // Highfield CDN cover ends up as ~100KB in the PDF, not 21MB. 1400px
    // is wider than the A4 cover render target (~1200px) so we still get
    // crisp prints. Smaller images pass through untouched (weserv is a no-op
    // when the source is already smaller than the requested width).
    const dataUrls = await preloadImages(candidateUrls, { maxWidth: 1400 });

    // 4. Swap URLs everywhere they appear, leaving original URLs intact
    // when preload couldn't resolve them (@react-pdf will silent-fail on
    // those — matches prior behaviour, doesn't make it worse).
    const swap = (u: string | null | undefined) => (u ? (dataUrls.get(u) ?? u) : u);
    const mappedBlocks: typeof contentBlocks = contentBlocks
        ? Object.fromEntries(
            Object.entries(contentBlocks).map(([k, v]) => [k, v ? swapImgUrlsInHtml(v, dataUrls) : v]),
        )
        : contentBlocks;
    const mappedSalespersonProfile = salespersonProfile
        ? {
              ...salespersonProfile,
              photoUrl: swap(salespersonProfile.photoUrl) ?? null,
              messageHtml: salespersonProfile.messageHtml
                  ? swapImgUrlsInHtml(salespersonProfile.messageHtml, dataUrls)
                  : salespersonProfile.messageHtml,
          }
        : null;
    const swappedQuote = {
        ...quote,
        coverImageUrl: swap(quote.coverImageUrl),
        vendorLogoUrl: swap(quote.vendorLogoUrl),
        motor: quote.motor
            ? {
                  ...quote.motor,
                  imageUrl: swap(quote.motor.imageUrl),
                  brandLogoUrl: swap(quote.motor.brandLogoUrl),
              }
            : quote.motor,
        trailer: quote.trailer
            ? {
                  ...quote.trailer,
                  imageUrl: swap(quote.trailer.imageUrl),
                  brandLogoUrl: swap(quote.trailer.brandLogoUrl),
                  catalog: quote.trailer.catalog
                      ? { ...quote.trailer.catalog, imageUrl: swap(quote.trailer.catalog.imageUrl) }
                      : quote.trailer.catalog,
              }
            : quote.trailer,
    };
    const swappedOrg = organisation
        ? {
              ...organisation,
              primaryLogoUrl: swap(organisation.primaryLogoUrl),
              secondaryLogoUrl: swap(organisation.secondaryLogoUrl),
          }
        : organisation;

    // v1.10 cover-letter fix — dev-only canary so the next instance of a
    // "block authored but invisible on the PDF" bug screams instead of
    // silently dropping. Fires when a content block is in the resolved
    // map with non-empty html (operator did author content) but the
    // dependency the renderer needs is missing.
    if (process.env.NODE_ENV === 'development') {
        if (contentBlocks?.['salesperson-message']?.trim() && !mappedSalespersonProfile?.messageHtml?.trim()) {
            console.warn(
                '[renderQuotePdf] salesperson-message block resolved but salespersonProfile.messageHtml is empty/missing — block will not render. quote.createdByUid =',
                quote.createdByUid,
            );
        }
    }

    // 5. Render via @react-pdf.
    const blob = await pdf(
        createElement(ProposalPDFDocument, {
            quote: swappedQuote,
            organisation: swappedOrg,
            financials,
            contentBlocks: mappedBlocks,
            contentBlockSubHeaders,
            contentBlockStyles,
            salespersonProfile: mappedSalespersonProfile,
        }) as any,
    ).toBlob();

    return { blob };
}
