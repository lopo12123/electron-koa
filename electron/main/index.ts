// The built directory structure
//
// ├─┬ dist-electron
// │ ├─┬ main
// │ │ └── index.js    > Electron-Main
// │ └─┬ preload
// │   └── index.js    > Preload-Scripts
// ├─┬ dist
// │ └── index.html    > Electron-Renderer
//

import { Server } from "net";

process.env.DIST_ELECTRON = join(__dirname, '../..')
process.env.DIST = join(process.env.DIST_ELECTRON, '../dist')
process.env.PUBLIC = app.isPackaged ? process.env.DIST : join(process.env.DIST_ELECTRON, '../public')

import { app, BrowserWindow, shell, ipcMain } from 'electron'
import { release } from 'os'
import { join } from 'path'
import Koa from "koa"
import { v4 } from "uuid";
import { exec } from "child_process";

// Disable GPU Acceleration for Windows 7
if(release().startsWith('6.1')) app.disableHardwareAcceleration()

// Set application name for Windows 10+ notifications
if(process.platform === 'win32') app.setAppUserModelId(app.getName())

if(!app.requestSingleInstanceLock()) {
  app.quit()
  process.exit(0)
}

let win: BrowserWindow | null = null
// Here, you can also use other preload
const preload = join(__dirname, '../preload/index.js')
const url = process.env.VITE_DEV_SERVER_URL
const indexHtml = join(process.env.DIST, 'index.html')

async function createWindow() {
  win = new BrowserWindow({
    title: 'Main window',
    icon: join(process.env.PUBLIC, 'favicon.svg'),
    webPreferences: {
      preload,
      nodeIntegration: true,
      contextIsolation: false,
    },
  })

  if(app.isPackaged) {
    win.loadFile(indexHtml)
  }
  else {
    win.loadURL(url)
    win.webContents.openDevTools({ mode: 'detach' })
  }

  // Test actively push message to the Electron-Renderer
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', new Date().toLocaleString())
  })

  // Make all links open with the browser, not with the application
  win.webContents.setWindowOpenHandler(({ url }) => {
    if(url.startsWith('https:')) shell.openExternal(url)
    return { action: 'deny' }
  })
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  win = null
  if(process.platform !== 'darwin') app.quit()
})

app.on('second-instance', () => {
  if(win) {
    // Focus on the main window if the user tried to open another
    if(win.isMinimized()) win.restore()
    win.focus()
  }
})

app.on('activate', () => {
  const allWindows = BrowserWindow.getAllWindows()
  if(allWindows.length) {
    allWindows[0].focus()
  }
  else {
    createWindow()
  }
})

// new window example arg: new windows url
ipcMain.handle('open-win', (event, arg) => {
  const childWindow = new BrowserWindow({
    webPreferences: {
      preload,
    },
  })

  if(app.isPackaged) {
    childWindow.loadFile(indexHtml, { hash: arg })
  }
  else {
    childWindow.loadURL(`${ url }/#${ arg }`)
    // childWindow.webContents.openDevTools()
  }
})

/// 以下是模板外新增内容, 内容较少直接附加仅作示意
const embed_page_generator = (pid: string, port: number) => {
  return `<!doctype html>
<html lang="zh-cn">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport"
          content="width=device-width, user-scalable=no, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0">
    <meta http-equiv="X-UA-Compatible" content="ie=edge">
    <title>Document</title>
  </head>
  <body>
    <p>pid: ${ pid }. (powered by koa.)</p>
    <button id="btn">ping</button>
    <script>
      document.getElementById('btn')
        .onclick = () => {
        fetch(\`./ping?port=${ port }\`)
          .then(res => res.text())
          .then(res => {
            alert(res)
          })
          .catch(err => {
            alert(err)
          })
      }
    </script>
  </body>
</html>
`
}
/**
 * @description 返回可用端口(自增), 四位数的端口有较多为保留端口, 使用自增使用可能会发生错误无法定位
 */
const available_port = new Proxy({ curr: 10086 }, {
  // auto-increase getter
  get(target: { curr: number }, p: string | symbol, receiver: any): any {
    if(p !== 'curr') return undefined
    else {
      let out = Reflect.get(target, p, receiver)
      Reflect.set(target, 'curr', out + 1)
      return out
    }
  },
  // disabled setter
  set(target: { curr: number }, p: string | symbol, newValue: any, receiver: any): boolean {
    return false
  }
})
/**
 * @description koa实例池
 */
const koa_instances = new Map<string, Server>()
/**
 * @description 启动一个koa实例,
 */
const setupKoa = () => {
  const _pid = v4()
  const _port = available_port.curr
  const _instance = new Koa()
  _instance.use(ctx => {
    if(ctx.req.url.startsWith('/ping')) {
      win.webContents.send('op', _pid, _port)
      ctx.body = 'check ur electron window to see some toast.'
    }
    else {
      if(ctx.req.url === '/')
        ctx.body = embed_page_generator(_pid, _port)
      else
        ctx.body = 'nothing to reply.'
    }
  })
  const _koa_server = _instance.listen(_port, '127.0.0.1'/* '0.0.0.0' */, () => {
    console.log(`a new koa instance listening 0.0.0.0:${ _port }.`)
    try {
      exec(`explorer http://localhost:${ _port }`)
    }
    catch (e) {
      console.log(`fail to auto-open in browser, u can manually open [http://localhost:${ _port }] in ur browser`)
    }
  })
  koa_instances.set(_pid, _koa_server)
  return [ _pid, _port ]
}

ipcMain.handle('server:stat', () => {
  return [ ...koa_instances.keys() ]
})
ipcMain.handle('server:setup', () => {
  return setupKoa()
})
ipcMain.handle('server:dispose', (ev, pid: string) => {
  console.log(`instance is going to dispose. (pid: ${ pid })`)
  koa_instances.get(pid)?.close((err) => {
    err
      ? console.error(err)
      : console.log(`instance has been disposed. (pid: ${ pid })`)
  })
  koa_instances.delete(pid)
  // this true not means close successfully. just a signal ...
  return true
})
ipcMain.handle('server:clearAll', () => {
  koa_instances.forEach((server, pid) => {
    console.log(`instance is going to dispose. (pid: ${ pid })`)
    server.close((err) => {
      err
        ? console.error(err)
        : console.log(`instance has been disposed. (pid: ${ pid })`)
    })
  })
  koa_instances.clear()

  // this true not means close successfully even finished. just a signal ...
  return true
})

/// bugs:
/// l211, l223 never reached?
