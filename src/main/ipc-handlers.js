function setupIPC(mainWindow, services) {
  const fs = require('fs')
  const path = require('path')
  // 使用动态路径，基于当前文件所在目录
  const logPath = path.join(__dirname, '../../debug_ipc.log')

  const safeLog = (msg) => {
    try {
      fs.appendFileSync(logPath, `[${new Date().toISOString()}] ${msg}\n`)
    } catch (e) {
      // 静默忽略
    }
  }

  safeLog('setupIPC called')
  safeLog(`Services keys: ${Object.keys(services || {}).join(', ')}`)

  // 延迟加载 electron 和服务，避免模块加载顺序问题
  const { ipcMain, dialog } = require('electron')

  safeLog('Requiring services...')

  const supabaseService = require('./services/supabase.service')
  const aiStudioService = require('./services/aistudio.service')
  const clipboardLock = require('./services/clipboard-lock.service')
  const douyinService = require('./services/douyin.service')
  const youtubeService = require('./services/youtube.service')

  try {
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] Services required. Destructuring...\n`)
  } catch (e) { }

  const { dbService, fileService, bitBrowserService, hubStudioService, uploadService } = services

  try {
    fs.appendFileSync(logPath, `[${new Date().toISOString()}] Destructuring complete.\n`)
  } catch (e) { }

  // ===== 文件管理相关 =====

  ipcMain.handle('file:scan', async (event, folderPath) => {
    try {
      return await fileService.scanFolder(folderPath)
    } catch (error) {
      console.error('file:scan error:', error)
      throw error
    }
  })

  ipcMain.handle('file:scan-shallow', async (event, folderPath) => {
    try {
      return await fileService.scanFolderShallow(folderPath)
    } catch (error) {
      console.error('file:scan-shallow error:', error)
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

  ipcMain.handle('file:move-to-published', async (event, folderPath) => {
    try {
      return await fileService.moveToPublishedFolder(folderPath)
    } catch (error) {
      console.error('file:move-to-published error:', error)
      throw error
    }
  })

  ipcMain.handle('file:open', async (event, filePath) => {
    try {
      const { shell } = require('electron')
      await shell.openPath(filePath)
      return { success: true }
    } catch (error) {
      console.error('file:open error:', error)
      return { success: false, error: error.message }
    }
  })

  // 打开外部链接（在默认浏览器中打开）
  ipcMain.handle('shell:openExternal', async (event, url) => {
    try {
      const { shell } = require('electron')
      await shell.openExternal(url)
      return { success: true }
    } catch (error) {
      console.error('shell:openExternal error:', error)
      return { success: false, error: error.message }
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

  ipcMain.handle('browser:check-status', async (event, browserId, browserType = 'bitbrowser') => {
    try {
      // 根据浏览器类型选择对应的服务
      if (browserType === 'hubstudio') {
        if (!hubStudioService) {
          return { success: false, error: 'HubStudio 服务未初始化' }
        }
        return await hubStudioService.checkBrowserStatus(browserId)
      }
      return await bitBrowserService.checkBrowserStatus(browserId)
    } catch (error) {
      console.error('browser:check-status error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('hubstudio:batch-status', async (event, containerCodes) => {
    try {
      if (!hubStudioService) {
        return { success: false, error: 'HubStudio 服务未初始化' }
      }
      return await hubStudioService.getBatchBrowserStatus(containerCodes)
    } catch (error) {
      console.error('hubstudio:batch-status error:', error)
      return { success: false, error: error.message }
    }
  })

  // ===== HubStudio 相关 =====

  ipcMain.handle('hubstudio:set-credentials', async (event, appId, appSecret, groupCode) => {
    try {
      hubStudioService.setCredentials(appId, appSecret, groupCode)
      // 保存到数据库
      await dbService.setSetting('hubstudio_app_id', appId)
      await dbService.setSetting('hubstudio_app_secret', appSecret)
      await dbService.setSetting('hubstudio_group_code', groupCode)
      return { success: true }
    } catch (error) {
      console.error('hubstudio:set-credentials error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('hubstudio:get-credentials', async () => {
    try {
      return hubStudioService.getCredentials()
    } catch (error) {
      console.error('hubstudio:get-credentials error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('hubstudio:test', async () => {
    try {
      return await hubStudioService.testConnection()
    } catch (error) {
      console.error('hubstudio:test error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('hubstudio:list', async () => {
    try {
      return await hubStudioService.getProfiles()
    } catch (error) {
      console.error('hubstudio:list error:', error)
      return { success: false, error: error.message }
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

  ipcMain.handle('db:update-browser-profile', async (event, id, updates) => {
    try {
      return dbService.updateBrowserProfile(id, updates)
    } catch (error) {
      console.error('db:update-browser-profile error:', error)
      throw error
    }
  })

  ipcMain.handle('db:delete-browser-profile', async (event, id) => {
    try {
      return dbService.deleteBrowserProfile(id)
    } catch (error) {
      console.error('db:delete-browser-profile error:', error)
      throw error
    }
  })

  ipcMain.handle('db:update-profiles-order', async (event, profiles) => {
    try {
      console.log('IPC db:update-profiles-order 收到:', JSON.stringify(profiles))
      const result = dbService.updateBrowserProfilesOrder(profiles)
      console.log('IPC db:update-profiles-order 结果:', result)
      return result
    } catch (error) {
      console.error('db:update-profiles-order error:', error)
      throw error
    }
  })

  // ===== AI Studio 账号 IPC =====

  ipcMain.handle('db:ai-studio-accounts', async () => {
    try {
      return dbService.getAIStudioAccounts()
    } catch (error) {
      console.error('db:ai-studio-accounts error:', error)
      throw error
    }
  })

  ipcMain.handle('db:save-ai-studio-account', async (event, account) => {
    try {
      return dbService.createAIStudioAccount(account)
    } catch (error) {
      console.error('db:save-ai-studio-account error:', error)
      throw error
    }
  })

  ipcMain.handle('db:update-ai-studio-account', async (event, id, updates) => {
    try {
      return dbService.updateAIStudioAccount(id, updates)
    } catch (error) {
      console.error('db:update-ai-studio-account error:', error)
      throw error
    }
  })

  ipcMain.handle('db:delete-ai-studio-account', async (event, id) => {
    try {
      return dbService.deleteAIStudioAccount(id)
    } catch (error) {
      console.error('db:delete-ai-studio-account error:', error)
      throw error
    }
  })

  // ===== 解说词任务 IPC =====

  ipcMain.handle('db:create-commentary-task', async (event, task) => {
    try {
      const taskId = dbService.createCommentaryTask(task)
      if (task.items && task.items.length > 0) {
        dbService.addCommentaryTaskItems(taskId, task.items)
      }
      return taskId
    } catch (error) {
      console.error('db:create-commentary-task error:', error)
      throw error
    }
  })

  ipcMain.handle('db:get-commentary-tasks', async () => {
    try {
      return dbService.getCommentaryTasks()
    } catch (error) {
      console.error('db:get-commentary-tasks error:', error)
      throw error
    }
  })

  ipcMain.handle('db:get-commentary-tasks-with-stats', async () => {
    try {
      return dbService.getCommentaryTasksWithStats()
    } catch (error) {
      console.error('db:get-commentary-tasks-with-stats error:', error)
      throw error
    }
  })

  ipcMain.handle('db:get-commentary-task-stats', async (event, taskId) => {
    try {
      return dbService.getCommentaryTaskStats(taskId)
    } catch (error) {
      console.error('db:get-commentary-task-stats error:', error)
      throw error
    }
  })

  ipcMain.handle('db:get-commentary-task-by-id', async (event, id) => {
    try {
      return dbService.getCommentaryTaskById(id)
    } catch (error) {
      console.error('db:get-commentary-task-by-id error:', error)
      throw error
    }
  })

  ipcMain.handle('db:get-commentary-task-items', async (event, taskId) => {
    try {
      return dbService.getCommentaryTaskItems(taskId)
    } catch (error) {
      console.error('db:get-commentary-task-items error:', error)
      throw error
    }
  })

  ipcMain.handle('db:delete-commentary-task', async (event, id) => {
    try {
      return dbService.deleteCommentaryTask(id)
    } catch (error) {
      console.error('db:delete-commentary-task error:', error)
      throw error
    }
  })

  // ===== 自有频道任务 IPC =====

  ipcMain.handle('db:create-own-channel-task', async (event, task) => {
    try {
      const taskId = dbService.createOwnChannelTask(task)
      if (task.items && task.items.length > 0) {
        // 复用 addCommentaryTaskItems 逻辑，但需要确认是否需要独立的方法
        // DatabaseService 中我们添加了 addOwnChannelTaskItem，但没有批量添加的方法
        // 我们需要循环调用或者在 DatabaseService 中添加批量方法
        // 为了简单，这里循环调用
        for (const item of task.items) {
          dbService.addOwnChannelTaskItem(taskId, item.video_id, item.video_info)
        }
      }
      return taskId
    } catch (error) {
      console.error('db:create-own-channel-task error:', error)
      throw error
    }
  })

  ipcMain.handle('db:get-own-channel-tasks', async () => {
    try {
      return dbService.getOwnChannelTasks()
    } catch (error) {
      console.error('db:get-own-channel-tasks error:', error)
      throw error
    }
  })

  ipcMain.handle('db:get-own-channel-tasks-with-stats', async () => {
    try {
      return dbService.getOwnChannelTasksWithStats()
    } catch (error) {
      console.error('db:get-own-channel-tasks-with-stats error:', error)
      throw error
    }
  })

  ipcMain.handle('db:get-own-channel-task-items', async (event, taskId) => {
    try {
      return dbService.getOwnChannelTaskItems(taskId)
    } catch (error) {
      console.error('db:get-own-channel-task-items error:', error)
      throw error
    }
  })

  ipcMain.handle('db:get-own-channel-task-by-id', async (event, id) => {
    try {
      return dbService.getOwnChannelTaskById(id)
    } catch (error) {
      console.error('db:get-own-channel-task-by-id error:', error)
      throw error
    }
  })

  ipcMain.handle('db:get-own-channel-task-stats', async (event, taskId) => {
    try {
      return dbService.getOwnChannelTaskStats(taskId)
    } catch (error) {
      console.error('db:get-own-channel-task-stats error:', error)
      throw error
    }
  })

  ipcMain.handle('db:delete-own-channel-task', async (event, id) => {
    try {
      return dbService.deleteOwnChannelTask(id)
    } catch (error) {
      console.error('db:delete-own-channel-task error:', error)
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

  // ===== 对话框相关 =====

  ipcMain.handle('dialog:select-folder', async () => {
    try {
      return await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory']
      })
    } catch (error) {
      console.error('dialog:select-folder error:', error)
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

  // ===== Supabase 相关 =====

  ipcMain.handle('supabase:connect', async (event, url, apiKey, tableName) => {
    try {
      supabaseService.initialize(url, apiKey)
      if (tableName) {
        supabaseService.setTableName(tableName)
      }
      return { success: true }
    } catch (error) {
      console.error('supabase:connect error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('supabase:test', async () => {
    try {
      return await supabaseService.testConnection()
    } catch (error) {
      console.error('supabase:test error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('supabase:get-config', async () => {
    try {
      return supabaseService.getConfig()
    } catch (error) {
      console.error('supabase:get-config error:', error)
      throw error
    }
  })

  ipcMain.handle('supabase:set-table', async (event, tableName) => {
    try {
      supabaseService.setTableName(tableName)
      return { success: true }
    } catch (error) {
      console.error('supabase:set-table error:', error)
      throw error
    }
  })

  ipcMain.handle('supabase:get-videos', async (event, options) => {
    try {
      return await supabaseService.getVideos(options)
    } catch (error) {
      console.error('supabase:get-videos error:', error)
      throw error
    }
  })

  ipcMain.handle('supabase:get-video', async (event, id) => {
    try {
      return await supabaseService.getVideo(id)
    } catch (error) {
      console.error('supabase:get-video error:', error)
      throw error
    }
  })

  ipcMain.handle('supabase:update-status', async (event, id, status, errorMessage) => {
    try {
      return await supabaseService.updateStatus(id, status, errorMessage)
    } catch (error) {
      console.error('supabase:update-status error:', error)
      throw error
    }
  })

  ipcMain.handle('supabase:get-columns', async () => {
    try {
      return await supabaseService.getTableColumns()
    } catch (error) {
      console.error('supabase:get-columns error:', error)
      throw error
    }
  })

  ipcMain.handle('supabase:search-channels', async (event, keyword, limit) => {
    try {
      return await supabaseService.searchChannels(keyword, limit)
    } catch (error) {
      console.error('supabase:search-channels error:', error)
      throw error
    }
  })

  ipcMain.handle('supabase:get-groups', async () => {
    try {
      return await supabaseService.getGroups()
    } catch (error) {
      console.error('supabase:get-groups error:', error)
      throw error
    }
  })

  ipcMain.handle('supabase:search-own-channels', async (event, keyword, limit) => {
    try {
      return await supabaseService.searchOwnChannels(keyword, limit)
    } catch (error) {
      console.error('supabase:search-own-channels error:', error)
      throw error
    }
  })

  ipcMain.handle('supabase:get-own-channel-groups', async () => {
    try {
      return await supabaseService.getOwnChannelGroups()
    } catch (error) {
      console.error('supabase:get-own-channel-groups error:', error)
      throw error
    }
  })

  ipcMain.handle('supabase:disconnect', async () => {
    try {
      supabaseService.disconnect()
      return { success: true }
    } catch (error) {
      console.error('supabase:disconnect error:', error)
      throw error
    }
  })

  // ===== AI Studio 相关 =====

  ipcMain.handle('aistudio:set-prompt', async (event, prompt) => {
    try {
      aiStudioService.setDefaultPrompt(prompt)
      return { success: true }
    } catch (error) {
      console.error('aistudio:set-prompt error:', error)
      throw error
    }
  })

  ipcMain.handle('aistudio:get-prompt', async () => {
    try {
      return aiStudioService.getDefaultPrompt()
    } catch (error) {
      console.error('aistudio:get-prompt error:', error)
      throw error
    }
  })

  ipcMain.handle('aistudio:process', async (event, video, browserProfileId) => {
    try {
      return await aiStudioService.processVideo(video, browserProfileId, (progress) => {
        mainWindow.webContents.send('aistudio:progress', progress)
      })
    } catch (error) {
      console.error('aistudio:process error:', error)
      throw error
    }
  })

  ipcMain.handle('aistudio:start-task', async (event, taskId, browserProfileIds, taskType = 'benchmark') => {
    try {
      // 支持多浏览器并行执行
      // browserProfileIds 可以是单个字符串或数组
      const profileIds = Array.isArray(browserProfileIds) ? browserProfileIds : [browserProfileIds]

      // 不等待 Promise 完成，直接返回，通过事件发送进度
      if (profileIds.length > 1) {
        // 多浏览器并行模式
        aiStudioService.startParallelTask(taskId, profileIds, (progress) => {
          mainWindow.webContents.send('aistudio:progress', progress)
        }, taskType).catch(err => {
          console.error('Async parallel task error:', err)
          mainWindow.webContents.send('aistudio:progress', {
            taskId,
            status: 'error',
            error: err.message,
            message: '并行任务执行失败: ' + err.message
          })
        })
      } else {
        // 单浏览器模式（兼容旧逻辑）
        aiStudioService.startTask(taskId, profileIds[0], (progress) => {
          mainWindow.webContents.send('aistudio:progress', progress)
        }, taskType).catch(err => {
          console.error('Async task error:', err)
          mainWindow.webContents.send('aistudio:progress', { status: 'error', error: err.message })
        })
      }
      return { success: true, parallel: profileIds.length > 1, workerCount: profileIds.length }
    } catch (error) {
      console.error('aistudio:start-task error:', error)
      throw error
    }
  })

  ipcMain.handle('aistudio:stop-task', async () => {
    try {
      return aiStudioService.stopCurrentTask()
    } catch (error) {
      console.error('aistudio:stop-task error:', error)
      throw error
    }
  })

  ipcMain.handle('aistudio:status', async () => {
    try {
      return aiStudioService.getStatus()
    } catch (error) {
      console.error('aistudio:status error:', error)
      throw error
    }
  })

  ipcMain.handle('aistudio:cancel', async () => {
    try {
      return aiStudioService.cancelCurrentTask()
    } catch (error) {
      console.error('aistudio:cancel error:', error)
      throw error
    }
  })

  ipcMain.handle('aistudio:force-reset', async () => {
    try {
      return aiStudioService.forceReset()
    } catch (error) {
      console.error('aistudio:force-reset error:', error)
      throw error
    }
  })

  // AI Studio 使用统计
  ipcMain.handle('aistudio:get-usage-stats', async () => {
    try {
      return dbService.getAIStudioUsageStats()
    } catch (error) {
      console.error('aistudio:get-usage-stats error:', error)
      throw error
    }
  })

  ipcMain.handle('aistudio:reset-daily-count', async (event, accountId) => {
    try {
      dbService.resetAIStudioDailyCount(accountId)
      return true
    } catch (error) {
      console.error('aistudio:reset-daily-count error:', error)
      throw error
    }
  })

  // 固定的 AI Studio 浏览器配置 (作为默认值)
  const DEFAULT_BROWSER_ID = '0e7f85a348654b618508dc873b78389d'
  const AI_STUDIO_URL = 'https://aistudio.google.com/prompts/new_chat'

  ipcMain.handle('aistudio:open-browser', async (event, videoLink, browserId, prompt) => {
    try {
      const targetBrowserId = browserId || DEFAULT_BROWSER_ID
      const targetVideoLink = videoLink || 'https://www.youtube.com/watch?v=ougJV1ULixk'

      console.log('Opening AI Studio browser with ID:', targetBrowserId)
      console.log('Test video link:', targetVideoLink)

      // 启动 BitBrowser
      const browserResult = await bitBrowserService.startBrowser(targetBrowserId)

      if (!browserResult.success) {
        throw new Error('启动浏览器失败: ' + (browserResult.msg || '未知错误'))
      }

      const wsEndpoint = browserResult.wsEndpoint
      console.log('Browser started, wsEndpoint:', wsEndpoint)

      if (!wsEndpoint) {
        console.error('Browser started but no WebSocket endpoint found. Browser result:', browserResult)
        throw new Error('Browser started but failed to get WebSocket URL. Please check BitBrowser configuration.')
      }

      // 使用 Playwright 连接并打开页面
      const { playwrightService } = services
      const connection = await playwrightService.connectBrowser(wsEndpoint)

      const existingPages = connection.context.pages()
      const initialPageCount = existingPages.length
      console.log('[VERIFY_IPC] Existing pages count:', initialPageCount)

      // 尝试创建新标签页
      let page = await connection.context.newPage()

      // 检查是否真的创建了新页面
      const newPageCount = connection.context.pages().length
      console.log('[VERIFY_IPC] New pages count:', newPageCount)

      // 如果页面数量没有增加，说明 newPage() 可能复用了现有页面
      // 或者 CDP 行为异常。尝试使用 window.open 强制打开新标签页
      if (newPageCount <= initialPageCount && existingPages.length > 0) {
        console.log('[VERIFY_IPC] newPage() failed to create new tab, trying window.open() fallback...')
        const sourcePage = existingPages[0]

        // 使用 window.open 打开新窗口
        const [newPage] = await Promise.all([
          connection.context.waitForEvent('page'),
          sourcePage.evaluate(() => window.open('about:blank', '_blank'))
        ])

        if (newPage) {
          page = newPage
          console.log('[VERIFY_IPC] Successfully created new page via window.open')
          // 等待页面稳定
          await page.waitForTimeout(2000)
        }
      }

      // 导航到 AI Studio
      console.log('[VERIFY_IPC] Navigating to AI Studio:', AI_STUDIO_URL)
      await page.goto(AI_STUDIO_URL, {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      })

      // === 测试交互逻辑 (演示用) ===
      console.log('[VERIFY_IPC] Starting interaction demo...')
      try {
        // 1. 等待页面加载
        await page.waitForTimeout(3000)

        // 2. 查找输入框
        console.log('[VERIFY_IPC] Looking for input...')
        const inputSelectors = [
          'textarea[aria-label*="prompt"]',
          'textarea[placeholder*="Enter"]',
          'textarea[placeholder*="Type"]',
          '.chat-input textarea',
          'textarea',
          '[contenteditable="true"]',
          '.ql-editor',
          'div[role="textbox"]'
        ]

        let inputElement = null
        for (const selector of inputSelectors) {
          try {
            const element = await page.locator(selector).first()
            if (await element.isVisible()) {
              inputElement = element
              console.log('[VERIFY_IPC] Found input with selector:', selector)
              break
            }
          } catch (e) {
            continue
          }
        }

        if (inputElement) {
          // 3. 输入测试文本
          console.log('[VERIFY_IPC] Starting input sequence...')

          // 3.1 聚焦输入框
          await inputElement.click()
          await page.waitForTimeout(1000)

          // 清空输入框 (Ctrl+A, Backspace)
          await page.keyboard.press('Control+A')
          await page.keyboard.press('Backspace')
          await page.waitForTimeout(500)

          // 3.2 粘贴视频链接 (使用剪贴板锁保护)
          console.log('[VERIFY_IPC] Pasting link...')
          await clipboardLock.writeAndPaste(page, targetVideoLink, 'ipc-paste-video-url')

          // 3.2.1 验证视频附件是否出现（Google 更新后的新选择器）
          // 新结构：ms-prompt-media > ms-prompt-video
          console.log('[VERIFY_IPC] Waiting for video attachment...')
          try {
            // 等待 YouTube 视频组件出现，这表示粘贴成功了
            await page.waitForSelector('ms-prompt-media, ms-prompt-video, ms-youtube-chunk', {
              state: 'visible',
              timeout: 10000
            })
            console.log('[VERIFY_IPC] Video attachment detected.')
          } catch (e) {
            console.error('[VERIFY_IPC] Failed to detect video attachment after paste.')
            return {
              success: false,
              message: '粘贴视频链接失败：未检测到视频附件，请检查链接是否有效或剪贴板权限。',
              browserId: browserResult.browserId
            }
          }

          // 3.2.2 等待视频处理完成（Google 更新后的新选择器）
          // 新结构：处理完成后会显示 token 数量，或者设置按钮变为可点击状态
          console.log('[VERIFY_IPC] Waiting for video processing...')
          try {
            // 等待 token 数量出现或设置按钮可用（表示视频已处理完成）
            await page.waitForSelector('ms-token-status span[data-test-id="token-count"], ms-prompt-media button[aria-label="Edit video options"]:not([disabled]), mat-icon:has-text("settings_video_camera"), span.material-symbols-outlined:has-text("settings")', {
              state: 'visible',
              timeout: 60000
            })
            console.log('[VERIFY_IPC] Video processing complete (token count or settings icon found)')
          } catch (e) {
            console.error('[VERIFY_IPC] Timeout waiting for video processing.')
            return {
              success: false,
              message: '视频处理超时：未检测到处理完成标志（token数量或设置图标）。',
              browserId: browserResult.browserId
            }
          }

          await page.waitForTimeout(1000)

          // 3.3 输入提示词
          console.log('[VERIFY_IPC] Typing prompt...')
          // 换行
          await page.keyboard.press('Shift+Enter')
          await page.keyboard.press('Shift+Enter')

          // 使用传入的 prompt，如果未传入则使用默认值 (虽然前端应该会传入)
          const promptToUse = prompt || `请分析视频内容...` // 简化的默认值，实际逻辑由前端控制

          // 确保输入框有焦点
          await inputElement.click()
          await page.waitForTimeout(500)

          // 使用剪贴板锁保护粘贴操作
          console.log('[VERIFY_IPC] Pasting prompt...')
          await clipboardLock.writeAndPaste(page, promptToUse, 'ipc-paste-prompt')
          console.log('[VERIFY_IPC] Input complete')

          // 4. 尝试点击发送
          console.log('[VERIFY_IPC] Ready to send...')
          // 增加随机等待，模拟人类思考/检查
          await page.waitForTimeout(2000 + Math.random() * 1000)

          // 发送 - 增强版：多重验证和重试机制
          // 基于实际 HTML 结构优化的选择器（按优先级排序）
          const runButtonSelectors = [
            // 最精确：ms-run-button 组件内的 button
            'ms-run-button button.run-button',
            'ms-run-button button[aria-label="Run"]',
            'ms-run-button button[type="submit"]',
            // 次精确：class 和 aria-label 组合
            'button.run-button[aria-label="Run"]',
            'button.run-button[type="submit"]',
            // 通用选择器
            'button[aria-label="Run"]',
            'button.run-button',
            'button:has-text("Run")',
            '[data-testid="run-button"]',
            'button[type="submit"]:has-text("Run")'
          ]

          const stopBtnSelector = 'button:has-text("Stop")'
          const maxRunRetries = 3
          let runSuccess = false

          for (let runRetry = 0; runRetry < maxRunRetries && !runSuccess; runRetry++) {
            if (runRetry > 0) {
              console.log(`[VERIFY_IPC] 发送按钮点击重试 ${runRetry}/${maxRunRetries}...`)
              await page.waitForTimeout(1000)
            }

            let runClicked = false
            for (const selector of runButtonSelectors) {
              try {
                const btn = await page.locator(selector).first()
                const isVisible = await btn.isVisible({ timeout: 500 })
                if (isVisible) {
                  // 获取按钮位置信息用于调试
                  const box = await btn.boundingBox()
                  console.log(`[VERIFY_IPC] 找到发送按钮: ${selector}, 位置: x=${box?.x}, y=${box?.y}, w=${box?.width}, h=${box?.height}`)

                  // 确保按钮在视口内
                  await btn.scrollIntoViewIfNeeded()
                  await page.waitForTimeout(200)

                  // 检查按钮是否被禁用
                  const isDisabled = await btn.getAttribute('aria-disabled')
                  if (isDisabled === 'true') {
                    console.log('[VERIFY_IPC] ⚠ 按钮被禁用，跳过此选择器')
                    continue
                  }

                  // 模拟鼠标移动到按钮上
                  await btn.hover()
                  await page.waitForTimeout(200 + Math.random() * 200)

                  // 方法1：先尝试普通点击
                  try {
                    await btn.click({ timeout: 3000 })
                    console.log('[VERIFY_IPC] ✓ 普通点击发送按钮成功:', selector)
                    runClicked = true
                    break
                  } catch (clickErr) {
                    console.log('[VERIFY_IPC] 普通点击失败，尝试强制点击...')
                  }

                  // 方法2：强制点击
                  try {
                    await btn.click({ force: true, timeout: 3000 })
                    console.log('[VERIFY_IPC] ✓ 强制点击发送按钮成功:', selector)
                    runClicked = true
                    break
                  } catch (forceClickErr) {
                    console.log('[VERIFY_IPC] 强制点击也失败，尝试 JavaScript 点击...')
                  }

                  // 方法3：使用 JavaScript 直接点击
                  try {
                    await btn.evaluate((el) => el.click())
                    console.log('[VERIFY_IPC] ✓ JavaScript 点击发送按钮成功:', selector)
                    runClicked = true
                    break
                  } catch (jsClickErr) {
                    console.log('[VERIFY_IPC] JavaScript 点击也失败:', jsClickErr.message)
                  }
                }
              } catch (e) {
                continue
              }
            }

            // 如果所有按钮点击方式都失败，使用快捷键 Ctrl+Enter
            if (!runClicked) {
              console.log('[VERIFY_IPC] 所有按钮点击方式失败，使用 Ctrl+Enter 快捷键...')
              try {
                await inputElement.focus()
                await page.waitForTimeout(200)
                await page.keyboard.press('Control+Enter')
                console.log('[VERIFY_IPC] ✓ 已发送 Ctrl+Enter 快捷键')
              } catch (e) {
                console.log('[VERIFY_IPC] Ctrl+Enter 也失败:', e.message)
              }
            }

            // 验证发送是否成功：检查 Stop 按钮是否出现
            console.log('[VERIFY_IPC] 等待验证发送结果...')
            await page.waitForTimeout(2000)
            try {
              const stopBtn = await page.locator(stopBtnSelector).first()
              const stopVisible = await stopBtn.isVisible({ timeout: 3000 })
              if (stopVisible) {
                console.log('[VERIFY_IPC] ✓ 发送成功确认：Stop 按钮已出现')
                runSuccess = true
              } else {
                console.log('[VERIFY_IPC] ⚠ Stop 按钮未出现，可能发送失败')
              }
            } catch (e) {
              console.log('[VERIFY_IPC] ⚠ 检查 Stop 按钮时出错:', e.message)
            }

            // 如果还没成功，尝试再次点击输入框确保焦点正确
            if (!runSuccess && runRetry < maxRunRetries - 1) {
              console.log('[VERIFY_IPC] 准备重试，先恢复输入框焦点...')
              try {
                await inputElement.click()
                await page.waitForTimeout(500)
              } catch (e) {
                // 忽略
              }
            }
          }

          if (!runSuccess) {
            console.log('[VERIFY_IPC] ⚠ 发送按钮点击可能未成功，但继续等待响应...')
          }

          // 5. 等待并提取 AI 回复
          console.log('[VERIFY_IPC] Waiting for AI response to complete (looking for thumbs up icon)...')
          let responseText = ''

          try {
            // 等待点赞图标出现，标志着生成结束
            const completionSelector = 'button[iconname="thumb_up"], span.material-symbols-outlined:has-text("thumb_up")'

            await page.waitForSelector(completionSelector, {
              state: 'visible',
              timeout: 180000 // 最多等待3分钟
            })

            console.log('[VERIFY_IPC] Completion signal found (thumbs up icon)')

            // 给一点额外时间确保文本完全渲染
            await page.waitForTimeout(1000)

            // 提取内容
            const responseSelectors = [
              '[data-message-author-role="model"]', // 优先尝试明确的模型角色
              '.model-response',
              'ms-text-chunk', // 可能是通用的，放在后面
              '.response-content',
              '.message-content',
              '.ai-response',
              '.markdown-body'
            ]

            // 滚动到底部以确保加载最新内容
            try {
              console.log('[VERIFY_IPC] Scrolling to bottom...')
              await page.evaluate(() => {
                window.scrollTo(0, document.body.scrollHeight);
                // 尝试找到滚动容器并滚动
                const scrollers = document.querySelectorAll('.infinite-scroll-component, [class*="scroll"], main');
                scrollers.forEach(el => el.scrollTop = el.scrollHeight);
              });
              await page.waitForTimeout(1000)
            } catch (e) {
              console.warn('[VERIFY_IPC] Scroll failed:', e)
            }

            for (const selector of responseSelectors) {
              try {
                const elements = await page.locator(selector).all()
                if (elements.length > 0) {
                  console.log(`[VERIFY_IPC] Found ${elements.length} elements for selector: ${selector}`)

                  // 遍历所有找到的元素看看内容 (调试用)
                  for (let i = 0; i < elements.length; i++) {
                    const elText = await elements[i].innerText()
                    console.log(`[VERIFY_IPC] Selector ${selector} [${i}]: ${elText.substring(0, 50)}...`)
                  }

                  // 从最后一个元素开始向前查找有内容的元素
                  for (let i = elements.length - 1; i >= 0; i--) {
                    const element = elements[i]

                    // 等待文本内容出现 (对于最后一个元素特别重要，但对于之前的元素可能已经有了)
                    let text = ''
                    // 只对最后两个元素尝试等待，避免太慢
                    const maxAttempts = (i >= elements.length - 2) ? 10 : 1;

                    for (let attempt = 0; attempt < maxAttempts; attempt++) {
                      text = await element.innerText()
                      if (text && text.trim().length > 0) {
                        break
                      }
                      if (maxAttempts > 1) {
                        console.log(`[VERIFY_IPC] Waiting for text in ${selector} index ${i} (attempt ${attempt + 1}/${maxAttempts})...`)
                        await page.waitForTimeout(500)
                      }
                    }

                    if (text && text.trim().length > 0) {
                      responseText = text
                      console.log(`[VERIFY_IPC] Selected content from ${selector} (index ${i})`)
                      // 找到内容后跳出外层循环 (responseSelectors 循环)
                      // 这里需要设置一个标志位或者直接 return? 
                      // 现在的结构是在 for(selector) 循环里。
                      // 我们应该 break 内部循环，并且设置 responseText，外层循环会检测 responseText 长度
                      break
                    } else {
                      console.log(`[VERIFY_IPC] Element found but text is empty for ${selector} index ${i}`)
                    }
                  }

                  // 如果找到了内容，跳出 selector 循环
                  if (responseText.length > 0) {
                    break
                  }
                }
              } catch (e) {
                console.log(`[VERIFY_IPC] Error checking selector ${selector}: ${e.message}`)
                continue
              }
            }

          } catch (e) {
            console.error('[VERIFY_IPC] Timeout waiting for completion signal:', e)
            // 如果超时，尝试直接提取当前已有的内容
            // 尝试滚动到底部
            try {
              await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight))
              await page.waitForTimeout(500)
            } catch (scrollErr) {
              console.warn('Failed to scroll to bottom:', scrollErr)
            }
            responseText = await page.locator('ms-text-chunk').last().innerText().catch(() => '')
          }

          console.log('[VERIFY_IPC] Final response extracted length:', responseText.length)

          return {
            success: true,
            message: 'AI Studio 已打开并获取回复',
            browserId: browserResult.browserId,
            aiResponse: responseText
          }

        } else {
          console.error('[VERIFY_IPC] Could not find input element')
          return {
            success: false,
            message: '无法找到输入框',
            browserId: browserResult.browserId
          }
        }
      } catch (error) {
        console.error('[VERIFY_IPC] Interaction demo failed:', error)
        return {
          success: false,
          message: '交互过程出错: ' + error.message,
          browserId: browserResult.browserId
        }
      }
      // ===========================
    } catch (error) {
      console.error('aistudio:open-browser error:', error)
      return {
        success: false,
        error: error.message
      }
    }
  })

  // ===== 采集账号管理相关 =====

  ipcMain.handle('collect-account:list', async (event, platform) => {
    try {
      return dbService.getCollectAccounts(platform)
    } catch (error) {
      console.error('collect-account:list error:', error)
      return []
    }
  })

  ipcMain.handle('collect-account:get', async (event, id) => {
    try {
      return dbService.getCollectAccountById(id)
    } catch (error) {
      console.error('collect-account:get error:', error)
      return null
    }
  })

  ipcMain.handle('collect-account:create', async (event, account) => {
    try {
      console.log('[IPC] collect-account:create received:', JSON.stringify(account))
      const id = dbService.createCollectAccount(account)
      console.log('[IPC] collect-account:create saved with id:', id)
      return { success: true, id }
    } catch (error) {
      console.error('collect-account:create error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('collect-account:update', async (event, id, account) => {
    try {
      dbService.updateCollectAccount(id, account)
      return { success: true }
    } catch (error) {
      console.error('collect-account:update error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('collect-account:delete', async (event, id) => {
    try {
      dbService.deleteCollectAccount(id)
      return { success: true }
    } catch (error) {
      console.error('collect-account:delete error:', error)
      return { success: false, error: error.message }
    }
  })

  // ===== 抖音视频采集相关 =====

  // 启动比特浏览器并连接
  ipcMain.handle('douyin:launch', async (event, browserId) => {
    try {
      return await douyinService.launchBrowser(browserId)
    } catch (error) {
      console.error('douyin:launch error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('douyin:open', async () => {
    try {
      return await douyinService.openDouyin()
    } catch (error) {
      console.error('douyin:open error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('douyin:get-current-video', async () => {
    try {
      return await douyinService.getCurrentVideoInfo()
    } catch (error) {
      console.error('douyin:get-current-video error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('douyin:scroll-next', async () => {
    try {
      return await douyinService.scrollToNext()
    } catch (error) {
      console.error('douyin:scroll-next error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('douyin:scroll-prev', async () => {
    try {
      return await douyinService.scrollToPrevious()
    } catch (error) {
      console.error('douyin:scroll-prev error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('douyin:collect', async (event, count) => {
    try {
      return await douyinService.collectVideos(count, (progress) => {
        mainWindow.webContents.send('douyin:progress', progress)
      })
    } catch (error) {
      console.error('douyin:collect error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('douyin:stop', async () => {
    try {
      return douyinService.stopCollection()
    } catch (error) {
      console.error('douyin:stop error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('douyin:close', async () => {
    try {
      return await douyinService.closeBrowser()
    } catch (error) {
      console.error('douyin:close error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('douyin:status', async () => {
    try {
      return douyinService.getStatus()
    } catch (error) {
      console.error('douyin:status error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('douyin:get-collected', async () => {
    try {
      return douyinService.getCollectedVideos()
    } catch (error) {
      console.error('douyin:get-collected error:', error)
      return []
    }
  })

  ipcMain.handle('douyin:clear', async () => {
    try {
      return douyinService.clearCollectedVideos()
    } catch (error) {
      console.error('douyin:clear error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('douyin:get-page-data', async () => {
    try {
      return await douyinService.getPageData()
    } catch (error) {
      console.error('douyin:get-page-data error:', error)
      return { success: false, error: error.message }
    }
  })

  // 获取当前视频发布信息 (作者、发布时间、点赞数、时长)
  ipcMain.handle('douyin:get-video-publish-info', async () => {
    try {
      return await douyinService.getVideoPublishInfo()
    } catch (error) {
      console.error('douyin:get-video-publish-info error:', error)
      return { success: false, error: error.message }
    }
  })

  // 点击收藏按钮
  ipcMain.handle('douyin:click-favorite', async () => {
    try {
      return await douyinService.clickFavoriteButton()
    } catch (error) {
      console.error('douyin:click-favorite error:', error)
      return { success: false, error: error.message }
    }
  })

  // 点击分享并复制链接
  ipcMain.handle('douyin:share-copy-link', async () => {
    try {
      return await douyinService.clickShareAndCopyLink()
    } catch (error) {
      console.error('douyin:share-copy-link error:', error)
      return { success: false, error: error.message }
    }
  })

  // 连续采集推荐视频 (符合时间条件的视频)
  ipcMain.handle('douyin:collect-recommended', async (event, options = {}) => {
    try {
      // 获取当前账号信息
      const accountId = douyinService.currentBrowserId || ''
      const accountName = options.accountName || ''

      const result = await douyinService.collectRecommendedVideos((progress) => {
        mainWindow.webContents.send('douyin:recommend-progress', progress)

        // 实时保存每个采集到的视频
        if (progress.type === 'collected' && progress.video) {
          try {
            dbService.saveDouyinVideo({
              ...progress.video,
              accountId,
              accountName
            })
          } catch (err) {
            console.error('Failed to save video to database:', err)
          }
        }
      }, options)

      return result
    } catch (error) {
      console.error('douyin:collect-recommended error:', error)
      return { success: false, error: error.message }
    }
  })

  // 获取抖音采集历史视频列表
  ipcMain.handle('douyin:get-history-videos', async (event, options = {}) => {
    try {
      const videos = dbService.getDouyinVideos(options)
      const total = dbService.getDouyinVideoCount(options.date)
      return { success: true, videos, total }
    } catch (error) {
      console.error('douyin:get-history-videos error:', error)
      return { success: false, error: error.message }
    }
  })

  // 获取抖音采集日期列表
  ipcMain.handle('douyin:get-collection-dates', async () => {
    try {
      const dates = dbService.getDouyinCollectionDates()
      return { success: true, dates }
    } catch (error) {
      console.error('douyin:get-collection-dates error:', error)
      return { success: false, error: error.message }
    }
  })

  // 删除单个抖音采集视频
  ipcMain.handle('douyin:delete-video', async (event, id) => {
    try {
      dbService.deleteDouyinVideo(id)
      return { success: true }
    } catch (error) {
      console.error('douyin:delete-video error:', error)
      return { success: false, error: error.message }
    }
  })

  // 清空所有抖音采集视频
  ipcMain.handle('douyin:clear-all-videos', async () => {
    try {
      dbService.clearDouyinVideos()
      return { success: true }
    } catch (error) {
      console.error('douyin:clear-all-videos error:', error)
      return { success: false, error: error.message }
    }
  })

  // ===== 定时任务相关 =====
  const schedulerService = require('./services/scheduler.service')

  ipcMain.handle('scheduler:getConfig', async () => {
    try {
      return schedulerService.getConfig()
    } catch (error) {
      console.error('scheduler:getConfig error:', error)
      throw error
    }
  })

  ipcMain.handle('scheduler:updateConfig', async (event, config) => {
    try {
      return await schedulerService.updateConfig(config)
    } catch (error) {
      console.error('scheduler:updateConfig error:', error)
      throw error
    }
  })

  ipcMain.handle('scheduler:enable', async () => {
    try {
      return await schedulerService.enable()
    } catch (error) {
      console.error('scheduler:enable error:', error)
      throw error
    }
  })

  ipcMain.handle('scheduler:disable', async () => {
    try {
      return await schedulerService.disable()
    } catch (error) {
      console.error('scheduler:disable error:', error)
      throw error
    }
  })

  ipcMain.handle('scheduler:executeNow', async () => {
    try {
      return await schedulerService.executeNow()
    } catch (error) {
      console.error('scheduler:executeNow error:', error)
      throw error
    }
  })

  ipcMain.handle('scheduler:getLogs', async (event, limit) => {
    try {
      return schedulerService.getLogs(limit)
    } catch (error) {
      console.error('scheduler:getLogs error:', error)
      throw error
    }
  })

  ipcMain.handle('scheduler:clearLogs', async () => {
    try {
      return await schedulerService.clearLogs()
    } catch (error) {
      console.error('scheduler:clearLogs error:', error)
      throw error
    }
  })

  ipcMain.handle('scheduler:getStatus', async () => {
    try {
      return schedulerService.getStatus()
    } catch (error) {
      console.error('scheduler:getStatus error:', error)
      throw error
    }
  })

  // 批量打开浏览器
  ipcMain.handle('scheduler:openBrowsers', async (event, browserIds) => {
    const { chromium } = require('playwright-core')
    const results = []
    const AI_STUDIO_URL = 'https://aistudio.google.com/prompts/new_chat'

    for (const browserId of browserIds) {
      try {
        // 获取账号信息以确定浏览器类型
        const account = dbService.getAIStudioAccountByBrowserId(browserId)
        if (!account) {
          results.push({
            browserId,
            success: false,
            error: `未找到浏览器账号: ${browserId}`
          })
          continue
        }

        const browserType = account.browser_type || 'bitbrowser'
        let browserService

        if (browserType === 'hubstudio') {
          browserService = hubStudioService
        } else {
          browserService = bitBrowserService
        }

        // 启动浏览器
        const result = await browserService.startBrowser(browserId)

        // 如果启动成功且有 wsEndpoint，打开 AI Studio 页面
        if (result.success !== false && result.wsEndpoint) {
          try {
            const browser = await chromium.connectOverCDP(result.wsEndpoint)
            const context = browser.contexts()[0]
            const page = await context.newPage()
            await page.goto(AI_STUDIO_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
            // 断开连接但不关闭浏览器
            await browser.close()
          } catch (pageError) {
            console.error(`Failed to open AI Studio page for ${browserId}:`, pageError.message)
            // 页面打开失败不影响整体结果，浏览器已经启动成功
          }
        }

        results.push({
          browserId,
          name: account.name,
          success: true,
          result
        })
      } catch (error) {
        // 获取账号名称用于显示
        let accountName = browserId
        try {
          const account = dbService.getAIStudioAccountByBrowserId(browserId)
          if (account) accountName = account.name
        } catch (e) { }

        results.push({
          browserId,
          name: accountName,
          success: false,
          error: error.message
        })
      }
    }

    return results
  })

  // ===== 自有频道定时任务相关 =====
  const ownChannelSchedulerService = require('./services/own-channel-scheduler.service')

  ipcMain.handle('own-channel-scheduler:getConfig', async () => {
    try {
      return ownChannelSchedulerService.getConfig()
    } catch (error) {
      console.error('own-channel-scheduler:getConfig error:', error)
      throw error
    }
  })

  ipcMain.handle('own-channel-scheduler:updateConfig', async (event, config) => {
    try {
      return await ownChannelSchedulerService.updateConfig(config)
    } catch (error) {
      console.error('own-channel-scheduler:updateConfig error:', error)
      throw error
    }
  })

  ipcMain.handle('own-channel-scheduler:enable', async () => {
    try {
      return await ownChannelSchedulerService.enable()
    } catch (error) {
      console.error('own-channel-scheduler:enable error:', error)
      throw error
    }
  })

  ipcMain.handle('own-channel-scheduler:disable', async () => {
    try {
      return await ownChannelSchedulerService.disable()
    } catch (error) {
      console.error('own-channel-scheduler:disable error:', error)
      throw error
    }
  })

  ipcMain.handle('own-channel-scheduler:executeNow', async () => {
    try {
      return await ownChannelSchedulerService.executeNow()
    } catch (error) {
      console.error('own-channel-scheduler:executeNow error:', error)
      throw error
    }
  })

  ipcMain.handle('own-channel-scheduler:getLogs', async (event, limit) => {
    try {
      return ownChannelSchedulerService.getLogs(limit)
    } catch (error) {
      console.error('own-channel-scheduler:getLogs error:', error)
      throw error
    }
  })

  ipcMain.handle('own-channel-scheduler:clearLogs', async () => {
    try {
      return await ownChannelSchedulerService.clearLogs()
    } catch (error) {
      console.error('own-channel-scheduler:clearLogs error:', error)
      throw error
    }
  })

  ipcMain.handle('own-channel-scheduler:getStatus', async () => {
    try {
      return ownChannelSchedulerService.getStatus()
    } catch (error) {
      console.error('own-channel-scheduler:getStatus error:', error)
      throw error
    }
  })

  // 批量打开浏览器（自有频道定时任务使用，复用逻辑）
  ipcMain.handle('own-channel-scheduler:openBrowsers', async (event, browserIds) => {
    const { chromium } = require('playwright-core')
    const results = []
    const AI_STUDIO_URL = 'https://aistudio.google.com/prompts/new_chat'

    for (const browserId of browserIds) {
      try {
        // 获取账号信息以确定浏览器类型
        const account = dbService.getAIStudioAccountByBrowserId(browserId)
        if (!account) {
          results.push({
            browserId,
            success: false,
            error: `未找到浏览器账号: ${browserId}`
          })
          continue
        }

        const browserType = account.browser_type || 'bitbrowser'
        let browserService

        if (browserType === 'hubstudio') {
          browserService = hubStudioService
        } else {
          browserService = bitBrowserService
        }

        // 启动浏览器
        const result = await browserService.startBrowser(browserId)

        // 如果启动成功且有 wsEndpoint，打开 AI Studio 页面
        if (result.success !== false && result.wsEndpoint) {
          try {
            const browser = await chromium.connectOverCDP(result.wsEndpoint)
            const context = browser.contexts()[0]
            const page = await context.newPage()
            await page.goto(AI_STUDIO_URL, { waitUntil: 'domcontentloaded', timeout: 30000 })
            // 断开连接但不关闭浏览器
            await browser.close()
          } catch (pageError) {
            console.error(`Failed to open AI Studio page for ${browserId}:`, pageError.message)
          }
        }

        results.push({
          browserId,
          name: account.name,
          success: true,
          result
        })
      } catch (error) {
        let accountName = browserId
        try {
          const account = dbService.getAIStudioAccountByBrowserId(browserId)
          if (account) accountName = account.name
        } catch (e) { }

        results.push({
          browserId,
          name: accountName,
          success: false,
          error: error.message
        })
      }
    }

    return results
  })

  // 关闭所有比特浏览器
  ipcMain.handle('browser:closeAllBitBrowser', async () => {
    try {
      // 获取所有比特浏览器类型的账号
      const accounts = dbService.getAIStudioAccounts()
      const bitBrowserIds = accounts
        .filter(a => a.browser_type === 'bitbrowser' || !a.browser_type)
        .map(a => a.bit_browser_id)

      if (bitBrowserIds.length === 0) {
        return { success: true, closed: 0, message: '没有比特浏览器账号' }
      }

      const result = await bitBrowserService.closeAllBrowsers(bitBrowserIds)
      return result
    } catch (error) {
      console.error('browser:closeAllBitBrowser error:', error)
      return { success: false, error: error.message }
    }
  })

  // 关闭所有 HubStudio 浏览器
  ipcMain.handle('browser:closeAllHubStudio', async () => {
    try {
      // 获取所有 HubStudio 类型的账号
      const accounts = dbService.getAIStudioAccounts()
      const hubStudioIds = accounts
        .filter(a => a.browser_type === 'hubstudio')
        .map(a => a.bit_browser_id)

      if (hubStudioIds.length === 0) {
        return { success: true, closed: 0, message: '没有 HubStudio 浏览器账号' }
      }

      const result = await hubStudioService.closeAllBrowsers(hubStudioIds)
      return result
    } catch (error) {
      console.error('browser:closeAllHubStudio error:', error)
      return { success: false, error: error.message }
    }
  })

  // ===== YouTube 上传相关 =====
  const YouTubeUploadService = require('./services/youtube-upload.service')
  const youtubeUploadService = new YouTubeUploadService()
  youtubeUploadService.initialize(bitBrowserService, hubStudioService, mainWindow)

  // 打开 YouTube Studio
  ipcMain.handle('youtube:open-studio', async (event, browserId, browserType) => {
    try {
      console.log('youtube:open-studio called with browserId:', browserId, 'browserType:', browserType)
      return await youtubeUploadService.openYouTubeStudio(browserId, browserType || 'bitbrowser')
    } catch (error) {
      console.error('youtube:open-studio error:', error)
      return { success: false, error: error.message }
    }
  })

  // 点击创建按钮
  ipcMain.handle('youtube:click-create', async (event, browserId) => {
    try {
      return await youtubeUploadService.clickCreateButton(browserId || '')
    } catch (error) {
      console.error('youtube:click-create error:', error)
      return { success: false, error: error.message }
    }
  })

  // 点击上传视频
  ipcMain.handle('youtube:click-upload', async (event, browserId) => {
    try {
      return await youtubeUploadService.clickUploadVideo(browserId || '')
    } catch (error) {
      console.error('youtube:click-upload error:', error)
      return { success: false, error: error.message }
    }
  })

  // 选择视频文件
  ipcMain.handle('youtube:select-file', async (event, browserId, videoPath) => {
    try {
      return await youtubeUploadService.selectVideoFile(browserId || '', videoPath)
    } catch (error) {
      console.error('youtube:select-file error:', error)
      return { success: false, error: error.message }
    }
  })

  // 填写视频详情
  ipcMain.handle('youtube:fill-details', async (event, browserId, videoInfo) => {
    try {
      return await youtubeUploadService.fillVideoDetailsNormal(browserId || '', videoInfo)
    } catch (error) {
      console.error('youtube:fill-details error:', error)
      return { success: false, error: error.message }
    }
  })

  // 设置非儿童内容
  ipcMain.handle('youtube:set-not-for-kids', async (event, browserId) => {
    try {
      return await youtubeUploadService.setNotMadeForKids(browserId || '')
    } catch (error) {
      console.error('youtube:set-not-for-kids error:', error)
      return { success: false, error: error.message }
    }
  })

  // 点击下一步
  ipcMain.handle('youtube:click-next', async (event, browserId, times) => {
    try {
      return await youtubeUploadService.clickNextButton(browserId || '', times || 1)
    } catch (error) {
      console.error('youtube:click-next error:', error)
      return { success: false, error: error.message }
    }
  })

  // 设置可见性
  ipcMain.handle('youtube:set-visibility', async (event, browserId, visibility) => {
    try {
      return await youtubeUploadService.setVisibility(browserId || '', visibility)
    } catch (error) {
      console.error('youtube:set-visibility error:', error)
      return { success: false, error: error.message }
    }
  })

  // 点击发布
  ipcMain.handle('youtube:click-publish', async (event, browserId) => {
    try {
      return await youtubeUploadService.clickPublishButton(browserId || '')
    } catch (error) {
      console.error('youtube:click-publish error:', error)
      return { success: false, error: error.message }
    }
  })

  // 完整上传流程（普通号）
  ipcMain.handle('youtube:upload-normal', async (event, browserId, videoPath, videoInfo, browserType) => {
    try {
      return await youtubeUploadService.uploadVideoNormal(browserId, videoPath, videoInfo, browserType || 'bitbrowser')
    } catch (error) {
      console.error('youtube:upload-normal error:', error)
      return { success: false, error: error.message }
    }
  })

  // 完整上传流程（创收号）
  ipcMain.handle('youtube:upload-monetized', async (event, browserId, videoPath, videoInfo, browserType) => {
    try {
      return await youtubeUploadService.uploadVideoMonetized(browserId, videoPath, videoInfo, browserType || 'bitbrowser')
    } catch (error) {
      console.error('youtube:upload-monetized error:', error)
      return { success: false, error: error.message }
    }
  })

  // 暂停上传
  ipcMain.handle('youtube:pause', async () => {
    try {
      youtubeUploadService.pause()
      return { success: true }
    } catch (error) {
      console.error('youtube:pause error:', error)
      return { success: false, error: error.message }
    }
  })

  // 继续上传
  ipcMain.handle('youtube:resume', async () => {
    try {
      youtubeUploadService.resume()
      return { success: true }
    } catch (error) {
      console.error('youtube:resume error:', error)
      return { success: false, error: error.message }
    }
  })

  // 取消上传
  ipcMain.handle('youtube:cancel', async () => {
    try {
      youtubeUploadService.cancel()
      return { success: true }
    } catch (error) {
      console.error('youtube:cancel error:', error)
      return { success: false, error: error.message }
    }
  })

  // 获取上传状态
  ipcMain.handle('youtube:get-status', async () => {
    try {
      return { success: true, data: youtubeUploadService.getStatus() }
    } catch (error) {
      console.error('youtube:get-status error:', error)
      return { success: false, error: error.message }
    }
  })

  // 获取所有正在执行的任务进度（用于页面切换后恢复）
  ipcMain.handle('youtube:get-all-progress', async () => {
    try {
      return { success: true, data: youtubeUploadService.getAllProgress() }
    } catch (error) {
      console.error('youtube:get-all-progress error:', error)
      return { success: false, error: error.message }
    }
  })

  // 获取指定浏览器的进度
  ipcMain.handle('youtube:get-progress', async (event, browserId) => {
    try {
      return { success: true, data: youtubeUploadService.getProgress(browserId) }
    } catch (error) {
      console.error('youtube:get-progress error:', error)
      return { success: false, error: error.message }
    }
  })

  // 关闭连接
  ipcMain.handle('youtube:close', async () => {
    try {
      await youtubeUploadService.close()
      return { success: true }
    } catch (error) {
      console.error('youtube:close error:', error)
      return { success: false, error: error.message }
    }
  })

  // ===== 上传日志相关 =====

  ipcMain.handle('upload-log:create', async (event, logData) => {
    try {
      const id = dbService.createUploadLog(logData)
      return { success: true, id }
    } catch (error) {
      console.error('upload-log:create error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('upload-log:update', async (event, id, updates) => {
    try {
      dbService.updateUploadLog(id, updates)
      return { success: true }
    } catch (error) {
      console.error('upload-log:update error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('upload-log:list', async (event, options) => {
    try {
      return dbService.getUploadLogs(options)
    } catch (error) {
      console.error('upload-log:list error:', error)
      return []
    }
  })

  ipcMain.handle('upload-log:get', async (event, id) => {
    try {
      return dbService.getUploadLogById(id)
    } catch (error) {
      console.error('upload-log:get error:', error)
      return null
    }
  })

  ipcMain.handle('upload-log:delete', async (event, id) => {
    try {
      dbService.deleteUploadLog(id)
      return { success: true }
    } catch (error) {
      console.error('upload-log:delete error:', error)
      return { success: false, error: error.message }
    }
  })

  // ===== 用户缓存相关（从 Supabase 同步） =====

  ipcMain.handle('users:sync', async () => {
    try {
      // 从 Supabase 获取用户列表
      const users = await supabaseService.getUsers()
      // 同步到本地缓存
      dbService.syncCachedUsers(users)
      return { success: true, count: users.length }
    } catch (error) {
      console.error('users:sync error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('users:get-cached', async () => {
    try {
      return dbService.getCachedUsers()
    } catch (error) {
      console.error('users:get-cached error:', error)
      return []
    }
  })

  ipcMain.handle('users:get-by-name', async (event, name) => {
    try {
      return dbService.getCachedUserByName(name)
    } catch (error) {
      console.error('users:get-by-name error:', error)
      return null
    }
  })

  ipcMain.handle('users:get-last-sync', async () => {
    try {
      return dbService.getLastUserSyncTime()
    } catch (error) {
      console.error('users:get-last-sync error:', error)
      return null
    }
  })

  // ===== YouTube 采集相关 =====

  ipcMain.handle('youtube-collect:launch-browser', async (event, browserId) => {
    try {
      // 根据 browserId 查找账号获取浏览器类型
      const accounts = dbService.getCollectAccounts('youtube')
      const account = accounts.find(a => a.bit_browser_id === browserId)
      const browserType = account?.browser_type || 'hubstudio'

      console.log('[YouTube Collect] Launch browser:', { browserId, browserType })

      let browserResult
      if (browserType === 'hubstudio') {
        // 设置 HubStudio 凭证
        const appId = dbService.getSetting('hubstudio_app_id')
        const appSecret = dbService.getSetting('hubstudio_app_secret')
        const groupCode = dbService.getSetting('hubstudio_group_code')

        if (appId && appSecret) {
          hubStudioService.setCredentials(appId, appSecret, groupCode)
        }

        browserResult = await hubStudioService.startBrowser(browserId)
      } else {
        // 使用比特浏览器
        browserResult = await bitBrowserService.startBrowser(browserId)
      }

      console.log('[YouTube Collect] Browser start result:', browserResult)

      if (!browserResult.success && browserResult.success !== undefined) {
        return { success: false, error: browserResult.error || browserResult.msg || '启动浏览器失败' }
      }

      const wsEndpoint = browserResult.wsEndpoint || browserResult.ws
      if (!wsEndpoint) {
        return { success: false, error: '未获取到浏览器连接地址' }
      }

      // 使用 wsEndpoint 连接浏览器
      return await youtubeService.connectWithWsEndpoint(wsEndpoint, browserId, browserType)
    } catch (error) {
      console.error('youtube-collect:launch-browser error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('youtube-collect:close-browser', async () => {
    try {
      // 获取当前浏览器信息以便正确关闭
      const browserId = youtubeService.currentBrowserId
      const browserType = youtubeService.currentBrowserType

      // 先断开 Playwright 连接
      const result = await youtubeService.closeBrowser()

      // 如果是 BitBrowser，也调用 BitBrowser API 关闭
      if (browserId && browserType === 'bitbrowser') {
        try {
          await bitBrowserService.closeBrowser(browserId)
          console.log('[YouTube Collect] BitBrowser closed via API')
        } catch (e) {
          console.log('[YouTube Collect] Failed to close BitBrowser via API:', e.message)
        }
      }

      return result
    } catch (error) {
      console.error('youtube-collect:close-browser error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('youtube-collect:get-status', async () => {
    try {
      return youtubeService.getStatus()
    } catch (error) {
      console.error('youtube-collect:get-status error:', error)
      return { browserRunning: false, isCollecting: false, collectedCount: 0 }
    }
  })

  ipcMain.handle('youtube-collect:open-youtube', async () => {
    try {
      return await youtubeService.openYouTube()
    } catch (error) {
      console.error('youtube-collect:open-youtube error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('youtube-collect:get-video-info', async () => {
    try {
      return await youtubeService.getCurrentVideoInfo()
    } catch (error) {
      console.error('youtube-collect:get-video-info error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('youtube-collect:get-home-videos', async () => {
    try {
      return await youtubeService.getHomeVideoList()
    } catch (error) {
      console.error('youtube-collect:get-home-videos error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('youtube-collect:get-current-shorts', async () => {
    try {
      return await youtubeService.getCurrentShortsInfo()
    } catch (error) {
      console.error('youtube-collect:get-current-shorts error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('youtube-collect:scroll-next', async () => {
    try {
      return await youtubeService.scrollToNextShorts()
    } catch (error) {
      console.error('youtube-collect:scroll-next error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('youtube-collect:collect-videos', async (event, options) => {
    try {
      return await youtubeService.collectVideos((progress) => {
        mainWindow.webContents.send('youtube-collect:progress', progress)
      }, options)
    } catch (error) {
      console.error('youtube-collect:collect-videos error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('youtube-collect:stop-collection', async () => {
    try {
      return youtubeService.stopCollection()
    } catch (error) {
      console.error('youtube-collect:stop-collection error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('youtube-collect:get-collected-videos', async () => {
    try {
      return youtubeService.getCollectedVideos()
    } catch (error) {
      console.error('youtube-collect:get-collected-videos error:', error)
      return []
    }
  })

  ipcMain.handle('youtube-collect:clear-collected-videos', async () => {
    try {
      return youtubeService.clearCollectedVideos()
    } catch (error) {
      console.error('youtube-collect:clear-collected-videos error:', error)
      return { success: false, error: error.message }
    }
  })

  // 开始自动采集（带数据库保存）
  ipcMain.handle('youtube-collect:start-auto-collect', async (event, options = {}) => {
    try {
      const { duration = 60, groupName = null } = options // 默认1小时
      // TODO: 后续启用Supabase同步功能
      // const BATCH_SIZE = 100 // 每100条批量保存到Supabase
      // let supabaseBuffer = [] // 缓冲区

      console.log('[IPC] Starting auto collect with duration:', duration, 'minutes, groupName:', groupName)

      // 获取所有对标频道用于匹配
      const allBenchmarkChannels = dbService.getBenchmarkChannels()
      // 如果指定了分组，获取该分组的频道
      const groupChannels = groupName ? dbService.getBenchmarkChannels(groupName) : []

      console.log(`[IPC] Loaded ${allBenchmarkChannels.length} benchmark channels, ${groupChannels.length} in group "${groupName || 'none'}"`)

      // TODO: 后续启用Supabase同步功能
      // // 批量保存到Supabase的函数
      // const flushToSupabase = async () => {
      //   if (supabaseBuffer.length === 0) return
      //   const videosToSave = [...supabaseBuffer]
      //   supabaseBuffer = []
      //   console.log(`[IPC] Batch saving ${videosToSave.length} videos to Supabase...`)
      //   try {
      //     const result = await supabaseService.saveYouTubeCollectedVideos(videosToSave)
      //     if (result.success) {
      //       console.log(`[IPC] Batch saved ${result.count || videosToSave.length} videos to Supabase`)
      //     } else {
      //       console.error('[IPC] Batch save to Supabase failed:', result.error)
      //     }
      //   } catch (err) {
      //     console.error('[IPC] Batch save to Supabase error:', err.message)
      //   }
      // }

      const result = await youtubeService.startAutoCollect({
        duration,
        groupName,
        allBenchmarkChannels,
        groupChannels,
        onProgress: (progress) => {
          // 发送进度到前端
          mainWindow.webContents.send('youtube-collect:auto-progress', progress)
        },
        onSave: (video) => {
          // 保存到本地数据库
          const insertId = dbService.saveYoutubeVideo(video)
          if (insertId) {
            console.log('[IPC] Saved YouTube video to local DB:', video.videoId)
            // TODO: 后续启用Supabase同步功能
            // // 添加到Supabase缓冲区
            // supabaseBuffer.push(video)
            // // 达到批量大小时，异步批量保存到Supabase
            // if (supabaseBuffer.length >= BATCH_SIZE) {
            //   flushToSupabase()
            // }
            return true
          } else {
            // 视频已存在
            return false
          }
        }
      })

      // TODO: 后续启用Supabase同步功能
      // // 采集结束后，保存剩余的视频到Supabase
      // await flushToSupabase()

      return result
    } catch (error) {
      console.error('youtube-collect:start-auto-collect error:', error)
      return { success: false, error: error.message }
    }
  })

  // 停止自动采集
  ipcMain.handle('youtube-collect:stop-auto-collect', async () => {
    try {
      return youtubeService.stopAutoCollect()
    } catch (error) {
      console.error('youtube-collect:stop-auto-collect error:', error)
      return { success: false, error: error.message }
    }
  })

  // 获取数据库中保存的 YouTube 视频列表
  ipcMain.handle('youtube-collect:get-saved-videos', async (event, { limit = 100, offset = 0, date = null } = {}) => {
    try {
      const videos = dbService.getYoutubeVideos(limit, offset, date)
      const total = dbService.getYoutubeVideoCount(date)
      return { success: true, videos, total }
    } catch (error) {
      console.error('youtube-collect:get-saved-videos error:', error)
      return { success: false, error: error.message, videos: [], total: 0 }
    }
  })

  // 删除数据库中的 YouTube 视频
  ipcMain.handle('youtube-collect:delete-saved-video', async (event, id) => {
    try {
      dbService.deleteYoutubeVideo(id)
      return { success: true }
    } catch (error) {
      console.error('youtube-collect:delete-saved-video error:', error)
      return { success: false, error: error.message }
    }
  })

  // 清空数据库中的 YouTube 视频
  ipcMain.handle('youtube-collect:clear-saved-videos', async () => {
    try {
      dbService.clearYoutubeVideos()
      return { success: true }
    } catch (error) {
      console.error('youtube-collect:clear-saved-videos error:', error)
      return { success: false, error: error.message }
    }
  })

  // 获取 YouTube 采集日期列表
  ipcMain.handle('youtube-collect:get-collection-dates', async () => {
    try {
      const dates = dbService.getYoutubeCollectionDates()
      return { success: true, dates }
    } catch (error) {
      console.error('youtube-collect:get-collection-dates error:', error)
      return { success: false, error: error.message, dates: [] }
    }
  })

  // ========== 对标频道同步相关 IPC ==========

  // 从 Supabase 同步对标频道数据到本地
  ipcMain.handle('youtube-collect:sync-benchmark-from-supabase', async () => {
    try {
      console.log('[IPC] Starting sync benchmark data from Supabase...')

      // 1. 获取分组数据
      const groupsResult = await supabaseService.getBenchmarkChannelGroups()
      if (!groupsResult.success) {
        return { success: false, error: '获取分组数据失败: ' + groupsResult.error }
      }

      // 2. 获取频道数据
      const channelsResult = await supabaseService.getBenchmarkChannels()
      if (!channelsResult.success) {
        return { success: false, error: '获取频道数据失败: ' + channelsResult.error }
      }

      // 3. 保存到本地数据库
      const groupCount = dbService.saveBenchmarkChannelGroups(groupsResult.data)
      const channelCount = dbService.saveBenchmarkChannels(channelsResult.data)

      console.log(`[IPC] Synced ${groupCount} groups, ${channelCount} channels from Supabase`)

      return {
        success: true,
        groupCount,
        channelCount,
        message: `同步完成：${groupCount} 个分组，${channelCount} 个频道`
      }
    } catch (error) {
      console.error('youtube-collect:sync-benchmark-from-supabase error:', error)
      return { success: false, error: error.message }
    }
  })

  // 获取本地对标频道分组
  ipcMain.handle('youtube-collect:get-local-benchmark-groups', async () => {
    try {
      const groups = dbService.getBenchmarkChannelGroups()
      return { success: true, groups }
    } catch (error) {
      console.error('youtube-collect:get-local-benchmark-groups error:', error)
      return { success: false, error: error.message, groups: [] }
    }
  })

  // 获取本地对标频道
  ipcMain.handle('youtube-collect:get-local-benchmark-channels', async (event, groupName = null) => {
    try {
      const channels = dbService.getBenchmarkChannels(groupName)
      return { success: true, channels }
    } catch (error) {
      console.error('youtube-collect:get-local-benchmark-channels error:', error)
      return { success: false, error: error.message, channels: [] }
    }
  })

  // 获取对标频道同步状态
  ipcMain.handle('youtube-collect:get-benchmark-sync-status', async () => {
    try {
      const status = dbService.getBenchmarkSyncStatus()
      return { success: true, ...status }
    } catch (error) {
      console.error('youtube-collect:get-benchmark-sync-status error:', error)
      return { success: false, error: error.message }
    }
  })

  // 同步本地采集视频到Supabase
  ipcMain.handle('youtube-collect:sync-to-supabase', async () => {
    try {
      console.log('[IPC] Starting sync local videos to Supabase...')

      // 1. 获取所有本地采集的视频
      const localVideos = dbService.getYoutubeVideos(10000, 0, null)
      console.log(`[IPC] Found ${localVideos.length} local videos`)

      if (localVideos.length === 0) {
        return { success: true, synced: 0, skipped: 0, total: 0, message: '本地没有采集的视频' }
      }

      // 2. 同步到Supabase
      const result = await supabaseService.syncLocalVideosToSupabase(localVideos, (progress) => {
        // 发送进度到前端
        mainWindow.webContents.send('youtube-collect:sync-to-supabase-progress', progress)
      })

      console.log('[IPC] Sync to Supabase result:', result)
      return result
    } catch (error) {
      console.error('youtube-collect:sync-to-supabase error:', error)
      return { success: false, error: error.message }
    }
  })

  console.log('IPC handlers initialized')
}

module.exports = { setupIPC }
