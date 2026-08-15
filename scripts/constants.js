export const MODULE_ID = "spotlight-tracker";
export const SOCKET_CHANNEL = `module.${MODULE_ID}`;

export const SETTINGS = Object.freeze({
    state: "state",
    playersCanView: "playersCanView"
});

export const STATE_VERSION = 2;
export const HISTORY_LIMIT = 20;
export const TICK_INTERVAL_MS = 500;
export const DEFAULT_TIMER_DURATION_MS = 5 * 60 * 1000;
export const MIN_TIMER_DURATION_MS = 1000;
export const MAX_TIMER_DURATION_MS = 180 * 60 * 1000;
export const FALLBACK_ACTOR_IMAGE = "icons/svg/mystery-man.svg";

export function localize(key) {
    return game.i18n.localize(`${MODULE_ID}.${key}`);
}

export function format(key, data) {
    return game.i18n.format(`${MODULE_ID}.${key}`, data);
}
