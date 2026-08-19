import { FALLBACK_ACTOR_IMAGE, MODULE_ID, localize } from "../constants.js";
import { getPlayerCharacterActors } from "../player-characters.js";
import { matchesSearch } from "../search.js";

export class SpotlightRosterApplication extends FormApplication {
  static store = null;
  static trackerApplication = null;
  static instance = null;

  static configure({ store, trackerApplication }) {
    this.store = store;
    this.trackerApplication = trackerApplication;
  }

  static open() {
    if (!this.store?.canEdit()) {
      ui.notifications.warn(localize("Notifications.GmOnly"));
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

  static get defaultOptions() {
    return foundry.utils.mergeObject(super.defaultOptions, {
      id: `${MODULE_ID}-roster`,
      classes: [MODULE_ID, "spotlight-roster-window"],
      template: `modules/${MODULE_ID}/templates/roster.hbs`,
      title: `${MODULE_ID}.Roster.Title`,
      width: 540,
      height: 620,
      resizable: true,
      closeOnSubmit: true,
      submitOnChange: false
    });
  }

  constructor(options = {}) {
    super({}, options);
    this.store = this.constructor.store;
    this.constructor.instance = this;
  }

  render(force = false, options = {}) {
    if (!this.store?.canEdit()) {
      ui.notifications.warn(localize("Notifications.GmOnly"));
      return this;
    }
    return super.render(force, options);
  }

  get title() {
    return localize("Roster.Title");
  }

  async getData(options = {}) {
    const context = await super.getData(options);
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

  activateListeners(html) {
    super.activateListeners(html);

    html.find("[data-roster-search]").on("input search change keyup", (event) => {
      const query = event.currentTarget.value;
      html.find("[data-actor-row]").each((_index, row) => {
        const visible = matchesSearch(row.dataset.searchText, query, game.i18n.lang);
        row.hidden = !visible;
        row.classList.toggle("is-search-hidden", !visible);
      });
    });

    html.find("[data-selection-action]").on("click", (event) => {
      event.preventDefault();
      const action = event.currentTarget.dataset.selectionAction;
      html.find("[data-actor-row]").each((_index, row) => {
        const checkbox = row.querySelector("input[type='checkbox']");
        if (!checkbox) return;
        if (action === "all") checkbox.checked = true;
        if (action === "none") checkbox.checked = false;
      });
    });
  }

  async _updateObject(_event, formData) {
    const selectedIds = new Set(
      Object.entries(formData)
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

  async close(options = {}) {
    if (this.constructor.instance === this) this.constructor.instance = null;
    return super.close(options);
  }
}
