const { contextBridge, ipcRenderer } = require('electron')

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electron', {
  // 文件管理
  file: {
    scan: (folderPath) => ipcRenderer.invoke('file:scan', folderPath),
    scanShallow: (folderPath) => ipcRenderer.invoke('file:scan-shallow', folderPath),
    move: (sourcePath, destFolder) => ipcRenderer.invoke('file:move', sourcePath, destFolder),
    moveToPublished: (folderPath) => ipcRenderer.invoke('file:move-to-published', folderPath),
    openFile: (filePath) => ipcRenderer.invoke('file:open', filePath)
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
    list: () => ipcRenderer.invoke('hubstudio:list'),
    batchStatus: (containerCodes) => ipcRenderer.invoke('hubstudio:batch-status', containerCodes)
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
    getCommentaryTasksWithStats: () => ipcRenderer.invoke('db:get-commentary-tasks-with-stats'),
    getCommentaryTaskById: (id) => ipcRenderer.invoke('db:get-commentary-task-by-id', id),
    getCommentaryTaskItems: (taskId) => ipcRenderer.invoke('db:get-commentary-task-items', taskId),
    getCommentaryTaskStats: (taskId) => ipcRenderer.invoke('db:get-commentary-task-stats', taskId),
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

  // 采集账号管理
  collectAccount: {
    list: (platform) => ipcRenderer.invoke('collect-account:list', platform),
    get: (id) => ipcRenderer.invoke('collect-account:get', id),
    create: (account) => ipcRenderer.invoke('collect-account:create', account),
    update: (id, account) => ipcRenderer.invoke('collect-account:update', id, account),
    delete: (id) => ipcRenderer.invoke('collect-account:delete', id)
  },

  // 抖音视频采集
  douyin: {
    // 启动比特浏览器并连接
    launch: (browserId) => ipcRenderer.invoke('douyin:launch', browserId),
    // 打开抖音页面
    open: () => ipcRenderer.invoke('douyin:open'),
    // 获取当前视频信息
    getCurrentVideo: () => ipcRenderer.invoke('douyin:get-current-video'),
    // 滑动到下一个视频
    scrollNext: () => ipcRenderer.invoke('douyin:scroll-next'),
    // 滑动到上一个视频
    scrollPrev: () => ipcRenderer.invoke('douyin:scroll-prev'),
    // 自动采集视频
    collect: (count) => ipcRenderer.invoke('douyin:collect', count),
    // 停止采集
    stop: () => ipcRenderer.invoke('douyin:stop'),
    // 关闭浏览器连接
    close: () => ipcRenderer.invoke('douyin:close'),
    // 获取状态
    getStatus: () => ipcRenderer.invoke('douyin:status'),
    // 获取已采集的视频
    getCollected: () => ipcRenderer.invoke('douyin:get-collected'),
    // 清空采集列表
    clear: () => ipcRenderer.invoke('douyin:clear'),
    // 获取页面数据 (RENDER_DATA)
    getPageData: () => ipcRenderer.invoke('douyin:get-page-data'),

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
  },

  // YouTube 上传
  youtube: {
    // 打开 YouTube Studio
    openStudio: (browserId, browserType) => ipcRenderer.invoke('youtube:open-studio', browserId, browserType),
    // 点击创建按钮
    clickCreate: (browserId) => ipcRenderer.invoke('youtube:click-create', browserId),
    // 点击上传视频
    clickUpload: (browserId) => ipcRenderer.invoke('youtube:click-upload', browserId),
    // 选择视频文件
    selectFile: (browserId, videoPath) => ipcRenderer.invoke('youtube:select-file', browserId, videoPath),
    // 填写视频详情
    fillDetails: (browserId, videoInfo) => ipcRenderer.invoke('youtube:fill-details', browserId, videoInfo),
    // 设置非儿童内容
    setNotForKids: (browserId) => ipcRenderer.invoke('youtube:set-not-for-kids', browserId),
    // 点击下一步
    clickNext: (browserId, times) => ipcRenderer.invoke('youtube:click-next', browserId, times),
    // 设置可见性
    setVisibility: (browserId, visibility) => ipcRenderer.invoke('youtube:set-visibility', browserId, visibility),
    // 点击发布
    clickPublish: (browserId) => ipcRenderer.invoke('youtube:click-publish', browserId),
    // 完整上传流程（普通号）
    uploadNormal: (browserId, videoPath, videoInfo, browserType) => ipcRenderer.invoke('youtube:upload-normal', browserId, videoPath, videoInfo, browserType),
    // 完整上传流程（创收号）
    uploadMonetized: (browserId, videoPath, videoInfo, browserType) => ipcRenderer.invoke('youtube:upload-monetized', browserId, videoPath, videoInfo, browserType),
    // 暂停上传
    pause: () => ipcRenderer.invoke('youtube:pause'),
    // 继续上传
    resume: () => ipcRenderer.invoke('youtube:resume'),
    // 取消上传
    cancel: () => ipcRenderer.invoke('youtube:cancel'),
    // 获取上传状态
    getStatus: () => ipcRenderer.invoke('youtube:get-status'),
    // 关闭连接
    close: () => ipcRenderer.invoke('youtube:close'),
    // 获取所有正在执行的任务进度（用于页面切换后恢复）
    getAllProgress: () => ipcRenderer.invoke('youtube:get-all-progress'),
    // 获取指定浏览器的进度
    getProgress: (browserId) => ipcRenderer.invoke('youtube:get-progress', browserId),

    // 监听上传进度
    onProgress: (callback) => {
      ipcRenderer.on('youtube:progress', (event, data) => callback(data))
    },

    // 移除监听器
    removeListener: (channel) => {
      ipcRenderer.removeAllListeners(channel)
    }
  },

  // 上传日志
  uploadLog: {
    create: (logData) => ipcRenderer.invoke('upload-log:create', logData),
    update: (id, updates) => ipcRenderer.invoke('upload-log:update', id, updates),
    list: (options) => ipcRenderer.invoke('upload-log:list', options),
    get: (id) => ipcRenderer.invoke('upload-log:get', id),
    delete: (id) => ipcRenderer.invoke('upload-log:delete', id)
  },

  // 用户管理（从 Supabase 同步）
  users: {
    sync: () => ipcRenderer.invoke('users:sync'),
    getCached: () => ipcRenderer.invoke('users:get-cached'),
    getByName: (name) => ipcRenderer.invoke('users:get-by-name', name),
    getLastSync: () => ipcRenderer.invoke('users:get-last-sync')
  }
})

console.log('Preload script loaded')
