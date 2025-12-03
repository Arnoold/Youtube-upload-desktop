const { contextBridge, ipcRenderer } = require('electron')

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electron', {
  // 文件管理
  file: {
    scan: (folderPath) => ipcRenderer.invoke('file:scan', folderPath),
    scanShallow: (folderPath) => ipcRenderer.invoke('file:scan-shallow', folderPath),
    move: (sourcePath, destFolder) => ipcRenderer.invoke('file:move', sourcePath, destFolder),
    moveToPublished: (folderPath) => ipcRenderer.invoke('file:move-to-published', folderPath)
  },

  // 浏览器管理 (支持 BitBrowser 和 HubStudio)
  browser: {
    test: () => ipcRenderer.invoke('browser:test'),
    list: () => ipcRenderer.invoke('browser:list'),
    create: (config) => ipcRenderer.invoke('browser:create', config),
    checkStatus: (browserId, browserType) => ipcRenderer.invoke('browser:check-status', browserId, browserType)
  },

  // HubStudio 浏览器
  hubstudio: {
    setCredentials: (appId, appSecret, groupCode) => ipcRenderer.invoke('hubstudio:set-credentials', appId, appSecret, groupCode),
    getCredentials: () => ipcRenderer.invoke('hubstudio:get-credentials'),
    test: () => ipcRenderer.invoke('hubstudio:test'),
    list: () => ipcRenderer.invoke('hubstudio:list')
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
    updateBrowserProfile: (id, updates) => ipcRenderer.invoke('db:update-browser-profile', id, updates),
    deleteBrowserProfile: (id) => ipcRenderer.invoke('db:delete-browser-profile', id),
    updateProfilesOrder: (profiles) => ipcRenderer.invoke('db:update-profiles-order', profiles),

    // AI Studio 账号
    getAIStudioAccounts: () => ipcRenderer.invoke('db:ai-studio-accounts'),
    saveAIStudioAccount: (account) => ipcRenderer.invoke('db:save-ai-studio-account', account),
    updateAIStudioAccount: (id, updates) => ipcRenderer.invoke('db:update-ai-studio-account', id, updates),
    deleteAIStudioAccount: (id) => ipcRenderer.invoke('db:delete-ai-studio-account', id),

    // 解说词任务
    createCommentaryTask: (task) => ipcRenderer.invoke('db:create-commentary-task', task),
    getCommentaryTasks: () => ipcRenderer.invoke('db:get-commentary-tasks'),
    getCommentaryTaskById: (id) => ipcRenderer.invoke('db:get-commentary-task-by-id', id),
    getCommentaryTaskItems: (taskId) => ipcRenderer.invoke('db:get-commentary-task-items', taskId),
    deleteCommentaryTask: (id) => ipcRenderer.invoke('db:delete-commentary-task', id),

    getSetting: (key) => ipcRenderer.invoke('db:get-setting', key),
    setSetting: (key, value) => ipcRenderer.invoke('db:set-setting', key, value)
  },

  // 对话框
  dialog: {
    selectFolder: () => ipcRenderer.invoke('dialog:select-folder')
  },

  // Supabase 数据库
  supabase: {
    connect: (url, apiKey, tableName) => ipcRenderer.invoke('supabase:connect', url, apiKey, tableName),
    test: () => ipcRenderer.invoke('supabase:test'),
    getConfig: () => ipcRenderer.invoke('supabase:get-config'),
    setTable: (tableName) => ipcRenderer.invoke('supabase:set-table', tableName),
    getVideos: (options) => ipcRenderer.invoke('supabase:get-videos', options),
    getVideo: (id) => ipcRenderer.invoke('supabase:get-video', id),
    updateStatus: (id, status, errorMessage) => ipcRenderer.invoke('supabase:update-status', id, status, errorMessage),
    getColumns: () => ipcRenderer.invoke('supabase:get-columns'),
    searchChannels: (keyword, limit) => ipcRenderer.invoke('supabase:search-channels', keyword, limit),
    getGroups: () => ipcRenderer.invoke('supabase:get-groups'),
    disconnect: () => ipcRenderer.invoke('supabase:disconnect')
  },

  // AI Studio 自动化
  aiStudio: {
    setPrompt: (prompt) => ipcRenderer.invoke('aistudio:set-prompt', prompt),
    getPrompt: () => ipcRenderer.invoke('aistudio:get-prompt'),
    process: (video, browserProfileId) => ipcRenderer.invoke('aistudio:process', video, browserProfileId),
    batchProcess: (videos, browserProfileId) => ipcRenderer.invoke('aistudio:batch-process', videos, browserProfileId),
    startTask: (taskId, browserProfileId) => ipcRenderer.invoke('aistudio:start-task', taskId, browserProfileId),
    stopTask: () => ipcRenderer.invoke('aistudio:stop-task'),
    getStatus: () => ipcRenderer.invoke('aistudio:status'),
    cancel: () => ipcRenderer.invoke('aistudio:cancel'),
    openBrowser: (videoLink, browserId, prompt) => ipcRenderer.invoke('aistudio:open-browser', videoLink, browserId, prompt),

    // 监听处理进度
    onProgress: (callback) => {
      ipcRenderer.on('aistudio:progress', (event, data) => callback(data))
    },

    // 移除监听器
    removeListener: (channel) => {
      ipcRenderer.removeAllListeners(channel)
    }
  },

  // 抖音视频采集
  douyin: {
    checkChrome: () => ipcRenderer.invoke('douyin:check-chrome'),
    getProfiles: () => ipcRenderer.invoke('douyin:get-profiles'),
    killChrome: () => ipcRenderer.invoke('douyin:kill-chrome'),
    startDebugMode: (profileId) => ipcRenderer.invoke('douyin:start-debug-mode', profileId),
    launch: (profileId) => ipcRenderer.invoke('douyin:launch', profileId),
    open: () => ipcRenderer.invoke('douyin:open'),
    getCurrentVideo: () => ipcRenderer.invoke('douyin:get-current-video'),
    scrollNext: () => ipcRenderer.invoke('douyin:scroll-next'),
    scrollPrev: () => ipcRenderer.invoke('douyin:scroll-prev'),
    collect: (count) => ipcRenderer.invoke('douyin:collect', count),
    stop: () => ipcRenderer.invoke('douyin:stop'),
    close: () => ipcRenderer.invoke('douyin:close'),
    getStatus: () => ipcRenderer.invoke('douyin:status'),
    getCollected: () => ipcRenderer.invoke('douyin:get-collected'),
    clear: () => ipcRenderer.invoke('douyin:clear'),

    // 监听采集进度
    onProgress: (callback) => {
      ipcRenderer.on('douyin:progress', (event, data) => callback(data))
    },

    // 移除监听器
    removeListener: (channel) => {
      ipcRenderer.removeAllListeners(channel)
    }
  },

  // 定时任务
  scheduler: {
    getConfig: () => ipcRenderer.invoke('scheduler:getConfig'),
    updateConfig: (config) => ipcRenderer.invoke('scheduler:updateConfig', config),
    enable: () => ipcRenderer.invoke('scheduler:enable'),
    disable: () => ipcRenderer.invoke('scheduler:disable'),
    executeNow: () => ipcRenderer.invoke('scheduler:executeNow'),
    getLogs: (limit) => ipcRenderer.invoke('scheduler:getLogs', limit),
    clearLogs: () => ipcRenderer.invoke('scheduler:clearLogs'),
    getStatus: () => ipcRenderer.invoke('scheduler:getStatus'),

    // 监听定时任务状态
    onStatus: (callback) => {
      ipcRenderer.on('scheduler:status', (event, data) => callback(data))
    },

    // 监听日志
    onLog: (callback) => {
      ipcRenderer.on('scheduler:log', (event, data) => callback(data))
    },

    // 移除监听器
    removeListener: (channel) => {
      ipcRenderer.removeAllListeners(channel)
    }
  }
})

console.log('Preload script loaded')
