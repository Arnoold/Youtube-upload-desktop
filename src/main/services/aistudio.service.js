/**
 * AI Studio 自动化服务
 * 用于在 BitBrowser 中访问 Google AI Studio，发送视频链接和提示词，获取 AI 回复
 */

const PlaywrightService = require('./playwright.service')
const supabaseService = require('./supabase.service')
const clipboardLock = require('./clipboard-lock.service')

class AIStudioService {
  constructor() {
    this.playwrightService = new PlaywrightService()
    this.dbService = null
    this.bitBrowserService = null
    this.hubStudioService = null
    this.isProcessing = false
    this.currentTask = null
    this.shouldStop = false
    // 多浏览器并行支持
    this.activeWorkers = new Map() // workerId -> { browserProfileId, isProcessing, currentItem }
    this.taskQueue = [] // 待处理的任务项队列
    this.taskId = null // 当前任务ID
    this.defaultPrompt = `请分析以上我提供的 YouTube 视频链接的内容，并严格按照以下 JSON 格式输出分析结果。不要输出 JSON 以外的任何开场白或结束语。

\`\`\`json
{
  "videoDescription": "视频速记标签/外号",
  "originalScript": "合并后的原文内容（解说词+对话）",
  "chineseScript": "原文内容的中文翻译（自然流畅）",
  "videoLanguage": "解说词的原始语言（中文）",
  "searchKeywords": [
    "Keyword1 - 关键词1",
    "Keyword2 - 关键词2"
  ],
  "videoHighlights": [
    "1. 爆点分析内容1",
    "2. 爆点分析内容2"
  ],
  "videoType": "大类 - 子类（中文）"
}
\`\`\`

**字段详细要求说明：**

1.  **videoDescription**:

      * **目标**：提供一个口语化的、用于个人快速识别的"外号"或"速记标签"。
      * **风格**：非正式、直白，抓住视频最核心的视觉或行为特征（例如："厨房跳舞男"或"猫咪推杯子"）。
      * **长度**：必须非常简洁，控制在 **10个汉字以内**。
      * **格式**：纯文本字符串。

2.  **originalScript**:

      * **内容**：提取并整合视频中所有的解说词（旁白）和人物对话原文。
      * **结构**：
          * 如果视频中同时包含"旁白解说"和"人物对话"，请严格按照以下顺序排列：
            1.  解说词内容
            2.  **换行** (插入换行符)
            3.  分隔符 \`======\`
            4.  **换行** (插入换行符)
            5.  对话内容
          * 如果只有其中一种，则直接输出该内容。
      * **语言**：保持视频原始语言。

3.  **chineseScript**:

      * **内容**：将上述 \`originalScript\` 中的完整内容翻译成中文。
      * **要求**：
          * **自然流畅**：拒绝生硬的"机翻感"或逐字直译，请使用符合中文口语和阅读习惯的表达方式。
          * **结构保持**：必须严格保留原文的段落结构（包括换行符位置）和 \`======\` 分隔符位置，以便对照。

4.  **searchKeywords**:

      * **目标**：提供 5-10 个**专门用于在 TikTok 上搜索类似视觉素材**的关键词。
      * **选词策略**：优先选择**视觉描述词**（如具体的动作、物体）、**场景词**或**TikTok 热门标签**，以便我能搜到相似的画面。
      * **格式**：**严格的 JSON 字符串数组**。
      * **内容格式**：每个数组元素为"\`英文关键词 - 中文意思\`"。
      * **正确示例**：
        \`["Oddly Satisfying - 极度舒适解压", "Street Food POV - 街头美食第一视角", "Luxury Car - 豪车内饰"]\`

5.  **videoLanguage**:

      * 识别视频中解说词或旁白使用的原始语言。
      * **注意：必须用中文回复**（例如：英语、法语、日语、韩语、印尼语等）。

6.  **videoHighlights**:

      * **目标**：分析视频的爆点（为什么播放量高、完播率高）。
      * **内容**：列出 **5-10 个**具体吸引力因素。
      * **语言：必须用中文回复。**
      * **格式**：**严格的 JSON 字符串数组**。
      * **关键要求**：
          * **拒绝空泛的形容词**（如不要只写"题材新奇"），**必须写出具体的内容细节**。
          * **每个数组元素必须以数字序号开头（1. 2. 3. ...）。**
          * 每条控制在 **25个字** 以内。
      * **正确示例**：
        \`["1. 使用液压机压碎钻石的视觉冲击力极强", "2. 压碎瞬间的碎片飞溅特写非常解压", "3. 实验失败的反转结局引发观众讨论"]\`

7.  **videoType**:

      * **目标**：判断视频所属的细分垂直领域。
      * **语言：必须用中文回复。**
      * **格式**：**必须包含【大类】和【子类】，中间用 \`-\` 连接。**
      * **参考分类体系（请从中选择最准确的组合）：**
          * **科普/解说类**：科普冷知识、历史悬疑、机械原理、自然地理、奇闻轶事、商业思维
          * **情感/剧情类**：感人故事、反转剧情、情侣日常、家庭伦理、正能量、POV视角
          * **娱乐/搞笑类**：搞笑段子、街头恶作剧、意外翻车(Fails)、迷因梗图、脱口秀
          * **生活/兴趣类**：萌宠动物、儿童玩具、文具手帐、建筑设计、美食制作、沉浸式解压(ASMR)、DIY手工、收纳整理、好物推荐`
  }

  setDbService(dbService) {
    this.dbService = dbService
  }

  setBitBrowserService(bitBrowserService) {
    this.bitBrowserService = bitBrowserService
  }

  setHubStudioService(hubStudioService) {
    this.hubStudioService = hubStudioService
  }

  /**
   * 根据浏览器类型获取对应的浏览器服务
   * @param {string} browserType - 'bitbrowser' 或 'hubstudio'
   */
  getBrowserService(browserType) {
    if (browserType === 'hubstudio') {
      if (!this.hubStudioService) {
        throw new Error('HubStudio 服务未初始化')
      }
      return this.hubStudioService
    }
    // 默认使用 BitBrowser
    if (!this.bitBrowserService) {
      throw new Error('BitBrowser 服务未初始化')
    }
    return this.bitBrowserService
  }

  /**
   * 根据浏览器配置文件ID获取账号信息（包含浏览器类型）
   * @param {string} browserProfileId - 浏览器配置文件ID
   */
  async getAccountByBrowserId(browserProfileId) {
    if (!this.dbService) return null
    const accounts = this.dbService.getAIStudioAccounts()
    return accounts.find(a => a.bit_browser_id === browserProfileId)
  }

  /**
   * 设置默认提示词
   */
  setDefaultPrompt(prompt) {
    this.defaultPrompt = prompt
  }

  /**
   * 获取默认提示词
   */
  getDefaultPrompt() {
    return this.defaultPrompt
  }

  /**
   * 开始执行持久化任务
   * @param {number} taskId - 任务 ID
   * @param {string} browserProfileId - BitBrowser 配置文件 ID
   * @param {Function} progressCallback - 进度回调
   */
  async startTask(taskId, browserProfileId, progressCallback = () => { }) {
    if (this.isProcessing) {
      throw new Error('已有任务正在处理中')
    }
    if (!this.dbService) {
      throw new Error('DatabaseService not initialized in AIStudioService')
    }

    this.shouldStop = false
    this.isProcessing = true
    this.currentTask = { type: 'persistent', id: taskId }

    try {
      // 1. 获取任务项
      console.log(`[AIStudio] Fetching items for task ${taskId}`)
      const items = this.dbService.getCommentaryTaskItems(taskId)
      console.log(`[AIStudio] Retrieved ${items.length} items`)
      const pendingItems = items.filter(item => item.status === 'pending' || item.status === 'failed')
      const total = items.length
      let processedCount = items.length - pendingItems.length

      console.log(`[AIStudio] Starting task ${taskId}, total: ${total}, pending: ${pendingItems.length}`)

      // 更新任务状态
      this.dbService.updateCommentaryTaskStatus(taskId, 'processing')

      for (let i = 0; i < pendingItems.length; i++) {
        if (this.shouldStop) {
          console.log('Task stopped by user')
          break
        }

        const item = pendingItems[i]
        // item.video_info is already parsed by dbService
        const video = item.video_info

        progressCallback({
          type: 'batch',
          taskId: taskId,
          current: processedCount + 1,
          total: total,
          videoId: video.id,
          message: `正在处理: ${video.title}`
        })

        try {
          // 更新单项状态
          this.dbService.updateCommentaryTaskItemStatus(item.id, 'processing')

          // 执行处理
          console.log(`[AIStudio] Processing item ${item.id}, videoId: ${video.id}`)
          const result = await this.processVideo(video, browserProfileId, (progress) => {
            progressCallback({
              type: 'single',
              taskId: taskId,
              ...progress,
              current: processedCount + 1,
              total: total
            })
          })

          // 更新成功状态 - 只保存实际的AI回复内容，而不是整个结果对象
          const responseToSave = result.response || result
          this.dbService.updateCommentaryTaskItemStatus(item.id, 'completed', responseToSave)
          processedCount++

          // 休息一下
          if (i < pendingItems.length - 1 && !this.shouldStop) {
            await new Promise(resolve => setTimeout(resolve, 3000))
          }

        } catch (error) {
          console.error(`Failed to process item ${item.id}:`, error)
          // 更新失败状态
          this.dbService.updateCommentaryTaskItemStatus(item.id, 'failed', null, error.message)
          processedCount++ // 即使失败也算处理过
        }
      }

      // 任务结束
      if (this.shouldStop) {
        this.dbService.updateCommentaryTaskStatus(taskId, 'paused')
      } else {
        this.dbService.updateCommentaryTaskStatus(taskId, 'completed')
      }

    } catch (error) {
      console.error('Task execution failed:', error)
      this.dbService.updateCommentaryTaskStatus(taskId, 'error')
      throw error
    } finally {
      this.isProcessing = false
      this.currentTask = null
      this.shouldStop = false
    }
  }

  stopCurrentTask() {
    if (this.isProcessing) {
      this.shouldStop = true
      return true
    }
    return false
  }

  /**
   * 多浏览器并行执行任务
   * @param {number} taskId - 任务 ID
   * @param {Array<string>} browserProfileIds - 多个 BitBrowser 配置文件 ID
   * @param {Function} progressCallback - 进度回调
   */
  async startParallelTask(taskId, browserProfileIds, progressCallback = () => { }) {
    if (this.isProcessing) {
      throw new Error('已有任务正在处理中')
    }
    if (!this.dbService) {
      throw new Error('DatabaseService not initialized in AIStudioService')
    }
    if (!browserProfileIds || browserProfileIds.length === 0) {
      throw new Error('请选择至少一个执行账号')
    }

    this.shouldStop = false
    this.isProcessing = true
    this.taskId = taskId
    this.currentTask = { type: 'parallel', id: taskId }

    try {
      // 1. 获取任务项
      console.log(`[AIStudio] Fetching items for parallel task ${taskId}`)
      const items = this.dbService.getCommentaryTaskItems(taskId)
      const pendingItems = items.filter(item => item.status === 'pending' || item.status === 'failed')
      const total = items.length
      let completedCount = items.length - pendingItems.length

      console.log(`[AIStudio] Starting parallel task ${taskId}, total: ${total}, pending: ${pendingItems.length}, workers: ${browserProfileIds.length}`)

      // 更新任务状态
      this.dbService.updateCommentaryTaskStatus(taskId, 'processing')

      // 2. 初始化任务队列
      this.taskQueue = [...pendingItems]

      // 3. 创建工作线程
      const workerPromises = browserProfileIds.map((profileId, index) => {
        const workerId = `worker-${index}-${profileId}`
        return this.runWorker(workerId, profileId, taskId, total, () => completedCount, (delta) => { completedCount += delta }, progressCallback)
      })

      // 4. 等待所有工作线程完成
      await Promise.all(workerPromises)

      // 5. 任务结束
      if (this.shouldStop) {
        this.dbService.updateCommentaryTaskStatus(taskId, 'paused')
        progressCallback({
          type: 'task',
          taskId: taskId,
          status: 'cancelled',
          message: '任务已暂停'
        })
      } else {
        this.dbService.updateCommentaryTaskStatus(taskId, 'completed')
        progressCallback({
          type: 'task',
          taskId: taskId,
          status: 'completed',
          message: '任务已完成'
        })
      }

    } catch (error) {
      console.error('Parallel task execution failed:', error)
      this.dbService.updateCommentaryTaskStatus(taskId, 'error')
      progressCallback({
        type: 'task',
        taskId: taskId,
        status: 'error',
        error: error.message,
        message: '任务执行失败: ' + error.message
      })
      throw error
    } finally {
      this.isProcessing = false
      this.currentTask = null
      this.taskId = null
      this.shouldStop = false
      this.taskQueue = []
      this.activeWorkers.clear()
    }
  }

  /**
   * 单个工作线程的执行逻辑
   */
  async runWorker(workerId, browserProfileId, taskId, total, getCompleted, addCompleted, progressCallback) {
    console.log(`[AIStudio] Worker ${workerId} started with profile ${browserProfileId}`)

    this.activeWorkers.set(workerId, {
      browserProfileId,
      isProcessing: true,
      currentItem: null
    })

    try {
      while (!this.shouldStop) {
        // 从队列中获取下一个任务
        const item = this.taskQueue.shift()
        if (!item) {
          console.log(`[AIStudio] Worker ${workerId} - no more items in queue`)
          break
        }

        const video = item.video_info
        this.activeWorkers.get(workerId).currentItem = item

        progressCallback({
          type: 'worker',
          taskId: taskId,
          workerId: workerId,
          browserProfileId: browserProfileId,
          current: getCompleted() + 1,
          total: total,
          videoId: video.id,
          status: 'processing',
          message: `[${workerId}] 正在处理: ${video.title}`
        })

        try {
          // 更新单项状态
          this.dbService.updateCommentaryTaskItemStatus(item.id, 'processing')

          // 执行处理
          console.log(`[AIStudio] Worker ${workerId} processing item ${item.id}, videoId: ${video.id}`)
          const result = await this.processVideoForWorker(video, browserProfileId, workerId, (progress) => {
            progressCallback({
              type: 'single',
              taskId: taskId,
              workerId: workerId,
              ...progress,
              current: getCompleted() + 1,
              total: total
            })
          })

          // 更新成功状态
          const responseToSave = result.response || result
          this.dbService.updateCommentaryTaskItemStatus(item.id, 'completed', responseToSave)
          addCompleted(1)

          progressCallback({
            type: 'single',
            taskId: taskId,
            workerId: workerId,
            videoId: video.id,
            status: 'completed',
            current: getCompleted(),
            total: total,
            message: `[${workerId}] 完成: ${video.title}`,
            response: responseToSave
          })

          // 短暂休息
          if (!this.shouldStop && this.taskQueue.length > 0) {
            await new Promise(resolve => setTimeout(resolve, 2000))
          }

        } catch (error) {
          console.error(`[AIStudio] Worker ${workerId} failed to process item ${item.id}:`, error)
          this.dbService.updateCommentaryTaskItemStatus(item.id, 'failed', null, error.message)
          addCompleted(1)

          progressCallback({
            type: 'single',
            taskId: taskId,
            workerId: workerId,
            videoId: video.id,
            status: 'error',
            current: getCompleted(),
            total: total,
            error: error.message,
            message: `[${workerId}] 失败: ${video.title} - ${error.message}`
          })

          // 失败后短暂等待再继续
          await new Promise(resolve => setTimeout(resolve, 3000))
        }
      }
    } finally {
      console.log(`[AIStudio] Worker ${workerId} finished`)
      this.activeWorkers.delete(workerId)
    }
  }

  /**
   * 为工作线程处理单个视频 (独立的浏览器实例)
   */
  async processVideoForWorker(video, browserProfileId, workerId, progressCallback = () => { }) {
    let browserId = null
    let playwrightBrowserId = null
    let browserService = null
    let browserType = 'bitbrowser'

    try {
      // Step 1: 更新状态为 generating
      progressCallback({ step: 1, progress: 5, message: '更新任务状态...' })
      await supabaseService.updateStatus(video.id, 'generating')

      // Step 2: 获取账号信息并启动对应浏览器
      progressCallback({ step: 2, progress: 10, message: '启动浏览器...' })

      // 获取账号信息以确定浏览器类型
      const account = await this.getAccountByBrowserId(browserProfileId)
      console.log(`[${workerId}] Looking up account for browserProfileId:`, browserProfileId)
      console.log(`[${workerId}] Found account:`, account ? JSON.stringify(account) : 'null')
      if (account) {
        browserType = account.browser_type || 'bitbrowser'
        console.log(`[${workerId}] Using browser_type from account:`, browserType)
      } else {
        console.log(`[${workerId}] No account found, using default browserType: bitbrowser`)
      }

      browserService = this.getBrowserService(browserType)
      console.log(`[${workerId}] Starting ${browserType} browser with profile:`, browserProfileId)

      const browserResult = await browserService.startBrowser(browserProfileId)
      if (!browserResult.success) {
        throw new Error('启动浏览器失败: ' + (browserResult.msg || '未知错误'))
      }

      browserId = browserResult.browserId
      const wsEndpoint = browserResult.wsEndpoint

      // Step 3: 连接 Playwright
      progressCallback({ step: 3, progress: 20, message: '连接浏览器...' })
      const connection = await this.playwrightService.connectBrowser(wsEndpoint)
      playwrightBrowserId = connection.browserId
      const context = connection.context

      // Step 4: 打开或获取 AI Studio 页面
      progressCallback({ step: 4, progress: 30, message: '打开 AI Studio...' })

      const existingPages = context.pages()
      let page = existingPages.length > 0 ? existingPages[0] : await context.newPage()

      try {
        await page.bringToFront()
      } catch (e) {
        console.error(`[${workerId}] Failed to bring page to front:`, e)
      }

      await page.goto('https://aistudio.google.com/prompts/new_chat', {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      })

      await page.waitForTimeout(3000)

      // Step 5: 检查是否需要登录
      const currentUrl = page.url()
      if (currentUrl.includes('accounts.google.com')) {
        throw new Error('需要先登录 Google 账号')
      }

      // Step 6: 查找并点击聊天输入框
      progressCallback({ step: 5, progress: 40, message: '准备输入内容...' })

      await page.waitForTimeout(2000)

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
            break
          }
        } catch (e) {
          continue
        }
      }

      if (!inputElement) {
        throw new Error('无法找到聊天输入框')
      }

      // Step 7.1: 输入视频链接
      progressCallback({ step: 6, progress: 50, message: '正在输入视频链接...' })

      await inputElement.click()
      await page.waitForTimeout(1000)
      await page.keyboard.press('Control+A')
      await page.keyboard.press('Backspace')
      await page.waitForTimeout(500)

      const videoUrl = video.video_url || video.url

      if (!videoUrl) {
        throw new Error('视频链接为空')
      }

      // 使用剪贴板锁保护粘贴操作，避免多浏览器并行时冲突
      await clipboardLock.writeAndPaste(page, videoUrl, `worker-paste-video-url`)

      // 验证视频附件
      try {
        await page.waitForSelector('ms-youtube-chunk', {
          state: 'visible',
          timeout: 20000
        })
      } catch (e) {
        throw new Error('粘贴视频链接失败：未检测到视频附件')
      }

      // 等待视频处理完成
      try {
        await page.waitForSelector('mat-icon:has-text("settings_video_camera")', {
          state: 'visible',
          timeout: 60000
        })
      } catch (e) {
        throw new Error('视频处理超时：未检测到处理完成图标')
      }
      await page.waitForTimeout(1000)

      // Step 7.2: 输入提示词
      progressCallback({ step: 7, progress: 60, message: '正在输入提示词...' })
      await page.keyboard.press('Shift+Enter')
      await page.keyboard.press('Shift+Enter')

      await inputElement.click()
      await page.waitForTimeout(500)

      // 使用剪贴板锁保护粘贴操作，避免多浏览器并行时冲突
      await clipboardLock.writeAndPaste(page, this.defaultPrompt, `worker-paste-prompt`)
      await page.waitForTimeout(500)

      // 发送
      const sendSelectors = [
        'button:has-text("Run")',
        'button[aria-label="Run"]',
        '[data-testid="run-button"]',
        '.run-button',
        'button[aria-label*="Send"]',
        'button[type="submit"]'
      ]

      let sent = false
      for (const selector of sendSelectors) {
        try {
          const button = await page.locator(selector).first()
          if (await button.isVisible()) {
            await button.click()
            sent = true
            break
          }
        } catch (e) {
          continue
        }
      }

      if (!sent) {
        await inputElement.press('Control+Enter')
      }

      // Step 8: 等待 AI 回复
      // 8.1 等待生成开始
      console.log(`[${workerId}] 等待5秒让AI开始生成...`)
      progressCallback({ step: 8, progress: 71, message: '⏳ 等待5秒让AI开始生成...' })
      await page.waitForTimeout(5000)

      // 8.2 滚动到底部
      console.log(`[${workerId}] 滚动到页面底部...`)
      progressCallback({ step: 8, progress: 72, message: '📜 滚动到页面底部...' })
      await this.scrollChatToBottom(page)

      let response = ''

      // Stop 按钮选择器
      const stopButtonSelector = 'button:has-text("Stop")'
      // thumb_up 图标选择器
      const thumbUpSelectors = [
        'button[iconname="thumb_up"]',
        'span.material-symbols-outlined:has-text("thumb_up")',
        'mat-icon:has-text("thumb_up")',
        '[aria-label*="helpful"]',
        '[aria-label*="like"]'
      ]

      let completionFound = false
      const startTime = Date.now()
      const timeout = 180000 // 3分钟
      let stopButtonSeenAt = null
      let stopButtonGoneAt = null
      let thumbUpSeenAt = null
      let thumbUpCount = 0

      console.log(`[${workerId}] 开始检测完成信号...`)
      // 这里的 message 会在进入 loop 前短暂显示
      progressCallback({ step: 8, progress: 73, message: '👀 开始检测完成信号(Stop按钮/ThumbUp)...' })

      while (!completionFound && (Date.now() - startTime) < timeout && !this.shouldStop) {
        const elapsed = Math.round((Date.now() - startTime) / 1000)
        let statusMsg = `⏱️ 等待AI回复... ${elapsed}s`

        // 检查 Stop 按钮状态
        try {
          const stopButton = await page.locator(stopButtonSelector).first()
          const stopVisible = await stopButton.isVisible({ timeout: 300 })

          if (stopVisible) {
            if (!stopButtonSeenAt) {
              stopButtonSeenAt = new Date().toLocaleTimeString()
              console.log(`[${workerId}] ⏳ Stop按钮出现 @ ${stopButtonSeenAt}`)
            }
            statusMsg += ` | ⏹️ Stop按钮: 可见 (出现于 ${stopButtonSeenAt})`
          } else {
            if (stopButtonSeenAt && !stopButtonGoneAt) {
              stopButtonGoneAt = new Date().toLocaleTimeString()
              console.log(`[${workerId}] ✅ Stop按钮消失 @ ${stopButtonGoneAt}`)
            }
            if (stopButtonGoneAt) {
              statusMsg += ` | ✅ Stop按钮: 已消失 (于 ${stopButtonGoneAt})`
              // Stop 按钮消失后，立即滚动到底部，确保最新回复可见
              await this.scrollChatToBottom(page)
              await page.waitForTimeout(500)
            }
          }
        } catch (e) {
          // Stop 按钮不存在
        }

        // 检查 thumb_up 图标
        let currentThumbUpCount = 0
        for (const selector of thumbUpSelectors) {
          try {
            const elements = await page.locator(selector).all()
            if (elements.length > 0) {
              currentThumbUpCount = elements.length
              // 检查最后一个 thumb_up 图标
              const lastThumbUp = elements[elements.length - 1]
              if (await lastThumbUp.isVisible({ timeout: 300 })) {
                thumbUpSeenAt = new Date().toLocaleTimeString()
                thumbUpCount = elements.length
                console.log(`[${workerId}] 👍 thumb_up图标出现 @ ${thumbUpSeenAt} (共${thumbUpCount}个)`)
                completionFound = true
                break
              }
            }
          } catch (e) {
            // 继续
          }
        }

        if (currentThumbUpCount > 0) {
          statusMsg += ` | 👍 ThumbUp: ${currentThumbUpCount}个`
        }

        // 实时更新进度消息
        if (!completionFound) {
          // 立即更新状态，不要等待 elapsed % 1 === 0
          // 使用 elapsed 来控制日志频率，但 UI 更新可以更频繁
          progressCallback({
            step: 8,
            progress: 74 + Math.min(elapsed / 3, 10),
            message: statusMsg
          })

          // 滚动检查 (每5秒一次)
          if (elapsed % 5 === 0 && elapsed > 0) {
            await this.scrollChatToBottom(page)
          }

          await page.waitForTimeout(1000)
        }
      }

      // 再次滚动到底部
      console.log(`[${workerId}] 再次滚动到底部...`)
      progressCallback({ step: 8, progress: 87, message: '再次滚动到底部...' })
      await this.scrollChatToBottom(page)

      // 额外等待确保内容完全加载
      console.log(`[${workerId}] 完成检测，等待3秒确保内容稳定...`)
      progressCallback({ step: 8, progress: 88, message: '完成检测，等待3秒确保内容稳定...' })
      await page.waitForTimeout(3000)

      // 提取 AI 回复内容 - 关键改进：从 thumb_up 图标往上找最近的回复
      console.log(`[${workerId}] 开始提取AI回复内容...`)
      progressCallback({ step: 8, progress: 90, message: `开始提取AI回复内容 (thumbUp数量: ${thumbUpCount})...` })

      response = await page.evaluate(() => {
        // 找到所有 thumb_up 图标
        const thumbUpButtons = document.querySelectorAll('button[iconname="thumb_up"], [aria-label*="helpful"], [aria-label*="like"]')
        console.log(`[Extract] 找到 ${thumbUpButtons.length} 个 thumb_up 图标`)

        if (thumbUpButtons.length === 0) {
          console.log('[Extract] 未找到 thumb_up 图标，尝试其他方法')
          return null
        }

        // 获取最后一个 thumb_up 图标（对应最新的回复）
        const lastThumbUp = thumbUpButtons[thumbUpButtons.length - 1]

        // 从 thumb_up 往上找最近的消息容器
        // AI Studio 的结构通常是: 消息容器 > ... > thumb_up按钮
        let messageContainer = lastThumbUp.closest('[class*="turn"], [class*="message"], [class*="response"]')

        if (!messageContainer) {
          // 尝试往上遍历找到包含代码块或长文本的容器
          let parent = lastThumbUp.parentElement
          for (let i = 0; i < 15 && parent; i++) {
            const codeBlocks = parent.querySelectorAll('pre code, pre, code')
            const textChunks = parent.querySelectorAll('ms-text-chunk, ms-cmark-node')
            if (codeBlocks.length > 0 || textChunks.length > 0) {
              messageContainer = parent
              console.log(`[Extract] 在第${i + 1}层父元素找到消息容器`)
              break
            }
            parent = parent.parentElement
          }
        }

        if (!messageContainer) {
          console.log('[Extract] 未找到消息容器，使用整个文档')
          messageContainer = document.body
        }

        // 在消息容器中查找 JSON 内容
        // 方法1: 查找代码块
        const codeBlocks = messageContainer.querySelectorAll('pre code, pre, code')
        console.log(`[Extract] 消息容器中找到 ${codeBlocks.length} 个代码块`)

        for (const block of codeBlocks) {
          const text = block.innerText || block.textContent || ''
          // 检查是否是真正的 AI 回复（不是模板示例）
          // AI 回复的特征：videoDescription 的值不是 "视频速记标签/外号"
          if (text.includes('"videoDescription"') && !text.includes('"视频速记标签/外号"')) {
            console.log(`[Extract] ✅ 在代码块中找到有效回复，长度: ${text.length}`)
            return text
          }
        }

        // 方法2: 在消息容器中查找 ms-text-chunk
        const chunks = messageContainer.querySelectorAll('ms-text-chunk, ms-cmark-node')
        console.log(`[Extract] 消息容器中找到 ${chunks.length} 个 text-chunk`)

        for (let i = chunks.length - 1; i >= 0; i--) {
          const chunk = chunks[i]
          const text = chunk.innerText || chunk.textContent || ''
          // 排除模板内容
          if (text.includes('"videoDescription"') && !text.includes('"视频速记标签/外号"')) {
            console.log(`[Extract] ✅ 在 text-chunk[${i}] 中找到有效回复，长度: ${text.length}`)
            return text
          }
        }

        // 方法3: 如果上面都没找到，查找最长的包含JSON的内容（排除模板）
        console.log('[Extract] 尝试查找最长的非模板JSON内容...')
        let bestText = ''
        const allChunks = document.querySelectorAll('ms-text-chunk, ms-cmark-node, pre code, pre, code')
        for (const chunk of allChunks) {
          const text = chunk.innerText || chunk.textContent || ''
          if (text.includes('"videoDescription"') &&
            !text.includes('"视频速记标签/外号"') &&
            text.length > bestText.length) {
            bestText = text
          }
        }

        if (bestText) {
          console.log(`[Extract] ✅ 找到最长的有效回复，长度: ${bestText.length}`)
          return bestText
        }

        console.log('[Extract] ❌ 未能找到有效的AI回复内容')
        return null
      })

      const refinedResponse = await this.extractAIResponseText(page, `[${workerId}]`)
      if (refinedResponse) {
        response = refinedResponse
      }

      if (!response) {
        console.log(`[${workerId}] ❌ 提取失败，尝试备用方法...`)
        progressCallback({ step: 8, progress: 91, message: '提取失败，尝试备用方法...' })
        // 备用方法：直接获取页面上所有包含 videoDescription 但不包含模板内容的文本
        response = await page.evaluate(() => {
          const allElements = document.querySelectorAll('*')
          let bestText = ''
          for (const el of allElements) {
            if (el.children.length > 0) continue // 跳过有子元素的
            const text = el.innerText || el.textContent || ''
            if (text.includes('"videoDescription"') &&
              !text.includes('"视频速记标签/外号"') &&
              !text.includes('videoDescription": "视频速记') &&
              text.length > 500 &&
              text.length > bestText.length) {
              bestText = text
            }
          }
          return bestText
        })
      }

      if (!response) {
        console.log(`[${workerId}] ❌ 所有提取方法都失败了`)
        progressCallback({ step: 8, progress: 92, message: '❌ 所有提取方法都失败' })
        throw new Error('无法获取 AI 回复内容')
      }

      console.log(`[${workerId}] ✅ 成功提取回复，长度: ${response.length}`)
      progressCallback({ step: 8, progress: 93, message: `✅ 成功提取回复，长度: ${response.length}` })

      // 清理回复内容
      const cleanResponse = this.cleanAIResponse(response)

      // 验证提取的内容不是模板
      const templateMarkers = ['视频速记标签/外号', '"videoDescription": "视频速记']
      const isTemplateContent = templateMarkers.some(marker => cleanResponse.includes(marker))
      if (isTemplateContent) {
        console.log(`[${workerId}] ❌ 提取到的是模板内容，不是AI真实回复`)
        progressCallback({ step: 8, progress: 94, message: '❌ 提取到模板内容，获取失败' })
        throw new Error('提取到的是模板内容，AI未生成有效回复')
      }

      let parsedResponse = cleanResponse
      try {
        parsedResponse = JSON.parse(cleanResponse)
      } catch (e) {
        console.warn(`[${workerId}] Failed to parse JSON, saving as raw text`)
      }

      // 保存到 Supabase
      progressCallback({ step: 9, progress: 95, message: '保存结果...' })
      await supabaseService.updateAIResponse(video.id, parsedResponse, 'completed')

      progressCallback({ step: 10, progress: 100, message: '处理完成！' })

      return {
        success: true,
        videoId: video.id,
        response: cleanResponse
      }

    } catch (error) {
      console.error(`[${workerId}] Process video failed:`, error)

      try {
        await supabaseService.updateStatus(video.id, 'failed', error.message)
      } catch (e) {
        console.error('Failed to update status:', e)
      }

      throw error

    } finally {
      if (playwrightBrowserId) {
        try {
          await this.playwrightService.disconnectBrowser(playwrightBrowserId)
        } catch (e) {
          console.error(`[${workerId}] Failed to disconnect playwright:`, e)
        }
      }

      if (browserId && browserService) {
        try {
          await browserService.closeBrowser(browserId)
        } catch (e) {
          console.error(`[${workerId}] Failed to close browser:`, e)
        }
      }
    }
  }

  /**
   * 处理单个视频
   * @param {Object} video - 视频记录 { id, video_url, prompt }
   * @param {string} browserProfileId - 浏览器配置文件 ID
   * @param {Function} progressCallback - 进度回调
   */
  async processVideo(video, browserProfileId, progressCallback = () => { }) {
    if (this.isProcessing && (!this.currentTask || this.currentTask.type !== 'persistent')) {
      // 如果是持久化任务调用 processVideo，不应该抛出错误，因为 isProcessing 已经被置为 true
      // 这里需要区分是外部直接调用 processVideo 还是 startTask 内部调用
      // 简单处理：如果 currentTask 是 persistent，允许重入
    } else if (this.isProcessing && !this.currentTask) {
      throw new Error('已有任务正在处理中')
    }

    // 注意：如果是 startTask 调用的，isProcessing 已经是 true 了。
    // 为了复用 processVideo，我们需要稍微调整一下逻辑，或者在 startTask 里手动管理 isProcessing
    // 这里的 processVideo 原本是设计为独立调用的。
    // 为了不破坏原有逻辑，我们假设 processVideo 只负责处理单个视频的逻辑，不管理全局 isProcessing 状态（或者由调用者管理）
    // 但原来的代码里 processVideo 会设置 isProcessing = true。

    // 临时修正：如果已经是在处理 persistent 任务，就不再设置 isProcessing
    const isSubTask = this.currentTask && this.currentTask.type === 'persistent';

    if (!isSubTask) {
      if (this.isProcessing) throw new Error('已有任务正在处理中');
      this.isProcessing = true;
      this.currentTask = video.id;
    }

    let browserId = null
    let playwrightBrowserId = null
    let browserService = null
    let browserType = 'bitbrowser'

    try {
      // Step 1: 更新状态为 generating
      progressCallback({ step: 1, progress: 5, message: '更新任务状态...' })
      await supabaseService.updateStatus(video.id, 'generating')

      // Step 2: 获取账号信息并启动对应浏览器
      progressCallback({ step: 2, progress: 10, message: '启动浏览器...' })

      // 获取账号信息以确定浏览器类型
      const account = await this.getAccountByBrowserId(browserProfileId)
      if (account) {
        browserType = account.browser_type || 'bitbrowser'
      }

      browserService = this.getBrowserService(browserType)
      console.log(`Starting ${browserType} browser with profile:`, browserProfileId)

      const browserResult = await browserService.startBrowser(browserProfileId)
      if (!browserResult.success) {
        throw new Error('启动浏览器失败: ' + (browserResult.msg || '未知错误'))
      }

      browserId = browserResult.browserId
      const wsEndpoint = browserResult.wsEndpoint

      // Step 3: 连接 Playwright
      progressCallback({ step: 3, progress: 20, message: '连接浏览器...' })
      const connection = await this.playwrightService.connectBrowser(wsEndpoint)
      playwrightBrowserId = connection.browserId
      const context = connection.context

      // Step 4: 打开或获取 AI Studio 页面
      progressCallback({ step: 4, progress: 30, message: '打开 AI Studio...' })

      const existingPages = context.pages()
      console.log('[AIStudio] Existing pages count:', existingPages.length)

      let page = null
      if (existingPages.length > 0) {
        page = existingPages[0]
        console.log('[AIStudio] Using existing page')
      } else {
        console.log('[AIStudio] No existing pages, creating new one...')
        page = await context.newPage()
      }

      // 确保页面置顶
      try {
        await page.bringToFront()
      } catch (e) {
        console.error('[AIStudio] Failed to bring page to front:', e)
      }

      console.log('[AIStudio] Navigating to:', 'https://aistudio.google.com/prompts/new_chat')
      await page.goto('https://aistudio.google.com/prompts/new_chat', {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      })

      await page.waitForTimeout(3000)

      // Step 5: 检查是否需要登录
      const currentUrl = page.url()
      if (currentUrl.includes('accounts.google.com')) {
        throw new Error('需要先登录 Google 账号')
      }

      // Step 6: 查找并点击聊天输入框
      progressCallback({ step: 5, progress: 40, message: '准备输入内容...' })
      console.log('Looking for chat input...')

      // 等待页面完全加载
      await page.waitForTimeout(2000)

      // 尝试多种选择器找到输入框
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
            console.log('Found input with selector:', selector)
            break
          }
        } catch (e) {
          continue
        }
      }

      if (!inputElement) {
        throw new Error('无法找到聊天输入框')
      }

      // Step 7.1: 输入视频链接
      progressCallback({ step: 6, progress: 50, message: '正在输入视频链接...' })
      console.log('Typing message...')

      // 3.1 聚焦输入框
      await inputElement.click()
      await page.waitForTimeout(1000)

      // 清空输入框
      await page.keyboard.press('Control+A')
      await page.keyboard.press('Backspace')
      await page.waitForTimeout(500)

      // 3.2 粘贴视频链接 (使用剪贴板锁保护)
      const videoUrl = video.video_url || video.url
      console.log('[AIStudio] Video object:', JSON.stringify(video))
      console.log('[AIStudio] Pasting URL:', videoUrl)

      if (!videoUrl) {
        throw new Error('视频链接为空')
      }

      // 使用剪贴板锁保护粘贴操作，避免多浏览器并行时冲突
      console.log('[AIStudio] Pasting link...')
      await clipboardLock.writeAndPaste(page, videoUrl, 'paste-video-url')

      // 验证视频附件
      console.log('[AIStudio] Waiting for video attachment...')
      try {
        await page.waitForSelector('ms-youtube-chunk', {
          state: 'visible',
          timeout: 20000
        })
        console.log('[AIStudio] Video attachment detected.')
      } catch (e) {
        throw new Error('粘贴视频链接失败：未检测到视频附件')
      }

      // 等待链接解析/预览生成
      console.log('Waiting for video link processing...')
      try {
        // 等待 YouTube 视频处理完成，标志是出现 settings_video_camera 图标
        await page.waitForSelector('mat-icon:has-text("settings_video_camera")', {
          state: 'visible',
          timeout: 60000
        })
        console.log('Video link processed (settings_video_camera icon found)')
      } catch (e) {
        throw new Error('视频处理超时：未检测到处理完成图标')
      }
      await page.waitForTimeout(1000)

      // Step 7.2: 输入提示词
      progressCallback({ step: 7, progress: 60, message: '正在输入提示词...' })
      console.log('Typing prompt...')
      // 换行
      await page.keyboard.press('Shift+Enter')
      await page.keyboard.press('Shift+Enter')

      const prompt = this.defaultPrompt

      // 确保输入框有焦点
      await inputElement.click()
      await page.waitForTimeout(500)

      // 使用剪贴板锁保护粘贴操作，避免多浏览器并行时冲突
      console.log('Pasting prompt...')
      await clipboardLock.writeAndPaste(page, prompt, 'paste-prompt')
      console.log('Input complete')

      await page.waitForTimeout(1000)

      // 尝试多种方式发送
      const sendSelectors = [
        'button:has-text("Run")',
        'button[aria-label="Run"]',
        '[data-testid="run-button"]',
        '.run-button',
        'button[aria-label*="Send"]',
        'button[type="submit"]'
      ]

      let sent = false
      for (const selector of sendSelectors) {
        try {
          const button = await page.locator(selector).first()
          if (await button.isVisible()) {
            await button.click()
            sent = true
            console.log('Clicked send button with selector:', selector)
            break
          }
        } catch (e) {
          continue
        }
      }

      // 如果没找到按钮，尝试按 Enter
      if (!sent) {
        console.log('No send button found, trying Ctrl+Enter...')
        await inputElement.press('Control+Enter')
      }

      // Step 8: 等待 AI 回复
      // 8.1 等待生成开始
      console.log('[AIStudio] Waiting for AI to start generating...')
      progressCallback({ step: 8, progress: 71, message: '⏳ 等待5秒让AI开始生成...' })
      await page.waitForTimeout(5000)

      // 8.2 滚动到底部
      console.log('[AIStudio] Scrolling to bottom...')
      progressCallback({ step: 8, progress: 72, message: '📜 滚动到页面底部...' })
      await this.scrollChatToBottom(page)

      let response = ''

      try {
        // 主要等待 thumb_up 图标出现，这是 AI 回复完成的最可靠标志
        const thumbUpSelectors = [
          'button[iconname="thumb_up"]',
          'span.material-symbols-outlined:has-text("thumb_up")',
          'mat-icon:has-text("thumb_up")',
          '[aria-label*="helpful"]',
          '[aria-label*="like"]'
        ]

        // Stop 按钮消失也是完成标志
        const stopButtonSelector = 'button:has-text("Stop")'

        let completionFound = false
        const startTime = Date.now()
        const timeout = 180000 // 3分钟

        console.log('[AIStudio] Waiting for completion signal (thumb_up icon)...')
        // 这里的 message 会在进入 loop 前短暂显示
        progressCallback({ step: 8, progress: 73, message: '👀 开始检测完成信号(Stop按钮/ThumbUp)...' })

        let stopButtonSeenAt = null
        let stopButtonGoneAt = null
        let thumbUpSeenAt = null
        let thumbUpCount = 0

        while (!completionFound && (Date.now() - startTime) < timeout) {
          const elapsed = Math.round((Date.now() - startTime) / 1000)
          let statusMsg = `⏱️ 等待AI回复... ${elapsed}s`

          // 检查 Stop 按钮状态
          try {
            const stopButton = await page.locator(stopButtonSelector).first()
            const stopVisible = await stopButton.isVisible({ timeout: 300 })

            if (stopVisible) {
              if (!stopButtonSeenAt) {
                stopButtonSeenAt = new Date().toLocaleTimeString()
                console.log(`[AIStudio] ⏳ Stop按钮出现 @ ${stopButtonSeenAt}`)
              }
              statusMsg += ` | ⏹️ Stop按钮: 可见 (出现于 ${stopButtonSeenAt})`
            } else {
              if (stopButtonSeenAt && !stopButtonGoneAt) {
                stopButtonGoneAt = new Date().toLocaleTimeString()
                console.log(`[AIStudio] ✅ Stop按钮消失 @ ${stopButtonGoneAt}`)
              }
              if (stopButtonGoneAt) {
                statusMsg += ` | ✅ Stop按钮: 已消失 (于 ${stopButtonGoneAt})`
                // Stop 按钮消失后，立即滚动到底部，确保最新内容加载
                await this.scrollChatToBottom(page)
                await page.waitForTimeout(500)
              }
            }
          } catch (e) {
            // Stop 按钮不存在
          }

          // 检查 thumb_up 图标
          let currentThumbUpCount = 0
          for (const selector of thumbUpSelectors) {
            try {
              const elements = await page.locator(selector).all()
              if (elements.length > 0) {
                currentThumbUpCount = elements.length
                // 检查最后一个 thumb_up 图标
                const lastThumbUp = elements[elements.length - 1]
                if (await lastThumbUp.isVisible({ timeout: 300 })) {
                  thumbUpSeenAt = new Date().toLocaleTimeString()
                  thumbUpCount = elements.length
                  console.log(`[AIStudio] 👍 thumb_up图标出现 @ ${thumbUpSeenAt} (共${thumbUpCount}个)`)
                  completionFound = true
                  break
                }
              }
            } catch (e) {
              // 继续
            }
          }

          if (currentThumbUpCount > 0) {
            statusMsg += ` | 👍 ThumbUp: ${currentThumbUpCount}个`
          }

          if (!completionFound) {
            // 立即更新状态
            progressCallback({
              step: 8,
              progress: 74 + Math.min(elapsed / 3, 10),
              message: statusMsg
            })

            // 滚动检查 (每5秒一次)
            if (elapsed % 5 === 0 && elapsed > 0) {
              await this.scrollChatToBottom(page)
            }

            await page.waitForTimeout(1000)
          }
        }

        if (!completionFound) {
          console.warn('[AIStudio] Timeout waiting for completion signal, trying to extract anyway...')
        }

        // 额外等待确保内容完全加载
        console.log('[AIStudio] Completion detected, waiting for content to stabilize...')
        await page.waitForTimeout(3000)

        // 提取 AI 回复内容（过滤掉提示模板）
        console.log('[AIStudio] Extracting AI response content...')
        progressCallback({ step: 8, progress: 90, message: '开始提取AI回复内容...' })

        response = await this.extractAIResponseText(page, '[AIStudio]')

        if (!response) {
          console.log('[AIStudio] 主策略提取失败，尝试备用方案...')
          progressCallback({ step: 8, progress: 91, message: '提取失败，尝试备用方案...' })
          const templateMarkers = ['视频速记标签/外号', 'videoDescription": "视频速记']
          response = await page.evaluate(({ templateMarkers }) => {
            const containsTemplate = (text = '') => templateMarkers.some(marker => text.includes(marker))
            const isCandidate = (text = '') => {
              if (!text) return false
              const trimmed = text.trim()
              if (trimmed.length < 100) return false
              if (!trimmed.includes('"videoDescription"')) return false
              if (!trimmed.includes('{') || !trimmed.includes('}')) return false
              return !containsTemplate(trimmed)
            }

            let bestText = ''
            const elements = document.querySelectorAll('*')
            for (const el of elements) {
              if (!el) continue
              if (el.children && el.children.length > 0) continue
              if (el.closest('textarea') || el.closest('[contenteditable]')) continue
              const text = el.innerText || el.textContent || ''
              if (isCandidate(text) && text.length > bestText.length) {
                bestText = text
              }
            }
            return bestText || null
          }, { templateMarkers })
        }
      } catch (e) {
        console.error('[AIStudio] Error during completion wait:', e)
      }

      if (!response) {
        throw new Error('无法获取 AI 回复内容')
      }

      console.log(`[AIStudio] ✅ 成功提取回复，长度 ${response.length}`)
      progressCallback({ step: 8, progress: 93, message: `✅ 成功提取回复，长度 ${response.length}` })

      // 清理回复内容 (提取 JSON)
      const cleanResponse = this.cleanAIResponse(response)
      console.log('[AIStudio] Cleaned response length:', cleanResponse.length)

      // 验证提取的内容不是模板
      const templateCheckMarkers = ['视频速记标签/外号', '"videoDescription": "视频速记']
      const isTemplateContent = templateCheckMarkers.some(marker => cleanResponse.includes(marker))
      if (isTemplateContent) {
        console.log('[AIStudio] ❌ 提取到的是模板内容，不是AI真实回复')
        progressCallback({ step: 8, progress: 94, message: '❌ 提取到模板内容，获取失败' })
        throw new Error('提取到的是模板内容，AI未生成有效回复')
      }

      // 尝试解析 JSON
      let parsedResponse = cleanResponse
      try {
        parsedResponse = JSON.parse(cleanResponse)
        console.log('[AIStudio] JSON parsed successfully')
      } catch (e) {
        console.warn('[AIStudio] Failed to parse JSON, saving as raw text:', e)
      }

      // Step 10: 保存回复到 Supabase
      progressCallback({ step: 9, progress: 95, message: '保存结果...' })
      console.log('[AIStudio] Saving response to Supabase...')
      console.log('[AIStudio] Response preview:', cleanResponse.substring(0, 200) + '...')

      await supabaseService.updateAIResponse(video.id, parsedResponse, 'completed')

      progressCallback({ step: 10, progress: 100, message: '处理完成！' })

      return {
        success: true,
        videoId: video.id,
        response: cleanResponse
      }

    } catch (error) {
      console.error('[AIStudio] Process video failed:', error)

      // 尝试截图保存，帮助调试
      if (typeof page !== 'undefined' && page) {
        try {
          const fs = require('fs-extra')
          const path = require('path')
          const { app } = require('electron')
          const screenshotDir = path.join(app.getPath('userData'), 'debug-screenshots')
          await fs.ensureDir(screenshotDir)
          const screenshotPath = path.join(screenshotDir, `error-${video.id}-${Date.now()}.png`)
          await page.screenshot({ path: screenshotPath, fullPage: true })
          console.log('[AIStudio] Error screenshot saved to:', screenshotPath)
        } catch (screenshotErr) {
          console.error('[AIStudio] Failed to save error screenshot:', screenshotErr)
        }
      }

      // 更新状态为失败
      try {
        await supabaseService.updateStatus(video.id, 'failed', error.message)
      } catch (e) {
        console.error('Failed to update status:', e)
      }

      throw error

    } finally {
      // 清理资源
      if (!isSubTask) {
        this.isProcessing = false
        this.currentTask = null
      }

      if (playwrightBrowserId) {
        try {
          await this.playwrightService.disconnectBrowser(playwrightBrowserId)
        } catch (e) {
          console.error('Failed to disconnect playwright:', e)
        }
      }

      if (browserId && browserService) {
        try {
          await browserService.closeBrowser(browserId)
        } catch (e) {
          console.error('Failed to close browser:', e)
        }
      }
    }
  }

  /**
   * 滚动聊天区域到最底部，确保可以看到最新的 AI 回复
   */
  async scrollChatToBottom(page) {
    if (!page) return
    try {
      await page.evaluate(() => {
        // AI Studio 的主滚动容器是 MS-AUTOSCROLL-CONTAINER
        const mainContainer = document.querySelector('ms-autoscroll-container')
        if (mainContainer) {
          mainContainer.scrollTop = mainContainer.scrollHeight
          console.log('[Scroll] MS-AUTOSCROLL-CONTAINER scrolled to:', mainContainer.scrollHeight)
          return
        }

        // 备选：查找 scrollable-area
        const scrollableArea = document.querySelector('.scrollable-area')
        if (scrollableArea) {
          scrollableArea.scrollTop = scrollableArea.scrollHeight
          console.log('[Scroll] scrollable-area scrolled to:', scrollableArea.scrollHeight)
          return
        }

        // 最后备选：遍历所有可滚动元素
        document.querySelectorAll('*').forEach(el => {
          if (el.scrollHeight > el.clientHeight && el.clientHeight > 100) {
            el.scrollTop = el.scrollHeight
          }
        })
      })

      // 滚动后等待一下让页面渲染
      await page.waitForTimeout(300)
    } catch (error) {
      console.error('[AIStudio] Failed to scroll chat to bottom:', error)
    }
  }

  /**
   * 从页面提取最新的 AI 回复（避免抓取提示模板）
   */
  async extractAIResponseText(page, logPrefix = '[AIStudio]') {
    if (!page) return null
    const templateMarkers = ['视频速记标签/外号', 'videoDescription": "视频速记']
    try {
      return await page.evaluate(({ templateMarkers, logPrefix }) => {
        const log = (...args) => console.log(`${logPrefix} [Extract]`, ...args)
        const containsTemplate = (text = '') => {
          if (!text) return false
          return templateMarkers.some(marker => text.includes(marker))
        }
        const isCandidate = (text = '') => {
          if (!text) return false
          const trimmed = text.trim()
          if (trimmed.length < 50) return false
          if (!trimmed.includes('"videoDescription"')) return false
          if (!trimmed.includes('{') || !trimmed.includes('}')) return false
          return !containsTemplate(trimmed)
        }
        const pickFromElement = (element) => {
          if (!element) return null

          const codeBlocks = element.querySelectorAll('pre code, pre, code')
          for (const block of codeBlocks) {
            const text = block.innerText || block.textContent || ''
            if (isCandidate(text)) {
              log('Found candidate in code block, length:', text.length)
              return text
            }
          }

          const chunks = element.querySelectorAll('ms-text-chunk, ms-cmark-node')
          for (let i = chunks.length - 1; i >= 0; i--) {
            const text = chunks[i].innerText || chunks[i].textContent || ''
            if (isCandidate(text)) {
              log('Found candidate in text chunk, length:', text.length)
              return text
            }
          }

          const plainText = element.innerText || element.textContent || ''
          if (isCandidate(plainText)) {
            log('Found candidate in plain text, length:', plainText.length)
            return plainText
          }
          return null
        }

        const searchAroundThumbUp = () => {
          const thumbUpButtons = document.querySelectorAll('button[iconname="thumb_up"], [aria-label*="helpful"], [aria-label*="like"]')
          if (thumbUpButtons.length === 0) return null
          const lastThumbUp = thumbUpButtons[thumbUpButtons.length - 1]
          let container = lastThumbUp.closest('[class*="turn"], [class*="message"], [class*="response"]')

          if (!container) {
            let parent = lastThumbUp.parentElement
            for (let i = 0; i < 20 && parent; i++) {
              if (parent.querySelector('pre, ms-text-chunk, ms-cmark-node')) {
                container = parent
                break
              }
              parent = parent.parentElement
            }
          }

          return pickFromElement(container)
        }

        const searchModelMessages = () => {
          const selectors = [
            'ms-chat-message[data-message-author-role="model"]',
            '[data-message-author-role="model"]',
            'ms-message[data-message-author-role="model"]',
            '.model-response',
            '.assistant-message'
          ]

          for (const selector of selectors) {
            const elements = document.querySelectorAll(selector)
            if (!elements.length) continue
            for (let i = elements.length - 1; i >= 0; i--) {
              const node = elements[i]
              if (!node || node.closest('textarea') || node.closest('[contenteditable]')) continue
              const picked = pickFromElement(node)
              if (picked) return picked
            }
          }
          return null
        }

        const fallbackLongest = () => {
          let bestText = ''
          const nodes = document.querySelectorAll('ms-text-chunk, ms-cmark-node, pre code, pre, code, [data-message-author-role="model"]')
          nodes.forEach(node => {
            if (!node || node.closest('textarea') || node.closest('[contenteditable]')) return
            const text = node.innerText || node.textContent || ''
            if (isCandidate(text) && text.length > bestText.length) {
              bestText = text
            }
          })
          return bestText || null
        }

        return searchAroundThumbUp() || searchModelMessages() || fallbackLongest()
      }, { templateMarkers, logPrefix })
    } catch (error) {
      console.error('[AIStudio] Failed to extract AI response text:', error)
      return null
    }
  }

  /**
   * 清理 AI 回复，提取 JSON 内容
   */
  cleanAIResponse(text) {
    if (!text) return ''

    // 尝试提取 ```json ... ``` 代码块
    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/)
    if (jsonMatch && jsonMatch[1]) {
      return jsonMatch[1].trim()
    }

    // 尝试提取 ``` ... ``` 代码块 (如果没有指定 json 语言)
    const codeMatch = text.match(/```\s*([\s\S]*?)\s*```/)
    if (codeMatch && codeMatch[1]) {
      return codeMatch[1].trim()
    }

    // 如果没有代码块，尝试查找第一个 { 和最后一个 }
    const firstBrace = text.indexOf('{')
    const lastBrace = text.lastIndexOf('}')

    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return text.substring(firstBrace, lastBrace + 1)
    }

    // 如果都不是，返回原始内容 (去除首尾空白)
    return text.trim()
  }

  /**
   * 批量处理视频
   * @param {Array} videos - 视频记录数组
   * @param {string} browserProfileId - BitBrowser 配置文件 ID
   * @param {Function} progressCallback - 进度回调
   */
  async batchProcess(videos, browserProfileId, progressCallback = () => { }) {
    const results = []
    const total = videos.length

    for (let i = 0; i < total; i++) {
      const video = videos[i]

      progressCallback({
        type: 'batch',
        current: i + 1,
        total: total,
        videoId: video.id,
        message: `处理第 ${i + 1}/${total} 个视频`
      })

      try {
        const result = await this.processVideo(video, browserProfileId, (progress) => {
          progressCallback({
            type: 'single',
            ...progress,
            current: i + 1,
            total: total
          })
        })
        results.push(result)

        // 处理完一个后等待一段时间，避免请求过快
        if (i < total - 1) {
          await new Promise(resolve => setTimeout(resolve, 3000))
        }
      } catch (error) {
        results.push({
          success: false,
          videoId: video.id,
          error: error.message
        })
      }
    }

    return results
  }

  /**
   * 取消当前任务
   */
  cancelCurrentTask() {
    if (this.currentTask) {
      // 标记取消
      this.isProcessing = false
      return true
    }
    return false
  }

  /**
   * 获取处理状态
   */
  getStatus() {
    return {
      isProcessing: this.isProcessing,
      currentTask: this.currentTask
    }
  }
}

// 导出单例
module.exports = new AIStudioService()
