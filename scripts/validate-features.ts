/**
 * Plan Validator (v1.8 — story 6.4.2)
 * ====================================
 * Walks every doc in the `features` collection, scans every story's
 * `acceptanceCriteria[]` + `description` for cross-story references,
 * and verifies the dependency graph stays sane against
 * `RELEASE_WINDOWS` order.
 *
 * Two reference patterns are detected:
 *   - STRICT — /DEPENDS ON \d+\.\d+\.\d+/g (canonical per
 *     tasks/CONVENTIONS.md → "Cross-story dependency convention")
 *   - LOOSE  — /\b\d+\.\d+\.\d+\b/g (catches legacy / non-canonical
 *     refs; flagged as warnings, doesn't block)
 *
 * Plus the typed `dependsOn[]` field on each FeatureDoc (populated
 * by 6.4.1) — checked as if it were a STRICT ref.
 *
 * Per ref, three checks:
 *   1. Target feature exists (matched by title.startsWith("X.Y.Z —"))
 *   2. Target isn't soft-deleted (deletedAt == null)
 *   3. Target.targetRelease ≤ source.targetRelease per the canonical
 *      RELEASE_WINDOWS order (so deps don't ship after the story
 *      that depends on them)
 *
 * Failures are ERRORS (exit code 1). Loose-ref refs that resolve
 * cleanly become WARNINGS (consider rewording with the canonical
 * `DEPENDS ON` prefix). Exit code 0 if all green.
 *
 * Usage:
 *   npm run validate:plan
 *   # or directly:
 *   npx tsx scripts/validate-features.ts
 *
 * The script uses the public Firebase client SDK (read-only access
 * to the `features` collection — same pattern as scripts/seed-*.ts)
 * so no service-account credential is needed for the dev path.
 *
 * Exits 0 if no errors; 1 if any error. Warnings never block.
 *
 * Story 6.4.2 OUT OF SCOPE (deferred to v1.9):
 *   - GitHub Actions workflow that runs this on every PR (1 pt)
 *   - Auto-fix mode (interactive rewrite of non-canonical refs)
 *   - Cycle detection (a → b → a)
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

import { RELEASE_WINDOWS, UNSCHEDULED_KEY } from '../src/lib/release-schedule';

// ---------------------------------------------------------------------------
// Firebase init — same config as scripts/seed-master-price-file.ts. Read-only
// access via the public web SDK; no service-account key needed.
// ---------------------------------------------------------------------------

const firebaseConfig = {
    projectId: 'studio-2290360004-3b963',
    appId: '1:611154837797:web:ad53f3118b9dfa4770dacc',
    apiKey: 'AIzaSyDJ7b5G9zL2uTpDzgwTLvQtVUIyaVBpSBY',
    authDomain: 'studio-2290360004-3b963.firebaseapp.com',
    storageBucket: 'studio-2290360004-3b963.firebasestorage.app',
};

// ---------------------------------------------------------------------------
// ANSI colours (no chalk dep — this is a one-file script)
// ---------------------------------------------------------------------------

const C = {
    reset: '\x1b[0m',
    dim: '\x1b[2m',
    bold: '\x1b[1m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    cyan: '\x1b[36m',
    grey: '\x1b[90m',
};

// ---------------------------------------------------------------------------
// Types — narrow enough for what we read.
// ---------------------------------------------------------------------------

interface FeatureRow {
    id: string;
    title: string;
    description?: string;
    acceptanceCriteria?: string[];
    targetRelease?: string | null;
    dependsOn?: string[];
    dependsOnSoft?: string[];
    deletedAt?: any;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const STRICT_RE = /DEPENDS ON (\d+\.\d+\.\d+)/g;
const LOOSE_RE = /\b(\d+\.\d+\.\d+)\b/g;

function compareReleases(a: string, b: string): number {
    const order = Object.keys(RELEASE_WINDOWS);
    const ai = order.indexOf(a);
    const bi = order.indexOf(b);
    if (ai === -1 && bi === -1) return 0;
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return Math.sign(ai - bi);
}

function findFeatureByRef(ref: string, features: FeatureRow[]): FeatureRow | null {
    return features.find(f => {
        if (f.deletedAt != null) return false;
        const t = (f.title ?? '').trim();
        return t.startsWith(`${ref} —`) || t.startsWith(`${ref} -`);
    }) ?? null;
}

interface Issue {
    severity: 'error' | 'warning';
    feature: FeatureRow;
    sourceField: 'dependsOn' | 'acceptanceCriteria' | 'description';
    sourceLine?: number;       // 1-based AC line index for grep-able output
    ref: string;
    reason: string;
}

function checkRef(
    ref: string,
    feature: FeatureRow,
    sourceField: Issue['sourceField'],
    sourceLine: number | undefined,
    features: FeatureRow[],
    canonical: boolean,                 // true = strict DEPENDS ON, false = loose
): Issue | null {
    const target = findFeatureByRef(ref, features);
    if (!target) {
        // Loose refs that don't resolve are usually false positives
        // (e.g. "Section 1.2.3 of the contract", a version string). Don't
        // flag those — only flag missing CANONICAL DEPENDS ON refs.
        if (!canonical) return null;
        return {
            severity: 'error', feature, sourceField, sourceLine, ref,
            reason: `target feature "${ref}" not found (or soft-deleted)`,
        };
    }
    const sourceTarget = feature.targetRelease ?? null;
    const depTarget = target.targetRelease ?? null;
    if (!sourceTarget || sourceTarget === UNSCHEDULED_KEY) {
        // Source is unscheduled — order check not meaningful.
        return null;
    }
    if (!depTarget || depTarget === UNSCHEDULED_KEY) {
        if (!canonical) return null;
        return {
            severity: 'error', feature, sourceField, sourceLine, ref,
            reason: `target "${ref}" is unscheduled, but source ships in ${sourceTarget}`,
        };
    }
    if (compareReleases(depTarget, sourceTarget) > 0) {
        return {
            severity: canonical ? 'error' : 'warning',
            feature, sourceField, sourceLine, ref,
            reason: `target "${ref}" ships in ${depTarget}, AFTER source ${sourceTarget}`,
        };
    }
    if (!canonical) {
        // Resolves cleanly but used loose form — flag as warning so the
        // operator knows to rewrite with the canonical DEPENDS ON prefix.
        return {
            severity: 'warning', feature, sourceField, sourceLine, ref,
            reason: `loose ref to "${ref}" — consider rewriting with canonical "DEPENDS ON ${ref}" per CONVENTIONS.md`,
        };
    }
    return null;
}

function scanText(
    text: string,
    feature: FeatureRow,
    sourceField: Issue['sourceField'],
    sourceLine: number | undefined,
    features: FeatureRow[],
): Issue[] {
    const issues: Issue[] = [];
    // Strict pass first — these matches override loose detection on the
    // same span (avoid double-flagging "DEPENDS ON 1.8.1" once strict +
    // once loose).
    const strictMatches = new Set<string>();
    let m: RegExpExecArray | null;
    STRICT_RE.lastIndex = 0;
    while ((m = STRICT_RE.exec(text)) !== null) {
        const ref = m[1];
        strictMatches.add(ref);
        const issue = checkRef(ref, feature, sourceField, sourceLine, features, /* canonical */ true);
        if (issue) issues.push(issue);
    }
    LOOSE_RE.lastIndex = 0;
    while ((m = LOOSE_RE.exec(text)) !== null) {
        const ref = m[1];
        if (strictMatches.has(ref)) continue;
        const issue = checkRef(ref, feature, sourceField, sourceLine, features, /* canonical */ false);
        if (issue) issues.push(issue);
    }
    return issues;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
    console.log(`${C.dim}Initializing Firebase...${C.reset}`);
    const app = initializeApp(firebaseConfig);
    const db = getFirestore(app);

    console.log(`${C.dim}Reading features collection...${C.reset}`);
    const snap = await getDocs(collection(db, 'features'));
    const features: FeatureRow[] = [];
    snap.forEach(d => features.push({ id: d.id, ...(d.data() as Omit<FeatureRow, 'id'>) }));
    const live = features.filter(f => f.deletedAt == null);

    console.log(`${C.green}Loaded ${features.length} feature docs${C.reset} (${live.length} live, ${features.length - live.length} soft-deleted)\n`);

    // Walk every live feature and collect issues.
    const allIssues: Issue[] = [];
    for (const f of live) {
        // 1. Typed dependsOn[] field — every entry is canonical-strict.
        for (const ref of f.dependsOn ?? []) {
            const issue = checkRef(ref, f, 'dependsOn', undefined, features, /* canonical */ true);
            if (issue) allIssues.push(issue);
        }
        // 2. acceptanceCriteria — line-anchored.
        const ac = f.acceptanceCriteria ?? [];
        for (let i = 0; i < ac.length; i++) {
            allIssues.push(...scanText(ac[i] ?? '', f, 'acceptanceCriteria', i + 1, features));
        }
        // 3. description — single text blob (no line index).
        if (f.description) {
            allIssues.push(...scanText(f.description, f, 'description', undefined, features));
        }
    }

    // Group issues by feature for human-readable output.
    const byFeature = new Map<string, Issue[]>();
    for (const issue of allIssues) {
        const key = issue.feature.id;
        if (!byFeature.has(key)) byFeature.set(key, []);
        byFeature.get(key)!.push(issue);
    }

    let errorCount = 0;
    let warningCount = 0;
    if (byFeature.size === 0) {
        console.log(`${C.green}${C.bold}✓ All ${live.length} live features pass dependency validation.${C.reset}`);
    } else {
        // Sort features by title for stable output.
        const featureKeys = Array.from(byFeature.keys()).sort((a, b) => {
            const ta = byFeature.get(a)![0].feature.title ?? '';
            const tb = byFeature.get(b)![0].feature.title ?? '';
            return ta.localeCompare(tb);
        });

        for (const key of featureKeys) {
            const issues = byFeature.get(key)!;
            const feature = issues[0].feature;
            const errors = issues.filter(i => i.severity === 'error');
            const warnings = issues.filter(i => i.severity === 'warning');
            errorCount += errors.length;
            warningCount += warnings.length;

            const dot = errors.length > 0 ? `${C.red}✗${C.reset}` : `${C.yellow}⚠${C.reset}`;
            console.log(`${dot} ${C.bold}${feature.title}${C.reset} ${C.grey}[${feature.targetRelease ?? 'unscheduled'}]${C.reset}`);
            for (const issue of issues) {
                const tag = issue.severity === 'error'
                    ? `${C.red}ERROR${C.reset}`
                    : `${C.yellow}WARN${C.reset} `;
                const loc = issue.sourceField === 'acceptanceCriteria' && issue.sourceLine != null
                    ? `${C.cyan}AC[${issue.sourceLine}]${C.reset}`
                    : `${C.cyan}${issue.sourceField}${C.reset}`;
                console.log(`    ${tag} ${loc}: ${issue.reason}`);
            }
            console.log();
        }
    }

    // Summary
    const summary = `${live.length} live · ${errorCount} ${C.red}error${errorCount === 1 ? '' : 's'}${C.reset} · ${warningCount} ${C.yellow}warning${warningCount === 1 ? '' : 's'}${C.reset}`;
    console.log(`${C.bold}Summary:${C.reset} ${summary}`);

    process.exit(errorCount > 0 ? 1 : 0);
}

main().catch(err => {
    console.error(`${C.red}${C.bold}validate-features.ts crashed:${C.reset}`, err);
    process.exit(2);
});
