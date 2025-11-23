const { contextBridge, ipcRenderer } = require('electron')

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electron', {
  // 文件管理
  file: {
    scan: (folderPath) => ipcRenderer.invoke('file:scan', folderPath),
    move: (sourcePath, destFolder) => ipcRenderer.invoke('file:move', sourcePath, destFolder)
  },

  // 比特浏览器
  browser: {
    test: () => ipcRenderer.invoke('browser:test'),
    list: () => ipcRenderer.invoke('browser:list'),
    create: (config) => ipcRenderer.invoke('browser:create', config)
  },

  // 上传任务
  upload: {
    create: (taskData) => ipcRenderer.invoke('upload:create', taskData),
    list: (status) => ipcRenderer.invoke('upload:list', status),
    cancel: (taskId) => ipcRenderer.invoke('upload:cancel', taskId),
    queueStatus: () => ipcRenderer.invoke('upload:queue-status'),

    // 监听上传进度
    onProgress: (callback) => {
      ipcRenderer.on('upload:progress', (event, data) => callback(data))
    },

    // 监听上传状态变化
    onStatus: (callback) => {
      ipcRenderer.on('upload:status', (event, data) => callback(data))
    },

    // 监听任务添加
    onAdded: (callback) => {
      ipcRenderer.on('upload:added', (event, data) => callback(data))
    },

    // 移除监听器
    removeListener: (channel) => {
      ipcRenderer.removeAllListeners(channel)
    }
  },

  // 数据库
  db: {
    getBrowserProfiles: () => ipcRenderer.invoke('db:browser-profiles'),
    saveBrowserProfile: (profile) => ipcRenderer.invoke('db:save-browser-profile', profile),
    updateProfilesOrder: (profiles) => ipcRenderer.invoke('db:update-profiles-order', profiles),
    getSetting: (key) => ipcRenderer.invoke('db:get-setting', key),
    setSetting: (key, value) => ipcRenderer.invoke('db:set-setting', key, value)
  }
})

console.log('Preload script loaded')
