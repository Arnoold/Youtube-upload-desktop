const { app, BrowserWindow, ipcMain, dialog, globalShortcut, Menu } = require('electron')
const path = require('path')
const { setupIPC } = require('./ipc-handlers')
const fs = require('fs')


// 设置 NO_PROXY 环境变量，强制 localhost 不走代理
process.env.NO_PROXY = [
  process.env.NO_PROXY,
  '127.0.0.1',
  'localhost'
].filter(Boolean).join(',')

// 导入服务
const DatabaseService = require('./services/database.service')
const FileService = require('./services/file.service')
const BitBrowserService = require('./services/bitbrowser.service')
const HubStudioService = require('./services/hubstudio.service')
const PlaywrightService = require('./services/playwright.service')
const UploadService = require('./services/upload.service')

let mainWindow = null
let services = {}

// 使用动态路径，基于应用所在目录
const LOG_PATH = path.join(__dirname, '../../debug_ipc.log')

function log(msg) {
  try {
    fs.appendFileSync(LOG_PATH, `[${new Date().toISOString()}] ${msg}\n`)
  } catch (e) {
    // 静默忽略日志写入错误，避免控制台输出过多信息
    // console.error('Failed to write log:', e)
  }
}

function createWindow() {
  log('createWindow: Creating browser window...')
  // 创建浏览器窗口
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false
    }
  })

  // 开发环境下加载 vite 开发服务器
  const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged

  if (isDev) {
    // 开发模式：加载 Vite 开发服务器
    const devServerUrl = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173'
    console.log('Loading dev server:', devServerUrl)
    mainWindow.loadURL(devServerUrl)
    mainWindow.webContents.openDevTools()
  } else {
    // 生产环境加载构建后的文件
    mainWindow.loadFile(path.join(__dirname, '../../dist/index.html'))
  }

  // 添加菜单（包含开发者工具选项）
  const template = [
    {
      label: '文件',
      submenu: [
        { role: 'quit', label: '退出' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '刷新' },
        { role: 'forceReload', label: '强制刷新' },
        { type: 'separator' },
        { role: 'toggleDevTools', label: '开发者工具', accelerator: 'Ctrl+Shift+I' },
        { type: 'separator' },
        { role: 'resetZoom', label: '重置缩放' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' }
      ]
    }
  ]
  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // 注册快捷键打开开发者工具 (Ctrl+Shift+D)
  globalShortcut.register('CommandOrControl+Shift+D', () => {
    if (mainWindow && mainWindow.webContents) {
      mainWindow.webContents.toggleDevTools()
    }
  })

  log('createWindow: Browser window created.')
}

async function initializeServices() {
  try {
    log('initializeServices: Starting...')
    console.log('Initializing services...')

    // 初始化数据库
    log('initializeServices: Creating DatabaseService...')
    const dbService = new DatabaseService()
    log('initializeServices: Initializing DatabaseService...')
    await dbService.initialize()
    log('initializeServices: DatabaseService initialized.')

    // 初始化其他服务
    log('initializeServices: Creating other services...')
    const fileService = new FileService()
    const bitBrowserService = new BitBrowserService()
    const hubStudioService = new HubStudioService()
    const playwrightService = new PlaywrightService()
    const uploadService = new UploadService(dbService, bitBrowserService, playwrightService)

    log('initializeServices: Requiring Supabase/AIStudio services...')
    const supabaseService = require('./services/supabase.service')
    const aiStudioService = require('./services/aistudio.service')

    // 注入 dbService 和浏览器服务
    aiStudioService.setDbService(dbService)
    aiStudioService.setBitBrowserService(bitBrowserService)
    aiStudioService.setHubStudioService(hubStudioService)

    // 尝试自动连接 Supabase
    try {
      const supabaseUrl = dbService.getSetting('supabase_url')
      const supabaseKey = dbService.getSetting('supabase_api_key')
      const supabaseTable = dbService.getSetting('supabase_table')

      if (supabaseUrl && supabaseKey) {
        log('initializeServices: Auto-connecting Supabase...')
        console.log('Auto-connecting to Supabase...')
        supabaseService.initialize(supabaseUrl, supabaseKey)
        if (supabaseTable) {
          supabaseService.setTableName(supabaseTable)
        }
        console.log('Supabase auto-connected')
      }
    } catch (error) {
      log(`initializeServices: Supabase auto-connect failed: ${error.message}`)
      console.error('Supabase auto-connect failed:', error)
    }

    // 尝试自动加载 HubStudio 凭证
    try {
      const hubstudioAppId = dbService.getSetting('hubstudio_app_id')
      const hubstudioAppSecret = dbService.getSetting('hubstudio_app_secret')
      const hubstudioGroupCode = dbService.getSetting('hubstudio_group_code')

      if (hubstudioAppId && hubstudioAppSecret) {
        log('initializeServices: Auto-loading HubStudio credentials...')
        console.log('Auto-loading HubStudio credentials...')
        hubStudioService.setCredentials(hubstudioAppId, hubstudioAppSecret, hubstudioGroupCode || '')
        console.log('HubStudio credentials loaded')
      }
    } catch (error) {
      log(`initializeServices: HubStudio credentials load failed: ${error.message}`)
      console.error('HubStudio credentials load failed:', error)
    }

    services = {
      dbService,
      fileService,
      bitBrowserService,
      hubStudioService,
      playwrightService,
      uploadService,
      supabaseService,
      aiStudioService
    }
    log('initializeServices: Completed. Services object created.')
  } catch (error) {
    log(`initializeServices: FATAL ERROR: ${error.message}\n${error.stack}`)
    console.error('Service initialization failed:', error)
    throw error
  }
}

// 当 Electron 完成初始化时
app.whenReady().then(async () => {
  log('app.whenReady: Started.')


  try {
    log('app.whenReady: Calling initializeServices...')
    await initializeServices()
    log('app.whenReady: initializeServices returned.')
  } catch (error) {
    log(`app.whenReady: Initialization error: ${error.message}`)
    console.error('Initialization error:', error)
  }

  log('app.whenReady: Calling createWindow...')
  createWindow()

  if (mainWindow) {
    log('app.whenReady: Calling setupIPC...')
    try {
      log(`app.whenReady: Services keys: ${Object.keys(services || {}).join(', ')}`)
    } catch (e) { }

    setupIPC(mainWindow, services)
    log('app.whenReady: setupIPC returned.')

    // 初始化定时任务服务
    log('app.whenReady: Initializing scheduler service...')
    try {
      const schedulerService = require('./services/scheduler.service')
      schedulerService.init(services, mainWindow)
      log('app.whenReady: Scheduler service initialized.')
    } catch (error) {
      log(`app.whenReady: Scheduler init error: ${error.message}`)
      console.error('Scheduler initialization error:', error)
    }
  } else {
    log('app.whenReady: mainWindow is null!')
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// 当所有窗口关闭时
app.on('window-all-closed', () => {
  // 在 macOS 上，除非用户用 Cmd + Q 确定退出
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// 应用退出前的清理
app.on('before-quit', () => {
  console.log('Cleaning up before quit...')
  log('app: before-quit')

  if (services.fileService) {
    services.fileService.closeAll()
  }

  if (services.playwrightService) {
    services.playwrightService.closeAll()
  }

  if (services.dbService) {
    services.dbService.close()
  }
})

// 捕获未处理的异常
process.on('uncaughtException', (error) => {
  log(`Uncaught exception: ${error.message}\n${error.stack}`)
  console.error('Uncaught exception:', error)
})

process.on('unhandledRejection', (error) => {
  log(`Unhandled rejection: ${error.message}\n${error.stack}`)
  console.error('Unhandled rejection:', error)
})
