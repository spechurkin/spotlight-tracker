import { MODULE_ID } from "./constants.js";

const ROOT_TOOL = `${MODULE_ID}-root`;
const OPEN_TOOL = `${MODULE_ID}-open`;

export function addSpotlightSceneControl(controls, { title, visible, open }) {
  if (!controls || controls[MODULE_ID]) return null;

  const showControl = Boolean(visible);
  const control = {
    name: MODULE_ID,
    title,
    icon: "fa-solid fa-person-rays",
    order: 90,
    visible: showControl,
    activeTool: ROOT_TOOL,
    onChange: (_event, active) => {
      if (active) open();
    },
    tools: {
      [ROOT_TOOL]: {
        name: ROOT_TOOL,
        title,
        icon: "fa-solid fa-person-rays",
        order: -1,
        button: false,
        visible: false,
        onChange: () => {}
      },
      [OPEN_TOOL]: {
        name: OPEN_TOOL,
        title,
        icon: "fa-solid fa-arrow-up-right-from-square",
        order: 10,
        button: true,
        visible: showControl,
        onChange: () => open()
      }
    }
  };

  controls[MODULE_ID] = control;
  return control;
}
