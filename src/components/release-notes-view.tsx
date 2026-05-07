'use client';

/**
 * Release Notes timeline view — renders the parsed RELEASE_NOTES_*.md
 * blobs handed down from the Server Component loader. Left sidebar
 * lists versions, right pane shows full release notes with a sticky
 * header per version.
 */

import { useEffect, useState } from 'react';
import { BookOpen, Calendar, ChevronRight, FileText, GraduationCap, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ReleaseNote } from '@/lib/release-notes-loader';

type Pane = 'notes' | 'guide';

export function ReleaseNotesView({ notes }: { notes: ReleaseNote[] }) {
    const [activeVersion, setActiveVersion] = useState<string | null>(
        notes[0]?.version ?? null,
    );
    /**
     * v1.7 — per-release tab state ("What changed" / "How to use").
     * Each release independently remembers which pane is active so a
     * user reading the v1.7 guide doesn't lose their tab when scrolling
     * past v1.6.2's release block. Versions without a paired user
     * guide implicitly stay on 'notes'.
     */
    const [paneByVersion, setPaneByVersion] = useState<Record<string, Pane>>({});
    const paneFor = (v: string): Pane => paneByVersion[v] ?? 'notes';

    // Intersection-observer-lite: on scroll, pick the version whose
    // block is top-most in the viewport. Keeps the sidebar highlight
    // in sync with what the user is actually reading.
    useEffect(() => {
        const pane = document.getElementById('release-notes-scroll');
        if (!pane) return;
        const onScroll = () => {
            const blocks = Array.from(pane.querySelectorAll<HTMLElement>('[data-version]'));
            const paneTop = pane.getBoundingClientRect().top;
            let best: string | null = null;
            let bestDistance = Infinity;
            for (const b of blocks) {
                const dist = Math.abs(b.getBoundingClientRect().top - paneTop - 24);
                if (dist < bestDistance) {
                    bestDistance = dist;
                    best = b.dataset.version ?? null;
                }
            }
            if (best && best !== activeVersion) setActiveVersion(best);
        };
        pane.addEventListener('scroll', onScroll, { passive: true });
        return () => pane.removeEventListener('scroll', onScroll);
    }, [activeVersion]);

    function scrollToVersion(version: string) {
        const pane = document.getElementById('release-notes-scroll');
        const target = pane?.querySelector<HTMLElement>(`[data-version="${version}"]`);
        if (!pane || !target) return;
        pane.scrollTo({
            top: target.offsetTop - 8,
            behavior: 'smooth',
        });
        setActiveVersion(version);
    }

    if (notes.length === 0) {
        return (
            <div className="h-full flex items-center justify-center">
                <div className="text-center space-y-2 max-w-sm">
                    <BookOpen className="h-8 w-8 text-slate-300 mx-auto" />
                    <h3 className="text-sm font-semibold text-slate-700">No release notes yet</h3>
                    <p className="text-xs text-slate-500">
                        Release notes appear here once a <code className="bg-slate-100 px-1 rounded">RELEASE_NOTES_vX.Y.Z.md</code> is added to <code className="bg-slate-100 px-1 rounded">tasks/</code>.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full flex">
            {/* Banner + version sidebar */}
            <aside className="w-60 shrink-0 border-r bg-white flex flex-col">
                <div className="bg-gradient-to-br from-violet-600 to-blue-700 text-white px-5 py-4">
                    <div className="flex items-center gap-2">
                        <div className="h-9 w-9 bg-white/15 rounded-lg flex items-center justify-center border border-white/20">
                            <BookOpen className="h-4 w-4" />
                        </div>
                        <div>
                            <h2 className="text-sm font-bold leading-tight">Release Notes</h2>
                            <p className="text-[10px] text-blue-50/90">
                                {notes.length} release{notes.length === 1 ? '' : 's'} shipped
                            </p>
                        </div>
                    </div>
                </div>
                <nav className="feature-scroll flex-1 min-h-0 overflow-y-auto py-2">
                    {notes.map(n => (
                        <button
                            key={n.version}
                            type="button"
                            onClick={() => scrollToVersion(n.version)}
                            className={cn(
                                'w-full text-left px-4 py-2.5 flex items-center gap-2 group transition-colors border-l-2',
                                activeVersion === n.version
                                    ? 'bg-blue-50 border-blue-600 text-blue-800'
                                    : 'border-transparent text-slate-600 hover:bg-slate-50 hover:text-slate-900',
                            )}
                        >
                            <Sparkles
                                className={cn(
                                    'h-3 w-3 shrink-0',
                                    activeVersion === n.version ? 'text-blue-500' : 'text-slate-300',
                                )}
                            />
                            <div className="flex-1 min-w-0">
                                <div className="text-xs font-bold flex items-center gap-1.5">
                                    {n.version}
                                    {n.userGuideHtml && (
                                        <span
                                            title="Has user guide"
                                            className="inline-flex items-center justify-center h-3.5 w-3.5 rounded-full bg-blue-100 text-blue-700"
                                        >
                                            <GraduationCap className="h-2.5 w-2.5" />
                                        </span>
                                    )}
                                </div>
                                {n.date && (
                                    <div className="text-[10px] text-slate-500 truncate">{n.date}</div>
                                )}
                            </div>
                            <ChevronRight className={cn(
                                'h-3 w-3 shrink-0 transition-opacity',
                                activeVersion === n.version ? 'opacity-100 text-blue-500' : 'opacity-0 group-hover:opacity-60',
                            )} />
                        </button>
                    ))}
                </nav>
            </aside>

            {/* Release blocks */}
            <div
                id="release-notes-scroll"
                className="feature-scroll flex-1 min-h-0 overflow-y-auto"
            >
                <div className="max-w-3xl mx-auto px-8 py-8 space-y-12">
                    {notes.map((n, idx) => {
                        const pane = paneFor(n.version);
                        const hasGuide = !!n.userGuideHtml;
                        const showGuide = hasGuide && pane === 'guide';
                        return (
                        <article
                            key={n.version}
                            data-version={n.version}
                            className="scroll-mt-4"
                        >
                            <header className="mb-4 pb-4 border-b">
                                <div className="flex items-baseline gap-3 flex-wrap">
                                    <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                                        {n.version}
                                    </h1>
                                    {idx === 0 && (
                                        <span className="text-[10px] font-black uppercase tracking-widest bg-emerald-100 text-emerald-700 rounded-full px-2 py-0.5 border border-emerald-200">
                                            Latest
                                        </span>
                                    )}
                                    {n.date && (
                                        <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                                            <Calendar className="h-3 w-3" />
                                            {n.date}
                                        </span>
                                    )}
                                </div>
                                <p className="text-xs text-slate-500 mt-1">{n.title}</p>

                                {/* v1.7 — paired-pane toggle: "What changed"
                                    (release notes) | "How to use" (user guide).
                                    Only renders the toggle when a user guide
                                    exists for this release; older releases just
                                    show the notes. */}
                                {hasGuide && (
                                    <div className="mt-3 inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                                        <button
                                            type="button"
                                            onClick={() => setPaneByVersion(s => ({ ...s, [n.version]: 'notes' }))}
                                            className={cn(
                                                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-wider transition-colors',
                                                pane === 'notes'
                                                    ? 'bg-white text-slate-900 shadow-sm border border-slate-200'
                                                    : 'text-slate-500 hover:text-slate-800',
                                            )}
                                        >
                                            <FileText className="h-3 w-3" />
                                            What changed
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setPaneByVersion(s => ({ ...s, [n.version]: 'guide' }))}
                                            className={cn(
                                                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-bold uppercase tracking-wider transition-colors',
                                                pane === 'guide'
                                                    ? 'bg-white text-blue-700 shadow-sm border border-slate-200'
                                                    : 'text-slate-500 hover:text-slate-800',
                                            )}
                                        >
                                            <GraduationCap className="h-3 w-3" />
                                            How to use
                                        </button>
                                    </div>
                                )}
                            </header>
                            <div
                                className={cn(
                                    'prose prose-sm max-w-none',
                                    '[&_h1]:text-xl [&_h1]:font-bold [&_h1]:mt-6 [&_h1]:mb-2',
                                    '[&_h2]:text-lg [&_h2]:font-bold [&_h2]:mt-6 [&_h2]:mb-2 [&_h2]:text-slate-800',
                                    '[&_h3]:text-base [&_h3]:font-bold [&_h3]:mt-4 [&_h3]:mb-1.5 [&_h3]:text-slate-700',
                                    '[&_h4]:text-sm [&_h4]:font-bold [&_h4]:mt-3 [&_h4]:mb-1 [&_h4]:text-slate-700',
                                    '[&_p]:text-sm [&_p]:text-slate-700 [&_p]:my-2',
                                    '[&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-2 [&_ul_li]:text-sm [&_ul_li]:text-slate-700 [&_ul_li]:my-0.5',
                                    '[&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-2 [&_ol_li]:text-sm [&_ol_li]:text-slate-700',
                                    '[&_strong]:text-slate-900 [&_strong]:font-semibold',
                                    '[&_code]:text-[11px] [&_code]:bg-slate-100 [&_code]:text-slate-700 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_code]:font-mono',
                                    '[&_pre]:bg-slate-900 [&_pre]:text-slate-100 [&_pre]:text-[11px] [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:overflow-x-auto [&_pre_code]:bg-transparent [&_pre_code]:text-slate-100 [&_pre_code]:p-0',
                                    '[&_blockquote]:border-l-4 [&_blockquote]:border-blue-200 [&_blockquote]:bg-blue-50/40 [&_blockquote]:pl-3 [&_blockquote]:py-1 [&_blockquote]:my-3 [&_blockquote_p]:text-xs [&_blockquote_p]:text-slate-600',
                                    '[&_a]:text-blue-600 [&_a]:underline [&_a]:underline-offset-2',
                                    '[&_table]:text-xs [&_table]:my-3 [&_th]:bg-slate-100 [&_th]:font-bold [&_th]:px-2 [&_th]:py-1.5 [&_th]:text-left [&_th]:text-[11px] [&_th]:uppercase [&_th]:tracking-wider [&_th]:text-slate-600 [&_td]:px-2 [&_td]:py-1.5 [&_td]:border-t [&_td]:border-slate-100',
                                    '[&_hr]:my-6 [&_hr]:border-slate-200',
                                )}
                                dangerouslySetInnerHTML={{ __html: showGuide ? (n.userGuideHtml ?? '') : n.html }}
                            />
                        </article>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
