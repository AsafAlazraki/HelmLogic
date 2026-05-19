/**
 * SharePoint path builder (v1.9 — story 1.3.3).
 *
 * Pure helpers that translate a HelmLogic quote into the SharePoint
 * folder + file path it should sync to. The structure mirrors HL's
 * Firestore hierarchy 1:1 (per `tasks/ADMIN_TASK_sharepoint-setup.md`):
 *
 *   {folderPath root}/                                 — sharePointConfig.folderPath
 *     HelmLogic — {Organisation Name}/                 = organisations/{orgId}
 *       {Salesperson Display Name}/                    = users/{createdByUid}
 *         {Customer Name} — {Root Quote Number}/       = quote family root
 *           Original/                                   — root quote (no scenarioLabel)
 *             Quote.pdf
 *           {Scenario Label}/                           — v1.1.3 scenario sibling
 *             Quote.pdf
 *           v{N}/                                       — v1.8 fork-on-edit child
 *             Quote.pdf
 *
 * Why this shape:
 * - Salesperson layer makes handoffs leave breadcrumbs (the old
 *   salesperson's folder stays; new owner starts a fresh subtree). HL
 *   already retains `createdByUid` for the lifetime of the quote.
 * - Customer + root-quote-number compound key avoids collisions on
 *   repeat customers across a single salesperson's pipeline.
 * - Scenarios use their label as the leaf folder so the SharePoint
 *   navigator sees the same human-readable name the operator chose
 *   in the Create Scenario dialog.
 * - Forks (v2+) get `v{N}/` so the version chain is obvious; the
 *   forked-from quote stays at its existing folder unchanged.
 *
 * No Firestore I/O here — all inputs are passed in. Keeps the builder
 * unit-testable and makes the call sites explicit about what context
 * they have. Consumers fetch the salesperson + root quote separately
 * (see `quote-scenarios.ts`'s sibling-tree subscription for the same
 * pattern).
 */

export interface BuildPathInputs {
    /** The org doc — needs `.name`. */
    organisation: { name?: string | null } | null | undefined;
    /** Salesperson display name (resolved from users/{createdByUid} OR
     *  organisations/{orgId}/salesTeam/{uid}). */
    salespersonName: string | null | undefined;
    /** Root quote (no parentQuoteId in its own data, or the quote
     *  pointed at by quote.parentQuoteId). Needs `.quoteNumber` and
     *  `.customer.name`. */
    rootQuote: {
        quoteNumber?: string | null;
        customer?: { name?: string | null } | null;
    } | null | undefined;
    /** The quote we're syncing (may be the root, a scenario, or a fork). */
    quote: {
        quoteNumber?: string | null;
        scenarioLabel?: string | null;
        version?: number | null;
        parentQuoteId?: string | null;
    } | null | undefined;
}

export interface BuiltPath {
    /** Folder path segments from the config root down to the quote's
     *  immediate folder, joined with `/`. Does NOT include the root
     *  (the caller prepends `sharePointConfig.folderPath`). */
    folderPath: string;
    /** File name with extension. */
    fileName: string;
    /** folderPath + '/' + fileName — convenience for log lines. */
    fullPath: string;
}

/**
 * SharePoint folder + file names tolerate most characters but the
 * Graph API rejects `\ / : * ? " < > |` and trims trailing dots /
 * spaces. We replace those with a hyphen rather than stripping so the
 * operator's intent stays readable.
 *
 * Trailing dots are illegal at any path-segment end on Windows-backed
 * stores (SharePoint included). Trim them.
 *
 * Empty segments fall back to a placeholder rather than producing
 * `//` in the path (which Graph would 400 on).
 */
export function sanitizeSegment(raw: string | null | undefined, fallback: string): string {
    const trimmed = (raw ?? '').trim();
    if (!trimmed) return fallback;
    // Replace forbidden chars with '-'; collapse runs.
    const replaced = trimmed.replace(/[\\/:*?"<>|]+/g, '-');
    // Strip trailing dots and spaces.
    const tidied = replaced.replace(/[. ]+$/, '');
    return tidied || fallback;
}

/**
 * Compute the SharePoint path for a given quote. Pure.
 */
export function buildQuoteSharePointPath(inputs: BuildPathInputs): BuiltPath {
    const orgSegment = sanitizeSegment(
        inputs.organisation?.name ? `HelmLogic — ${inputs.organisation.name}` : null,
        'HelmLogic — Unnamed Organisation',
    );
    const salespersonSegment = sanitizeSegment(
        inputs.salespersonName,
        'Unassigned Salesperson',
    );

    const customer = inputs.rootQuote?.customer?.name?.trim();
    const rootNumber = inputs.rootQuote?.quoteNumber?.trim();
    const familySegment = sanitizeSegment(
        customer && rootNumber
            ? `${customer} — ${rootNumber}`
            : (rootNumber ?? customer ?? null),
        'Unidentified Quote Family',
    );

    // Leaf segment: Original / {scenarioLabel} / v{N}
    let leafSegment = 'Original';
    if (inputs.quote?.scenarioLabel && inputs.quote.scenarioLabel.trim()) {
        leafSegment = sanitizeSegment(inputs.quote.scenarioLabel, 'Scenario');
    } else if (typeof inputs.quote?.version === 'number' && inputs.quote.version > 1) {
        leafSegment = `v${inputs.quote.version}`;
    }

    const folderPath = [orgSegment, salespersonSegment, familySegment, leafSegment].join('/');
    const fileName = 'Quote.pdf';
    return { folderPath, fileName, fullPath: `${folderPath}/${fileName}` };
}
