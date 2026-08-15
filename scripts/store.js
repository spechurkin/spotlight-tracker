import {localize, MODULE_ID, SETTINGS, SOCKET_CHANNEL} from "./constants.js";
import {createState, normalizeState, transition} from "./model.js";

export class SpotlightStore {
    constructor() {
        this.state = createState(Date.now(), this.createId());
        this.listeners = new Set();
        this.receiveSocket = this.receiveSocket.bind(this);
    }

    registerSettings({trackerMenu, rosterMenu}) {
        game.settings.register(MODULE_ID, SETTINGS.state, {
            scope: "world",
            config: false,
            type: Object,
            default: createState(0, ""),
            onChange: (value) => this.setLocalState(value)
        });

        game.settings.register(MODULE_ID, SETTINGS.playersCanView, {
            scope: "world",
            config: true,
            type: Boolean,
            default: true,
            name: `${MODULE_ID}.Settings.PlayersCanView.Name`,
            hint: `${MODULE_ID}.Settings.PlayersCanView.Hint`,
            onChange: () => {
                this.notify();
                ui.controls?.render?.(true);
            }
        });

        game.settings.registerMenu(MODULE_ID, "openTracker", {
            name: `${MODULE_ID}.Settings.OpenTracker.Name`,
            hint: `${MODULE_ID}.Settings.OpenTracker.Hint`,
            label: `${MODULE_ID}.Settings.OpenTracker.Label`,
            icon: "fas fa-hourglass-half",
            type: trackerMenu,
            restricted: false
        });

        game.settings.registerMenu(MODULE_ID, "manageRoster", {
            name: `${MODULE_ID}.Settings.ManageRoster.Name`,
            hint: `${MODULE_ID}.Settings.ManageRoster.Hint`,
            label: `${MODULE_ID}.Settings.ManageRoster.Label`,
            icon: "fas fa-users-gear",
            type: rosterMenu,
            restricted: true
        });
    }

    activate() {
        const stored = game.settings.get(MODULE_ID, SETTINGS.state);
        const state = normalizeState(stored, this.now());
        const needsInitialization = !state.session.id;
        const needsMigration = Number(stored?.version) !== state.version;
        if (needsInitialization) state.session.id = this.createId();
        this.state = state;
        game.socket.on(SOCKET_CHANNEL, this.receiveSocket);
        if ((needsInitialization || needsMigration) && game.user?.isGM) {
            void game.settings.set(MODULE_ID, SETTINGS.state, state);
        }
    }

    subscribe(listener) {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    getState() {
        return normalizeState(this.state, this.now());
    }

    canView() {
        if (game.user?.isGM) return true;
        return Boolean(game.settings.get(MODULE_ID, SETTINGS.playersCanView));
    }

    canEdit() {
        return Boolean(game.user?.isGM);
    }

    async dispatch(type, payload = {}) {
        if (!this.canEdit()) {
            ui.notifications.warn(localize("Notifications.GmOnly"));
            return false;
        }

        const actionPayload = {...payload};
        if (["RESET", "ARCHIVE"].includes(type) && !actionPayload.sessionId) {
            actionPayload.sessionId = this.createId();
        }

        const latest = normalizeState(game.settings.get(MODULE_ID, SETTINGS.state), this.now());
        if (!latest.session.id && this.state.session.id) latest.session.id = this.state.session.id;
        const next = transition(latest, {type, payload: actionPayload}, this.now());
        await game.settings.set(MODULE_ID, SETTINGS.state, next);
        this.setLocalState(next);
        game.socket.emit(SOCKET_CHANNEL, {type: "refresh", revision: next.revision});
        return true;
    }

    async setRoster(participants) {
        return this.dispatch("SET_ROSTER", {participants});
    }

    setLocalState(rawState) {
        this.state = normalizeState(rawState, this.now());
        this.notify();
    }

    receiveSocket(payload) {
        if (payload?.type !== "refresh") return;
        window.setTimeout(() => {
            const incoming = normalizeState(game.settings.get(MODULE_ID, SETTINGS.state), this.now());
            if (incoming.revision < this.state.revision) return;
            this.state = incoming;
            this.notify();
        }, 50);
    }

    notify() {
        for (const listener of this.listeners) {
            try {
                listener(this.getState());
            } catch (error) {
                console.error(`${MODULE_ID} | Listener failed`, error);
            }
        }
    }

    now() {
        const serverTime = Number(game.time?.serverTime);
        return Number.isFinite(serverTime) ? serverTime : Date.now();
    }

    createId() {
        return globalThis.foundry?.utils?.randomID?.() ?? crypto.randomUUID();
    }
}
