const { ipcMain } = require('electron')

function setupIPC(mainWindow, services) {
  const { dbService, fileService, bitBrowserService, uploadService } = services

  // ===== 文件管理相关 =====

  ipcMain.handle('file:scan', async (event, folderPath) => {
    try {
      return await fileService.scanFolder(folderPath)
    } catch (error) {
      console.error('file:scan error:', error)
      throw error
    }
  })

  ipcMain.handle('file:move', async (event, sourcePath, destFolder) => {
    try {
      return await fileService.moveFile(sourcePath, destFolder)
    } catch (error) {
      console.error('file:move error:', error)
      throw error
    }
  })

  // ===== 比特浏览器相关 =====

  ipcMain.handle('browser:test', async () => {
    try {
      return await bitBrowserService.testConnection()
    } catch (error) {
      console.error('browser:test error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('browser:list', async () => {
    try {
      return await bitBrowserService.getProfiles()
    } catch (error) {
      console.error('browser:list error:', error)
      throw error
    }
  })

  ipcMain.handle('browser:create', async (event, config) => {
    try {
      return await bitBrowserService.createProfile(config)
    } catch (error) {
      console.error('browser:create error:', error)
      throw error
    }
  })

  // ===== 上传任务相关 =====

  ipcMain.handle('upload:create', async (event, taskData) => {
    try {
      return await uploadService.addTask(taskData)
    } catch (error) {
      console.error('upload:create error:', error)
      throw error
    }
  })

  ipcMain.handle('upload:list', async (event, status) => {
    try {
      return uploadService.getTasks(status)
    } catch (error) {
      console.error('upload:list error:', error)
      throw error
    }
  })

  ipcMain.handle('upload:cancel', async (event, taskId) => {
    try {
      return await uploadService.cancelTask(taskId)
    } catch (error) {
      console.error('upload:cancel error:', error)
      throw error
    }
  })

  ipcMain.handle('upload:queue-status', async () => {
    try {
      return uploadService.getQueueStatus()
    } catch (error) {
      console.error('upload:queue-status error:', error)
      throw error
    }
  })

  // ===== 数据库相关 =====

  ipcMain.handle('db:browser-profiles', async () => {
    try {
      return dbService.getBrowserProfiles()
    } catch (error) {
      console.error('db:browser-profiles error:', error)
      throw error
    }
  })

  ipcMain.handle('db:save-browser-profile', async (event, profile) => {
    try {
      return dbService.createBrowserProfile(profile)
    } catch (error) {
      console.error('db:save-browser-profile error:', error)
      throw error
    }
  })

  ipcMain.handle('db:get-setting', async (event, key) => {
    try {
      return dbService.getSetting(key)
    } catch (error) {
      console.error('db:get-setting error:', error)
      return null
    }
  })

  ipcMain.handle('db:set-setting', async (event, key, value) => {
    try {
      return dbService.setSetting(key, value)
    } catch (error) {
      console.error('db:set-setting error:', error)
      throw error
    }
  })

  // ===== 上传进度事件 =====

  uploadService.on('task-progress', (data) => {
    mainWindow.webContents.send('upload:progress', data)
  })

  uploadService.on('task-update', (data) => {
    mainWindow.webContents.send('upload:status', data)
  })

  uploadService.on('task-added', (data) => {
    mainWindow.webContents.send('upload:added', data)
  })

  console.log('IPC handlers initialized')
}

module.exports = { setupIPC }
