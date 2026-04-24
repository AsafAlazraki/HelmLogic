/**
 * Release Notes loader — reads tasks/RELEASE_NOTES_*.md at request-time
 * inside a Server Component and returns parsed metadata + rendered HTML.
 *
 * Content is intentionally static: the canonical source is the markdown
 * file in the repo, which ships with the deployed bundle. Changing a
 * release note means editing the file in the repo and redeploying.
 */

import fs from 'node:fs';
import path from 'node:path';
import { marked } from 'marked';

export interface ReleaseNote {
    /** Version string (e.g. "v1.4"). Used as the React key and URL hash anchor. */
    version: string;
    /** Full title from the first H1 line (e.g. "HelmLogic — Release Notes v1.4.0"). */
    title: string;
    /** Date string as written in the file (e.g. "2026-04-23"), or null if missing. */
    date: string | null;
    /** Rendered HTML body, first H1 stripped (since we render it ourselves). */
    html: string;
}

/** Semantic-ish comparator — "v1" < "v1.1" < "v1.2" < "v1.2.1" < "v1.3" etc. */
function compareVersions(a: string, b: string): number {
    const parse = (v: string) => v.replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0);
    const ap = parse(a);
    const bp = parse(b);
    const len = Math.max(ap.length, bp.length);
    for (let i = 0; i < len; i++) {
        const diff = (ap[i] ?? 0) - (bp[i] ?? 0);
        if (diff !== 0) return diff;
    }
    return 0;
}

export function loadReleaseNotes(): ReleaseNote[] {
    const dir = path.join(process.cwd(), 'tasks');
    let files: string[] = [];
    try {
        files = fs.readdirSync(dir).filter(f => /^RELEASE_NOTES_v[\d.]+\.md$/.test(f));
    } catch {
        return [];
    }

    const notes: ReleaseNote[] = files.map(filename => {
        const fullPath = path.join(dir, filename);
        const md = fs.readFileSync(fullPath, 'utf8');

        const versionMatch = filename.match(/RELEASE_NOTES_(v\d+(?:\.\d+)*)\.md/);
        const version = versionMatch?.[1] ?? filename;

        const titleMatch = md.match(/^#\s+(.+)$/m);
        const title = titleMatch?.[1]?.trim() ?? `Release ${version}`;

        const dateMatch = md.match(/^>\s*Release Date:\s*(.+)$/mi);
        const date = dateMatch?.[1]?.trim() ?? null;

        // Strip the first H1 from the body so we can render the title
        // ourselves in a styled card header.
        const bodyMd = md.replace(/^#\s+.+$/m, '').trimStart();

        // marked.parse is sync when called without options that force async.
        const html = marked.parse(bodyMd, { async: false }) as string;

        return { version, title, date, html };
    });

    // Newest first.
    notes.sort((a, b) => compareVersions(b.version, a.version));
    return notes;
}
