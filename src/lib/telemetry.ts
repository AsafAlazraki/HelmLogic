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

/**
 * v1.33 extreme-monitoring event kinds:
 *   nav        — route landed (every page open + SPA change)
 *   dwell      — route left: how long it was open + max scroll depth
 *   click      — EVERY click (interactive elements get their label;
 *                anything else gets the nearest readable text)
 *   input      — a form field was focused or changed (field identifier
 *                only — values are NEVER captured)
 *   action     — explicit domain events via logAction()
 *   visibility — tab hidden / visible, window focus / blur
 *   error      — uncaught JS error or unhandled promise rejection
 */
type QueuedEvent = {
    type: 'nav' | 'click' | 'action' | 'input' | 'dwell' | 'visibility' | 'error';
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
    /** Dwell tracking: the route currently open + when it was landed +
     *  the deepest scroll position seen on it (0–100). */
    currentPath: string;
    pathEnteredAt: number;
    maxScrollPct: number;
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

/** Emit the dwell record for the route being left (time on page + max
 *  scroll depth), then reset tracking for the next route. */
function closeDwell() {
    if (!state?.started || !state.currentPath) return;
    const ms = Date.now() - state.pathEnteredAt;
    if (ms < 500) return; // sub-half-second bounces are noise
    const secs = Math.round(ms / 1000);
    state.queue.push({
        type: 'dwell',
        label: `${secs}s on page · scrolled ${state.maxScrollPct}%`,
        path: state.currentPath,
        meta: { ms, scrollPct: state.maxScrollPct },
        at: Date.now(),
    });
}

/** Public: log a route change. Called by the provider on pathname change. */
export function logNav(path: string) {
    if (!state?.started) return;
    if (path === state.currentPath) return;
    closeDwell();
    state.currentPath = path;
    state.pathEnteredAt = Date.now();
    state.maxScrollPct = 0;
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
        currentPath: '',
        pathEnteredAt: Date.now(),
        maxScrollPct: 0,
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
    // landing route here, at start, where state.started is guaranteed
    // (also seeds the dwell tracker for the landing route).
    logNav(window.location.pathname);

    // Input listeners mark activity (throttled by assignment cost only).
    const markInput = () => { if (state) state.lastInputAt = Date.now(); };
    for (const evt of ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const) {
        window.addEventListener(evt, markInput, { passive: true, capture: true });
        state.cleanups.push(() => window.removeEventListener(evt, markInput, { capture: true } as any));
    }

    // EVERY click is captured (v1.33 extreme monitoring). Interactive
    // elements report their own label; anything else reports the nearest
    // readable text so even dead-zone clicks leave a trace.
    const onClick = (ev: MouseEvent) => {
        const target = ev.target as HTMLElement | null;
        if (!target) return;
        const interactive = target.closest?.('button, a, [role="button"], [role="tab"], [role="menuitem"], [role="option"], [role="switch"], [role="checkbox"], select, summary, label');
        const el = (interactive || target) as HTMLElement;
        const raw = el.getAttribute?.('aria-label') || el.innerText || (el as HTMLInputElement).placeholder || el.tagName || 'click';
        const label = String(raw).replace(/\s+/g, ' ').trim().slice(0, MAX_LABEL) || el.tagName || 'click';
        enqueue('click', interactive ? label : `(page) ${label}`, null);
    };
    window.addEventListener('click', onClick, { capture: true });
    state.cleanups.push(() => window.removeEventListener('click', onClick, { capture: true } as any));

    // Field-level interaction (v1.33 extreme monitoring): which fields a
    // user focuses and changes — identified by label, NEVER by value.
    const fieldDesc = (el: HTMLElement): string => {
        const input = el as HTMLInputElement;
        return (el.getAttribute('aria-label') || input.placeholder || input.name || el.id
            || (el.closest('label')?.innerText) || el.tagName).replace(/\s+/g, ' ').trim().slice(0, 70);
    };
    const isField = (el: any): el is HTMLElement =>
        el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName) && (el as HTMLInputElement).type !== 'password';
    const onFocusIn = (ev: FocusEvent) => {
        if (isField(ev.target)) enqueue('input', `focused · ${fieldDesc(ev.target as HTMLElement)}`, null);
    };
    const onChange = (ev: Event) => {
        if (isField(ev.target)) enqueue('input', `changed · ${fieldDesc(ev.target as HTMLElement)}`, null);
    };
    window.addEventListener('focusin', onFocusIn, { capture: true });
    window.addEventListener('change', onChange, { capture: true });
    state.cleanups.push(() => window.removeEventListener('focusin', onFocusIn, { capture: true } as any));
    state.cleanups.push(() => window.removeEventListener('change', onChange, { capture: true } as any));

    // Tab visibility + window focus (v1.33): "had it open but was on
    // another window" is visible in the trace, not just inferred.
    const onVisibility = () => enqueue('visibility', document.visibilityState === 'visible' ? 'Tab visible' : 'Tab hidden', null);
    const onFocus = () => enqueue('visibility', 'Window focused', null);
    const onBlur = () => enqueue('visibility', 'Window blurred', null);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('focus', onFocus);
    window.addEventListener('blur', onBlur);
    state.cleanups.push(() => document.removeEventListener('visibilitychange', onVisibility));
    state.cleanups.push(() => window.removeEventListener('focus', onFocus));
    state.cleanups.push(() => window.removeEventListener('blur', onBlur));

    // Uncaught errors (v1.33): full traceability includes what broke in
    // front of the user. Message only — never breaks the app itself.
    const onError = (ev: ErrorEvent) => {
        try { enqueue('error', String(ev.message || 'Script error').slice(0, MAX_LABEL), { source: ev.filename ? `${ev.filename}:${ev.lineno}` : null }); } catch { /* noop */ }
    };
    const onRejection = (ev: PromiseRejectionEvent) => {
        try { enqueue('error', `Unhandled rejection: ${String((ev.reason && (ev.reason.message || ev.reason)) || 'unknown')}`.slice(0, MAX_LABEL), null); } catch { /* noop */ }
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    state.cleanups.push(() => window.removeEventListener('error', onError));
    state.cleanups.push(() => window.removeEventListener('unhandledrejection', onRejection));

    // Scroll depth per route (feeds the dwell record).
    const onScroll = () => {
        if (!state) return;
        const doc = document.documentElement;
        const denom = doc.scrollHeight - window.innerHeight;
        const pct = denom > 0 ? Math.min(100, Math.round((window.scrollY / denom) * 100)) : 100;
        if (pct > state.maxScrollPct) state.maxScrollPct = pct;
    };
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    state.cleanups.push(() => window.removeEventListener('scroll', onScroll, { capture: true } as any));

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

    // Best-effort close-out on tab exit (dwell for the final route too).
    const onHide = () => { closeDwell(); void flushEvents(); void heartbeat(true); };
    window.addEventListener('pagehide', onHide);
    state.cleanups.push(() => window.removeEventListener('pagehide', onHide));

    return stopTelemetry;
}

export function stopTelemetry() {
    if (!state) return;
    for (const t of state.timers) clearInterval(t);
    for (const c of state.cleanups) { try { c(); } catch { /* noop */ } }
    closeDwell();
    void flushEvents();
    void heartbeat(true);
    state.started = false;
    state = null;
}
