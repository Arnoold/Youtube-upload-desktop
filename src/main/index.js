const { app, BrowserWindow } = require('electron')
const path = require('path')
const { setupIPC } = require('./ipc-handlers')

// 导入服务
const DatabaseService = require('./services/database.service')
const FileService = require('./services/file.service')
const BitBrowserService = require('./services/bitbrowser.service')
const PlaywrightService = require('./services/playwright.service')
const UploadService = require('./services/upload.service')

let mainWindow = null
let services = {}

function createWindow() {
  // 创建浏览器窗口
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true
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

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

async function initializeServices() {
  try {
    console.log('Initializing services...')

    // 初始化数据库
    const dbService = new DatabaseService()
    await dbService.initialize()

    // 初始化其他服务
    const fileService = new FileService()
    const bitBrowserService = new BitBrowserService()
    const playwrightService = new PlaywrightService()
    const uploadService = new UploadService(dbService, bitBrowserService, playwrightService)

    services = {
      dbService,
      fileService,
      bitBrowserService,
      playwrightService,
      uploadService
    }

    console.log('All services initialized successfully')

    // 设置 IPC 处理程序
    setupIPC(mainWindow, services)

    return true
  } catch (error) {
    console.error('Failed to initialize services:', error)
    throw error
  }
}

// 当 Electron 完成初始化时
app.whenReady().then(async () => {
  createWindow()

  try {
    await initializeServices()
  } catch (error) {
    console.error('Initialization error:', error)
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
  console.error('Uncaught exception:', error)
})

process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error)
})
