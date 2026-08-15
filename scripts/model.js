import {
    DEFAULT_TIMER_DURATION_MS,
    HISTORY_LIMIT,
    MAX_TIMER_DURATION_MS,
    MIN_TIMER_DURATION_MS,
    STATE_VERSION
} from "./constants.js";

export function createSession(now = Date.now(), id = "") {
    return {
        id: String(id || ""),
        title: "",
        createdAt: finiteTimestamp(now, Date.now()),
        running: false,
        activeActorId: null,
        segmentStartedAt: null,
        slotRemainingMs: null,
        entries: {}
    };
}

export function createState(now = Date.now(), sessionId = "") {
    return {
        version: STATE_VERSION,
        revision: 0,
        timerDurationMs: DEFAULT_TIMER_DURATION_MS,
        roster: [],
        session: createSession(now, sessionId),
        history: []
    };
}

export function normalizeState(rawState, now = Date.now()) {
    const raw = isObject(rawState) ? rawState : {};
    const timerDurationMs = normalizeTimerDuration(raw.timerDurationMs);
    const roster = normalizeRoster(raw.roster);
    const rosterIds = new Set(roster.map((participant) => participant.actorId));
    const rawSession = isObject(raw.session) ? raw.session : {};
    const entries = {};

    for (const [actorId, rawEntry] of Object.entries(rawSession.entries ?? {})) {
        const id = String(actorId || "").trim();
        if (!id || !isObject(rawEntry)) continue;
        entries[id] = normalizeEntry(rawEntry);
    }

    for (const participant of roster) {
        const entry = entries[participant.actorId] ?? normalizeEntry({});
        entry.name = participant.name || entry.name;
        entry.img = participant.img || entry.img;
        entries[participant.actorId] = entry;
    }

    const candidateActiveId = stringOrNull(rawSession.activeActorId);
    const activeActorId = candidateActiveId && rosterIds.has(candidateActiveId)
        ? candidateActiveId
        : null;
    let segmentStartedAt = finiteTimestampOrNull(rawSession.segmentStartedAt);
    const hasStoredRemaining = rawSession.slotRemainingMs !== null
        && rawSession.slotRemainingMs !== undefined
        && rawSession.slotRemainingMs !== "";
    const migratingLegacyTimer = raw.version !== STATE_VERSION
        && rawSession.running
        && activeActorId
        && segmentStartedAt !== null
        && !hasStoredRemaining;
    if (migratingLegacyTimer) {
        const entry = entries[activeActorId] ?? normalizeEntry({});
        entry.elapsedMs += Math.max(0, Number(now) - segmentStartedAt);
        entries[activeActorId] = entry;
        segmentStartedAt = finiteTimestamp(now, Date.now());
    }
    const slotRemainingMs = activeActorId
        ? Math.min(
            timerDurationMs,
            hasStoredRemaining ? nonNegativeNumber(rawSession.slotRemainingMs) : timerDurationMs
        )
        : null;
    const running = Boolean(
        rawSession.running
        && activeActorId
        && segmentStartedAt !== null
        && slotRemainingMs > 0
    );

    return {
        version: STATE_VERSION,
        revision: nonNegativeInteger(raw.revision),
        timerDurationMs,
        roster,
        session: {
            id: String(rawSession.id || ""),
            title: normalizeTitle(rawSession.title),
            createdAt: finiteTimestamp(rawSession.createdAt, now),
            running,
            activeActorId,
            segmentStartedAt: running ? segmentStartedAt : null,
            slotRemainingMs,
            entries
        },
        history: normalizeHistory(raw.history).slice(0, HISTORY_LIMIT)
    };
}

export function transition(rawState, action, now = Date.now()) {
    const state = normalizeState(rawState, now);
    const type = String(action?.type ?? "");
    const payload = action?.payload ?? {};

    switch (type) {
        case "SET_ROSTER":
            setRoster(state, payload.participants, now);
            break;
        case "SET_TITLE":
            state.session.title = normalizeTitle(payload.title);
            break;
        case "SET_TIMER_DURATION":
            setTimerDuration(state, payload.durationMs, now);
            break;
        case "FOCUS":
            focusActor(state, payload.actorId, now);
            break;
        case "START":
            start(state, now);
            break;
        case "PAUSE":
            commitRunningSegment(state, now);
            break;
        case "RESET_TIMER":
            resetTimer(state, now);
            break;
        case "EXPIRE":
            commitRunningSegment(state, now);
            break;
        case "NEXT":
            focusNext(state, now);
            break;
        case "MOVE":
            moveParticipant(state, payload.actorId, payload.direction);
            break;
        case "RESET":
            resetSession(state, now, payload.sessionId, {keepTitle: true});
            break;
        case "ARCHIVE":
            archiveSession(state, now, payload.sessionId);
            break;
        case "REMOVE_HISTORY":
            state.history = state.history.filter((item) => item.id !== String(payload.id ?? ""));
            break;
        default:
            return state;
    }

    state.revision += 1;
    return normalizeState(state, now);
}

export function getEntryElapsed(session, actorId, now = Date.now()) {
    const entry = session?.entries?.[actorId];
    let elapsed = nonNegativeNumber(entry?.elapsedMs);
    if (session?.running && session.activeActorId === actorId) {
        const startedAt = finiteTimestampOrNull(session.segmentStartedAt);
        const remaining = nonNegativeNumber(session.slotRemainingMs);
        if (startedAt !== null) elapsed += Math.min(remaining, Math.max(0, Number(now) - startedAt));
    }
    return Math.round(elapsed);
}

export function getTotalElapsed(session, now = Date.now()) {
    return Object.keys(session?.entries ?? {}).reduce(
        (total, actorId) => total + getEntryElapsed(session, actorId, now),
        0
    );
}

export function getTimerRemaining(rawState, now = Date.now()) {
    const session = rawState?.session ?? {};
    let remaining = nonNegativeNumber(session.slotRemainingMs);
    if (session.running) {
        const startedAt = finiteTimestampOrNull(session.segmentStartedAt);
        if (startedAt !== null) remaining -= Math.max(0, Number(now) - startedAt);
    }
    return Math.max(0, Math.round(remaining));
}

export function getSessionSnapshot(rawSession, now = Date.now()) {
    const syntheticRoster = Object.entries(rawSession?.entries ?? {}).map(([actorId, entry]) => ({
        actorId,
        name: entry?.name,
        img: entry?.img
    }));
    const syntheticDuration = Math.max(
        DEFAULT_TIMER_DURATION_MS,
        nonNegativeNumber(rawSession?.slotRemainingMs)
    );
    const session = normalizeState({
        timerDurationMs: syntheticDuration,
        roster: syntheticRoster,
        session: rawSession
    }, now).session;
    const entries = Object.entries(session.entries)
        .map(([actorId, entry]) => ({
            actorId,
            name: entry.name,
            img: entry.img,
            elapsedMs: getEntryElapsed(session, actorId, now),
            turns: entry.turns,
            lastFocusedAt: entry.lastFocusedAt
        }))
        .filter((entry) => entry.elapsedMs > 0 || entry.turns > 0);

    return {
        id: session.id,
        title: session.title,
        createdAt: session.createdAt,
        endedAt: finiteTimestamp(now, Date.now()),
        totalMs: entries.reduce((total, entry) => total + entry.elapsedMs, 0),
        entries
    };
}

export function formatDuration(milliseconds) {
    const totalSeconds = Math.max(0, Math.floor(nonNegativeNumber(milliseconds) / 1000));
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    if (hours > 0) return `${hours}:${pad(minutes)}:${pad(seconds)}`;
    return `${pad(minutes)}:${pad(seconds)}`;
}

function setRoster(state, rawParticipants, now) {
    if (state.session.running) commitRunningSegment(state, now);
    const roster = normalizeRoster(rawParticipants);
    const rosterIds = new Set(roster.map((participant) => participant.actorId));

    state.roster = roster;
    for (const participant of roster) {
        const entry = state.session.entries[participant.actorId] ?? normalizeEntry({});
        entry.name = participant.name || entry.name;
        entry.img = participant.img || entry.img;
        state.session.entries[participant.actorId] = entry;
    }

    if (state.session.activeActorId && !rosterIds.has(state.session.activeActorId)) {
        state.session.activeActorId = null;
        state.session.slotRemainingMs = null;
    }
}

function setTimerDuration(state, durationMs, now) {
    const oldDuration = state.timerDurationMs;
    const wasRunning = state.session.running;
    if (wasRunning) commitRunningSegment(state, now);

    const nextDuration = normalizeTimerDuration(durationMs);
    const usedInCurrentSlot = state.session.activeActorId
        ? Math.max(0, oldDuration - nonNegativeNumber(state.session.slotRemainingMs))
        : 0;
    state.timerDurationMs = nextDuration;

    if (!state.session.activeActorId) return;
    state.session.slotRemainingMs = Math.max(0, nextDuration - usedInCurrentSlot);
    if (wasRunning && state.session.slotRemainingMs > 0) {
        state.session.running = true;
        state.session.segmentStartedAt = finiteTimestamp(now, Date.now());
    }
}

function focusActor(state, actorId, now) {
    const id = String(actorId ?? "");
    if (!state.roster.some((participant) => participant.actorId === id)) return;
    if (state.session.running && state.session.activeActorId === id) return;

    if (state.session.running) commitRunningSegment(state, now);
    const participant = state.roster.find((item) => item.actorId === id);
    const entry = state.session.entries[id] ?? normalizeEntry(participant ?? {});
    entry.name = participant?.name || entry.name;
    entry.img = participant?.img || entry.img;
    entry.turns += 1;
    entry.lastFocusedAt = finiteTimestamp(now, Date.now());
    state.session.entries[id] = entry;
    state.session.activeActorId = id;
    state.session.running = true;
    state.session.segmentStartedAt = finiteTimestamp(now, Date.now());
    state.session.slotRemainingMs = state.timerDurationMs;
}

function start(state, now) {
    if (state.session.running) return;
    const id = state.session.activeActorId;
    if (!id || !state.roster.some((participant) => participant.actorId === id)) return;
    const entry = state.session.entries[id] ?? normalizeEntry({});
    if (entry.turns === 0 || nonNegativeNumber(state.session.slotRemainingMs) <= 0) {
        entry.turns += 1;
        entry.lastFocusedAt = finiteTimestamp(now, Date.now());
        state.session.entries[id] = entry;
    }
    if (nonNegativeNumber(state.session.slotRemainingMs) <= 0) {
        state.session.slotRemainingMs = state.timerDurationMs;
    }
    state.session.running = true;
    state.session.segmentStartedAt = finiteTimestamp(now, Date.now());
}

function resetTimer(state, now) {
    const actorId = state.session.activeActorId;
    if (!actorId) return;
    const wasRunning = state.session.running;
    if (wasRunning) commitRunningSegment(state, now);
    const entry = state.session.entries[actorId] ?? normalizeEntry({});
    entry.turns += 1;
    entry.lastFocusedAt = finiteTimestamp(now, Date.now());
    state.session.entries[actorId] = entry;
    state.session.slotRemainingMs = state.timerDurationMs;
    if (wasRunning) {
        state.session.running = true;
        state.session.segmentStartedAt = finiteTimestamp(now, Date.now());
    }
}

function focusNext(state, now) {
    if (!state.roster.length) return;
    const currentIndex = state.roster.findIndex(
        (participant) => participant.actorId === state.session.activeActorId
    );
    const nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % state.roster.length;
    focusActor(state, state.roster[nextIndex].actorId, now);
}

function commitRunningSegment(state, now) {
    if (!state.session.running) return;
    const actorId = state.session.activeActorId;
    const startedAt = finiteTimestampOrNull(state.session.segmentStartedAt);
    if (actorId && startedAt !== null) {
        const entry = state.session.entries[actorId] ?? normalizeEntry({});
        const remaining = nonNegativeNumber(state.session.slotRemainingMs);
        const elapsed = Math.min(remaining, Math.max(0, Number(now) - startedAt));
        entry.elapsedMs += elapsed;
        state.session.entries[actorId] = entry;
        state.session.slotRemainingMs = Math.max(0, remaining - elapsed);
    }
    state.session.running = false;
    state.session.segmentStartedAt = null;
}

function moveParticipant(state, actorId, direction) {
    const index = state.roster.findIndex((participant) => participant.actorId === String(actorId ?? ""));
    if (index < 0) return;
    const offset = String(direction) === "up" ? -1 : String(direction) === "down" ? 1 : 0;
    const nextIndex = index + offset;
    if (!offset || nextIndex < 0 || nextIndex >= state.roster.length) return;
    [state.roster[index], state.roster[nextIndex]] = [state.roster[nextIndex], state.roster[index]];
}

function resetSession(state, now, sessionId, {keepTitle = false} = {}) {
    const title = keepTitle ? state.session.title : "";
    state.session = createSession(now, sessionId);
    state.session.title = title;
    for (const participant of state.roster) {
        state.session.entries[participant.actorId] = normalizeEntry(participant);
    }
}

function archiveSession(state, now, sessionId) {
    const snapshot = getSessionSnapshot(state.session, now);
    if (snapshot.entries.length) {
        state.history = [snapshot, ...state.history.filter((item) => item.id !== snapshot.id)]
            .slice(0, HISTORY_LIMIT);
    }
    resetSession(state, now, sessionId);
}

function normalizeRoster(rawRoster) {
    const seen = new Set();
    const roster = [];
    for (const rawParticipant of Array.isArray(rawRoster) ? rawRoster : []) {
        const actorId = String(rawParticipant?.actorId ?? rawParticipant?.id ?? "").trim();
        if (!actorId || seen.has(actorId)) continue;
        seen.add(actorId);
        roster.push({
            actorId,
            name: normalizeName(rawParticipant?.name),
            img: normalizeImage(rawParticipant?.img)
        });
    }
    return roster;
}

function normalizeEntry(rawEntry) {
    return {
        name: normalizeName(rawEntry?.name),
        img: normalizeImage(rawEntry?.img),
        elapsedMs: nonNegativeNumber(rawEntry?.elapsedMs),
        turns: nonNegativeInteger(rawEntry?.turns),
        lastFocusedAt: finiteTimestampOrNull(rawEntry?.lastFocusedAt)
    };
}

function normalizeHistory(rawHistory) {
    const result = [];
    for (const rawItem of Array.isArray(rawHistory) ? rawHistory : []) {
        if (!isObject(rawItem)) continue;
        const entries = Array.isArray(rawItem.entries)
            ? rawItem.entries.map((entry) => ({
                actorId: String(entry?.actorId ?? ""),
                name: normalizeName(entry?.name),
                img: normalizeImage(entry?.img),
                elapsedMs: nonNegativeNumber(entry?.elapsedMs),
                turns: nonNegativeInteger(entry?.turns),
                lastFocusedAt: finiteTimestampOrNull(entry?.lastFocusedAt)
            })).filter((entry) => entry.actorId)
            : [];
        result.push({
            id: String(rawItem.id || ""),
            title: normalizeTitle(rawItem.title),
            createdAt: finiteTimestamp(rawItem.createdAt, 0),
            endedAt: finiteTimestamp(rawItem.endedAt, 0),
            totalMs: entries.reduce((total, entry) => total + entry.elapsedMs, 0),
            entries
        });
    }
    return result;
}

function normalizeTitle(value) {
    return String(value ?? "").trim().slice(0, 120);
}

function normalizeTimerDuration(value) {
    const duration = Number(value);
    if (!Number.isFinite(duration) || duration < MIN_TIMER_DURATION_MS) {
        return DEFAULT_TIMER_DURATION_MS;
    }
    return Math.min(MAX_TIMER_DURATION_MS, Math.round(duration));
}

function normalizeName(value) {
    return String(value ?? "").trim().slice(0, 200);
}

function normalizeImage(value) {
    return String(value ?? "").trim().slice(0, 1000);
}

function nonNegativeNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(0, number) : 0;
}

function nonNegativeInteger(value) {
    return Math.floor(nonNegativeNumber(value));
}

function finiteTimestamp(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function finiteTimestampOrNull(value) {
    if (value === null || value === undefined || value === "") return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

function stringOrNull(value) {
    const string = String(value ?? "").trim();
    return string || null;
}

function isObject(value) {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function pad(value) {
    return String(value).padStart(2, "0");
}
