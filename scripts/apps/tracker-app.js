import {
    FALLBACK_ACTOR_IMAGE,
    format,
    localize,
    MAX_TIMER_DURATION_MS,
    MODULE_ID,
    TICK_INTERVAL_MS
} from "../constants.js";
import {formatDuration, getEntryElapsed, getSessionSnapshot, getTimerRemaining, getTotalElapsed} from "../model.js";

export class SpotlightTrackerApplication extends FormApplication {
    static store = null;
    static rosterApplication = null;
    static instance = null;

    constructor(options = {}) {
        super({}, options);
        this.store = this.constructor.store;
        this.tickHandle = null;
        this.expiringRevision = null;
        this.unsubscribe = this.store?.subscribe(() => this.onStoreChanged()) ?? null;
        this.constructor.instance = this;
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: `${MODULE_ID}-window`,
            classes: [MODULE_ID, "spotlight-tracker-window"],
            template: `modules/${MODULE_ID}/templates/tracker.hbs`,
            title: `${MODULE_ID}.Tracker.Title`,
            width: 660,
            height: "auto",
            resizable: true,
            closeOnSubmit: false,
            submitOnChange: false
        });
    }

    get title() {
        return localize("Tracker.Title");
    }

    static configure({store, rosterApplication}) {
        this.store = store;
        this.rosterApplication = rosterApplication;
    }

    static open() {
        if (!this.store?.canView()) {
            ui.notifications.warn(localize("Notifications.ViewDisabled"));
            return null;
        }
        if (this.instance?.rendered) {
            this.instance.bringToTop();
            return this.instance;
        }
        this.instance = new this();
        this.instance.render(true);
        return this.instance;
    }

    render(force = false, options = {}) {
        if (!this.store?.canView()) {
            ui.notifications.warn(localize("Notifications.ViewDisabled"));
            return this;
        }
        return super.render(force, options);
    }

    async getData(options = {}) {
        const context = await super.getData(options);
        const state = this.store.getState();
        const now = this.store.now();
        const totalMs = getTotalElapsed(state.session, now);
        const remainingMs = state.session.activeActorId
            ? getTimerRemaining(state, now)
            : state.timerDurationMs;
        const timerExpired = Boolean(state.session.activeActorId && remainingMs <= 0);
        const timerMinutes = Math.floor(state.timerDurationMs / 60_000);
        const timerSeconds = Math.floor((state.timerDurationMs % 60_000) / 1000);
        const rosterIds = state.roster.map((participant) => participant.actorId);
        const archivedIds = Object.keys(state.session.entries).filter((actorId) => {
            const entry = state.session.entries[actorId];
            return !rosterIds.includes(actorId) && (entry.elapsedMs > 0 || entry.turns > 0);
        });
        const displayIds = [...rosterIds, ...archivedIds];
        const rosterIndex = new Map(rosterIds.map((actorId, index) => [actorId, index]));

        const participants = displayIds.map((actorId) => {
            const entry = state.session.entries[actorId] ?? {};
            const actor = game.actors.get(actorId);
            const elapsedMs = getEntryElapsed(state.session, actorId, now);
            const share = totalMs > 0 ? (elapsedMs / totalMs) * 100 : 0;
            const index = rosterIndex.get(actorId);
            const inRoster = index !== undefined;
            const active = state.session.activeActorId === actorId;
            return {
                actorId,
                name: actor?.name || entry.name || localize("Tracker.DeletedActor"),
                img: actor?.img || entry.img || FALLBACK_ACTOR_IMAGE,
                elapsed: formatDuration(elapsedMs),
                elapsedMs,
                share: share.toFixed(1),
                turns: Number(entry.turns) || 0,
                active,
                running: active && state.session.running,
                rowClass: [active ? "is-active" : "", inRoster ? "" : "is-removed"].filter(Boolean).join(" "),
                canFocus: this.store.canEdit() && inRoster,
                canMoveUp: this.store.canEdit() && inRoster && index > 0,
                canMoveDown: this.store.canEdit() && inRoster && index < rosterIds.length - 1,
                removedLabel: inRoster ? "" : localize("Tracker.RemovedFromRoster")
            };
        });

        return {
            ...context,
            canEdit: this.store.canEdit(),
            state,
            participants,
            hasParticipants: participants.length > 0,
            hasRoster: rosterIds.length > 0,
            running: state.session.running,
            canResume: Boolean(state.session.activeActorId && !state.session.running),
            resumeLabel: timerExpired
                ? localize("Tracker.Restart")
                : localize("Tracker.Resume"),
            timerRemaining: formatDuration(remainingMs),
            timerExpired,
            timerClass: timerExpired ? "is-expired" : (state.session.running ? "is-running" : ""),
            timerMinutes,
            timerSeconds: String(timerSeconds).padStart(2, "0"),
            totalElapsed: formatDuration(totalMs),
            sessionTitle: state.session.title,
            sessionTitlePlaceholder: this.defaultSessionTitle(state.session.createdAt),
            history: state.history.map((item) => ({
                ...item,
                displayTitle: item.title || this.defaultSessionTitle(item.createdAt),
                endedAtText: this.formatDate(item.endedAt),
                totalElapsed: formatDuration(item.totalMs),
                entries: [...item.entries]
                    .sort((left, right) => right.elapsedMs - left.elapsedMs)
                    .map((entry) => ({
                        ...entry,
                        name: game.actors.get(entry.actorId)?.name || entry.name || localize("Tracker.DeletedActor"),
                        elapsed: formatDuration(entry.elapsedMs),
                        share: item.totalMs > 0 ? ((entry.elapsedMs / item.totalMs) * 100).toFixed(1) : "0.0"
                    }))
            })),
            hasHistory: state.history.length > 0
        };
    }

    activateListeners(html) {
        super.activateListeners(html);
        this.startTicking();

        html.find("[data-action]").on("click", (event) => {
            event.preventDefault();
            void this.handleAction(event.currentTarget);
        });

        html.find("[name='sessionTitle']").on("change", (event) => {
            void this.store.dispatch("SET_TITLE", {title: event.currentTarget.value});
        });
    }

    async _updateObject(_event, formData) {
        if (!this.store.canEdit()) return;
        await this.store.dispatch("SET_TITLE", {title: formData.sessionTitle ?? ""});
    }

    async close(options = {}) {
        this.stopTicking();
        this.unsubscribe?.();
        this.unsubscribe = null;
        if (this.constructor.instance === this) this.constructor.instance = null;
        return super.close(options);
    }

    async handleAction(element) {
        const action = element.dataset.action;
        const actorId = element.dataset.actorId;

        if (action === "manage") {
            this.constructor.rosterApplication.open();
            return;
        }
        if (action === "export") {
            this.exportCurrentSession();
            return;
        }
        if (action === "set-timer") {
            await this.setTimerDurationFromForm();
            return;
        }
        if (action === "reset-timer") {
            await this.store.dispatch("RESET_TIMER");
            return;
        }
        if (action === "reset") {
            if (await this.confirm("Tracker.ConfirmResetTitle", "Tracker.ConfirmReset")) {
                await this.store.dispatch("RESET");
            }
            return;
        }
        if (action === "archive") {
            const totalMs = getTotalElapsed(this.store.getState().session, this.store.now());
            if (totalMs <= 0) {
                ui.notifications.warn(localize("Notifications.NothingToArchive"));
                return;
            }
            if (await this.confirm("Tracker.ConfirmArchiveTitle", "Tracker.ConfirmArchive")) {
                await this.store.dispatch("ARCHIVE");
            }
            return;
        }
        if (action === "remove-history") {
            if (await this.confirm("Tracker.ConfirmDeleteHistoryTitle", "Tracker.ConfirmDeleteHistory")) {
                await this.store.dispatch("REMOVE_HISTORY", {id: element.dataset.historyId});
            }
            return;
        }

        const actionMap = {
            focus: ["FOCUS", {actorId}],
            start: ["START", {}],
            pause: ["PAUSE", {}],
            next: ["NEXT", {}],
            "move-up": ["MOVE", {actorId, direction: "up"}],
            "move-down": ["MOVE", {actorId, direction: "down"}]
        };
        const dispatch = actionMap[action];
        if (dispatch) await this.store.dispatch(dispatch[0], dispatch[1]);
    }

    onStoreChanged() {
        if (this.rendered) this.render(false);
    }

    startTicking() {
        this.stopTicking();
        this.tickHandle = window.setInterval(() => this.refreshTimes(), TICK_INTERVAL_MS);
        this.refreshTimes();
    }

    stopTicking() {
        if (this.tickHandle === null) return;
        window.clearInterval(this.tickHandle);
        this.tickHandle = null;
    }

    refreshTimes() {
        if (!this.rendered) return;
        const state = this.store.getState();
        const now = this.store.now();
        const totalMs = getTotalElapsed(state.session, now);
        const remainingMs = state.session.activeActorId
            ? getTimerRemaining(state, now)
            : state.timerDurationMs;
        const root = this.element?.[0] ?? this.element;
        if (!root?.querySelectorAll) return;

        for (const element of root.querySelectorAll("[data-actor-elapsed]")) {
            const actorId = element.dataset.actorElapsed;
            element.textContent = formatDuration(getEntryElapsed(state.session, actorId, now));
        }
        for (const element of root.querySelectorAll("[data-actor-share]")) {
            const actorId = element.dataset.actorShare;
            const elapsedMs = getEntryElapsed(state.session, actorId, now);
            const share = totalMs > 0 ? (elapsedMs / totalMs) * 100 : 0;
            element.textContent = `${share.toFixed(1)}%`;
        }
        for (const element of root.querySelectorAll("[data-share-bar]")) {
            const actorId = element.dataset.shareBar;
            const elapsedMs = getEntryElapsed(state.session, actorId, now);
            const share = totalMs > 0 ? (elapsedMs / totalMs) * 100 : 0;
            element.style.setProperty("--spotlight-share", `${share}%`);
        }
        const totalElement = root.querySelector("[data-total-elapsed]");
        if (totalElement) totalElement.textContent = formatDuration(totalMs);
        const timerElement = root.querySelector("[data-timer-remaining]");
        if (timerElement) timerElement.textContent = formatDuration(remainingMs);
        const timerDisplay = root.querySelector("[data-timer-display]");
        if (timerDisplay) {
            timerDisplay.classList.toggle("is-expired", Boolean(state.session.activeActorId && remainingMs <= 0));
            timerDisplay.classList.toggle("is-running", Boolean(state.session.running && remainingMs > 0));
        }
        if (this.store.canEdit() && state.session.running && remainingMs <= 0) {
            void this.expireTimer(state);
        }
    }

    async setTimerDurationFromForm() {
        const root = this.element?.[0] ?? this.element;
        const minutes = Number(root?.querySelector("[data-timer-minutes]")?.value ?? 0);
        const seconds = Number(root?.querySelector("[data-timer-seconds]")?.value ?? 0);
        const durationMs = ((minutes * 60) + seconds) * 1000;
        const valid = Number.isInteger(minutes)
            && Number.isInteger(seconds)
            && minutes >= 0
            && seconds >= 0
            && seconds <= 59
            && durationMs >= 1000
            && durationMs <= MAX_TIMER_DURATION_MS;
        if (!valid) {
            ui.notifications.warn(localize("Notifications.InvalidTimer"));
            return;
        }
        await this.store.dispatch("SET_TIMER_DURATION", {durationMs});
    }

    async expireTimer(state) {
        if (this.expiringRevision === state.revision) return;
        this.expiringRevision = state.revision;
        const actorId = state.session.activeActorId;
        const actorName = game.actors.get(actorId)?.name
            || state.session.entries[actorId]?.name
            || localize("Tracker.DeletedActor");
        try {
            await this.store.dispatch("EXPIRE");
            ui.notifications.warn(format("Notifications.TimerExpired", {character: actorName}), {
                permanent: true
            });
        } finally {
            this.expiringRevision = null;
        }
    }

    exportCurrentSession() {
        const state = this.store.getState();
        const snapshot = getSessionSnapshot(state.session, this.store.now());
        if (!snapshot.entries.length) {
            ui.notifications.warn(localize("Notifications.NothingToExport"));
            return;
        }

        const rows = [[
            localize("Export.Character"),
            localize("Export.TimeSeconds"),
            localize("Export.Time"),
            localize("Export.Share"),
            localize("Export.Activations")
        ]];
        for (const entry of snapshot.entries.sort((left, right) => right.elapsedMs - left.elapsedMs)) {
            const name = game.actors.get(entry.actorId)?.name || entry.name || entry.actorId;
            const share = snapshot.totalMs > 0 ? ((entry.elapsedMs / snapshot.totalMs) * 100).toFixed(1) : "0.0";
            rows.push([name, Math.round(entry.elapsedMs / 1000), formatDuration(entry.elapsedMs), share, entry.turns]);
        }
        const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\r\n")}`;
        const title = state.session.title || "spotlight-session";
        const filename = `${slugify(title)}-${new Date().toISOString().slice(0, 10)}.csv`;
        saveDataToFile(csv, "text/csv;charset=utf-8", filename);
    }

    async confirm(titleKey, contentKey) {
        return Dialog.confirm({
            title: localize(titleKey),
            content: `<p>${localize(contentKey)}</p>`,
            yes: () => true,
            no: () => false,
            defaultYes: false
        });
    }

    defaultSessionTitle(timestamp) {
        return format("Tracker.DefaultSessionTitle", {date: this.formatDate(timestamp)});
    }

    formatDate(timestamp) {
        const value = Number(timestamp);
        if (!Number.isFinite(value) || value <= 0) return "—";
        return new Intl.DateTimeFormat(game.i18n.lang, {
            dateStyle: "short",
            timeStyle: "short"
        }).format(new Date(value));
    }
}

function csvCell(value) {
    const text = String(value ?? "");
    return `"${text.replaceAll('"', '""')}"`;
}

function slugify(value) {
    const slug = String(value ?? "")
        .normalize("NFKD")
        .replace(/[^\p{L}\p{N}]+/gu, "-")
        .replace(/^-+|-+$/g, "")
        .toLowerCase();
    return slug || "spotlight-session";
}
