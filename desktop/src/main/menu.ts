import { Menu, MenuItemConstructorOptions, app, shell } from "electron";

interface MenuOpts {
  onShow: () => void;
  onQuit: () => void;
}

export function buildMenu({ onShow, onQuit }: MenuOpts) {
  const isMac = process.platform === "darwin";

  const template: MenuItemConstructorOptions[] = [
    ...(isMac
      ? ([
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { label: "Quit Hatch", accelerator: "Cmd+Q", click: onQuit },
            ],
          },
        ] as MenuItemConstructorOptions[])
      : []),
    {
      label: "File",
      submenu: [
        { label: "Open dashboard", accelerator: "CmdOrCtrl+1", click: onShow },
        { type: "separator" },
        isMac
          ? { role: "close" }
          : ({ label: "Quit Hatch", accelerator: "Ctrl+Q", click: onQuit } as MenuItemConstructorOptions),
      ],
    },
    { role: "editMenu" },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" },
        { type: "separator" },
        { role: "togglefullscreen" },
      ],
    },
    { role: "windowMenu" },
    {
      role: "help",
      submenu: [
        {
          label: "Documentation",
          click: () => shell.openExternal("https://github.com/mhirst/hatch"),
        },
        {
          label: "Report an issue",
          click: () => shell.openExternal("https://github.com/mhirst/hatch/issues"),
        },
      ],
    },
  ];

  return Menu.buildFromTemplate(template);
}
