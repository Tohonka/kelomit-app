import {app, Menu, shell} from 'electron';
import type {BrowserWindow, MenuItemConstructorOptions} from 'electron';

/** Menu actions the renderer handles; delivered as `menu` IPC events. */
export type MenuAction =
  | 'pair'
  | 'new-note'
  | 'today'
  | 'prev-day'
  | 'next-day'
  | 'view-day'
  | 'view-map'
  | 'view-projects'
  | 'view-leave'
  | 'export-report';

export function installMenu(getWindow: () => BrowserWindow | null): void {
  const send = (action: MenuAction) => () => getWindow()?.webContents.send('menu', action);

  const template: MenuItemConstructorOptions[] = [
    {
      label: app.name,
      submenu: [
        {role: 'about'},
        {type: 'separator'},
        {label: 'Pair phone…', accelerator: 'CmdOrCtrl+Shift+P', click: send('pair')},
        {type: 'separator'},
        {role: 'hide'},
        {role: 'hideOthers'},
        {role: 'unhide'},
        {type: 'separator'},
        {role: 'quit'},
      ],
    },
    {
      label: 'File',
      submenu: [
        {label: 'New Note', accelerator: 'CmdOrCtrl+N', click: send('new-note')},
        {type: 'separator'},
        {label: 'Export Work Report…', accelerator: 'CmdOrCtrl+E', click: send('export-report')},
        {type: 'separator'},
        {role: 'close'},
      ],
    },
    {role: 'editMenu'},
    {
      label: 'View',
      submenu: [
        {label: 'Day', accelerator: 'CmdOrCtrl+1', click: send('view-day')},
        {label: 'Map', accelerator: 'CmdOrCtrl+M', click: send('view-map')},
        {label: 'Projects & Tags', accelerator: 'CmdOrCtrl+2', click: send('view-projects')},
        {label: 'Leave', accelerator: 'CmdOrCtrl+3', click: send('view-leave')},
        {type: 'separator'},
        {role: 'reload'},
        {role: 'toggleDevTools'},
        {type: 'separator'},
        {role: 'togglefullscreen'},
      ],
    },
    {
      label: 'Go',
      submenu: [
        {label: 'Today', accelerator: 'CmdOrCtrl+T', click: send('today')},
        {label: 'Previous Day', accelerator: 'CmdOrCtrl+[', click: send('prev-day')},
        {label: 'Next Day', accelerator: 'CmdOrCtrl+]', click: send('next-day')},
      ],
    },
    {role: 'windowMenu'},
    {
      role: 'help',
      submenu: [
        {
          label: 'Open Data Folder',
          click: () => {
            shell.openPath(app.getPath('userData'));
          },
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}
