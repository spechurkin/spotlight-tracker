import {localize, MODULE_ID} from "./constants.js";
import {SpotlightRosterApplication} from "./apps/roster-app.js";
import {SpotlightTrackerApplication} from "./apps/tracker-app.js";
import {SpotlightStore} from "./store.js";

const store = new SpotlightStore();

SpotlightTrackerApplication.configure({
    store,
    rosterApplication: SpotlightRosterApplication
});
SpotlightRosterApplication.configure({
    store,
    trackerApplication: SpotlightTrackerApplication
});

Hooks.once("init", () => {
    store.registerSettings({
        trackerMenu: SpotlightTrackerApplication,
        rosterMenu: SpotlightRosterApplication
    });

    game.keybindings.register(MODULE_ID, "openTracker", {
        name: `${MODULE_ID}.Keybindings.Open.Name`,
        hint: `${MODULE_ID}.Keybindings.Open.Hint`,
        editable: [],
        restricted: false,
        onDown: () => {
            SpotlightTrackerApplication.open();
            return true;
        }
    });

    Hooks.on("getSceneControlButtons", addSceneControl);
});

Hooks.once("ready", () => {
    store.activate();

    const api = {
        open: () => SpotlightTrackerApplication.open(),
        manageRoster: () => SpotlightRosterApplication.open(),
        focus: (actorOrId) => store.dispatch("FOCUS", {
            actorId: typeof actorOrId === "string" ? actorOrId : actorOrId?.id
        }),
        next: () => store.dispatch("NEXT"),
        start: () => store.dispatch("START"),
        pause: () => store.dispatch("PAUSE"),
        setTimer: (seconds) => store.dispatch("SET_TIMER_DURATION", {
            durationMs: Number(seconds) * 1000
        }),
        resetTimer: () => store.dispatch("RESET_TIMER"),
        getState: () => foundry.utils.deepClone(store.getState())
    };

    game.modules.get(MODULE_ID).api = api;
    globalThis.SpotlightTracker = api;
    Hooks.callAll(`${MODULE_ID}.ready`, api);
    console.info(`${MODULE_ID} | Ready for Foundry VTT ${game.version}`);
});

for (const hook of ["createActor", "updateActor", "deleteActor"]) {
    Hooks.on(hook, () => {
        if (SpotlightTrackerApplication.instance?.rendered) {
            SpotlightTrackerApplication.instance.render(false);
        }
        if (SpotlightRosterApplication.instance?.rendered) {
            SpotlightRosterApplication.instance.render(false);
        }
    });
}

Hooks.on("updateUser", () => {
    if (SpotlightRosterApplication.instance?.rendered) {
        SpotlightRosterApplication.instance.render(false);
    }
});

function addSceneControl(controls) {
    if (!store.canView() || !Array.isArray(controls)) return;
    const controlGroup = controls.find((control) => control.name === "token") ?? controls[0];
    if (!controlGroup?.tools || !Array.isArray(controlGroup.tools)) return;
    if (controlGroup.tools.some((tool) => tool.name === `${MODULE_ID}-open`)) return;

    controlGroup.tools.push({
        name: `${MODULE_ID}-open`,
        title: localize("Controls.Open"),
        icon: "fas fa-person-rays",
        button: true,
        visible: true,
        onClick: () => SpotlightTrackerApplication.open()
    });
}
