'use client';

/**
 * v1.33 (Epic 14) — the Usage Report PDF. Renders the CURRENT filtered
 * view of the Usage & Activity workspace: filter header, KPI row, the
 * who-actually-uses-it table, and the event feed (capped at 250 rows —
 * the full stream stays queryable in the app). Same visual language as
 * the customer proposal PDFs (deep navy + gold rule).
 */
import { Document, Page, Text, View, StyleSheet } from '@react-pdf/renderer';

const NAVY = '#0b1f3a';
const GOLD = '#c9a24b';
const SLATE = '#334155';
const MUTED = '#94a3b8';

const S = StyleSheet.create({
    page: { padding: 40, fontSize: 9, color: SLATE, fontFamily: 'Helvetica' },
    h1: { fontSize: 20, fontWeight: 'bold', color: NAVY, textTransform: 'uppercase', letterSpacing: -0.4 },
    rule: { height: 3, width: 64, backgroundColor: GOLD, marginTop: 6, marginBottom: 14 },
    metaRow: { flexDirection: 'row', gap: 14, marginBottom: 16 },
    metaLabel: { fontSize: 6.5, color: MUTED, textTransform: 'uppercase', letterSpacing: 1.5 },
    metaValue: { fontSize: 9, fontWeight: 'bold', color: NAVY, marginTop: 2 },
    kpiRow: { flexDirection: 'row', gap: 10, marginBottom: 18 },
    kpi: { flex: 1, border: `1 solid #e2e8f0`, borderRadius: 6, padding: 10 },
    kpiValue: { fontSize: 16, fontWeight: 'bold', color: NAVY },
    kpiLabel: { fontSize: 6, color: MUTED, textTransform: 'uppercase', letterSpacing: 1, marginTop: 3 },
    sectionTitle: { fontSize: 11, fontWeight: 'bold', color: NAVY, textTransform: 'uppercase', borderBottom: `2 solid ${NAVY}`, paddingBottom: 4, marginBottom: 8, marginTop: 6 },
    th: { fontSize: 6.5, fontWeight: 'bold', color: '#fff', textTransform: 'uppercase', letterSpacing: 0.8 },
    theadRow: { flexDirection: 'row', backgroundColor: NAVY, padding: 5, borderRadius: 2 },
    row: { flexDirection: 'row', paddingVertical: 3.5, paddingHorizontal: 5, borderBottom: '0.5 solid #e2e8f0' },
    cell: { fontSize: 7.5 },
    foot: { position: 'absolute', bottom: 22, left: 40, right: 40, flexDirection: 'row', justifyContent: 'space-between', fontSize: 6.5, color: MUTED },
});

export function ActivityReportPDF(props: {
    generatedAt: Date;
    rangeLabel: string;
    personLabel: string;
    includeTest: boolean;
    kpis: { users: number; sessions: number; activeH: number; idleH: number; actions: number };
    perUser: Array<{ name: string; sessions: number; activeH: number; idleH: number; actions: number; lastSeen: string; isTest: boolean }>;
    events: Array<{ ts: string; name: string; type: string; label: string; path: string }>;
    totalEvents: number;
}) {
    const { kpis } = props;
    return (
        <Document title="HelmLogic Usage Report" author="HelmLogic">
            <Page size="A4" style={S.page}>
                <Text style={S.h1}>Usage & Activity Report</Text>
                <View style={S.rule} />
                <View style={S.metaRow}>
                    <View><Text style={S.metaLabel}>Period</Text><Text style={S.metaValue}>{props.rangeLabel}</Text></View>
                    <View><Text style={S.metaLabel}>People</Text><Text style={S.metaValue}>{props.personLabel}</Text></View>
                    <View><Text style={S.metaLabel}>Test accounts</Text><Text style={S.metaValue}>{props.includeTest ? 'Included' : 'Excluded'}</Text></View>
                    <View><Text style={S.metaLabel}>Generated</Text><Text style={S.metaValue}>{props.generatedAt.toLocaleString('en-AU')}</Text></View>
                </View>

                <View style={S.kpiRow}>
                    {[
                        [String(kpis.users), 'Active users'],
                        [String(kpis.sessions), 'Sessions'],
                        [`${kpis.activeH}h`, 'Active time'],
                        [`${kpis.idleH}h`, 'Idle, tab open'],
                        [kpis.actions.toLocaleString(), 'Actions captured'],
                    ].map(([v, l]) => (
                        <View key={l} style={S.kpi}><Text style={S.kpiValue}>{v}</Text><Text style={S.kpiLabel}>{l}</Text></View>
                    ))}
                </View>

                <Text style={S.sectionTitle}>Per person</Text>
                <View style={S.theadRow}>
                    <Text style={[S.th, { flex: 2.4 }]}>Person</Text>
                    <Text style={[S.th, { flex: 0.9, textAlign: 'right' }]}>Sessions</Text>
                    <Text style={[S.th, { flex: 0.9, textAlign: 'right' }]}>Active</Text>
                    <Text style={[S.th, { flex: 1.1, textAlign: 'right' }]}>Idle (open)</Text>
                    <Text style={[S.th, { flex: 0.9, textAlign: 'right' }]}>Actions</Text>
                    <Text style={[S.th, { flex: 1.6, textAlign: 'right' }]}>Last seen</Text>
                </View>
                {props.perUser.map((u, i) => (
                    <View key={i} style={S.row} wrap={false}>
                        <Text style={[S.cell, { flex: 2.4, fontWeight: 'bold' }]}>{u.name}{u.isTest ? '  (TEST)' : ''}</Text>
                        <Text style={[S.cell, { flex: 0.9, textAlign: 'right' }]}>{u.sessions}</Text>
                        <Text style={[S.cell, { flex: 0.9, textAlign: 'right', fontWeight: 'bold' }]}>{u.activeH}h</Text>
                        <Text style={[S.cell, { flex: 1.1, textAlign: 'right', color: MUTED }]}>{u.idleH}h</Text>
                        <Text style={[S.cell, { flex: 0.9, textAlign: 'right' }]}>{u.actions.toLocaleString()}</Text>
                        <Text style={[S.cell, { flex: 1.6, textAlign: 'right', color: MUTED }]}>{u.lastSeen}</Text>
                    </View>
                ))}

                <Text style={S.sectionTitle} break>Event feed</Text>
                <Text style={{ fontSize: 7, color: MUTED, marginBottom: 6 }}>
                    First {props.events.length} of {props.totalEvents.toLocaleString()} events in the current view — the complete stream is filterable inside HelmLogic → Reporting → Usage & Activity.
                </Text>
                <View style={S.theadRow}>
                    <Text style={[S.th, { flex: 1.3 }]}>When</Text>
                    <Text style={[S.th, { flex: 1.4 }]}>Who</Text>
                    <Text style={[S.th, { flex: 0.7 }]}>Type</Text>
                    <Text style={[S.th, { flex: 3 }]}>What</Text>
                    <Text style={[S.th, { flex: 1.6 }]}>Where</Text>
                </View>
                {props.events.map((e, i) => (
                    <View key={i} style={S.row} wrap={false}>
                        <Text style={[S.cell, { flex: 1.3, color: MUTED }]}>{e.ts}</Text>
                        <Text style={[S.cell, { flex: 1.4, fontWeight: 'bold' }]}>{e.name}</Text>
                        <Text style={[S.cell, { flex: 0.7, textTransform: 'uppercase' }]}>{e.type}</Text>
                        <Text style={[S.cell, { flex: 3 }]}>{e.label}</Text>
                        <Text style={[S.cell, { flex: 1.6, color: MUTED }]}>{e.path}</Text>
                    </View>
                ))}

                <View style={S.foot} fixed>
                    <Text>HelmLogic — Usage & Activity Report</Text>
                    <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
                </View>
            </Page>
        </Document>
    );
}
