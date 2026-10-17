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
    this.rateLimitedBrowsers = new Set() // 本次任务中已达到速率限制的浏览器 ID
    // 视频额度冷却：实测每个账号连做 1~2 个视频就会 permission denied，需冷却几分钟才恢复（纯文本不受限）
    this.browserCooldownUntil = new Map() // browserProfileId -> 冷却到期时间戳(ms)
    this.quotaRequeueCount = new Map()     // itemId -> 因视频额度被放回队列的次数（防止死循环）
    this.videoQuotaCooldownMs = 180000     // 命中视频额度后该账号冷却时长(默认3分钟)
    this.maxQuotaRequeue = 8               // 单条任务最多因额度放回队列次数，超过判失败
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
  "videoType": "大类 - 子类（中文）",
  "scriptValueAdd": "文案增值分析内容"
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
          * **生活/兴趣类**：萌宠动物、儿童玩具、文具手帐、建筑设计、美食制作、沉浸式解压(ASMR)、DIY手工、收纳整理、好物推荐

8.  **scriptValueAdd**:

      * **目标**：分析解说文案如何为纯画面提供"增量信息"和"吸引力"。
      * **语言**：必须用中文回复。
      * **内容逻辑**（请在一段文本中包含以下三个层面的分析，使用换行符分隔）：
          1. **纯画面信息**：如果静音观看，观众只能看到什么？（描述视觉表象）
          2. **文案增量信息**：解说词提供了哪些画面里看不出来的信息？（如：背景故事、人物心理活动、未知的后果、专业知识科普等）
          3. **增值效果分析**：这些额外信息是如何制造悬念、幽默感或紧迫感的？它是如何成功留住观众的？
      * **示例**：
        纯画面：一只猫蹲在鱼缸前看着鱼。
        文案增量：解说提到这只猫已经绝食抗议了两天，这是它最后的倔强，并且鱼缸里的鱼其实是假的。
        增值效果：文案赋予了静态画面强烈的故事性和反转喜感，让观众好奇猫发现真相后的反应，从而提高完播率。`
  }

  setDbService(dbService) {
    this.dbService = dbService
  }

  setBitBrowserService(bitBrowserService) {
    this.bitBrowserService = bitBrowserService
  }

  /**
   * 从 YouTube URL 中提取视频 ID
   * @param {string} url - YouTube 视频链接
   * @returns {string|null} - 视频 ID 或 null
   */
  extractVideoId(url) {
    if (!url) return null
    // 支持多种 YouTube URL 格式
    // https://www.youtube.com/watch?v=VIDEO_ID
    // https://youtu.be/VIDEO_ID
    // https://www.youtube.com/embed/VIDEO_ID
    // https://www.youtube.com/shorts/VIDEO_ID
    const patterns = [
      /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
      /^([a-zA-Z0-9_-]{11})$/ // 纯视频 ID
    ]
    for (const pattern of patterns) {
      const match = url.match(pattern)
      if (match) return match[1]
    }
    return null
  }

  /**
   * 检测 YouTube 视频是否有效（未被删除）
   * 通过请求视频缩略图来判断，被删除的视频缩略图会返回 404
   * @param {string} videoUrl - YouTube 视频链接
   * @returns {Promise<boolean>} - true = 视频有效, false = 视频已被删除
   */
  async checkVideoExists(videoUrl) {
    const videoId = this.extractVideoId(videoUrl)
    if (!videoId) {
      console.log('[AIStudio] 无法从 URL 提取视频 ID:', videoUrl)
      return true // 无法判断，默认认为有效
    }

    const thumbnailUrl = `https://ytimg.googleusercontent.com/vi/${videoId}/hqdefault.jpg`

    try {
      const response = await fetch(thumbnailUrl, { method: 'HEAD' })
      const isValid = response.ok
      console.log(`[AIStudio] 视频 ${videoId} 有效性检测: ${isValid ? '有效' : '已删除'} (HTTP ${response.status})`)
      return isValid
    } catch (error) {
      console.error('[AIStudio] 检测视频有效性时出错:', error.message)
      return true // 网络错误时默认认为有效，继续尝试
    }
  }

  setHubStudioService(hubStudioService) {
    this.hubStudioService = hubStudioService
  }

  /**
   * 打开视频链接检测是否存在 YouTube 视频错误或异常状态
   * 用于识别版权限制、地区限制、不公开/私人视频等情况
   * @param {Page} page - Playwright 页面对象
   * @param {string} videoUrl - 视频链接
   * @returns {Promise<{hasError: boolean, reason: string, subreason: string}>}
   */
  async checkYouTubeVideoError(page, videoUrl) {
    try {
      console.log(`[AIStudio] 正在打开视频链接检测错误: ${videoUrl}`)

      // 在当前页面打开视频链接
      await page.goto(videoUrl, { waitUntil: 'domcontentloaded', timeout: 15000 })
      await page.waitForTimeout(3000) // 等待页面完全加载

      // 1. 检测 YouTube 官方错误消息渲染器 (yt-player-error-message-renderer)
      const errorRenderer = page.locator('yt-player-error-message-renderer')

      if (await errorRenderer.isVisible({ timeout: 3000 })) {
        // 提取主要错误原因
        let reason = ''
        let subreason = ''

        try {
          const reasonElement = page.locator('yt-player-error-message-renderer #reason')
          if (await reasonElement.isVisible({ timeout: 500 })) {
            reason = await reasonElement.textContent() || ''
          }
        } catch (e) {
          // 忽略
        }

        try {
          const subreasonElement = page.locator('yt-player-error-message-renderer #subreason')
          if (await subreasonElement.isVisible({ timeout: 500 })) {
            subreason = await subreasonElement.textContent() || ''
          }
        } catch (e) {
          // 忽略
        }

        console.log(`[AIStudio] 检测到 YouTube 视频错误: ${reason} - ${subreason}`)
        return {
          hasError: true,
          reason: reason.trim(),
          subreason: subreason.trim()
        }
      }

      // 2. 检测视频隐私状态标识 (不公开/私人)
      // 使用 badge-shape 元素检测，aria-label 或 .yt-badge-shape__text 包含隐私状态
      try {
        const badgeElements = page.locator('badge-shape.yt-badge-shape')
        const count = await badgeElements.count()

        for (let i = 0; i < count; i++) {
          const badge = badgeElements.nth(i)
          const ariaLabel = await badge.getAttribute('aria-label') || ''
          let badgeText = ''

          try {
            const textElement = badge.locator('.yt-badge-shape__text')
            if (await textElement.isVisible({ timeout: 300 })) {
              badgeText = await textElement.textContent() || ''
            }
          } catch (e) {
            // 忽略
          }

          const labelToCheck = ariaLabel || badgeText

          // 检测不公开/私人状态（支持多语言）
          // 中文：不公开、私享、私人
          // 英文：Unlisted、Private
          const privatePatterns = ['不公开', '私享', '私人', 'unlisted', 'private']
          const isPrivateVideo = privatePatterns.some(pattern =>
            labelToCheck.toLowerCase().includes(pattern.toLowerCase())
          )

          if (isPrivateVideo) {
            console.log(`[AIStudio] 检测到视频隐私状态: ${labelToCheck}`)
            return {
              hasError: true,
              reason: labelToCheck.trim(),
              subreason: '视频为不公开或私人状态'
            }
          }
        }
      } catch (e) {
        // 忽略检测失败
        console.log('[AIStudio] 隐私状态检测失败:', e.message)
      }

      return { hasError: false, reason: '', subreason: '' }
    } catch (e) {
      console.error('[AIStudio] 检测视频错误时出错:', e.message)
      // 出错时不影响原流程
      return { hasError: false, reason: '', subreason: '' }
    }
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
   * 等待 YouTube 视频真正处理完成
   *
   * 旧逻辑用 waitForSelector 列表里包含了 `span.material-symbols-outlined:has-text("settings")`
   * 这种页面上一直存在的图标，导致 waitForSelector 几乎瞬间返回、根本没等视频处理完，
   * 之后只 sleep 1 秒就发送 → 视频未就绪 → "An internal error has occurred / permission denied"。
   *
   * 新逻辑：轮询顶部 token 数（视频处理完成后才会算出 token），等它出现且连续稳定后再返回，
   * 模拟人工"看到 token 跳出来才发送"的行为。
   * @param {Page} page - Playwright 页面对象
   * @param {string} label - 日志前缀
   * @returns {Promise<boolean>} 是否检测到处理完成（超时则返回 false，但仍可继续）
   */
  async waitForVideoProcessed(page, label = '') {
    const maxWaitMs = 120000   // 最长等待 2 分钟
    const start = Date.now()
    let lastCount = -1
    let stableReads = 0
    let sawCount = false

    while (Date.now() - start < maxWaitMs) {
      if (this.shouldStop) break

      // 1) 视频卡片内若仍有 loading / 进度条，说明还在处理
      let spinning = false
      try {
        spinning = await page.evaluate(() => {
          const chip = document.querySelector('ms-prompt-media, ms-prompt-video, ms-youtube-chunk')
          if (!chip) return false
          return !!chip.querySelector(
            'mat-spinner, mat-progress-spinner, .mat-mdc-progress-spinner, [role="progressbar"], .loading, .processing'
          )
        })
      } catch (e) { /* 忽略 */ }

      // 2) 读取顶部 token 数（处理完成后才会算出）
      //    优先用 ms-token-status；找不到时，扫描"只包含 token 计数文本"的叶子节点，
      //    避免误抓页面里提到 "tokens" 的正文/描述。
      let count = -1
      try {
        count = await page.evaluate(() => {
          const parseTokens = (raw) => {
            if (!raw) return -1
            const m = raw.match(/([\d.,]+)\s*(?:\/\s*[\d.,]+)?\s*tokens?/i)
            return m ? parseInt(m[1].replace(/[.,]/g, ''), 10) : -1
          }
          const statusEl = document.querySelector('ms-token-status, [data-test-id="token-count"]')
          if (statusEl) {
            const c = parseTokens(statusEl.innerText || statusEl.textContent || '')
            if (c >= 0) return c
          }
          // 兜底：找文本严格形如 "1,234 tokens" / "1,234 / 1,048,576 tokens" 的计数控件
          const pattern = /^[\d.,]+\s*(?:\/\s*[\d.,]+)?\s*tokens?$/i
          const candidates = document.querySelectorAll('span, div, button')
          for (const el of candidates) {
            const t = (el.innerText || el.textContent || '').trim()
            if (t.length <= 40 && pattern.test(t)) return parseTokens(t)
          }
          return -1
        })
      } catch (e) { /* 忽略 */ }

      if (count > 0) sawCount = true

      // token 数 > 0、无加载动画、且连续两次读数一致 → 视为处理完成
      if (!spinning && count > 0 && count === lastCount) {
        stableReads++
        if (stableReads >= 2) {
          console.log(`${label} 视频处理完成 (token=${count}, 耗时${Math.round((Date.now() - start) / 1000)}s)`)
          return true
        }
      } else {
        stableReads = 0
      }
      lastCount = count
      await page.waitForTimeout(1500)
    }

    console.log(`${label} ⚠ 视频处理等待超时(${Math.round((Date.now() - start) / 1000)}s, sawToken=${sawCount})，继续尝试发送`)
    return false
  }

  /**
   * 判断一个错误是否值得重试（瞬时错误）
   * AI Studio 的 Gemini 预览模型经常返回临时性错误（internal error / permission denied），
   * 人工遇到时点一下 "Please try again" 通常就好了——这里把这类错误标记为可重试。
   * 不重试：视频已删除、视频异常、速率限制（重试也没用，甚至有害）。
   * @param {Error} error
   * @returns {boolean}
   */
  isRetryableError(error) {
    if (!error || !error.message) return false
    if (error.isVideoDeleted || error.isVideoError) return false
    const msg = error.message
    if (msg.includes('速率限制') || msg.includes('rate limit')) return false
    const retryablePatterns = [
      'AI Studio 内部错误',
      'AI Studio 生成失败',
      'An internal error has occurred',
      '无法获取 AI 回复内容',
      'permission denied',
      'Failed to generate',
      '粘贴视频链接失败',
      '视频处理超时',
      '无法找到聊天输入框'
    ]
    return retryablePatterns.some(p => msg.includes(p))
  }

  /**
   * 判断是否是"视频额度被限"导致的错误（permission denied / internal error / 生成失败 / 无法获取回复）。
   * 实测：这类错误是单账号视频额度用尽，换账号/冷却后即恢复——不能在本账号原地重试，也不能直接判失败。
   * 注意：视频已删除/视频异常/速率限制不算这一类。
   * @param {Error} error
   * @returns {boolean}
   */
  isVideoQuotaError(error) {
    if (!error || !error.message) return false
    if (error.isVideoDeleted || error.isVideoError) return false
    const msg = error.message
    if (msg.includes('速率限制') || msg.includes('rate limit')) return false
    const quotaPatterns = [
      'permission denied',
      'Failed to generate',
      'AI Studio 生成失败',
      'AI Studio 内部错误',
      'An internal error has occurred',
      '无法获取 AI 回复内容'
    ]
    return quotaPatterns.some(p => msg.includes(p))
  }

  /**
   * 用 CDP Input.insertText 注入文本（提示词）。
   * 实测：剪贴板粘贴 + Ctrl+Enter 会被 AI Studio 判定为自动化 → "permission denied / internal error"；
   * 而 CDP insertText（语义级插入，不走系统剪贴板、不模拟逐键事件）+ 真实鼠标点击发送 = 稳定通过。
   * 额外好处：不占用系统剪贴板，多浏览器并行无需加锁。
   * @param {Page} page
   * @param {Locator} inputElement - 输入框
   * @param {string} text
   * @param {string} label - 日志前缀
   */
  async insertPromptViaCDP(page, inputElement, text, label = '') {
    try { await inputElement.click(); await page.waitForTimeout(200) } catch (e) { /* ignore */ }
    const client = await page.context().newCDPSession(page)
    try {
      await client.send('Input.insertText', { text })
    } finally {
      await client.detach().catch(() => {})
    }
    await page.waitForTimeout(300)
  }

  /**
   * 用真实鼠标轨迹 + 点击发送按钮 ms-run-button（不用 Ctrl+Enter）。
   * 注意：该按钮 aria-label 为空、class 也不是 run-button，旧选择器全部失效，
   * 唯一可靠定位是 `ms-run-button button`。
   * @returns {Promise<boolean>} 是否完成了点击动作
   */
  async clickRunButtonHuman(page, label = '') {
    const btn = page.locator('ms-run-button button').first()
    try {
      await btn.waitFor({ state: 'visible', timeout: 8000 })
    } catch (e) {
      console.log(`${label} 未找到发送按钮 (ms-run-button button)`)
      return false
    }
    // 等待按钮可用（aria-disabled 不为 true）
    for (let i = 0; i < 20; i++) {
      const dis = await btn.getAttribute('aria-disabled').catch(() => null)
      if (dis !== 'true') break
      await page.waitForTimeout(300)
    }
    await btn.scrollIntoViewIfNeeded().catch(() => {})
    const box = await btn.boundingBox()
    if (!box) {
      await btn.click({ force: true }).catch(() => {})
      return true
    }
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2
    // 模拟真人鼠标轨迹后点击
    await page.mouse.move(cx - 100, cy - 50, { steps: 6 })
    await page.waitForTimeout(80)
    await page.mouse.move(cx, cy, { steps: 10 })
    await page.waitForTimeout(80)
    await page.mouse.down()
    await page.waitForTimeout(50)
    await page.mouse.up()
    return true
  }

  /**
   * 开始执行持久化任务
   * @param {number} taskId - 任务 ID
   * @param {string} browserProfileId - BitBrowser 配置文件 ID
   * @param {Function} progressCallback - 进度回调
   * @param {string} taskType - 任务类型 ('benchmark' | 'own_channel')
   */
  async startTask(taskId, browserProfileId, progressCallback = () => { }, taskType = 'benchmark') {
    if (this.isProcessing) {
      throw new Error('已有任务正在处理中')
    }
    if (!this.dbService) {
      throw new Error('DatabaseService not initialized in AIStudioService')
    }

    this.shouldStop = false
    this.isProcessing = true
    this.currentTask = { type: 'persistent', id: taskId, taskType }

    try {
      // 1. 获取任务项
      console.log(`[AIStudio] Fetching items for task ${taskId} (type: ${taskType})`)
      const items = taskType === 'own_channel'
        ? this.dbService.getOwnChannelTaskItems(taskId)
        : this.dbService.getCommentaryTaskItems(taskId)

      console.log(`[AIStudio] Retrieved ${items.length} items`)
      const pendingItems = items.filter(item => item.status === 'pending' || item.status === 'failed')
      const total = items.length
      let processedCount = items.length - pendingItems.length

      console.log(`[AIStudio] Starting task ${taskId}, total: ${total}, pending: ${pendingItems.length}`)

      // 更新任务状态和开始时间
      if (taskType === 'own_channel') {
        this.dbService.updateOwnChannelTaskStatus(taskId, 'processing')
        this.dbService.updateOwnChannelTaskStartTime(taskId)
      } else {
        this.dbService.updateCommentaryTaskStatus(taskId, 'processing')
        this.dbService.updateCommentaryTaskStartTime(taskId)
      }

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
          if (taskType === 'own_channel') {
            this.dbService.updateOwnChannelTaskItemStatus(item.id, 'processing')
          } else {
            this.dbService.updateCommentaryTaskItemStatus(item.id, 'processing')
          }

          // 执行处理（带瞬时错误自动重试：模拟人工遇到 "Please try again" 时重试）
          console.log(`[AIStudio] Processing item ${item.id}, videoId: ${video.id}`)
          const tableName = taskType === 'own_channel' ? 'own_videos' : null
          const MAX_ATTEMPTS = 3
          let result = null
          for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            try {
              result = await this.processVideo(video, browserProfileId, (progress) => {
                progressCallback({
                  type: 'single',
                  taskId: taskId,
                  ...progress,
                  current: processedCount + 1,
                  total: total
                })
              }, { tableName })
              break // 成功
            } catch (err) {
              if (this.isRetryableError(err) && attempt < MAX_ATTEMPTS && !this.shouldStop) {
                console.log(`[AIStudio] 第 ${attempt}/${MAX_ATTEMPTS} 次失败可重试: ${err.message}`)
                progressCallback({
                  type: 'single',
                  taskId: taskId,
                  videoId: video.id,
                  status: 'processing',
                  current: processedCount + 1,
                  total: total,
                  message: `AI 临时报错，重试 ${attempt}/${MAX_ATTEMPTS - 1}: ${video.title}`
                })
                await new Promise(resolve => setTimeout(resolve, 5000))
                continue
              }
              throw err
            }
          }

          // 更新成功状态 - 只保存实际的AI回复内容，而不是整个结果对象
          const responseToSave = result.response || result
          if (taskType === 'own_channel') {
            this.dbService.updateOwnChannelTaskItemStatus(item.id, 'completed', responseToSave)
          } else {
            this.dbService.updateCommentaryTaskItemStatus(item.id, 'completed', responseToSave)
          }
          processedCount++

          // 记录成功次数
          try {
            const account = this.dbService.getAIStudioAccountByBrowserId(browserProfileId)
            if (account) {
              this.dbService.recordAIStudioSuccess(account.id)
            }
          } catch (e) {
            console.error('[AIStudio] Failed to record success:', e)
          }

          // 休息一下
          if (i < pendingItems.length - 1 && !this.shouldStop) {
            await new Promise(resolve => setTimeout(resolve, 3000))
          }

        } catch (error) {
          console.error(`Failed to process item ${item.id}:`, error)

          // 检测是否是速率限制错误
          const isRateLimitError = error.message && error.message.includes('速率限制')

          if (isRateLimitError) {
            // 速率限制：停止任务，保持当前项为 pending 状态
            console.log(`[AIStudio] Hit rate limit, stopping task`)
            if (taskType === 'own_channel') {
              this.dbService.updateOwnChannelTaskItemStatus(item.id, 'pending', null, null)
            } else {
              this.dbService.updateCommentaryTaskItemStatus(item.id, 'pending', null, null) // 重置为待处理
            }

            progressCallback({
              type: 'task',
              taskId: taskId,
              status: 'rate_limited',
              message: '已达今日使用上限，任务暂停'
            })

            // 设置停止标志并跳出循环
            this.shouldStop = true
            break
          }

          // 其他错误：正常处理
          const status = error.isVideoDeleted ? 'video_deleted' : (error.isVideoError ? 'video_error' : 'failed')
          if (taskType === 'own_channel') {
            this.dbService.updateOwnChannelTaskItemStatus(item.id, status, null, error.message)
          } else {
            this.dbService.updateCommentaryTaskItemStatus(item.id, status, null, error.message)
          }
          processedCount++ // 即使失败也算处理过
        }
      }

      // 任务结束
      if (this.shouldStop) {
        if (taskType === 'own_channel') {
          this.dbService.updateOwnChannelTaskStatus(taskId, 'paused')
        } else {
          this.dbService.updateCommentaryTaskStatus(taskId, 'paused')
        }
        progressCallback({ type: 'task', taskId: taskId, status: 'cancelled', message: '任务已暂停' })
      } else {
        if (taskType === 'own_channel') {
          this.dbService.updateOwnChannelTaskStatus(taskId, 'completed')
          this.dbService.updateOwnChannelTaskEndTime(taskId)
        } else {
          this.dbService.updateCommentaryTaskStatus(taskId, 'completed')
          this.dbService.updateCommentaryTaskFinishTime(taskId)
        }
        progressCallback({ type: 'task', taskId: taskId, status: 'completed', message: '任务已完成' })
      }

    } catch (error) {
      console.error('Task execution failed:', error)
      if (taskType === 'own_channel') {
        this.dbService.updateOwnChannelTaskStatus(taskId, 'error')
        this.dbService.updateOwnChannelTaskEndTime(taskId)
      } else {
        this.dbService.updateCommentaryTaskStatus(taskId, 'error')
        this.dbService.updateCommentaryTaskFinishTime(taskId)
      }
      progressCallback({ type: 'task', taskId: taskId, status: 'error', error: error.message, message: '任务执行失败: ' + error.message })
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
   * @param {string|object} taskTypeOrOptions - 任务类型 ('benchmark' | 'own_channel') 或配置对象
   */
  async startParallelTask(taskId, browserProfileIds, progressCallback = () => { }, taskTypeOrOptions = 'benchmark') {
    // 兼容旧的调用方式和新的 options 对象
    let taskType = 'benchmark'
    if (typeof taskTypeOrOptions === 'string') {
      taskType = taskTypeOrOptions
    } else if (typeof taskTypeOrOptions === 'object') {
      taskType = taskTypeOrOptions.taskType || 'benchmark'
    }

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
    this.currentTask = { type: 'parallel', id: taskId, taskType }
    this.rateLimitedBrowsers.clear() // 清空速率限制记录
    this.browserCooldownUntil.clear()
    this.quotaRequeueCount.clear()

    try {
      // 1. 获取任务项
      console.log(`[AIStudio] Fetching items for parallel task ${taskId} (type: ${taskType})`)
      const items = taskType === 'own_channel'
        ? this.dbService.getOwnChannelTaskItems(taskId)
        : this.dbService.getCommentaryTaskItems(taskId)

      const pendingItems = items.filter(item => item.status === 'pending' || item.status === 'failed')
      const total = items.length
      let completedCount = items.length - pendingItems.length

      console.log(`[AIStudio] Starting parallel task ${taskId}, total: ${total}, pending: ${pendingItems.length}, workers: ${browserProfileIds.length}`)

      // 更新任务状态和开始时间
      if (taskType === 'own_channel') {
        this.dbService.updateOwnChannelTaskStatus(taskId, 'processing')
        this.dbService.updateOwnChannelTaskStartTime(taskId)
      } else {
        this.dbService.updateCommentaryTaskStatus(taskId, 'processing')
        this.dbService.updateCommentaryTaskStartTime(taskId)
      }

      // 2. 初始化任务队列
      this.taskQueue = [...pendingItems]

      // 3. 创建工作线程
      const workerPromises = browserProfileIds.map((profileId, index) => {
        const workerId = `worker-${index}-${profileId}`
        return this.runWorker(workerId, profileId, taskId, total, () => completedCount, (delta) => { completedCount += delta }, progressCallback, taskType)
      })

      // 4. 等待所有工作线程完成
      await Promise.all(workerPromises)

      // 5. 清理任务中所有卡住的 processing 状态（防止 worker 异常退出导致状态未更新）
      console.log(`[AIStudio] 任务结束前清理卡住的 processing 状态...`)
      if (taskType === 'own_channel') {
        this.dbService.resetStuckOwnChannelTaskItems(taskId)
      } else {
        this.dbService.resetStuckCommentaryTaskItems(taskId)
      }

      // 6. 任务结束
      if (this.shouldStop) {
        // 用户手动停止了任务
        if (taskType === 'own_channel') {
          this.dbService.updateOwnChannelTaskStatus(taskId, 'paused')
        } else {
          this.dbService.updateCommentaryTaskStatus(taskId, 'paused')
        }
        progressCallback({
          type: 'task',
          taskId: taskId,
          status: 'cancelled',
          message: '任务已暂停'
        })
      } else {
        // 任务正常完成
        if (taskType === 'own_channel') {
          this.dbService.updateOwnChannelTaskStatus(taskId, 'completed')
          this.dbService.updateOwnChannelTaskEndTime(taskId)
        } else {
          this.dbService.updateCommentaryTaskStatus(taskId, 'completed')
          this.dbService.updateCommentaryTaskFinishTime(taskId)
        }
        progressCallback({
          type: 'task',
          taskId: taskId,
          status: 'completed',
          message: '任务已完成'
        })
      }

    } catch (error) {
      console.error('Parallel task execution failed:', error)
      // 清理任务中所有卡住的 processing 状态
      console.log(`[AIStudio] 任务出错，清理卡住的 processing 状态...`)
      if (taskType === 'own_channel') {
        this.dbService.resetStuckOwnChannelTaskItems(taskId)
        this.dbService.updateOwnChannelTaskStatus(taskId, 'error')
        this.dbService.updateOwnChannelTaskEndTime(taskId)
      } else {
        this.dbService.resetStuckCommentaryTaskItems(taskId)
        this.dbService.updateCommentaryTaskStatus(taskId, 'error')
        this.dbService.updateCommentaryTaskFinishTime(taskId)
      }
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
      this.rateLimitedBrowsers.clear() // 清空速率限制记录，不影响下次使用
      this.browserCooldownUntil.clear()
      this.quotaRequeueCount.clear()
    }
  }

  /**
   * 单个工作线程的执行逻辑
   */
  async runWorker(workerId, browserProfileId, taskId, total, getCompleted, addCompleted, progressCallback, taskType = 'benchmark') {
    console.log(`[AIStudio] Worker ${workerId} started with profile ${browserProfileId} (taskType: ${taskType})`)

    this.activeWorkers.set(workerId, {
      browserProfileId,
      isProcessing: true,
      currentItem: null
    })

    try {
      while (!this.shouldStop) {
        // 冷却门：本账号若因视频额度处于冷却中，则等待（任务留在队列里给其它账号做）
        const cdUntil = this.browserCooldownUntil.get(browserProfileId) || 0
        if (Date.now() < cdUntil) {
          if (this.taskQueue.length === 0) {
            console.log(`[AIStudio] Worker ${workerId} 冷却中且队列已空，结束`)
            break
          }
          const remainSec = Math.ceil((cdUntil - Date.now()) / 1000)
          progressCallback({
            type: 'worker', taskId, workerId, browserProfileId,
            status: 'cooldown',
            message: `[${workerId}] 视频额度冷却中，剩余约 ${remainSec}s（任务交其它账号）`
          })
          await new Promise(resolve => setTimeout(resolve, Math.min((cdUntil - Date.now()), 10000)))
          continue
        }

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
          if (taskType === 'own_channel') {
            this.dbService.updateOwnChannelTaskItemStatus(item.id, 'processing')
          } else {
            this.dbService.updateCommentaryTaskItemStatus(item.id, 'processing')
          }

          // 执行处理（带瞬时错误自动重试：模拟人工遇到 "Please try again" 时重试）
          console.log(`[AIStudio] Worker ${workerId} processing item ${item.id}, videoId: ${video.id}`)
          const tableName = taskType === 'own_channel' ? 'own_videos' : null
          const MAX_ATTEMPTS = 3
          let result = null
          for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
            try {
              result = await this.processVideoForWorker(video, browserProfileId, workerId, (progress) => {
                progressCallback({
                  type: 'single',
                  taskId: taskId,
                  workerId: workerId,
                  ...progress,
                  current: getCompleted() + 1,
                  total: total
                })
              }, {}, { tableName })
              break // 成功，跳出重试循环
            } catch (err) {
              // 视频额度错误：不在本账号原地重试（重试也是 permission denied），直接交给外层冷却+换号
              if (this.isVideoQuotaError(err)) {
                throw err
              }
              if (this.isRetryableError(err) && attempt < MAX_ATTEMPTS && !this.shouldStop) {
                console.log(`[AIStudio] Worker ${workerId} 第 ${attempt}/${MAX_ATTEMPTS} 次失败可重试: ${err.message}`)
                progressCallback({
                  type: 'single',
                  taskId: taskId,
                  workerId: workerId,
                  videoId: video.id,
                  status: 'processing',
                  current: getCompleted() + 1,
                  total: total,
                  message: `[${workerId}] AI 临时报错，重试 ${attempt}/${MAX_ATTEMPTS - 1}: ${video.title}`
                })
                await new Promise(resolve => setTimeout(resolve, 5000))
                continue
              }
              throw err // 不可重试或已到最大次数
            }
          }

          // 更新成功状态
          const responseToSave = result.response || result
          if (taskType === 'own_channel') {
            this.dbService.updateOwnChannelTaskItemStatus(item.id, 'completed', responseToSave)
          } else {
            this.dbService.updateCommentaryTaskItemStatus(item.id, 'completed', responseToSave)
          }
          addCompleted(1)

          // 记录成功次数
          try {
            const account = this.dbService.getAIStudioAccountByBrowserId(browserProfileId)
            if (account) {
              this.dbService.recordAIStudioSuccess(account.id)
            }
          } catch (e) {
            console.error(`[AIStudio] Worker ${workerId} failed to record success:`, e)
          }

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

          // 检测是否是速率限制错误
          const isRateLimitError = error.message && error.message.includes('速率限制')

          if (isRateLimitError) {
            // 速率限制：将当前项放回队列头部，供其他 worker 处理
            console.log(`[AIStudio] Worker ${workerId} hit rate limit, putting item back to queue and stopping`)
            if (taskType === 'own_channel') {
              this.dbService.updateOwnChannelTaskItemStatus(item.id, 'pending', null, null)
            } else {
              this.dbService.updateCommentaryTaskItemStatus(item.id, 'pending', null, null) // 重置为待处理
            }
            this.taskQueue.unshift(item) // 放回队列头部

            // 标记此浏览器已达限制
            this.rateLimitedBrowsers.add(browserProfileId)

            progressCallback({
              type: 'worker',
              taskId: taskId,
              workerId: workerId,
              browserProfileId: browserProfileId,
              status: 'rate_limited',
              message: `[${workerId}] 已达今日使用上限，停止使用此浏览器`
            })

            // 检查是否所有浏览器都已达限制
            if (this.rateLimitedBrowsers.size >= this.activeWorkers.size) {
              console.log(`[AIStudio] All browsers hit rate limit, stopping task`)
              this.shouldStop = true
              progressCallback({
                type: 'task',
                taskId: taskId,
                status: 'rate_limited',
                message: '所有浏览器账号已达今日使用上限，任务暂停'
              })
            }

            // 结束此 worker
            break
          }

          // 视频额度被限（permission denied / internal error）：冷却本账号 + 放回队列交其它账号
          if (this.isVideoQuotaError(error)) {
            const cnt = (this.quotaRequeueCount.get(item.id) || 0) + 1
            this.quotaRequeueCount.set(item.id, cnt)
            if (cnt > this.maxQuotaRequeue) {
              // 多次换号/冷却仍失败，判定为真失败
              console.log(`[AIStudio] Worker ${workerId} item ${item.id} 视频额度重试 ${cnt} 次仍失败，判失败`)
              if (taskType === 'own_channel') {
                this.dbService.updateOwnChannelTaskItemStatus(item.id, 'failed', null, error.message)
              } else {
                this.dbService.updateCommentaryTaskItemStatus(item.id, 'failed', null, error.message)
              }
              addCompleted(1)
              progressCallback({
                type: 'single', taskId, workerId, videoId: video.id, status: 'error',
                current: getCompleted(), total, error: error.message,
                message: `[${workerId}] 多次换号仍失败: ${video.title}`
              })
            } else {
              // 放回队列尾部 + 冷却本账号，让其它未超额的账号去做
              if (taskType === 'own_channel') {
                this.dbService.updateOwnChannelTaskItemStatus(item.id, 'pending', null, null)
              } else {
                this.dbService.updateCommentaryTaskItemStatus(item.id, 'pending', null, null)
              }
              this.taskQueue.push(item)
              this.browserCooldownUntil.set(browserProfileId, Date.now() + this.videoQuotaCooldownMs)
              console.log(`[AIStudio] Worker ${workerId} 命中视频额度，冷却 ${this.videoQuotaCooldownMs / 1000}s，item ${item.id} 放回队列(第${cnt}次)`)
              progressCallback({
                type: 'worker', taskId, workerId, browserProfileId, status: 'cooldown',
                message: `[${workerId}] 视频额度用尽，冷却 ${Math.round(this.videoQuotaCooldownMs / 1000)}s，任务交其它账号处理`
              })
            }
            // 让出循环：由顶部冷却门负责等待
            continue
          }

          // 其他错误：正常处理
          const status = error.isVideoDeleted ? 'video_deleted' : (error.isVideoError ? 'video_error' : 'failed')
          const statusText = error.isVideoDeleted ? '视频已删除' : (error.isVideoError ? '视频异常' : '失败')
          if (taskType === 'own_channel') {
            this.dbService.updateOwnChannelTaskItemStatus(item.id, status, null, error.message)
          } else {
            this.dbService.updateCommentaryTaskItemStatus(item.id, status, null, error.message)
          }
          addCompleted(1)

          progressCallback({
            type: 'single',
            taskId: taskId,
            workerId: workerId,
            videoId: video.id,
            status: error.isVideoDeleted ? 'video_deleted' : (error.isVideoError ? 'video_error' : 'error'),
            current: getCompleted(),
            total: total,
            error: error.message,
            message: `[${workerId}] ${statusText}: ${video.title} - ${error.message}`
          })

          // 失败后短暂等待再继续（视频已删除/视频异常则不需要等太久）
          await new Promise(resolve => setTimeout(resolve, (error.isVideoDeleted || error.isVideoError) ? 1000 : 3000))
        }
      }
    } finally {
      console.log(`[AIStudio] Worker ${workerId} finished`)
      this.activeWorkers.delete(workerId)
    }
  }

  /**
   * 为工作线程处理单个视频 (独立的浏览器实例)
   * @param {Object} video - 视频记录
   * @param {string} browserProfileId - 浏览器配置文件 ID
   * @param {string} workerId - 工作线程 ID
   * @param {Function} progressCallback - 进度回调
   * @param {Object} extraOptions - 额外选项（兼容旧调用）
   * @param {Object} options - 配置选项，包含 tableName 等
   */
  async processVideoForWorker(video, browserProfileId, workerId, progressCallback = () => { }, extraOptions = {}, options = {}) {
    let browserId = null
    let playwrightBrowserId = null
    let browserService = null
    let browserType = 'bitbrowser'
    let page = null  // 在外部声明，以便 catch 块中可以访问

    try {
      // Step 1: 更新状态为 generating
      progressCallback({ step: 1, progress: 5, message: '更新任务状态...' })
      await supabaseService.updateStatus(video.id, 'generating', null, { tableName: options.tableName })

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
      page = existingPages.length > 0 ? existingPages[0] : await context.newPage()

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

      const videoUrl = video.video_url || video.url || (video.video_id ? `https://www.youtube.com/watch?v=${video.video_id}` : null)

      if (!videoUrl) {
        throw new Error('视频链接为空')
      }

      // 在粘贴之前检测视频是否已被删除
      const videoExists = await this.checkVideoExists(videoUrl)
      if (!videoExists) {
        // 视频已被删除，返回特殊状态
        const error = new Error('视频已被删除')
        error.isVideoDeleted = true
        throw error
      }

      // 使用剪贴板锁保护粘贴操作，避免多浏览器并行时冲突
      await clipboardLock.writeAndPaste(page, videoUrl, `worker-paste-video-url`)

      // 验证视频附件（Google 更新后的新选择器）
      // 新结构：ms-prompt-media > ms-prompt-video
      try {
        await page.waitForSelector('ms-prompt-media, ms-prompt-video, ms-youtube-chunk', {
          state: 'visible',
          timeout: 20000
        })
        console.log('[Worker] Video attachment detected.')
      } catch (e) {
        throw new Error('粘贴视频链接失败：未检测到视频附件')
      }

      // 等待视频真正处理完成（轮询 token 数直到稳定，避免在视频就绪前就发送）
      await this.waitForVideoProcessed(page, '[Worker]')
      await page.waitForTimeout(1000)

      // Step 7.2: 输入提示词（用 CDP Input.insertText，不走剪贴板/按键，规避自动化识别）
      progressCallback({ step: 7, progress: 60, message: '正在输入提示词...' })
      await inputElement.click()
      await page.waitForTimeout(300)
      await page.keyboard.press('Shift+Enter')
      await page.keyboard.press('Shift+Enter')
      await this.insertPromptViaCDP(page, inputElement, this.defaultPrompt, `[${workerId}]`)
      await page.waitForTimeout(500)

      // 发送：真实鼠标点击 ms-run-button（不用 Ctrl+Enter——实测会被判定为自动化而 permission denied）
      const stopButtonSelectors = [
        'ms-run-button button:has-text("Stop")',
        'ms-run-button button[aria-label="Stop"]',
        'button[aria-label="Stop"]',
        'button:has-text("Stop")'
      ]
      const maxRetries = 3
      let sendSuccess = false

      for (let retry = 0; retry < maxRetries && !sendSuccess; retry++) {
        if (retry > 0) {
          console.log(`[${workerId}] 发送重试 ${retry}/${maxRetries}...`)
          await page.waitForTimeout(1000)
        }

        const clicked = await this.clickRunButtonHuman(page, `[${workerId}]`)
        if (!clicked) {
          console.log(`[${workerId}] ⚠ 未能定位发送按钮`)
        }

        // 验证发送是否成功：检查 Stop 按钮是否出现
        console.log(`[${workerId}] 等待验证发送结果...`)
        await page.waitForTimeout(2000)
        for (const stopSelector of stopButtonSelectors) {
          try {
            const stopButton = await page.locator(stopSelector).first()
            if (await stopButton.isVisible({ timeout: 1500 })) {
              console.log(`[${workerId}] ✓ 发送成功确认：Stop 按钮已出现`)
              sendSuccess = true
              break
            }
          } catch (e) {
            continue
          }
        }
        if (!sendSuccess) {
          console.log(`[${workerId}] ⚠ Stop 按钮未出现，可能发送失败`)
          // 重试前确保焦点在输入框
          if (retry < maxRetries - 1) {
            try { await inputElement.click(); await page.waitForTimeout(500) } catch (e) { /* 忽略 */ }
          }
        }
      }

      if (!sendSuccess) {
        console.log(`[${workerId}] ⚠ 发送按钮点击可能未成功，但继续等待响应...`)
      }

      // 记录发送次数（无论成功与否，只要执行到这里就算发送了）
      try {
        const account = this.dbService.getAIStudioAccountByBrowserId(browserProfileId)
        if (account) {
          this.dbService.recordAIStudioUsage(account.id)
          console.log(`[${workerId}] 已记录发送次数`)
        }
      } catch (e) {
        console.error(`[${workerId}] 记录发送次数失败:`, e)
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

        // 检查是否出现错误信息（内部错误 / 速率限制 / 顶部 toast 提示）
        try {
          // 1) 模型回复区域内的错误
          const errorElement = await page.locator('.model-error, [class*="model-error"]').first()
          if (await errorElement.isVisible({ timeout: 200 })) {
            const errorText = await errorElement.textContent()
            if (errorText) {
              // 检测内部错误
              if (errorText.includes('An internal error has occurred')) {
                console.log(`[${workerId}] ❌ 检测到 AI Studio 内部错误: ${errorText}`)
                throw new Error('AI Studio 内部错误: An internal error has occurred.')
              }
              // 检测速率限制错误
              if (errorText.includes("You've reached your rate limit") || errorText.includes('rate limit')) {
                console.log(`[${workerId}] ❌ 检测到 AI Studio 速率限制: ${errorText}`)
                throw new Error('AI Studio 速率限制: 已达到今日使用上限，请明天再试。')
              }
            }
          }
          // 2) 右上角 toast/snackbar 提示（如 "Failed to generate content: permission denied"）
          //    这种 toast 几秒后会自动消失，必须快速捕获，否则会白等满 3 分钟超时
          const snack = await page.locator('mat-snack-bar-container, .mat-mdc-snack-bar-container, [class*="snack-bar"]').first()
          if (await snack.isVisible({ timeout: 200 })) {
            const snackText = (await snack.textContent()) || ''
            if (/permission denied|Failed to generate|internal error/i.test(snackText)) {
              console.log(`[${workerId}] ❌ 检测到 AI Studio 提示: ${snackText.trim()}`)
              throw new Error('AI Studio 生成失败: ' + snackText.trim())
            }
          }
        } catch (e) {
          // 如果是我们主动抛出的错误，继续抛出（交给上层重试逻辑）
          if (e.message && (e.message.includes('AI Studio 内部错误') || e.message.includes('AI Studio 速率限制') || e.message.includes('AI Studio 生成失败') || e.isVideoError)) {
            throw e
          }
          // 其他错误（如元素未找到）忽略
        }

        // 检查 Stop 按钮状态（使用多个选择器）
        let stopVisible = false
        for (const stopSelector of stopButtonSelectors) {
          try {
            const stopButton = await page.locator(stopSelector).first()
            stopVisible = await stopButton.isVisible({ timeout: 200 })
            if (stopVisible) break
          } catch (e) {
            // 继续尝试下一个选择器
            continue
          }
        }

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
      await supabaseService.updateAIResponse(video.id, parsedResponse, 'completed', options.tableName)

      progressCallback({ step: 10, progress: 100, message: '处理完成！' })

      return {
        success: true,
        videoId: video.id,
        response: cleanResponse
      }

    } catch (error) {
      console.error(`[${workerId}] Process video failed:`, error)

      // 检测特定错误时，打开视频链接检查是否是视频异常
      const needsVideoCheck = error.message &&
        (error.message.includes('AI Studio 内部错误') || error.message.includes('无法获取 AI 回复内容'))

      if (needsVideoCheck && page) {
        try {
          console.log(`[${workerId}] 检测到可能的视频问题，正在打开视频链接检测...`)
          const videoUrl = video.url || video.video_url || `https://www.youtube.com/watch?v=${video.video_id}`
          const ytError = await this.checkYouTubeVideoError(page, videoUrl)

          if (ytError.hasError) {
            // 更新错误信息为视频异常
            error.isVideoError = true
            error.message = `视频异常: ${ytError.reason}${ytError.subreason ? ' - ' + ytError.subreason : ''}`
            console.log(`[${workerId}] ✓ 确认为视频异常: ${error.message}`)
          }
        } catch (e) {
          console.error(`[${workerId}] 视频错误检测失败:`, e.message)
        }
      }

      try {
        // 区分视频已删除、视频异常和普通失败状态
        const status = error.isVideoDeleted ? 'video_deleted' : (error.isVideoError ? 'video_error' : 'failed')
        await supabaseService.updateStatus(video.id, status, error.message, { tableName: options.tableName })
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
   * @param {Object} options - 配置选项，包含 tableName 等
   */
  async processVideo(video, browserProfileId, progressCallback = () => { }, options = {}) {
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
    let page = null  // 在外部声明，以便 catch 块中可以访问

    try {
      // Step 1: 更新状态为 generating
      progressCallback({ step: 1, progress: 5, message: '更新任务状态...' })
      await supabaseService.updateStatus(video.id, 'generating', null, { tableName: options.tableName })

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

      if (existingPages.length > 0) {
        page = existingPages[0]
        console.log('[AIStudio] Using existing page')
      } else {
        console.log('[AIStudio] No existing pages, creating new one...')
        page = await context.newPage()
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
      // 优先使用 video_url，其次 url，最后根据 video_id 构建
      const videoUrl = video.video_url || video.url || (video.video_id ? `https://www.youtube.com/watch?v=${video.video_id}` : null)
      console.log('[AIStudio] Video object:', JSON.stringify(video))
      console.log('[AIStudio] Pasting URL:', videoUrl)

      if (!videoUrl) {
        throw new Error('视频链接为空，且无法通过 video_id 构建')
      }

      // 使用剪贴板锁保护粘贴操作，避免多浏览器并行时冲突
      console.log('[AIStudio] Pasting link...')
      await clipboardLock.writeAndPaste(page, videoUrl, 'paste-video-url')

      // 验证视频附件（Google 更新后的新选择器）
      // 新结构：ms-prompt-media > ms-prompt-video
      console.log('[AIStudio] Waiting for video attachment...')
      try {
        await page.waitForSelector('ms-prompt-media, ms-prompt-video, ms-youtube-chunk', {
          state: 'visible',
          timeout: 20000
        })
        console.log('[AIStudio] Video attachment detected.')
      } catch (e) {
        throw new Error('粘贴视频链接失败：未检测到视频附件')
      }

      // 等待视频真正处理完成（轮询 token 数直到稳定，避免在视频就绪前就发送）
      console.log('Waiting for video link processing...')
      await this.waitForVideoProcessed(page, '[Single]')
      await page.waitForTimeout(1000)

      // Step 7.2: 输入提示词（用 CDP Input.insertText，不走剪贴板/按键，规避自动化识别）
      progressCallback({ step: 7, progress: 60, message: '正在输入提示词...' })
      console.log('Inserting prompt via CDP...')
      await inputElement.click()
      await page.waitForTimeout(300)
      // 换行
      await page.keyboard.press('Shift+Enter')
      await page.keyboard.press('Shift+Enter')
      await this.insertPromptViaCDP(page, inputElement, this.defaultPrompt, '[Single]')
      console.log('Input complete')
      await page.waitForTimeout(1000)

      // 发送：真实鼠标点击 ms-run-button（不用 Ctrl+Enter——实测会被判定为自动化而 permission denied）
      const stopButtonSelectorsSingle = [
        'ms-run-button button:has-text("Stop")',
        'ms-run-button button[aria-label="Stop"]',
        'button[aria-label="Stop"]',
        'button:has-text("Stop")'
      ]
      const maxRetriesSingle = 3
      let sendSuccessSingle = false

      for (let retry = 0; retry < maxRetriesSingle && !sendSuccessSingle; retry++) {
        if (retry > 0) {
          console.log(`[AIStudio] 发送重试 ${retry}/${maxRetriesSingle}...`)
          await page.waitForTimeout(1000)
        }

        const clicked = await this.clickRunButtonHuman(page, '[AIStudio]')
        if (!clicked) {
          console.log('[AIStudio] ⚠ 未能定位发送按钮')
        }

        // 验证发送是否成功：检查 Stop 按钮是否出现
        console.log('[AIStudio] 等待验证发送结果...')
        await page.waitForTimeout(2000)
        for (const stopSelector of stopButtonSelectorsSingle) {
          try {
            const stopButton = await page.locator(stopSelector).first()
            if (await stopButton.isVisible({ timeout: 1500 })) {
              console.log(`[AIStudio] ✓ 发送成功确认：Stop 按钮已出现`)
              sendSuccessSingle = true
              break
            }
          } catch (e) {
            continue
          }
        }
        if (!sendSuccessSingle) {
          console.log('[AIStudio] ⚠ Stop 按钮未出现，可能发送失败')
          if (retry < maxRetriesSingle - 1) {
            try { await inputElement.click(); await page.waitForTimeout(500) } catch (e) { /* 忽略 */ }
          }
        }
      }

      if (!sendSuccessSingle) {
        console.log('[AIStudio] ⚠ 发送按钮点击可能未成功，但继续等待响应...')
      }

      // 记录发送次数（无论成功与否，只要执行到这里就算发送了）
      try {
        const account = this.dbService.getAIStudioAccountByBrowserId(browserProfileId)
        if (account) {
          this.dbService.recordAIStudioUsage(account.id)
          console.log('[AIStudio] 已记录发送次数')
        }
      } catch (e) {
        console.error('[AIStudio] 记录发送次数失败:', e)
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

        // Stop 按钮选择器数组 - 与 stopButtonSelectorsSingle 保持一致
        const stopButtonSelectorsLoop = [
          'ms-run-button button:has-text("Stop")',
          'ms-run-button button[aria-label="Stop"]',
          'button.run-button:has-text("Stop")',
          'button[aria-label="Stop"]',
          'button:has-text("Stop")'
        ]

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

          // 检查是否出现错误信息（内部错误 / 速率限制 / 顶部 toast 提示）
          try {
            // 1) 模型回复区域内的错误
            const errorElement = await page.locator('.model-error, [class*="model-error"]').first()
            if (await errorElement.isVisible({ timeout: 200 })) {
              const errorText = await errorElement.textContent()
              if (errorText) {
                // 检测内部错误
                if (errorText.includes('An internal error has occurred')) {
                  console.log(`[AIStudio] ❌ 检测到 AI Studio 内部错误: ${errorText}`)
                  throw new Error('AI Studio 内部错误: An internal error has occurred.')
                }
                // 检测速率限制错误
                if (errorText.includes("You've reached your rate limit") || errorText.includes('rate limit')) {
                  console.log(`[AIStudio] ❌ 检测到 AI Studio 速率限制: ${errorText}`)
                  throw new Error('AI Studio 速率限制: 已达到今日使用上限，请明天再试。')
                }
              }
            }
            // 2) 右上角 toast/snackbar 提示（如 "Failed to generate content: permission denied"）
            const snack = await page.locator('mat-snack-bar-container, .mat-mdc-snack-bar-container, [class*="snack-bar"]').first()
            if (await snack.isVisible({ timeout: 200 })) {
              const snackText = (await snack.textContent()) || ''
              if (/permission denied|Failed to generate|internal error/i.test(snackText)) {
                console.log(`[AIStudio] ❌ 检测到 AI Studio 提示: ${snackText.trim()}`)
                throw new Error('AI Studio 生成失败: ' + snackText.trim())
              }
            }
          } catch (e) {
            // 如果是我们主动抛出的错误，继续抛出（交给上层重试逻辑）
            if (e.message && (e.message.includes('AI Studio 内部错误') || e.message.includes('AI Studio 速率限制') || e.message.includes('AI Studio 生成失败'))) {
              throw e
            }
            // 其他错误（如元素未找到）忽略
          }

          // 检查 Stop 按钮状态（使用多个选择器）
          let stopVisible = false
          for (const stopSelector of stopButtonSelectorsLoop) {
            try {
              const stopButton = await page.locator(stopSelector).first()
              stopVisible = await stopButton.isVisible({ timeout: 200 })
              if (stopVisible) break
            } catch (e) {
              continue
            }
          }

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

      await supabaseService.updateAIResponse(video.id, parsedResponse, 'completed', options.tableName)

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

      // 检测特定错误时，打开视频链接检查是否是视频异常
      const needsVideoCheck = error.message &&
        (error.message.includes('AI Studio 内部错误') || error.message.includes('无法获取 AI 回复内容'))

      if (needsVideoCheck && page) {
        try {
          console.log('[AIStudio] 检测到可能的视频问题，正在打开视频链接检测...')
          const videoUrl = video.url || video.video_url || `https://www.youtube.com/watch?v=${video.video_id}`
          const ytError = await this.checkYouTubeVideoError(page, videoUrl)

          if (ytError.hasError) {
            // 更新错误信息为视频异常
            error.isVideoError = true
            error.message = `视频异常: ${ytError.reason}${ytError.subreason ? ' - ' + ytError.subreason : ''}`
            console.log('[AIStudio] ✓ 确认为视频异常:', error.message)
          }
        } catch (e) {
          console.error('[AIStudio] 视频错误检测失败:', e.message)
        }
      }

      // 更新状态为失败（区分视频已删除、视频异常和普通失败）
      try {
        const status = error.isVideoDeleted ? 'video_deleted' : (error.isVideoError ? 'video_error' : 'failed')
        await supabaseService.updateStatus(video.id, status, error.message, { tableName: options.tableName })
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

  /**
   * 强制重置状态（用于状态卡住的情况）
   */
  forceReset() {
    console.log('[AIStudio] Force resetting state...')
    this.isProcessing = false
    this.currentTask = null
    this.shouldStop = false
    this.taskQueue = []
    this.activeWorkers.clear()
    console.log('[AIStudio] State reset complete')
    return true
  }
}

// 导出单例
module.exports = new AIStudioService()
