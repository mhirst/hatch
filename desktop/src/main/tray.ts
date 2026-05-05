import { Tray, Menu, nativeImage } from "electron";

interface TrayOpts {
  iconPath: string;
  onShow: () => void;
  onQuit: () => void;
}

export function setupTray(opts: TrayOpts): Tray {
  const image = nativeImage.createFromPath(opts.iconPath);
  // Tray icons want to be small; resize defensively if the source is large.
  const tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image.resize({ width: 16, height: 16 }));

  tray.setToolTip("Hatch");
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: "Open dashboard", click: opts.onShow },
      { type: "separator" },
      { label: "Quit Hatch", click: opts.onQuit },
    ]),
  );
  tray.on("click", () => opts.onShow());
  return tray;
}
