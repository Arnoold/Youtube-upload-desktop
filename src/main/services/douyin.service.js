const { chromium } = require('playwright-core')
const axios = require('axios')

class DouyinService {
  constructor() {
    this.browser = null
    this.context = null
    this.page = null
    this.isRunning = false
    this.collectedVideos = []
    this.currentAccountId = null
    this.currentBrowserId = null
    // 比特浏览器 API 地址
    this.apiUrl = 'http://127.0.0.1:54345'
    this.client = axios.create({ proxy: false })
  }

  /**
   * 启动比特浏览器
   * @param {string} browserId - 比特浏览器ID
   * @returns {Promise<Object>} 启动结果
   */
  async launchBrowser(browserId) {
    console.log('[Douyin] launchBrowser called with browserId:', browserId)

    if (this.browser && this.currentBrowserId === browserId) {
      console.log('[Douyin] Already connected to this browser')
      return { success: true, message: '已连接到浏览器' }
    }

    // 如果已连接到其他浏览器，先断开
    if (this.browser) {
      await this.closeBrowser()
    }

    try {
      // 调用比特浏览器 API 启动浏览器
      console.log('[Douyin] Starting BitBrowser with ID:', browserId)

      const response = await this.client.post(`${this.apiUrl}/browser/open`, {
        id: browserId
      }, { timeout: 30000 })

      console.log('[Douyin] BitBrowser API response:', JSON.stringify(response.data))

      if (!response.data.success) {
        return {
          success: false,
          error: response.data.msg || '启动浏览器失败'
        }
      }

      const { ws, http } = response.data.data
      console.log('[Douyin] WebSocket URL:', ws)
      console.log('[Douyin] HTTP endpoint:', http)

      // 使用 Playwright 连接到浏览器
      // connectOverCDP 需要完整的 HTTP URL
      const cdpEndpoint = http ? `http://${http}` : ws
      console.log('[Douyin] Connecting to CDP endpoint:', cdpEndpoint)
      this.browser = await chromium.connectOverCDP(cdpEndpoint)
      console.log('[Douyin] Connected to browser via CDP')

      // 获取上下文和页面
      const contexts = this.browser.contexts()
      this.context = contexts.length > 0 ? contexts[0] : await this.browser.newContext()

      const pages = this.context.pages()
      this.page = pages.length > 0 ? pages[0] : await this.context.newPage()

      this.currentBrowserId = browserId

      console.log('[Douyin] Browser launched successfully')

      // 自动导航到抖音首页推荐页面
      const currentUrl = this.page.url()
      console.log('[Douyin] Current page URL:', currentUrl)

      // 如果不在抖音首页推荐流，则导航过去
      if (!currentUrl.includes('douyin.com') || currentUrl.includes('/video/') || currentUrl.includes('/user/')) {
        console.log('[Douyin] Navigating to Douyin homepage...')
        try {
          await this.page.goto('https://www.douyin.com/', {
            waitUntil: 'domcontentloaded',
            timeout: 15000
          })
          await this.page.waitForTimeout(2000)
          console.log('[Douyin] Navigated to Douyin homepage')
        } catch (e) {
          console.log('[Douyin] Navigation warning:', e.message)
        }
      }

      return {
        success: true,
        message: '浏览器启动成功，已导航到抖音首页'
      }

    } catch (error) {
      console.error('[Douyin] Failed to launch browser:', error)

      // 清理状态
      this.browser = null
      this.context = null
      this.page = null
      this.currentBrowserId = null

      if (error.code === 'ECONNREFUSED') {
        return {
          success: false,
          error: '无法连接到比特浏览器，请确保比特浏览器已启动'
        }
      }

      return { success: false, error: `启动失败: ${error.message}` }
    }
  }

  /**
   * 打开抖音推荐页面
   * @returns {Promise<Object>} 操作结果
   */
  async openDouyin() {
    if (!this.page) {
      return { success: false, error: '浏览器未启动' }
    }

    try {
      console.log('[Douyin] Navigating to Douyin...')

      await this.page.goto('https://www.douyin.com/', {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      })

      // 等待页面加载
      await this.page.waitForTimeout(3000)

      const currentUrl = this.page.url()
      console.log('[Douyin] Current URL:', currentUrl)

      return {
        success: true,
        message: '抖音页面已打开',
        url: currentUrl
      }
    } catch (error) {
      console.error('[Douyin] Failed to open Douyin:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * 获取当前视频信息
   * @returns {Promise<Object>} 视频信息
   */
  async getCurrentVideoInfo() {
    if (!this.page) {
      return { success: false, error: '浏览器未启动' }
    }

    try {
      // 等待视频容器加载
      await this.page.waitForSelector('[data-e2e="feed-active-video"]', { timeout: 5000 }).catch(() => null)

      const videoInfo = await this.page.evaluate(() => {
        let videoId = null
        let videoUrl = null
        let authorName = null
        let authorId = null
        let description = null
        let likes = null
        let comments = null
        let shares = null

        // 方法1: 从URL获取视频ID
        const urlMatch = window.location.href.match(/\/video\/(\d+)/)
        if (urlMatch) {
          videoId = urlMatch[1]
          videoUrl = `https://www.douyin.com/video/${videoId}`
        }

        // 方法2: 从当前播放的视频元素获取
        const activeVideo = document.querySelector('[data-e2e="feed-active-video"]')
        if (activeVideo) {
          // 获取视频链接
          const linkElement = activeVideo.querySelector('a[href*="/video/"]')
          if (linkElement) {
            const href = linkElement.getAttribute('href')
            const match = href.match(/\/video\/(\d+)/)
            if (match) {
              videoId = match[1]
              videoUrl = `https://www.douyin.com/video/${videoId}`
            }
          }

          // 获取作者信息
          const authorElement = activeVideo.querySelector('[data-e2e="video-author-title"]') ||
                               activeVideo.querySelector('.author-card-user-name') ||
                               activeVideo.querySelector('[class*="author"]')
          if (authorElement) {
            authorName = authorElement.innerText?.trim()
          }

          // 获取作者ID
          const authorLink = activeVideo.querySelector('a[href*="/@"]')
          if (authorLink) {
            const href = authorLink.getAttribute('href')
            const match = href.match(/\/@([^/?]+)/)
            if (match) {
              authorId = match[1]
            }
          }

          // 获取描述
          const descElement = activeVideo.querySelector('[data-e2e="video-desc"]') ||
                             activeVideo.querySelector('[class*="video-desc"]') ||
                             activeVideo.querySelector('[class*="caption"]')
          if (descElement) {
            description = descElement.innerText?.trim()
          }

          // 获取互动数据
          const likeElement = activeVideo.querySelector('[data-e2e="like-count"]') ||
                             activeVideo.querySelector('[class*="like-count"]')
          if (likeElement) {
            likes = likeElement.innerText?.trim()
          }

          const commentElement = activeVideo.querySelector('[data-e2e="comment-count"]') ||
                                activeVideo.querySelector('[class*="comment-count"]')
          if (commentElement) {
            comments = commentElement.innerText?.trim()
          }

          const shareElement = activeVideo.querySelector('[data-e2e="share-count"]') ||
                              activeVideo.querySelector('[class*="share-count"]')
          if (shareElement) {
            shares = shareElement.innerText?.trim()
          }
        }

        return {
          videoId,
          videoUrl,
          authorName,
          authorId,
          description,
          likes,
          comments,
          shares,
          timestamp: new Date().toISOString()
        }
      })

      if (videoInfo.videoId) {
        console.log('[Douyin] Got video info:', videoInfo.videoId)
        return { success: true, video: videoInfo }
      } else {
        console.log('[Douyin] Could not extract video info')
        return { success: false, error: '无法获取视频信息', partial: videoInfo }
      }

    } catch (error) {
      console.error('[Douyin] Failed to get video info:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * 滑动到下一个视频
   * @returns {Promise<Object>} 操作结果
   */
  async scrollToNext() {
    if (!this.page) {
      return { success: false, error: '浏览器未启动' }
    }

    try {
      await this.page.keyboard.press('ArrowDown')
      await this.page.waitForTimeout(1500)
      console.log('[Douyin] Scrolled to next video')
      return { success: true }
    } catch (error) {
      console.error('[Douyin] Failed to scroll:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * 滑动到上一个视频
   * @returns {Promise<Object>} 操作结果
   */
  async scrollToPrevious() {
    if (!this.page) {
      return { success: false, error: '浏览器未启动' }
    }

    try {
      await this.page.keyboard.press('ArrowUp')
      await this.page.waitForTimeout(1500)
      console.log('[Douyin] Scrolled to previous video')
      return { success: true }
    } catch (error) {
      console.error('[Douyin] Failed to scroll:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * 自动采集多个视频
   * @param {number} count - 要采集的视频数量
   * @param {Function} progressCallback - 进度回调
   * @returns {Promise<Object>} 采集结果
   */
  async collectVideos(count, progressCallback) {
    if (!this.page) {
      return { success: false, error: '浏览器未启动' }
    }

    this.isRunning = true
    this.collectedVideos = []
    const seenIds = new Set()

    try {
      console.log(`[Douyin] Starting to collect ${count} videos...`)

      for (let i = 0; i < count && this.isRunning; i++) {
        const result = await this.getCurrentVideoInfo()

        if (result.success && result.video.videoId) {
          if (!seenIds.has(result.video.videoId)) {
            seenIds.add(result.video.videoId)
            this.collectedVideos.push(result.video)

            console.log(`[Douyin] Collected video ${this.collectedVideos.length}/${count}: ${result.video.videoId}`)

            if (progressCallback) {
              progressCallback({
                current: this.collectedVideos.length,
                total: count,
                video: result.video
              })
            }
          }
        }

        if (this.collectedVideos.length < count && this.isRunning) {
          await this.scrollToNext()
          await this.page.waitForTimeout(1000 + Math.random() * 1000)
        }
      }

      console.log(`[Douyin] Collection finished. Got ${this.collectedVideos.length} videos`)

      return {
        success: true,
        videos: this.collectedVideos,
        count: this.collectedVideos.length
      }

    } catch (error) {
      console.error('[Douyin] Collection failed:', error)
      return {
        success: false,
        error: error.message,
        videos: this.collectedVideos,
        count: this.collectedVideos.length
      }
    } finally {
      this.isRunning = false
    }
  }

  /**
   * 停止采集
   */
  stopCollection() {
    this.isRunning = false
    console.log('[Douyin] Collection stopped by user')
    return { success: true, message: '采集已停止' }
  }

  /**
   * 关闭浏览器连接
   * @returns {Promise<Object>} 操作结果
   */
  async closeBrowser() {
    try {
      // 调用比特浏览器 API 关闭浏览器
      if (this.currentBrowserId) {
        try {
          await this.client.post(`${this.apiUrl}/browser/close`, {
            id: this.currentBrowserId
          })
          console.log('[Douyin] BitBrowser closed via API')
        } catch (e) {
          console.log('[Douyin] Failed to close browser via API:', e.message)
        }
      }

      if (this.browser) {
        await this.browser.close().catch(() => {})
        console.log('[Douyin] Disconnected from browser')
      }

      this.browser = null
      this.context = null
      this.page = null
      this.currentBrowserId = null

      return { success: true, message: '浏览器已关闭' }
    } catch (error) {
      console.error('[Douyin] Failed to close browser:', error)
      this.browser = null
      this.context = null
      this.page = null
      this.currentBrowserId = null
      return { success: false, error: error.message }
    }
  }

  /**
   * 获取服务状态
   * @returns {Object} 状态信息
   */
  getStatus() {
    return {
      browserRunning: !!this.browser,
      isCollecting: this.isRunning,
      collectedCount: this.collectedVideos.length,
      currentBrowserId: this.currentBrowserId
    }
  }

  /**
   * 获取已采集的视频列表
   * @returns {Array} 视频列表
   */
  getCollectedVideos() {
    return this.collectedVideos
  }

  /**
   * 清空已采集的视频列表
   */
  clearCollectedVideos() {
    this.collectedVideos = []
    return { success: true, message: '已清空采集列表' }
  }

  /**
   * 从DOM获取当前视频的发布信息
   * @returns {Promise<Object>} 视频发布信息
   */
  async getVideoPublishInfo() {
    if (!this.page) {
      return { success: false, error: '浏览器未启动' }
    }

    try {
      const info = await this.page.evaluate(() => {
        // 获取当前活跃视频容器，确保所有选择器都在此范围内查找
        const activeVideo = document.querySelector('[data-e2e="feed-active-video"]')

        // 作者名称: [data-e2e="feed-video-nickname"]
        const authorElement = activeVideo?.querySelector('[data-e2e="feed-video-nickname"]') || document.querySelector('[data-e2e="feed-video-nickname"]')
        let authorName = ''
        if (authorElement) {
          authorName = authorElement.innerText?.trim() || ''
          // 移除开头的 @ 符号
          if (authorName.startsWith('@')) {
            authorName = authorName.substring(1)
          }
        }

        // 发布时间: .video-create-time .time
        const timeElement = activeVideo?.querySelector('.video-create-time .time') || document.querySelector('.video-create-time .time')
        let publishTime = ''
        if (timeElement) {
          publishTime = timeElement.innerText?.trim() || ''
          // 移除开头的 · 符号和空格
          publishTime = publishTime.replace(/^[·\s]+/, '').trim()
        }

        // 点赞数: 使用 data-e2e="video-player-digg" 选择器
        let likeCount = ''
        // 方法1: 使用 data-e2e 属性 (最可靠)，优先在活跃视频区域查找
        const diggElement = activeVideo?.querySelector('[data-e2e="video-player-digg"]') || document.querySelector('[data-e2e="video-player-digg"]')
        if (diggElement) {
          // 查找其中的数字文本
          const textNodes = diggElement.querySelectorAll('*')
          for (const node of textNodes) {
            const text = node.innerText?.trim()
            if (text && /^\d+(\.\d+)?[万亿kKwWmM]?$/.test(text) && node.children.length === 0) {
              likeCount = text
              break
            }
          }
          // 如果没找到子元素，直接取元素文本
          if (!likeCount) {
            likeCount = diggElement.innerText?.trim() || ''
          }
        }
        // 方法2: 备选 - 在活跃视频区域查找侧边栏第一个数字
        if (!likeCount && activeVideo) {
          const allElements = activeVideo.querySelectorAll('*')
          for (const el of allElements) {
            const text = el.innerText?.trim()
            if (text && /^\d+(\.\d+)?[万亿kKwWmM]?$/.test(text) && el.children.length === 0) {
              likeCount = text
              break
            }
          }
        }

        // 视频时长: .time-duration
        const durationElement = activeVideo?.querySelector('.time-duration') || document.querySelector('.time-duration')
        let duration = ''
        if (durationElement) {
          duration = durationElement.innerText?.trim() || ''
        }

        return {
          authorName,
          publishTime,
          likeCount,
          duration
        }
      })

      // 生成唯一标识用于后续校验
      const videoId = `${info.authorName}_${info.duration}_${info.likeCount}`
      console.log('[Douyin] Video publish info:', JSON.stringify(info))
      return { success: true, videoId, ...info }

    } catch (error) {
      console.error('[Douyin] Failed to get video publish info:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * 检查发布时间是否符合条件 (1天前 或 xx小时前)
   * @param {string} publishTime - 发布时间字符串
   * @returns {boolean} 是否符合条件
   */
  checkPublishTimeMatch(publishTime) {
    if (!publishTime) return false

    // 匹配 "1天前" 或 "xx小时前"
    const dayMatch = publishTime.match(/^(\d+)天前$/)
    const hourMatch = publishTime.match(/^(\d+)小时前$/)

    if (dayMatch) {
      const days = parseInt(dayMatch[1], 10)
      return days === 1 // 只匹配1天前
    }

    if (hourMatch) {
      return true // 任意小时前都符合
    }

    return false
  }

  /**
   * 验证当前视频是否与之前获取的信息一致
   * @param {string} expectedVideoId - 预期的视频唯一标识
   * @returns {Promise<Object>} 验证结果
   */
  async verifyVideoContext(expectedVideoId) {
    try {
      const currentInfo = await this.getVideoPublishInfo()
      if (!currentInfo.success) {
        return { valid: false, reason: '无法获取当前视频信息' }
      }

      if (currentInfo.videoId !== expectedVideoId) {
        console.log(`[Douyin] Video context mismatch! Expected: ${expectedVideoId}, Got: ${currentInfo.videoId}`)
        return {
          valid: false,
          reason: `视频已切换: 预期 ${expectedVideoId.split('_')[0]}, 实际 ${currentInfo.authorName}`,
          currentInfo
        }
      }

      return { valid: true, currentInfo }
    } catch (error) {
      return { valid: false, reason: error.message }
    }
  }

  /**
   * 解析点赞数字符串，返回实际数值
   * @param {string} likeCount - 点赞数字符串，如 "24.6万"、"108.9万"、"487"
   * @returns {number} 实际点赞数
   */
  parseLikeCount(likeCount) {
    if (!likeCount) return 0

    // 去除空格
    const str = likeCount.trim()

    // 匹配 "xx.x万" 或 "xx万" 格式
    const wanMatch = str.match(/^([\d.]+)万$/)
    if (wanMatch) {
      return parseFloat(wanMatch[1]) * 10000
    }

    // 纯数字格式
    const num = parseFloat(str.replace(/,/g, ''))
    return isNaN(num) ? 0 : num
  }

  /**
   * 检查点赞数是否符合条件 (>=10000)
   * @param {string} likeCount - 点赞数字符串
   * @returns {boolean} 是否符合条件
   */
  checkLikeCountMatch(likeCount) {
    const count = this.parseLikeCount(likeCount)
    return count >= 10000
  }

  /**
   * 收藏视频（使用键盘快捷键 C）
   * @returns {Promise<Object>} 操作结果
   */
  async clickFavoriteButton() {
    if (!this.page) {
      return { success: false, error: '浏览器未启动' }
    }

    try {
      // 直接按键盘 C 收藏/取消收藏
      console.log('[Douyin] Pressing C key to favorite...')
      await this.page.keyboard.press('c')
      await this.page.waitForTimeout(500)

      console.log('[Douyin] Favorite action completed via keyboard shortcut')
      return { success: true, method: 'keyboard-c' }

    } catch (error) {
      console.error('[Douyin] Failed to favorite:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * 复制分享链接（使用键盘快捷键 V）
   * @returns {Promise<Object>} 包含视频链接的结果
   */
  async clickShareAndCopyLink() {
    if (!this.page) {
      return { success: false, error: '浏览器未启动' }
    }

    try {
      // 直接按键盘 V 复制分享链接到剪贴板
      console.log('[Douyin] Pressing V key to copy share link...')
      await this.page.keyboard.press('v')

      // 等待剪贴板内容更新
      await this.page.waitForTimeout(1500)

      // 读取剪贴板内容
      console.log('[Douyin] Reading clipboard...')
      const clipboardContent = await this.page.evaluate(async () => {
        try {
          const text = await navigator.clipboard.readText()
          // 读取成功后清空剪贴板，防止下次读取到旧数据
          await navigator.clipboard.writeText('')
          return { success: true, text }
        } catch (e) {
          return { success: false, error: e.message }
        }
      })

      if (clipboardContent.success) {
        const rawText = clipboardContent.text
        console.log('[Douyin] Got video link from clipboard:', rawText)

        // 从剪贴板内容提取短链接 (https://v.douyin.com/xxx/)
        // 短链接可能包含字母、数字、连字符和下划线
        const shortLinkMatch = rawText.match(/https:\/\/v\.douyin\.com\/[a-zA-Z0-9\-_]+\/?/)
        const shortLink = shortLinkMatch ? shortLinkMatch[0] : ''

        let finalLink = ''
        if (shortLink) {
          console.log('[Douyin] Extracted short link:', shortLink)
          // 获取最终跳转链接
          try {
            finalLink = await this.getFinalVideoLink(shortLink)
            console.log('[Douyin] Got final link:', finalLink)
          } catch (e) {
            console.error('[Douyin] Failed to get final link:', e.message)
          }
        }

        return {
          success: true,
          videoLink: rawText,
          shortLink: shortLink,
          finalLink: finalLink
        }
      } else {
        console.log('[Douyin] Failed to read clipboard:', clipboardContent.error)
        return { success: false, error: '无法读取剪贴板: ' + clipboardContent.error }
      }

    } catch (error) {
      console.error('[Douyin] Failed to copy share link:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * 获取短链接的最终跳转地址（使用HTTP请求跟踪重定向，不打开浏览器标签页）
   * @param {string} shortLink - 短链接
   * @returns {Promise<string>} 最终链接
   */
  async getFinalVideoLink(shortLink) {
    if (!shortLink) return ''

    try {
      // 使用 HTTP HEAD 请求跟踪重定向
      const response = await this.client.head(shortLink, {
        maxRedirects: 10,
        timeout: 8000,
        validateStatus: () => true, // 接受所有状态码
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        }
      })

      // 获取最终URL（axios会自动跟踪重定向）
      let finalUrl = response.request?.res?.responseUrl || response.config?.url || ''

      console.log('[Douyin] HTTP redirect result:', finalUrl)

      // 检查是否是有效的视频链接
      if (finalUrl && finalUrl.includes('douyin.com/video/')) {
        // 清理URL，只保留视频ID部分
        const videoIdMatch = finalUrl.match(/douyin\.com\/video\/(\d+)/)
        if (videoIdMatch) {
          return `https://www.douyin.com/video/${videoIdMatch[1]}`
        }
        return finalUrl
      }

      return finalUrl || ''
    } catch (error) {
      console.error('[Douyin] Failed to get final video link:', error.message)
      return ''
    }
  }

  /**
   * 连续采集推荐视频 (符合时间条件的视频)
   * @param {Function} progressCallback - 进度回调
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 采集结果
   */
  async collectRecommendedVideos(progressCallback, options = {}) {
    if (!this.page) {
      return { success: false, error: '浏览器未启动' }
    }

    const { maxCount = 0 } = options // maxCount=0 表示无限制
    this.isRunning = true
    this.collectedVideos = []
    const seenVideos = new Set()
    let processedCount = 0
    let skippedCount = 0

    try {
      console.log('[Douyin] Starting recommended video collection...')

      // 检查当前页面，确保在抖音首页推荐流
      const currentUrl = this.page.url()
      console.log('[Douyin] Current URL before collection:', currentUrl)

      // 如果在视频详情页或其他页面，先导航回首页
      if (currentUrl.includes('/video/') || currentUrl.includes('/user/') || !currentUrl.includes('douyin.com')) {
        console.log('[Douyin] Not on homepage, navigating...')
        if (progressCallback) {
          progressCallback({
            type: 'processing',
            operation: '🔄 正在导航到抖音首页...',
            processed: 0,
            skipped: 0,
            current: 0
          })
        }
        try {
          await this.page.goto('https://www.douyin.com/', {
            waitUntil: 'domcontentloaded',
            timeout: 15000
          })
          await this.page.waitForTimeout(3000)
          console.log('[Douyin] Navigated to homepage')
        } catch (e) {
          console.log('[Douyin] Navigation error:', e.message)
          return { success: false, error: '无法导航到抖音首页: ' + e.message }
        }
      }

      // 等待视频容器加载
      try {
        await this.page.waitForSelector('[data-e2e="feed-active-video"]', { timeout: 10000 })
        console.log('[Douyin] Video feed loaded')
      } catch (e) {
        console.log('[Douyin] Video feed not found, trying to scroll first...')
        // 尝试按下箭头键激活视频流
        await this.page.keyboard.press('ArrowDown')
        await this.page.waitForTimeout(2000)
      }

      while (this.isRunning) {
        processedCount++

        // 获取当前视频信息
        const info = await this.getVideoPublishInfo()

        if (!info.success) {
          console.log('[Douyin] Failed to get video info, skipping...')
          skippedCount++
          await this.scrollToNext()
          await this.page.waitForTimeout(1500 + Math.random() * 1000)
          continue
        }

        console.log(`[Douyin] Processing video #${processedCount}: author=${info.authorName}, time=${info.publishTime}`)

        // 发送当前视频信息
        if (progressCallback) {
          progressCallback({
            type: 'processing',
            operation: `📹 正在检查视频: ${info.authorName} (${info.publishTime})`,
            processed: processedCount,
            skipped: skippedCount,
            current: this.collectedVideos.length
          })
        }

        // 检查发布时间和点赞数是否符合条件
        const timeMatch = this.checkPublishTimeMatch(info.publishTime)
        const likeMatch = this.checkLikeCountMatch(info.likeCount)

        if (timeMatch && likeMatch) {
          console.log('[Douyin] Video matches all criteria (time + likes), collecting...')

          // 保存初始视频标识用于后续校验
          const initialVideoId = info.videoId

          // 生成唯一标识避免重复
          const videoKey = `${info.authorName}_${info.publishTime}_${info.duration}`
          if (seenVideos.has(videoKey)) {
            console.log('[Douyin] Video already collected, skipping...')
            skippedCount++
          } else {
            seenVideos.add(videoKey)

            // 发送收藏操作状态
            if (progressCallback) {
              progressCallback({
                type: 'processing',
                operation: `⭐ 正在点击收藏按钮 (${info.authorName})...`,
                processed: processedCount,
                skipped: skippedCount,
                current: this.collectedVideos.length
              })
            }

            // 点击收藏
            const favoriteResult = await this.clickFavoriteButton()
            console.log('[Douyin] Favorite result:', favoriteResult.success ? 'success' : favoriteResult.error)
            await this.page.waitForTimeout(500)

            // ===== 校验1: 收藏后验证视频是否切换 =====
            const verify1 = await this.verifyVideoContext(initialVideoId)
            if (!verify1.valid) {
              console.log(`[Douyin] ⚠️ Video context changed after favorite! ${verify1.reason}`)
              skippedCount++
              if (progressCallback) {
                progressCallback({
                  type: 'skipped',
                  current: this.collectedVideos.length,
                  processed: processedCount,
                  skipped: skippedCount,
                  reason: `数据校验失败: ${verify1.reason}`,
                  video: info
                })
              }
              // 跳过此视频，继续下一个
              await this.scrollToNext()
              await this.page.waitForTimeout(1500 + Math.random() * 1500)
              continue
            }

            // 发送分享操作状态
            if (progressCallback) {
              progressCallback({
                type: 'processing',
                operation: `🔗 正在点击分享并复制链接 (${info.authorName})...`,
                processed: processedCount,
                skipped: skippedCount,
                current: this.collectedVideos.length
              })
            }

            // 点击分享并复制链接
            const shareResult = await this.clickShareAndCopyLink()

            let videoLink = ''
            let shortLink = ''
            let finalLink = ''
            if (shareResult.success) {
              videoLink = shareResult.videoLink
              shortLink = shareResult.shortLink || ''
              finalLink = shareResult.finalLink || ''
            } else {
              console.log('[Douyin] Failed to get video link:', shareResult.error)
            }

            // ===== 校验2: 获取链接后再次验证视频是否切换 =====
            const verify2 = await this.verifyVideoContext(initialVideoId)
            if (!verify2.valid) {
              console.log(`[Douyin] ⚠️ Video context changed after share! ${verify2.reason}`)
              skippedCount++
              if (progressCallback) {
                progressCallback({
                  type: 'skipped',
                  current: this.collectedVideos.length,
                  processed: processedCount,
                  skipped: skippedCount,
                  reason: `数据校验失败: ${verify2.reason}`,
                  video: info
                })
              }
              // 跳过此视频，继续下一个
              await this.scrollToNext()
              await this.page.waitForTimeout(1500 + Math.random() * 1500)
              continue
            }

            // ===== 校验3: 验证链接是否有效 =====
            if (!shortLink || !finalLink) {
              console.log(`[Douyin] ⚠️ Invalid link data: shortLink=${shortLink}, finalLink=${finalLink}`)
              // 链接无效但不跳过，仍然记录视频信息
            }

            // 记录视频信息（使用校验后的最新信息确保一致性）
            const videoData = {
              authorName: verify2.currentInfo.authorName,
              publishTime: verify2.currentInfo.publishTime,
              likeCount: verify2.currentInfo.likeCount,
              duration: verify2.currentInfo.duration,
              videoLink: videoLink,
              shortLink: shortLink,
              finalLink: finalLink,
              collectedAt: new Date().toISOString(),
              favorited: favoriteResult.success
            }

            this.collectedVideos.push(videoData)
            console.log(`[Douyin] ✅ Collected video #${this.collectedVideos.length}:`, JSON.stringify(videoData))

            // 回调进度
            if (progressCallback) {
              progressCallback({
                type: 'collected',
                current: this.collectedVideos.length,
                processed: processedCount,
                skipped: skippedCount,
                video: videoData
              })
            }

            // 检查是否达到最大数量
            if (maxCount > 0 && this.collectedVideos.length >= maxCount) {
              console.log(`[Douyin] Reached max count ${maxCount}, stopping...`)
              break
            }
          }
        } else {
          // 构建跳过原因
          const reasons = []
          if (!timeMatch) reasons.push(`时间: ${info.publishTime}`)
          if (!likeMatch) reasons.push(`点赞: ${info.likeCount}`)
          const skipReason = reasons.join(', ')

          console.log(`[Douyin] Video does not match criteria (${skipReason}), skipping...`)
          skippedCount++

          // 回调进度 (跳过)
          if (progressCallback) {
            progressCallback({
              type: 'skipped',
              current: this.collectedVideos.length,
              processed: processedCount,
              skipped: skippedCount,
              reason: `不符合条件: ${skipReason}`,
              video: info
            })
          }
        }

        // 保存当前博主名称用于滑动后检测
        const previousAuthorName = info.authorName

        // 滑动前等待1.5秒，确保当前操作完成
        await this.page.waitForTimeout(1500)
        // 滑动到下一个视频
        await this.scrollToNext()
        // 随机等待，模拟人工操作
        await this.page.waitForTimeout(1500 + Math.random() * 1500)

        // ===== 检测滑动是否成功：博主名称是否变化 =====
        let scrollRetryCount = 0
        const maxScrollRetries = 10

        while (scrollRetryCount < maxScrollRetries && this.isRunning) {
          const newInfo = await this.getVideoPublishInfo()

          if (!newInfo.success) {
            console.log('[Douyin] Failed to get new video info after scroll')
            scrollRetryCount++
            continue
          }

          // 如果博主名称变化了，说明滑动成功
          if (newInfo.authorName !== previousAuthorName) {
            console.log(`[Douyin] Scroll successful: ${previousAuthorName} -> ${newInfo.authorName}`)
            break
          }

          // 博主名称相同，可能滑动失败
          scrollRetryCount++
          console.log(`[Douyin] ⚠️ Scroll may have failed (same author: ${previousAuthorName}), retry ${scrollRetryCount}/${maxScrollRetries}`)

          if (progressCallback) {
            progressCallback({
              type: 'processing',
              operation: `⚠️ 滑动可能失败，正在重试 (${scrollRetryCount}/${maxScrollRetries})...`,
              processed: processedCount,
              skipped: skippedCount,
              current: this.collectedVideos.length
            })
          }

          if (scrollRetryCount >= maxScrollRetries) {
            // 达到最大重试次数，报错并结束
            const errorMsg = `滑动失败：连续${maxScrollRetries}次检测到相同博主(${previousAuthorName})，页面可能卡住`
            console.error(`[Douyin] ❌ ${errorMsg}`)

            return {
              success: false,
              error: errorMsg,
              videos: this.collectedVideos,
              collected: this.collectedVideos.length,
              processed: processedCount,
              skipped: skippedCount
            }
          }

          // 刷新页面，重新进入抖音首页
          console.log('[Douyin] Refreshing page and navigating to homepage...')
          if (progressCallback) {
            progressCallback({
              type: 'processing',
              operation: `🔄 正在刷新页面重新进入抖音首页...`,
              processed: processedCount,
              skipped: skippedCount,
              current: this.collectedVideos.length
            })
          }

          try {
            await this.page.goto('https://www.douyin.com/', {
              waitUntil: 'domcontentloaded',
              timeout: 15000
            })
            await this.page.waitForTimeout(3000)

            // 等待视频容器加载
            try {
              await this.page.waitForSelector('[data-e2e="feed-active-video"]', { timeout: 10000 })
            } catch (e) {
              await this.page.keyboard.press('ArrowDown')
              await this.page.waitForTimeout(2000)
            }

            console.log('[Douyin] Page refreshed, continuing collection...')
          } catch (e) {
            console.error('[Douyin] Failed to refresh page:', e.message)
          }

          // 再次尝试滑动
          await this.scrollToNext()
          await this.page.waitForTimeout(1500 + Math.random() * 1500)
        }
      }

      console.log(`[Douyin] Collection finished. Collected: ${this.collectedVideos.length}, Processed: ${processedCount}, Skipped: ${skippedCount}`)

      return {
        success: true,
        videos: this.collectedVideos,
        collected: this.collectedVideos.length,
        processed: processedCount,
        skipped: skippedCount
      }

    } catch (error) {
      console.error('[Douyin] Collection failed:', error)
      return {
        success: false,
        error: error.message,
        videos: this.collectedVideos,
        collected: this.collectedVideos.length,
        processed: processedCount,
        skipped: skippedCount
      }
    } finally {
      this.isRunning = false
    }
  }

  /**
   * 获取页面的 RENDER_DATA 数据
   * @returns {Promise<Object>} 包含视频列表和作者信息的数据
   */
  async getPageData() {
    if (!this.page) {
      return { success: false, error: '浏览器未启动' }
    }

    try {
      console.log('[Douyin] Extracting page RENDER_DATA...')

      const pageData = await this.page.evaluate(() => {
        try {
          // 获取 RENDER_DATA
          const renderDataElement = document.getElementById('RENDER_DATA')
          if (!renderDataElement) {
            return { success: false, error: '未找到 RENDER_DATA 元素' }
          }

          const rawData = renderDataElement.textContent
          if (!rawData) {
            return { success: false, error: 'RENDER_DATA 内容为空' }
          }

          // 解码和解析数据
          const decodedData = decodeURIComponent(rawData)
          const data = JSON.parse(decodedData)

          // 查找包含 awemeList 的数据
          let awemeList = []
          let routeData = null

          // 遍历所有键查找数据
          for (const key in data) {
            const value = data[key]
            if (value && typeof value === 'object') {
              // 查找 recommend 下的 awemeList
              if (value.recommend && value.recommend.awemeList) {
                awemeList = value.recommend.awemeList
                routeData = value
                break
              }
              // 或者直接的 awemeList
              if (value.awemeList) {
                awemeList = value.awemeList
                routeData = value
                break
              }
            }
          }

          if (awemeList.length === 0) {
            return { success: false, error: '未找到视频列表数据' }
          }

          // 提取视频和作者信息
          const videos = awemeList.map(aweme => {
            const video = aweme.video || {}
            const author = aweme.authorInfo || aweme.author || {}
            const stats = aweme.statistics || aweme.stats || {}
            const music = aweme.music || {}

            return {
              // 视频基本信息
              awemeId: aweme.awemeId || aweme.aweme_id,
              desc: aweme.desc || '',
              createTime: aweme.createTime || aweme.create_time,

              // 视频信息
              video: {
                playAddr: video.playAddr || video.play_addr,
                cover: video.cover || video.dynamicCover,
                duration: video.duration,
                width: video.width,
                height: video.height,
                ratio: video.ratio
              },

              // 作者信息
              author: {
                uid: author.uid,
                secUid: author.secUid || author.sec_uid,
                nickname: author.nickname,
                avatarThumb: author.avatarThumb || author.avatar_thumb,
                signature: author.signature,
                followingCount: author.followingCount || author.following_count,
                followerCount: author.followerCount || author.follower_count
              },

              // 互动数据
              statistics: {
                diggCount: stats.diggCount || stats.digg_count || 0,
                commentCount: stats.commentCount || stats.comment_count || 0,
                collectCount: stats.collectCount || stats.collect_count || 0,
                shareCount: stats.shareCount || stats.share_count || 0,
                playCount: stats.playCount || stats.play_count || 0
              },

              // 音乐信息
              music: {
                id: music.id,
                title: music.title,
                author: music.author,
                playUrl: music.playUrl || music.play_url
              },

              // 话题标签
              textExtra: (aweme.textExtra || []).map(tag => ({
                hashtagName: tag.hashtagName || tag.hashtag_name,
                hashtagId: tag.hashtagId || tag.hashtag_id
              }))
            }
          })

          return {
            success: true,
            videos,
            count: videos.length
          }

        } catch (error) {
          return { success: false, error: error.message }
        }
      })

      console.log(`[Douyin] Extracted ${pageData.count || 0} videos from page data`)
      return pageData

    } catch (error) {
      console.error('[Douyin] Failed to extract page data:', error)
      return { success: false, error: error.message }
    }
  }
}

// 单例导出
const douyinService = new DouyinService()
module.exports = douyinService
