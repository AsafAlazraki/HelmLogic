/**
 * v1.33 (Epic 14 — Usage Reporting) — client telemetry engine.
 *
 * Captures, per signed-in user:
 *   - SESSIONS: one doc per app-open at
 *     organisations/{orgId}/activitySessions/{sessionId} with startedAt /
 *     lastSeenAt / activeMs / idleMs / userAgent. "Active" means the tab is
 *     visible AND there was pointer/keyboard/scroll input within the last
 *     ACTIVE_WINDOW_MS; visible-but-silent time accrues as idleMs; hidden
 *     tabs accrue neither (the session just stays open).
 *   - EVENTS: batched rows at organisations/{orgId}/activityEvents/{id} —
 *     'nav' (route changes), 'click' (labeled interactive elements) and
 *     'action' (domain events logged explicitly via logAction()).
 *
 * Test accounts (the shared billh test login) are stamped isTestAccount so
 * every report can include/exclude them; when the dedicated test login
 * changes, update TEST_ACCOUNT_EMAILS here — history keeps its stamps.
 *
 * Write budget: one session update per HEARTBEAT_MS + one batch per
 * FLUSH_MS when events exist (≤ MAX_BATCH rows each). Everything is
 * fire-and-forget: telemetry must never break the app (all writes are
 * caught and dropped on failure).
 */
'use client';

import { collection, doc, serverTimestamp, setDoc, updateDoc, writeBatch, increment, type Firestore } from 'firebase/firestore';

export const TEST_ACCOUNT_EMAILS = ['billh@nsmarine.com.au'];

const ACTIVE_WINDOW_MS = 60_000;   // input within this window = active
const TICK_MS = 15_000;            // active/idle accrual granularity
const HEARTBEAT_MS = 60_000;       // session doc update cadence
const FLUSH_MS = 15_000;           // event batch cadence
const MAX_BATCH = 40;
const MAX_LABEL = 90;

type QueuedEvent = {
    type: 'nav' | 'click' | 'action';
    label: string;
    path: string;
    meta?: Record<string, unknown> | null;
    at: number; // Date.now() at capture — server ts is approximated per batch
};

type TelemetryState = {
    firestore: Firestore;
    orgId: string;
    uid: string;
    name: string;
    email: string;
    sessionId: string;
    isTest: boolean;
    queue: QueuedEvent[];
    lastInputAt: number;
    activeMsPending: number;
    idleMsPending: number;
    timers: ReturnType<typeof setInterval>[];
    cleanups: Array<() => void>;
    started: boolean;
};

let state: TelemetryState | null = null;

function sessionRef() {
    if (!state) return null;
    return doc(state.firestore, `organisations/${state.orgId}/activitySessions/${state.sessionId}`);
}

/** Public: log a domain action ("Quote finalized", "PDF downloaded", …). */
export function logAction(label: string, meta?: Record<string, unknown>) {
    enqueue('action', label, meta ?? null);
}

/** Public: log a route change. Called by the provider on pathname change. */
export function logNav(path: string) {
    enqueue('nav', path, null);
}

function enqueue(type: QueuedEvent['type'], label: string, meta: Record<string, unknown> | null) {
    if (!state?.started) return;
    state.queue.push({
        type,
        label: String(label).slice(0, MAX_LABEL),
        path: typeof window !== 'undefined' ? window.location.pathname : '',
        meta,
        at: Date.now(),
    });
    if (state.queue.length >= MAX_BATCH) void flushEvents();
}

async function flushEvents() {
    if (!state || state.queue.length === 0) return;
    const events = state.queue.splice(0, MAX_BATCH);
    try {
        const batch = writeBatch(state.firestore);
        const coll = collection(state.firestore, `organisations/${state.orgId}/activityEvents`);
        for (const e of events) {
            batch.set(doc(coll), {
                ts: new Date(e.at),
                uid: state.uid,
                name: state.name,
                sessionId: state.sessionId,
                type: e.type,
                label: e.label,
                path: e.path,
                meta: e.meta ?? null,
                isTestAccount: state.isTest,
            });
        }
        await batch.commit();
    } catch {
        /* telemetry never breaks the app; dropped on failure */
    }
}

async function heartbeat(ending = false) {
    const ref = sessionRef();
    if (!state || !ref) return;
    const activeMs = state.activeMsPending;
    const idleMs = state.idleMsPending;
    state.activeMsPending = 0;
    state.idleMsPending = 0;
    try {
        await updateDoc(ref, {
            lastSeenAt: serverTimestamp(),
            activeMs: increment(activeMs),
            idleMs: increment(idleMs),
            ...(ending ? { endedAt: serverTimestamp() } : {}),
        });
    } catch {
        state.activeMsPending += activeMs; // retry on next beat
        state.idleMsPending += idleMs;
    }
}

/** Start capture. Idempotent per (uid, orgId); returns a stop function. */
export function startTelemetry(opts: {
    firestore: Firestore;
    orgId: string;
    uid: string;
    name: string;
    email: string;
}): () => void {
    if (typeof window === 'undefined') return () => {};
    if (state?.started && state.uid === opts.uid && state.orgId === opts.orgId) {
        return stopTelemetry;
    }
    stopTelemetry();

    const sessionId = doc(collection(opts.firestore, '_')).id;
    state = {
        firestore: opts.firestore,
        orgId: opts.orgId,
        uid: opts.uid,
        name: opts.name,
        email: opts.email,
        sessionId,
        isTest: TEST_ACCOUNT_EMAILS.includes((opts.email || '').toLowerCase()),
        queue: [],
        lastInputAt: Date.now(),
        activeMsPending: 0,
        idleMsPending: 0,
        timers: [],
        cleanups: [],
        started: true,
    };

    // Session doc (fire-and-forget create).
    void setDoc(doc(opts.firestore, `organisations/${opts.orgId}/activitySessions/${sessionId}`), {
        uid: opts.uid,
        name: opts.name,
        email: opts.email,
        isTestAccount: state.isTest,
        startedAt: serverTimestamp(),
        lastSeenAt: serverTimestamp(),
        activeMs: 0,
        idleMs: 0,
        userAgent: navigator.userAgent.slice(0, 180),
        path: window.location.pathname,
    }).catch(() => {});

    // The provider's logNav(pathname) fires on mount BEFORE the org resolves
    // and telemetry starts, so enqueue drops it — on a fresh page load the
    // landing nav would never be captured (a user who opens the app and
    // reads without clicking would look like zero activity). Capture the
    // landing route here, at start, where state.started is guaranteed.
    enqueue('nav', window.location.pathname, null);

    // Input listeners mark activity (throttled by assignment cost only).
    const markInput = () => { if (state) state.lastInputAt = Date.now(); };
    for (const evt of ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const) {
        window.addEventListener(evt, markInput, { passive: true, capture: true });
        state.cleanups.push(() => window.removeEventListener(evt, markInput, { capture: true } as any));
    }

    // Labeled click capture on interactive elements.
    const onClick = (ev: MouseEvent) => {
        const el = (ev.target as HTMLElement)?.closest?.('button, a, [role="button"], [role="tab"], select');
        if (!el) return;
        const label = (el.getAttribute('aria-label') || (el as HTMLElement).innerText || el.tagName)
            .replace(/\s+/g, ' ').trim().slice(0, MAX_LABEL);
        if (label) enqueue('click', label, null);
    };
    window.addEventListener('click', onClick, { capture: true });
    state.cleanups.push(() => window.removeEventListener('click', onClick, { capture: true } as any));

    // Active/idle accrual tick.
    state.timers.push(setInterval(() => {
        if (!state) return;
        if (document.visibilityState !== 'visible') return; // hidden: accrue nothing
        const activeRecently = Date.now() - state.lastInputAt <= ACTIVE_WINDOW_MS;
        if (activeRecently) state.activeMsPending += TICK_MS;
        else state.idleMsPending += TICK_MS;
    }, TICK_MS));

    state.timers.push(setInterval(() => { void heartbeat(); }, HEARTBEAT_MS));
    state.timers.push(setInterval(() => { void flushEvents(); }, FLUSH_MS));

    // Best-effort close-out on tab exit.
    const onHide = () => { void flushEvents(); void heartbeat(true); };
    window.addEventListener('pagehide', onHide);
    state.cleanups.push(() => window.removeEventListener('pagehide', onHide));

    return stopTelemetry;
}

export function stopTelemetry() {
    if (!state) return;
    for (const t of state.timers) clearInterval(t);
    for (const c of state.cleanups) { try { c(); } catch { /* noop */ } }
    void flushEvents();
    void heartbeat(true);
    state.started = false;
    state = null;
}
