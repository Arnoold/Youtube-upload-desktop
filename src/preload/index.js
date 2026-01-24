const { contextBridge, ipcRenderer, shell } = require('electron')

// 暴露安全的 API 给渲染进程
contextBridge.exposeInMainWorld('electron', {
  // Shell - 用系统默认程序打开
  shell: {
    openExternal: (url) => shell.openExternal(url)
  },

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
    checkStatus: (browserId, browserType) => ipcRenderer.invoke('browser:check-status', browserId, browserType),
    closeAllBitBrowser: () => ipcRenderer.invoke('browser:closeAllBitBrowser'),
    closeAllHubStudio: () => ipcRenderer.invoke('browser:closeAllHubStudio')
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
    getCommentaryTaskStats: (taskId) => ipcRenderer.invoke('db:get-commentary-task-stats', taskId),
    deleteCommentaryTask: (id) => ipcRenderer.invoke('db:delete-commentary-task', id),

    // 自有频道任务
    createOwnChannelTask: (task) => ipcRenderer.invoke('db:create-own-channel-task', task),
    getOwnChannelTasks: () => ipcRenderer.invoke('db:get-own-channel-tasks'),
    getOwnChannelTasksWithStats: () => ipcRenderer.invoke('db:get-own-channel-tasks-with-stats'),
    getOwnChannelTaskById: (id) => ipcRenderer.invoke('db:get-own-channel-task-by-id', id),
    getOwnChannelTaskItems: (taskId) => ipcRenderer.invoke('db:get-own-channel-task-items', taskId),
    getOwnChannelTaskStats: (taskId) => ipcRenderer.invoke('db:get-own-channel-task-stats', taskId),
    deleteOwnChannelTask: (id) => ipcRenderer.invoke('db:delete-own-channel-task', id),

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
    startTask: (taskId, browserProfileId, taskType) => ipcRenderer.invoke('aistudio:start-task', taskId, browserProfileId, taskType),
    stopTask: () => ipcRenderer.invoke('aistudio:stop-task'),
    getStatus: () => ipcRenderer.invoke('aistudio:status'),
    cancel: () => ipcRenderer.invoke('aistudio:cancel'),
    forceReset: () => ipcRenderer.invoke('aistudio:force-reset'),
    getUsageStats: () => ipcRenderer.invoke('aistudio:get-usage-stats'),
    resetDailyCount: (accountId) => ipcRenderer.invoke('aistudio:reset-daily-count', accountId),
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

    // 获取当前视频发布信息 (作者、发布时间、点赞数、时长)
    getVideoPublishInfo: () => ipcRenderer.invoke('douyin:get-video-publish-info'),
    // 点击收藏按钮
    clickFavorite: () => ipcRenderer.invoke('douyin:click-favorite'),
    // 点击分享并复制链接
    shareCopyLink: () => ipcRenderer.invoke('douyin:share-copy-link'),
    // 连续采集推荐视频 (符合时间条件的视频)
    collectRecommended: (options) => ipcRenderer.invoke('douyin:collect-recommended', options),

    // 获取历史采集视频
    getHistoryVideos: (options) => ipcRenderer.invoke('douyin:get-history-videos', options),
    // 获取采集日期列表
    getCollectionDates: () => ipcRenderer.invoke('douyin:get-collection-dates'),
    // 删除单个视频记录
    deleteVideo: (id) => ipcRenderer.invoke('douyin:delete-video', id),
    // 清空所有历史视频
    clearAllVideos: () => ipcRenderer.invoke('douyin:clear-all-videos'),

    // 监听采集进度
    onProgress: (callback) => {
      ipcRenderer.on('douyin:progress', (event, data) => callback(data))
    },

    // 监听推荐视频采集进度
    onRecommendProgress: (callback) => {
      ipcRenderer.on('douyin:recommend-progress', (event, data) => callback(data))
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
    openBrowsers: (browserIds) => ipcRenderer.invoke('scheduler:openBrowsers', browserIds),

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

  // 自有频道定时任务
  ownChannelScheduler: {
    getConfig: () => ipcRenderer.invoke('own-channel-scheduler:getConfig'),
    updateConfig: (config) => ipcRenderer.invoke('own-channel-scheduler:updateConfig', config),
    enable: () => ipcRenderer.invoke('own-channel-scheduler:enable'),
    disable: () => ipcRenderer.invoke('own-channel-scheduler:disable'),
    executeNow: () => ipcRenderer.invoke('own-channel-scheduler:executeNow'),
    getLogs: (limit) => ipcRenderer.invoke('own-channel-scheduler:getLogs', limit),
    clearLogs: () => ipcRenderer.invoke('own-channel-scheduler:clearLogs'),
    getStatus: () => ipcRenderer.invoke('own-channel-scheduler:getStatus'),
    openBrowsers: (browserIds) => ipcRenderer.invoke('own-channel-scheduler:openBrowsers', browserIds),

    // 监听定时任务状态
    onStatus: (callback) => {
      ipcRenderer.on('own-channel-scheduler:status', (event, data) => callback(data))
    },

    // 监听日志
    onLog: (callback) => {
      ipcRenderer.on('own-channel-scheduler:log', (event, data) => callback(data))
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
  },

  // YouTube 视频采集
  youtubeCollect: {
    // 启动浏览器
    launchBrowser: (browserId) => ipcRenderer.invoke('youtube-collect:launch-browser', browserId),
    // 关闭浏览器
    closeBrowser: () => ipcRenderer.invoke('youtube-collect:close-browser'),
    // 获取状态
    getStatus: () => ipcRenderer.invoke('youtube-collect:get-status'),
    // 打开 YouTube
    openYouTube: () => ipcRenderer.invoke('youtube-collect:open-youtube'),
    // 获取当前视频信息
    getVideoInfo: () => ipcRenderer.invoke('youtube-collect:get-video-info'),
    // 获取当前 Shorts 视频信息
    getCurrentShorts: () => ipcRenderer.invoke('youtube-collect:get-current-shorts'),
    // 滑动到下一个 Shorts 视频
    scrollNext: () => ipcRenderer.invoke('youtube-collect:scroll-next'),
    // 获取首页视频列表
    getHomeVideos: () => ipcRenderer.invoke('youtube-collect:get-home-videos'),
    // 采集视频
    collectVideos: (options) => ipcRenderer.invoke('youtube-collect:collect-videos', options),
    // 停止采集
    stopCollection: () => ipcRenderer.invoke('youtube-collect:stop-collection'),
    // 获取已采集的视频
    getCollectedVideos: () => ipcRenderer.invoke('youtube-collect:get-collected-videos'),
    // 清空已采集的视频
    clearCollectedVideos: () => ipcRenderer.invoke('youtube-collect:clear-collected-videos'),

    // ==================== 自动采集相关 ====================
    // 开始自动采集（保存到数据库）
    startAutoCollect: (options) => ipcRenderer.invoke('youtube-collect:start-auto-collect', options),
    // 停止自动采集
    stopAutoCollect: () => ipcRenderer.invoke('youtube-collect:stop-auto-collect'),
    // 获取数据库中保存的视频
    getSavedVideos: (options) => ipcRenderer.invoke('youtube-collect:get-saved-videos', options),
    // 删除数据库中的视频
    deleteSavedVideo: (id) => ipcRenderer.invoke('youtube-collect:delete-saved-video', id),
    // 清空数据库中的视频
    clearSavedVideos: () => ipcRenderer.invoke('youtube-collect:clear-saved-videos'),
    // 获取采集日期列表
    getCollectionDates: () => ipcRenderer.invoke('youtube-collect:get-collection-dates'),

    // 监听采集进度
    onProgress: (callback) => {
      ipcRenderer.on('youtube-collect:progress', (event, data) => callback(data))
    },

    // 监听自动采集进度
    onAutoProgress: (callback) => {
      ipcRenderer.on('youtube-collect:auto-progress', (event, data) => callback(data))
    },

    // 移除监听器
    removeListener: (channel) => {
      ipcRenderer.removeAllListeners(channel)
    },

    // ==================== 对标频道同步相关 ====================
    // 从 Supabase 同步对标频道数据
    syncBenchmarkFromSupabase: () => ipcRenderer.invoke('youtube-collect:sync-benchmark-from-supabase'),
    // 获取本地对标频道分组
    getLocalBenchmarkGroups: () => ipcRenderer.invoke('youtube-collect:get-local-benchmark-groups'),
    // 获取本地对标频道
    getLocalBenchmarkChannels: (groupName) => ipcRenderer.invoke('youtube-collect:get-local-benchmark-channels', groupName),
    // 获取同步状态
    getBenchmarkSyncStatus: () => ipcRenderer.invoke('youtube-collect:get-benchmark-sync-status'),

    // ==================== 采集视频同步到Supabase ====================
    // 同步本地采集视频到Supabase
    syncToSupabase: () => ipcRenderer.invoke('youtube-collect:sync-to-supabase'),
    // 监听同步进度
    onSyncToSupabaseProgress: (callback) => {
      ipcRenderer.on('youtube-collect:sync-to-supabase-progress', (event, data) => callback(data))
    }
  }
})

console.log('Preload script loaded')
