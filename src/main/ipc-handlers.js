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

  ipcMain.handle('aistudio:start-task', async (event, taskId, browserProfileIds) => {
    try {
      // 支持多浏览器并行执行
      // browserProfileIds 可以是单个字符串或数组
      const profileIds = Array.isArray(browserProfileIds) ? browserProfileIds : [browserProfileIds]

      // 不等待 Promise 完成，直接返回，通过事件发送进度
      if (profileIds.length > 1) {
        // 多浏览器并行模式
        aiStudioService.startParallelTask(taskId, profileIds, (progress) => {
          mainWindow.webContents.send('aistudio:progress', progress)
        }).catch(err => {
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
        }).catch(err => {
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

      // 确保页面置顶
      try {
        await page.bringToFront()
      } catch (e) {
        console.error('Failed to bring page to front:', e)
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

          // 3.2.1 验证视频附件是否出现
          console.log('[VERIFY_IPC] Waiting for video attachment (ms-youtube-chunk)...')
          try {
            // 等待 YouTube 视频组件出现，这表示粘贴成功了
            await page.waitForSelector('ms-youtube-chunk', {
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

          // 3.2.2 等待视频处理完成 (齿轮图标)
          console.log('[VERIFY_IPC] Waiting for video processing (settings_video_camera icon)...')
          try {
            // 等待 YouTube 视频处理完成，标志是出现 settings_video_camera 图标
            await page.waitForSelector('mat-icon:has-text("settings_video_camera")', {
              state: 'visible',
              timeout: 60000
            })
            console.log('[VERIFY_IPC] Video processing complete (settings_video_camera icon found)')
          } catch (e) {
            console.error('[VERIFY_IPC] Timeout waiting for video processing.')
            return {
              success: false,
              message: '视频处理超时：未检测到处理完成图标 (settings_video_camera)。',
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
      const id = dbService.createCollectAccount(account)
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

  console.log('IPC handlers initialized')
}

module.exports = { setupIPC }
