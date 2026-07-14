'use client';

/**
 * v1.33 (Epic 14 — Usage Reporting) — the "who actually uses it" surface.
 *
 * Visual reports over the telemetry stream (activitySessions +
 * activityEvents) and the existing transaction audit trails:
 *   - KPI tiles: active users, sessions, active hours, actions
 *   - Daily active-vs-idle stacked bars
 *   - Per-user leaderboard (active time, sessions, actions, last seen)
 *   - Event explorer: filter by type/person, free-text search
 * Filters: date range, person, include-test-accounts. Every view respects
 * them. PDF export renders the CURRENT filtered view via the same
 * @react-pdf pipeline the customer quotes use.
 *
 * Test accounts (shared billh test login) are stamped at capture time and
 * excluded by default — flip the toggle to see them.
 */
import React, { useMemo, useState } from 'react';
import { collection, query, where, orderBy, limit } from 'firebase/firestore';
import { useCollection, useFirestore, useMemoFirebase } from '@/firebase';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Download, MousePointerClick, Users, Timer, Activity, AlertTriangle, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { format } from 'date-fns';

const RANGE_PRESETS = [
    { key: '7', label: 'Last 7 days', days: 7 },
    { key: '30', label: 'Last 30 days', days: 30 },
    { key: '90', label: 'Last 90 days', days: 90 },
] as const;

function toDate(v: any): Date | null {
    if (!v) return null;
    if (v.toDate) return v.toDate();
    if (v instanceof Date) return v;
    return null;
}

function hrs(ms: number) {
    return Math.round((ms / 3_600_000) * 10) / 10;
}

export function UsageReportingWorkspace({ organisationId }: { organisationId: string }) {
    const firestore = useFirestore();
    // Default to 7 days — the first paint pulls an order of magnitude
    // fewer docs; widen deliberately when you need history.
    const [rangeKey, setRangeKey] = useState<'7' | '30' | '90'>('7');
    const [personFilter, setPersonFilter] = useState<string>('all');
    const [typeFilter, setTypeFilter] = useState<string>('all');
    const [includeTest, setIncludeTest] = useState(false);
    const [search, setSearch] = useState('');
    const [exporting, setExporting] = useState(false);
    const [openSessionId, setOpenSessionId] = useState<string | null>(null);

    const rangeDays = RANGE_PRESETS.find(r => r.key === rangeKey)!.days;
    const rangeStart = useMemo(() => {
        const d = new Date();
        d.setDate(d.getDate() - rangeDays);
        d.setHours(0, 0, 0, 0);
        return d;
    }, [rangeDays]);

    const sessionsQuery = useMemoFirebase(
        () => query(
            collection(firestore, `organisations/${organisationId}/activitySessions`),
            where('startedAt', '>=', rangeStart),
            orderBy('startedAt', 'desc'),
            limit(2000),
        ),
        [firestore, organisationId, rangeStart],
    );
    const { data: sessionsRaw } = useCollection<any>(sessionsQuery, { silent: true });

    const eventsQuery = useMemoFirebase(
        () => query(
            collection(firestore, `organisations/${organisationId}/activityEvents`),
            where('ts', '>=', rangeStart),
            orderBy('ts', 'desc'),
            limit(5000),
        ),
        [firestore, organisationId, rangeStart],
    );
    const { data: eventsRaw } = useCollection<any>(eventsQuery, { silent: true });

    const sessions = useMemo(
        () => (sessionsRaw ?? []).filter(s => includeTest || !s.isTestAccount),
        [sessionsRaw, includeTest],
    );
    const events = useMemo(
        () => (eventsRaw ?? []).filter(e => includeTest || !e.isTestAccount),
        [eventsRaw, includeTest],
    );

    const people = useMemo(() => {
        const map = new Map<string, string>();
        for (const s of sessions) if (s.uid) map.set(s.uid, s.name || s.email || s.uid);
        for (const e of events) if (e.uid && !map.has(e.uid)) map.set(e.uid, e.name || e.uid);
        return [...map.entries()].map(([uid, name]) => ({ uid, name })).sort((a, b) => a.name.localeCompare(b.name));
    }, [sessions, events]);

    const fSessions = useMemo(
        () => personFilter === 'all' ? sessions : sessions.filter(s => s.uid === personFilter),
        [sessions, personFilter],
    );
    const fEvents = useMemo(() => {
        let list = personFilter === 'all' ? events : events.filter(e => e.uid === personFilter);
        if (typeFilter !== 'all') list = list.filter(e => e.type === typeFilter);
        const q = search.trim().toLowerCase();
        if (q) list = list.filter(e =>
            String(e.label || '').toLowerCase().includes(q) ||
            String(e.path || '').toLowerCase().includes(q) ||
            String(e.name || '').toLowerCase().includes(q));
        return list;
    }, [events, personFilter, typeFilter, search]);

    // ---- aggregates ----
    const kpis = useMemo(() => {
        const users = new Set(fSessions.map(s => s.uid));
        const activeMs = fSessions.reduce((a, s) => a + (s.activeMs || 0), 0);
        const idleMs = fSessions.reduce((a, s) => a + (s.idleMs || 0), 0);
        return {
            users: users.size,
            sessions: fSessions.length,
            activeH: hrs(activeMs),
            idleH: hrs(idleMs),
            actions: fEvents.length,
            errors: fEvents.filter(e => e.type === 'error').length,
        };
    }, [fSessions, fEvents]);

    /** Top pages — views (nav events) + total time (dwell events) per
     *  route, respecting the person filter but NOT the type filter (a
     *  "clicks only" filter shouldn't blank the page table). */
    const topPages = useMemo(() => {
        const base = personFilter === 'all' ? events : events.filter(e => e.uid === personFilter);
        const byPath = new Map<string, { path: string; views: number; ms: number }>();
        for (const e of base) {
            if (e.type !== 'nav' && e.type !== 'dwell') continue;
            const p = e.type === 'nav' ? (e.label || e.path) : e.path;
            if (!p) continue;
            const row = byPath.get(p) || { path: p, views: 0, ms: 0 };
            if (e.type === 'nav') row.views += 1;
            else row.ms += Number(e.meta?.ms || 0);
            byPath.set(p, row);
        }
        return [...byPath.values()].sort((a, b) => (b.views * 60_000 + b.ms) - (a.views * 60_000 + a.ms)).slice(0, 12);
    }, [events, personFilter]);

    /** Coverage — what each person has and has NOT touched. Areas are
     *  path prefixes; a zero cell is the "they clearly don't" receipt. */
    const AREAS: Array<{ label: string; test: (p: string) => boolean }> = useMemo(() => [
        { label: 'Dashboard', test: p => p.includes('/dashboard') },
        { label: 'Quoting', test: p => p.includes('/quote') || p.includes('/proposal') },
        { label: 'Modules', test: p => p.includes('/modules') && !p.includes('/quote') },
        { label: 'Customers', test: p => p.startsWith('/customers') },
        { label: 'Pipeline', test: p => p.startsWith('/pipeline') },
        { label: 'Contracts', test: p => p.startsWith('/contracts') },
        { label: 'My Work', test: p => p.startsWith('/my-work') },
        { label: 'Catalog', test: p => p.includes('/pricing-manager') || p.startsWith('/boats') },
        { label: 'Reporting', test: p => p.startsWith('/reporting') },
        { label: 'Feature Tracking', test: p => p.startsWith('/feature-tracking') },
        { label: 'Settings', test: p => p.includes('/manage') },
    ], []);
    const coverage = useMemo(() => {
        const byUser = new Map<string, { name: string; counts: number[] }>();
        for (const e of events) {
            if (!e.uid) continue;
            const row = byUser.get(e.uid) || { name: e.name || e.uid, counts: AREAS.map(() => 0) };
            const p = String(e.path || '');
            AREAS.forEach((a, i) => { if (a.test(p)) row.counts[i] += 1; });
            byUser.set(e.uid, row);
        }
        return [...byUser.entries()].map(([uid, r]) => ({ uid, ...r }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }, [events, AREAS]);

    /** Session drill-down rows: every session with its own event trace. */
    const sessionRows = useMemo(() => {
        const eventsBySession = new Map<string, any[]>();
        for (const e of events) {
            if (!e.sessionId) continue;
            const arr = eventsBySession.get(e.sessionId) || [];
            arr.push(e);
            eventsBySession.set(e.sessionId, arr);
        }
        return fSessions.map(s => {
            const started = toDate(s.startedAt);
            const seen = toDate(s.lastSeenAt);
            const durMin = started && seen ? Math.max(0, Math.round((seen.getTime() - started.getTime()) / 60000)) : 0;
            const trace = (eventsBySession.get(s.id) || []).slice().sort((a, b) => {
                const da = toDate(a.ts)?.getTime() ?? 0; const db = toDate(b.ts)?.getTime() ?? 0;
                return da - db;
            });
            return { ...s, started, durMin, trace };
        });
    }, [fSessions, events]);

    const daily = useMemo(() => {
        const byDay = new Map<string, { day: string; active: number; idle: number }>();
        for (const s of fSessions) {
            const d = toDate(s.startedAt);
            if (!d) continue;
            const key = format(d, 'dd MMM');
            const row = byDay.get(key) || { day: key, active: 0, idle: 0 };
            row.active += hrs(s.activeMs || 0);
            row.idle += hrs(s.idleMs || 0);
            byDay.set(key, row);
        }
        return [...byDay.values()].reverse();
    }, [fSessions]);

    const perUser = useMemo(() => {
        const byUser = new Map<string, { uid: string; name: string; sessions: number; activeMs: number; idleMs: number; actions: number; lastSeen: Date | null; isTest: boolean }>();
        for (const s of fSessions) {
            const row = byUser.get(s.uid) || { uid: s.uid, name: s.name || s.email || s.uid, sessions: 0, activeMs: 0, idleMs: 0, actions: 0, lastSeen: null as Date | null, isTest: !!s.isTestAccount };
            row.sessions += 1;
            row.activeMs += s.activeMs || 0;
            row.idleMs += s.idleMs || 0;
            const seen = toDate(s.lastSeenAt);
            if (seen && (!row.lastSeen || seen > row.lastSeen)) row.lastSeen = seen;
            byUser.set(s.uid, row);
        }
        for (const e of fEvents) {
            const row = byUser.get(e.uid);
            if (row) row.actions += 1;
        }
        return [...byUser.values()].sort((a, b) => b.activeMs - a.activeMs);
    }, [fSessions, fEvents]);

    const isLoading = sessionsRaw === undefined || eventsRaw === undefined;
    const isEmpty = !isLoading && sessions.length === 0 && events.length === 0;

    const handleExportPdf = async () => {
        setExporting(true);
        try {
            const [{ pdf }, { ActivityReportPDF }] = await Promise.all([
                import('@react-pdf/renderer'),
                import('@/components/activity-report-pdf'),
            ]);
            const blob = await pdf(
                <ActivityReportPDF
                    generatedAt={new Date()}
                    rangeLabel={RANGE_PRESETS.find(r => r.key === rangeKey)!.label}
                    personLabel={personFilter === 'all' ? 'Everyone' : (people.find(p => p.uid === personFilter)?.name ?? personFilter)}
                    includeTest={includeTest}
                    kpis={kpis}
                    perUser={perUser.map(u => ({
                        name: u.name, sessions: u.sessions,
                        activeH: hrs(u.activeMs), idleH: hrs(u.idleMs),
                        actions: u.actions,
                        lastSeen: u.lastSeen ? format(u.lastSeen, 'dd MMM yyyy HH:mm') : '—',
                        isTest: u.isTest,
                    }))}
                    events={fEvents.slice(0, 250).map(e => ({
                        ts: toDate(e.ts) ? format(toDate(e.ts)!, 'dd MMM HH:mm:ss') : '—',
                        name: e.name || e.uid,
                        type: e.type,
                        label: e.label,
                        path: e.path,
                    }))}
                    totalEvents={fEvents.length}
                />,
            ).toBlob();
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `usage-report-${format(new Date(), 'yyyy-MM-dd')}.pdf`;
            a.click();
            URL.revokeObjectURL(url);
        } finally {
            setExporting(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Filter bar */}
            <Card className="rounded-2xl border-2">
                <CardContent className="flex flex-wrap items-center gap-3 pt-6">
                    <Select value={rangeKey} onValueChange={(v) => setRangeKey(v as any)}>
                        <SelectTrigger className="w-40 h-10 rounded-xl border-2 font-bold"><SelectValue /></SelectTrigger>
                        <SelectContent>
                            {RANGE_PRESETS.map(r => <SelectItem key={r.key} value={r.key}>{r.label}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Select value={personFilter} onValueChange={setPersonFilter}>
                        <SelectTrigger className="w-52 h-10 rounded-xl border-2 font-bold"><SelectValue placeholder="Everyone" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">Everyone</SelectItem>
                            {people.map(p => <SelectItem key={p.uid} value={p.uid}>{p.name}</SelectItem>)}
                        </SelectContent>
                    </Select>
                    <Select value={typeFilter} onValueChange={setTypeFilter}>
                        <SelectTrigger className="w-40 h-10 rounded-xl border-2 font-bold"><SelectValue placeholder="All events" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All events</SelectItem>
                            <SelectItem value="click">Clicks</SelectItem>
                            <SelectItem value="nav">Page views</SelectItem>
                            <SelectItem value="dwell">Time on page</SelectItem>
                            <SelectItem value="input">Field activity</SelectItem>
                            <SelectItem value="action">Actions</SelectItem>
                            <SelectItem value="visibility">Focus / visibility</SelectItem>
                            <SelectItem value="error">Errors</SelectItem>
                        </SelectContent>
                    </Select>
                    <Input
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search actions, labels, pages…"
                        className="w-64 h-10 rounded-xl border-2"
                    />
                    <label className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-500">
                        <Switch checked={includeTest} onCheckedChange={setIncludeTest} />
                        Include test accounts
                    </label>
                    <div className="flex-1" />
                    <Button onClick={handleExportPdf} disabled={exporting || isLoading} className="h-10 rounded-xl font-black uppercase text-[10px] tracking-widest">
                        {exporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                        Export PDF
                    </Button>
                </CardContent>
            </Card>

            {isLoading ? (
                <div className="flex items-center justify-center py-24 text-slate-300">
                    <Loader2 className="h-8 w-8 animate-spin" />
                </div>
            ) : isEmpty ? (
                <Card className="rounded-2xl border-2 border-dashed">
                    <CardContent className="py-16 text-center space-y-2">
                        <Activity className="h-10 w-10 mx-auto text-slate-200" />
                        <p className="font-black uppercase tracking-widest text-slate-400 text-sm">No activity captured yet</p>
                        <p className="text-xs text-slate-400">Telemetry starts recording the moment this release is live — sessions and clicks will appear here as the team uses the system.</p>
                    </CardContent>
                </Card>
            ) : (
                <>
                    {/* KPI tiles */}
                    <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
                        {[
                            { icon: Users, label: 'Active users', value: kpis.users },
                            { icon: Activity, label: 'Sessions', value: kpis.sessions },
                            { icon: Timer, label: 'Active hours', value: kpis.activeH },
                            { icon: Timer, label: 'Idle hours (tab open)', value: kpis.idleH },
                            { icon: MousePointerClick, label: 'Events captured', value: kpis.actions.toLocaleString() },
                            { icon: AlertTriangle, label: 'Errors seen', value: kpis.errors.toLocaleString() },
                        ].map(({ icon: Icon, label, value }) => (
                            <Card key={label} className="rounded-2xl border-2">
                                <CardContent className="pt-6 pb-5">
                                    <Icon className="h-4 w-4 text-primary mb-2" />
                                    <div className="text-3xl font-black tracking-tighter text-slate-900">{value}</div>
                                    <div className="text-[9px] font-black uppercase tracking-widest text-slate-400 mt-1">{label}</div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>

                    {/* Daily active vs idle */}
                    <Card className="rounded-2xl border-2">
                        <CardHeader><CardTitle className="text-xs font-black uppercase tracking-widest">Daily activity — active vs idle hours</CardTitle></CardHeader>
                        <CardContent className="h-64">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={daily}>
                                    <XAxis dataKey="day" fontSize={10} />
                                    <YAxis fontSize={10} />
                                    <Tooltip />
                                    <Legend />
                                    <Bar dataKey="active" name="Active (h)" stackId="a" fill="hsl(var(--primary))" radius={[0, 0, 0, 0]} />
                                    <Bar dataKey="idle" name="Idle, tab open (h)" stackId="a" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </CardContent>
                    </Card>

                    {/* Per-user leaderboard */}
                    <Card className="rounded-2xl border-2">
                        <CardHeader><CardTitle className="text-xs font-black uppercase tracking-widest">Who actually uses it</CardTitle></CardHeader>
                        <CardContent>
                            <div className="overflow-auto max-h-[50vh] rounded-xl border">
                                <table className="w-full text-xs">
                                    <thead className="bg-slate-50 border-b-2 sticky top-0 z-10">
                                        <tr className="text-left">
                                            <th className="p-3 font-black uppercase tracking-widest text-[9px]">Person</th>
                                            <th className="p-3 font-black uppercase tracking-widest text-[9px] text-right">Sessions</th>
                                            <th className="p-3 font-black uppercase tracking-widest text-[9px] text-right">Active</th>
                                            <th className="p-3 font-black uppercase tracking-widest text-[9px] text-right">Idle (tab open)</th>
                                            <th className="p-3 font-black uppercase tracking-widest text-[9px] text-right">Actions</th>
                                            <th className="p-3 font-black uppercase tracking-widest text-[9px]">Last seen</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {perUser.map(u => (
                                            <tr key={u.uid} className="border-b hover:bg-slate-50/60 cursor-pointer" onClick={() => setPersonFilter(u.uid)}>
                                                <td className="p-3 font-bold">{u.name}{u.isTest && <Badge variant="outline" className="ml-2 text-[8px]">TEST</Badge>}</td>
                                                <td className="p-3 text-right font-bold">{u.sessions}</td>
                                                <td className="p-3 text-right font-black text-emerald-700">{hrs(u.activeMs)}h</td>
                                                <td className="p-3 text-right text-slate-400">{hrs(u.idleMs)}h</td>
                                                <td className="p-3 text-right font-bold">{u.actions.toLocaleString()}</td>
                                                <td className="p-3 text-slate-500">{u.lastSeen ? format(u.lastSeen, 'dd MMM yyyy HH:mm') : '—'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Top pages — where the time actually goes */}
                    <div className="grid lg:grid-cols-2 gap-6">
                        <Card className="rounded-2xl border-2">
                            <CardHeader><CardTitle className="text-xs font-black uppercase tracking-widest">Top pages <span className="text-slate-400 normal-case font-bold">— views &amp; time on page</span></CardTitle></CardHeader>
                            <CardContent>
                                <div className="space-y-2">
                                    {topPages.length === 0 && <p className="text-xs text-slate-400">No page-view data in this range yet.</p>}
                                    {topPages.map(p => {
                                        const maxMs = topPages[0] ? Math.max(topPages[0].ms, 1) : 1;
                                        return (
                                            <div key={p.path} className="flex items-center gap-3">
                                                <div className="w-52 truncate text-xs font-bold" title={p.path}>{p.path}</div>
                                                <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                                                    <div className="h-full bg-primary/70 rounded-full" style={{ width: `${Math.max(3, Math.round((p.ms / maxMs) * 100))}%` }} />
                                                </div>
                                                <div className="w-28 text-right text-[10px] font-black text-slate-500 whitespace-nowrap">
                                                    {p.views} view{p.views === 1 ? '' : 's'} · {Math.round(p.ms / 60000)}m
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </CardContent>
                        </Card>

                        {/* Coverage — what each person has and has NOT touched */}
                        <Card className="rounded-2xl border-2">
                            <CardHeader><CardTitle className="text-xs font-black uppercase tracking-widest">Coverage <span className="text-slate-400 normal-case font-bold">— what each person has and hasn't touched</span></CardTitle></CardHeader>
                            <CardContent>
                                <div className="overflow-x-auto rounded-xl border">
                                    <table className="w-full text-xs">
                                        <thead className="bg-slate-50 border-b-2">
                                            <tr className="text-left">
                                                <th className="p-2 font-black uppercase tracking-widest text-[8px]">Person</th>
                                                {AREAS.map(a => (
                                                    <th key={a.label} className="p-2 font-black uppercase tracking-widest text-[8px] text-center whitespace-nowrap">{a.label}</th>
                                                ))}
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {coverage.map(row => (
                                                <tr key={row.uid} className="border-b">
                                                    <td className="p-2 font-bold whitespace-nowrap">{row.name}</td>
                                                    {row.counts.map((c, i) => (
                                                        <td key={i} className="p-2 text-center">
                                                            {c > 0
                                                                ? <span className="inline-block min-w-8 px-1.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-black text-[10px]">{c}</span>
                                                                : <span className="inline-block min-w-8 px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-500 font-black text-[10px]" title="Never touched in this range">—</span>}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                            {coverage.length === 0 && (
                                                <tr><td className="p-3 text-slate-400" colSpan={AREAS.length + 1}>No events in this range.</td></tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                                <p className="text-[10px] text-slate-400 mt-2">A red dash is the receipt: that area was never opened in the selected range.</p>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Session drill-down — full traceability per sitting */}
                    <Card className="rounded-2xl border-2">
                        <CardHeader>
                            <CardTitle className="text-xs font-black uppercase tracking-widest">
                                Sessions <span className="text-slate-400 normal-case font-bold">— click one for its full trace, second by second</span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="overflow-auto max-h-[60vh] rounded-xl border">
                                <table className="w-full text-xs">
                                    <thead className="bg-slate-50 border-b-2 sticky top-0 z-10">
                                        <tr className="text-left">
                                            <th className="p-2.5 w-6"></th>
                                            <th className="p-2.5 font-black uppercase tracking-widest text-[9px]">Person</th>
                                            <th className="p-2.5 font-black uppercase tracking-widest text-[9px]">Started</th>
                                            <th className="p-2.5 font-black uppercase tracking-widest text-[9px] text-right">Length</th>
                                            <th className="p-2.5 font-black uppercase tracking-widest text-[9px] text-right">Active</th>
                                            <th className="p-2.5 font-black uppercase tracking-widest text-[9px] text-right">Idle</th>
                                            <th className="p-2.5 font-black uppercase tracking-widest text-[9px] text-right">Events</th>
                                            <th className="p-2.5 font-black uppercase tracking-widest text-[9px]">Device</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {sessionRows.map(s => (
                                            <React.Fragment key={s.id}>
                                                <tr className="border-b hover:bg-slate-50/60 cursor-pointer" onClick={() => setOpenSessionId(openSessionId === s.id ? null : s.id)}>
                                                    <td className="p-2.5"><ChevronRight className={cn('h-3.5 w-3.5 text-slate-400 transition-transform', openSessionId === s.id && 'rotate-90')} /></td>
                                                    <td className="p-2.5 font-bold whitespace-nowrap">{s.name || s.email}{s.isTestAccount && <Badge variant="outline" className="ml-2 text-[8px]">TEST</Badge>}</td>
                                                    <td className="p-2.5 whitespace-nowrap text-slate-500">{s.started ? format(s.started, 'dd MMM yyyy HH:mm:ss') : '—'}</td>
                                                    <td className="p-2.5 text-right font-bold whitespace-nowrap">{s.durMin}m</td>
                                                    <td className="p-2.5 text-right font-black text-emerald-700 whitespace-nowrap">{Math.round((s.activeMs || 0) / 60000)}m</td>
                                                    <td className="p-2.5 text-right text-slate-400 whitespace-nowrap">{Math.round((s.idleMs || 0) / 60000)}m</td>
                                                    <td className="p-2.5 text-right font-bold">{s.trace.length}</td>
                                                    <td className="p-2.5 text-slate-400 max-w-56 truncate" title={s.userAgent}>{s.userAgent?.replace(/^Mozilla\/5\.0\s*/, '').slice(0, 60)}</td>
                                                </tr>
                                                {openSessionId === s.id && (
                                                    <tr className="border-b bg-slate-50/40">
                                                        <td colSpan={8} className="p-3">
                                                            {s.trace.length === 0 ? (
                                                                <p className="text-[11px] text-slate-400">No events recorded inside this session (it may predate event capture, or the range clipped them).</p>
                                                            ) : (
                                                                <div className="max-h-72 overflow-auto space-y-1 pr-2">
                                                                    {s.trace.map((e: any, i: number) => {
                                                                        const d = toDate(e.ts);
                                                                        return (
                                                                            <div key={e.id ?? i} className="flex items-start gap-2 text-[11px]">
                                                                                <span className="text-slate-400 whitespace-nowrap tabular-nums">{d ? format(d, 'HH:mm:ss') : '—'}</span>
                                                                                <Badge variant="outline" className="text-[8px] uppercase shrink-0">{e.type}</Badge>
                                                                                <span className="font-bold break-all">{e.label}</span>
                                                                                <span className="text-slate-400 whitespace-nowrap ml-auto">{e.path}</span>
                                                                            </div>
                                                                        );
                                                                    })}
                                                                </div>
                                                            )}
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Event explorer */}
                    <Card className="rounded-2xl border-2">
                        <CardHeader>
                            <CardTitle className="text-xs font-black uppercase tracking-widest">
                                Event explorer <span className="text-slate-400 normal-case font-bold">— every click, field, page view, error and action ({fEvents.length.toLocaleString()} in view)</span>
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="overflow-auto max-h-[60vh] rounded-xl border">
                                <table className="w-full text-xs">
                                    <thead className="bg-slate-50 border-b-2 sticky top-0 z-10">
                                        <tr className="text-left">
                                            <th className="p-2.5 font-black uppercase tracking-widest text-[9px]">When</th>
                                            <th className="p-2.5 font-black uppercase tracking-widest text-[9px]">Who</th>
                                            <th className="p-2.5 font-black uppercase tracking-widest text-[9px]">Type</th>
                                            <th className="p-2.5 font-black uppercase tracking-widest text-[9px]">What</th>
                                            <th className="p-2.5 font-black uppercase tracking-widest text-[9px]">Where</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {fEvents.slice(0, 500).map((e, i) => {
                                            const d = toDate(e.ts);
                                            return (
                                                <tr key={e.id ?? i} className="border-b hover:bg-slate-50/60">
                                                    <td className="p-2.5 whitespace-nowrap text-slate-500">{d ? format(d, 'dd MMM HH:mm:ss') : '—'}</td>
                                                    <td className="p-2.5 font-bold whitespace-nowrap">{e.name || e.uid}</td>
                                                    <td className="p-2.5"><Badge variant="outline" className="text-[8px] uppercase">{e.type}</Badge></td>
                                                    <td className="p-2.5">{e.label}</td>
                                                    <td className="p-2.5 text-slate-400">{e.path}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                            {fEvents.length > 500 && (
                                <p className="text-[10px] text-slate-400 mt-2">Showing the latest 500 — narrow the filters or search to drill further. The PDF export carries the first 250 of the current view.</p>
                            )}
                        </CardContent>
                    </Card>
                </>
            )}
        </div>
    );
}
