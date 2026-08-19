import { FALLBACK_ACTOR_IMAGE, MODULE_ID, localize } from "../constants.js";
import { getPlayerCharacterActors } from "../player-characters.js";
import { matchesSearch } from "../search.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

export class SpotlightRosterApplication extends HandlebarsApplicationMixin(ApplicationV2) {
  static store = null;

  static DEFAULT_OPTIONS = {
    id: `${MODULE_ID}-roster`,
    classes: [MODULE_ID, "spotlight-roster-window"],
    tag: "form",
    actions: {
      "select-all": SpotlightRosterApplication.onSelectionAction,
      "select-none": SpotlightRosterApplication.onSelectionAction
    },
    form: {
      handler: SpotlightRosterApplication.onSubmit,
      submitOnChange: false,
      closeOnSubmit: true
    },
    position: {
      width: 540,
      height: 620
    },
    window: {
      icon: "fa-solid fa-users-gear",
      title: `${MODULE_ID}.Roster.Title`,
      resizable: true
    }
  };

  static PARTS = {
    main: {
      template: `modules/${MODULE_ID}/templates/roster.hbs`
    }
  };

  static configure({ store }) {
    this.store = store;
  }

  static open() {
    if (!this.store?.canEdit()) {
      ui.notifications.warn(localize("Notifications.GmOnly"));
      return null;
    }
    const current = this.current;
    if (current?.rendered) {
      current.bringToFront();
      return current;
    }
    const application = new this();
    void application.render({ force: true });
    return application;
  }

  static get current() {
    return foundry.applications.instances.get(`${MODULE_ID}-roster`) ?? null;
  }

  constructor(options = {}) {
    super(options);
    this.store = this.constructor.store;
  }

  _canRender(options) {
    const canRender = super._canRender(options);
    if (canRender === false) return false;
    if (!this.store?.canEdit()) {
      ui.notifications.warn(localize("Notifications.GmOnly"));
      return false;
    }
  }

  get title() {
    return localize("Roster.Title");
  }

  async _prepareContext(options) {
    const context = await super._prepareContext(options);
    const selected = new Set(this.store.getState().roster.map((participant) => participant.actorId));
    const actors = getPlayerCharacterActors(game.actors, game.users, game.i18n.lang)
      .map(({ actor, playerNames }) => {
        return {
          actorId: actor.id,
          name: actor.name,
          img: actor.img || FALLBACK_ACTOR_IMAGE,
          type: actor.type,
          linkedPlayers: playerNames.join(", "),
          checked: selected.has(actor.id)
        };
      });
    return { ...context, actors, hasActors: actors.length > 0 };
  }

  async _onRender(context, options) {
    await super._onRender(context, options);
    this.element.querySelector("[data-roster-search]")?.addEventListener("input", (event) => {
      const query = event.currentTarget.value;
      for (const row of this.element.querySelectorAll("[data-actor-row]")) {
        const visible = matchesSearch(row.dataset.searchText, query, game.i18n.lang);
        row.hidden = !visible;
        row.classList.toggle("is-search-hidden", !visible);
      }
    });
  }

  static onSelectionAction(event, target) {
    event.preventDefault();
    const checked = target.dataset.action === "select-all";
    for (const checkbox of this.element.querySelectorAll("[data-actor-row] input[type='checkbox']")) {
      checkbox.checked = checked;
    }
  }

  static async onSubmit(_event, _form, formData) {
    const selectedIds = new Set(
      Object.entries(formData.object)
        .filter(([key, value]) => key.startsWith("actors.") && Boolean(value))
        .map(([key]) => key.slice("actors.".length))
    );
    const currentIds = this.store.getState().roster.map((participant) => participant.actorId);
    const alphabetical = getPlayerCharacterActors(game.actors, game.users, game.i18n.lang)
      .map(({ actor }) => actor.id);
    const orderedIds = [
      ...currentIds.filter((actorId) => selectedIds.has(actorId)),
      ...alphabetical.filter((actorId) => selectedIds.has(actorId) && !currentIds.includes(actorId))
    ];
    const participants = orderedIds.map((actorId) => {
      const actor = game.actors.get(actorId);
      return {
        actorId,
        name: actor?.name ?? "",
        img: actor?.img ?? FALLBACK_ACTOR_IMAGE
      };
    });
    await this.store.setRoster(participants);
    ui.notifications.info(localize("Notifications.RosterSaved"));
  }
}
