const { chromium } = require('playwright-core')
const axios = require('axios')

/**
 * 解析发布时间字符串，判断是否超过指定月数
 * @param {string} publishDate - 发布时间字符串，如 "8小时前", "3天前", "2周前", "1个月前", "2025年12月21日"
 * @param {number} months - 月数阈值
 * @returns {boolean} 是否超过指定月数
 */
function isOlderThanMonths(publishDate, months) {
  if (!publishDate) return false

  const now = new Date()
  let publishDateTime = null

  // 处理相对时间格式 (支持简体中文、繁体中文、英文)
  const relativePatterns = [
    { pattern: /(\d+)\s*秒前/, unit: 'second' },
    { pattern: /(\d+)\s*seconds?\s*ago/i, unit: 'second' },
    { pattern: /(\d+)\s*(分钟|分鐘)前/, unit: 'minute' },
    { pattern: /(\d+)\s*minutes?\s*ago/i, unit: 'minute' },
    { pattern: /(\d+)\s*(小时|小時)前/, unit: 'hour' },
    { pattern: /(\d+)\s*hours?\s*ago/i, unit: 'hour' },
    { pattern: /(\d+)\s*天前/, unit: 'day' },
    { pattern: /(\d+)\s*days?\s*ago/i, unit: 'day' },
    { pattern: /(\d+)\s*(周|週)前/, unit: 'week' },
    { pattern: /(\d+)\s*weeks?\s*ago/i, unit: 'week' },
    { pattern: /(\d+)\s*个?月前/, unit: 'month' },
    { pattern: /(\d+)\s*months?\s*ago/i, unit: 'month' },
    { pattern: /(\d+)\s*年前/, unit: 'year' },
    { pattern: /(\d+)\s*years?\s*ago/i, unit: 'year' }
  ]

  for (const { pattern, unit } of relativePatterns) {
    const match = publishDate.match(pattern)
    if (match) {
      const value = parseInt(match[1], 10)
      publishDateTime = new Date(now)

      switch (unit) {
        case 'second':
          publishDateTime.setSeconds(publishDateTime.getSeconds() - value)
          break
        case 'minute':
          publishDateTime.setMinutes(publishDateTime.getMinutes() - value)
          break
        case 'hour':
          publishDateTime.setHours(publishDateTime.getHours() - value)
          break
        case 'day':
          publishDateTime.setDate(publishDateTime.getDate() - value)
          break
        case 'week':
          publishDateTime.setDate(publishDateTime.getDate() - value * 7)
          break
        case 'month':
          publishDateTime.setMonth(publishDateTime.getMonth() - value)
          break
        case 'year':
          publishDateTime.setFullYear(publishDateTime.getFullYear() - value)
          break
      }
      break
    }
  }

  // 处理绝对日期格式 "YYYY年MM月DD日"
  if (!publishDateTime) {
    const absoluteMatch = publishDate.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/)
    if (absoluteMatch) {
      const year = parseInt(absoluteMatch[1], 10)
      const month = parseInt(absoluteMatch[2], 10) - 1 // 月份从0开始
      const day = parseInt(absoluteMatch[3], 10)
      publishDateTime = new Date(year, month, day)
    }
  }

  // 如果无法解析，默认不跳过
  if (!publishDateTime) {
    console.log('[YouTube] Cannot parse publish date:', publishDate)
    return false
  }

  // 计算月数差异
  const diffMs = now.getTime() - publishDateTime.getTime()
  const diffMonths = diffMs / (1000 * 60 * 60 * 24 * 30) // 近似每月30天

  return diffMonths > months
}

class YouTubeService {
  constructor() {
    this.browser = null
    this.context = null
    this.page = null
    this.isRunning = false
    this.collectedVideos = []
    this.currentBrowserId = null
    // HubStudio API 地址
    this.apiUrl = 'http://127.0.0.1:6873'
    this.client = axios.create({ proxy: false })
    // HubStudio 凭证
    this.appId = ''
    this.appSecret = ''
    this.groupCode = ''
  }

  /**
   * 设置 HubStudio 凭证
   */
  setCredentials(appId, appSecret, groupCode) {
    this.appId = appId
    this.appSecret = appSecret
    this.groupCode = groupCode
  }

  /**
   * 获取通用请求参数
   */
  getCommonParams() {
    return {
      app_id: this.appId,
      app_secret: this.appSecret,
      group_code: this.groupCode
    }
  }

  /**
   * 通过 wsEndpoint 连接到已启动的浏览器
   * @param {string} wsEndpoint - WebSocket 端点
   * @param {string} browserId - 浏览器ID
   * @param {string} browserType - 浏览器类型 (hubstudio/bitbrowser)
   * @returns {Promise<Object>} 连接结果
   */
  async connectWithWsEndpoint(wsEndpoint, browserId, browserType = 'hubstudio') {
    console.log('[YouTube] connectWithWsEndpoint called with:', { wsEndpoint, browserId, browserType })

    if (this.browser && this.currentBrowserId === browserId) {
      console.log('[YouTube] Already connected to this browser')
      return { success: true, message: '已连接到浏览器' }
    }

    // 如果已连接到其他浏览器，先断开
    if (this.browser) {
      await this.closeBrowser()
    }

    try {
      console.log('[YouTube] Connecting to CDP endpoint:', wsEndpoint)
      this.browser = await chromium.connectOverCDP(wsEndpoint)
      console.log('[YouTube] Connected to browser via CDP')

      // 获取上下文和页面
      const contexts = this.browser.contexts()
      this.context = contexts.length > 0 ? contexts[0] : await this.browser.newContext()

      const pages = this.context.pages()
      this.page = pages.length > 0 ? pages[0] : await this.context.newPage()

      this.currentBrowserId = browserId
      this.currentBrowserType = browserType

      console.log('[YouTube] Browser connected successfully')

      // 自动导航到 YouTube 首页
      const currentUrl = this.page.url()
      console.log('[YouTube] Current page URL:', currentUrl)

      if (!currentUrl.includes('youtube.com/shorts')) {
        console.log('[YouTube] Navigating to YouTube Shorts...')
        try {
          await this.page.goto('https://www.youtube.com/shorts/', {
            waitUntil: 'domcontentloaded',
            timeout: 30000
          })
          await this.page.waitForTimeout(3000)
          console.log('[YouTube] Navigated to YouTube Shorts')
        } catch (e) {
          console.log('[YouTube] Navigation warning:', e.message)
        }
      }

      return {
        success: true,
        message: '浏览器连接成功，已导航到 YouTube Shorts'
      }

    } catch (error) {
      console.error('[YouTube] Failed to connect to browser:', error)

      // 清理状态
      this.browser = null
      this.context = null
      this.page = null
      this.currentBrowserId = null
      this.currentBrowserType = null

      return { success: false, error: `连接失败: ${error.message}` }
    }
  }

  /**
   * 启动浏览器 (仅用于 HubStudio，保留兼容性)
   * @param {string} browserId - HubStudio 浏览器ID
   * @returns {Promise<Object>} 启动结果
   */
  async launchBrowser(browserId) {
    console.log('[YouTube] launchBrowser called with browserId:', browserId)

    if (this.browser && this.currentBrowserId === browserId) {
      console.log('[YouTube] Already connected to this browser')
      return { success: true, message: '已连接到浏览器' }
    }

    // 如果已连接到其他浏览器，先断开
    if (this.browser) {
      await this.closeBrowser()
    }

    try {
      // 调用 HubStudio API 启动浏览器
      // containerCode 需要是字符串格式
      const containerCode = String(browserId)
      console.log('[YouTube] Starting HubStudio browser with containerCode:', containerCode)

      const response = await this.client.post(`${this.apiUrl}/api/v1/browser/start`, {
        containerCode: containerCode,
        extractIp: true,
        headless: false
      }, { timeout: 60000 })

      console.log('[YouTube] HubStudio API response:', JSON.stringify(response.data))

      if (response.data.code !== 0) {
        return {
          success: false,
          error: response.data.msg || '启动浏览器失败'
        }
      }

      const { ws, debug_port } = response.data.data
      console.log('[YouTube] WebSocket URL:', ws)
      console.log('[YouTube] Debug port:', debug_port)

      // 使用新方法连接
      const wsEndpoint = ws || `http://127.0.0.1:${debug_port}`
      return await this.connectWithWsEndpoint(wsEndpoint, browserId, 'hubstudio')

    } catch (error) {
      console.error('[YouTube] Failed to launch browser:', error)

      // 清理状态
      this.browser = null
      this.context = null
      this.page = null
      this.currentBrowserId = null

      if (error.code === 'ECONNREFUSED') {
        return {
          success: false,
          error: '无法连接到 HubStudio，请确保 HubStudio 已启动'
        }
      }

      return { success: false, error: `启动失败: ${error.message}` }
    }
  }

  /**
   * 打开 YouTube 首页
   * @returns {Promise<Object>} 操作结果
   */
  async openYouTube() {
    if (!this.page) {
      return { success: false, error: '浏览器未启动' }
    }

    try {
      console.log('[YouTube] Navigating to YouTube...')

      await this.page.goto('https://www.youtube.com/', {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      })

      // 等待页面加载
      await this.page.waitForTimeout(3000)

      const currentUrl = this.page.url()
      console.log('[YouTube] Current URL:', currentUrl)

      return {
        success: true,
        message: 'YouTube 页面已打开',
        url: currentUrl
      }
    } catch (error) {
      console.error('[YouTube] Failed to open YouTube:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * 获取当前 Shorts 视频信息
   * @returns {Promise<Object>} 视频信息
   */
  async getCurrentShortsInfo() {
    if (!this.page) {
      return { success: false, error: '浏览器未启动' }
    }

    try {
      const videoInfo = await this.page.evaluate(() => {
        const url = window.location.href

        // 检查是否在 Shorts 页面
        if (!url.includes('/shorts/')) {
          return null
        }

        // 获取视频ID（从URL获取是最可靠的）
        const videoId = window.location.pathname.match(/\/shorts\/([^\/\?]+)/)?.[1] || ''

        // 找到当前激活的视频容器
        // YouTube Shorts 使用多种方式标记当前播放的视频
        let activeVideo = null
        let activeVideoSource = 'none'

        // 方法1: is-active 属性
        activeVideo = document.querySelector('ytd-reel-video-renderer[is-active]')
        if (activeVideo) {
          activeVideoSource = 'ytd-reel-video-renderer[is-active]'
        }

        // 方法2: ytd-shorts[is-active]
        if (!activeVideo) {
          activeVideo = document.querySelector('ytd-shorts[is-active]')
          if (activeVideo) activeVideoSource = 'ytd-shorts[is-active]'
        }

        // 方法3: 通过 URL 中的 videoId 找到对应的渲染器
        if (!activeVideo && videoId) {
          const allRenderers = document.querySelectorAll('ytd-reel-video-renderer')
          for (const renderer of allRenderers) {
            // 检查渲染器内部是否有当前视频的链接
            const videoLink = renderer.querySelector(`a[href*="/shorts/${videoId}"]`)
            if (videoLink) {
              activeVideo = renderer
              activeVideoSource = 'matched by videoId'
              break
            }
          }
        }

        // 方法4: 找可见区域内的渲染器
        if (!activeVideo) {
          const allRenderers = document.querySelectorAll('ytd-reel-video-renderer')
          for (const renderer of allRenderers) {
            const rect = renderer.getBoundingClientRect()
            // 检查是否在视口中心区域
            if (rect.top >= -100 && rect.top <= 300 && rect.height > 200) {
              activeVideo = renderer
              activeVideoSource = 'viewport center'
              break
            }
          }
        }

        // 方法5: 最后的兜底
        if (!activeVideo) {
          activeVideo = document.querySelector('ytd-reel-video-renderer')
          if (activeVideo) activeVideoSource = 'first renderer (fallback)'
        }

        // 在激活的视频容器内查找频道信息
        let channelLink = null
        let channelHandle = ''
        let channelName = ''
        let channelUrl = ''

        let channelSource = 'none'

        if (activeVideo) {
          // 在当前视频容器内查找频道链接
          // 优先查找特定的频道信息区域
          channelLink = activeVideo.querySelector('ytd-channel-name a[href*="/@"]') ||
                       activeVideo.querySelector('.ytd-channel-name a[href*="/@"]') ||
                       activeVideo.querySelector('[class*="channel"] a[href*="/@"]') ||
                       activeVideo.querySelector('a[href*="/@"]')
          if (channelLink) {
            channelHandle = channelLink.href?.match(/\/@([^\/]+)/)?.[1] || ''
            channelName = channelLink.textContent?.trim() || ''
            channelUrl = channelLink.href || ''
            channelSource = 'activeVideo container'
          }
        }

        // 如果在容器内没找到，尝试在 Shorts 播放区域查找
        if (!channelLink) {
          // 查找 shorts 相关的频道信息区域
          const shortsContainer = document.querySelector('#shorts-container') ||
                                 document.querySelector('ytd-shorts') ||
                                 document.querySelector('#shorts-player')

          if (shortsContainer) {
            channelLink = shortsContainer.querySelector('ytd-channel-name a[href*="/@"]') ||
                         shortsContainer.querySelector('.ytd-channel-name a[href*="/@"]') ||
                         shortsContainer.querySelector('a[href*="/@"]')
            if (channelLink) {
              channelHandle = channelLink.href?.match(/\/@([^\/]+)/)?.[1] || ''
              channelName = channelLink.textContent?.trim() || ''
              channelUrl = channelLink.href || ''
              channelSource = 'shorts container'
            }
          }
        }

        // 最后的兜底：查找视口中间位置的频道链接
        if (!channelLink) {
          const allChannelLinks = document.querySelectorAll('a[href*="/@"]')
          const viewportCenter = window.innerHeight / 2

          let closestLink = null
          let closestDistance = Infinity

          for (const link of allChannelLinks) {
            const rect = link.getBoundingClientRect()
            const linkCenter = rect.top + rect.height / 2
            const distance = Math.abs(linkCenter - viewportCenter)

            // 只考虑在视口内且在主内容区域的链接
            if (rect.top >= 0 && rect.bottom <= window.innerHeight &&
                rect.left > 100 && // 排除侧边栏
                distance < closestDistance) {
              closestLink = link
              closestDistance = distance
            }
          }

          if (closestLink && closestDistance < 400) {
            channelLink = closestLink
            channelHandle = closestLink.href?.match(/\/@([^\/]+)/)?.[1] || ''
            channelName = closestLink.textContent?.trim() || ''
            channelUrl = closestLink.href || ''
            channelSource = 'closest to center'
          }
        }

        // 检测是否为广告视频
        const checkInContainer = (selector) => {
          if (activeVideo) {
            return activeVideo.querySelector(selector)
          }
          return document.querySelector(selector)
        }

        // 1. 检查广告进度条
        const adProgressList = checkInContainer('.ytp-ad-progress-list')
        const hasAdProgress = adProgressList && adProgressList.childElementCount > 0

        // 2. 检查"赞助商广告"徽章
        const adBadge = checkInContainer('badge-shape.yt-badge-shape--ad')
        const hasAdBadge = !!adBadge

        // 3. 检查广告相关的渲染器元素
        const hasAdRenderer = !!checkInContainer('ytd-ad-slot-renderer') ||
                              !!checkInContainer('ad-badge-view-model')

        const isAd = !channelLink || // 没有正常的频道链接
                     hasAdProgress || // 广告进度条有内容
                     hasAdBadge || // 有"赞助商广告"徽章
                     hasAdRenderer || // 有广告渲染器元素
                     channelName.toLowerCase().includes('video ad') ||
                     channelName.toLowerCase().includes('ad upload')

        // 检测是否已关注该频道 - 只在当前视频容器内查找（不全局查找，避免找到其他视频的按钮）
        // 逻辑：有【订阅】按钮 = 未关注，没有【订阅】按钮或显示【已订阅】 = 已关注
        let subscribeButton = null
        let subscribeSource = 'none'

        if (activeVideo) {
          // 方法1: 查找订阅按钮容器
          const subscribeContainer = activeVideo.querySelector('yt-subscribe-button-view-model') ||
                                    activeVideo.querySelector('.ytSubscribeButtonViewModelContainer') ||
                                    activeVideo.querySelector('yt-reel-channel-bar-view-model')
          if (subscribeContainer) {
            subscribeButton = subscribeContainer.querySelector('button')
            if (subscribeButton) subscribeSource = 'activeVideo container'
          }

          // 方法2: 查找显示"订阅"文字的按钮 - 支持简体/繁体/英文
          if (!subscribeButton) {
            subscribeButton = activeVideo.querySelector('button[aria-label*="订阅"]') ||
                             activeVideo.querySelector('button[aria-label*="訂閱"]') ||
                             activeVideo.querySelector('button[aria-label*="Subscribe"]')
            if (subscribeButton) subscribeSource = 'activeVideo aria-label'
          }
        }

        // 注意：不再全局查找，因为全局查找可能找到其他视频的订阅按钮
        // 如果在 activeVideo 内找不到订阅按钮，就认为是已关注

        const subscribeAriaLabel = subscribeButton?.getAttribute('aria-label') || ''
        const subscribeButtonText = subscribeButton?.textContent?.trim() || ''

        // 判断是否已关注
        // 简化逻辑：有"订阅/訂閱/Subscribe"文字（不含"已/Subscribed"）= 未关注，采集
        // 其他情况 = 已关注，不采集
        let isFollowed = true  // 默认已关注
        let followedReason = 'default to followed'

        if (subscribeButton) {
          // 检查是否包含"订阅"相关文字
          const hasSubscribeText = subscribeAriaLabel.includes('订阅') ||
                                   subscribeAriaLabel.includes('訂閱') ||
                                   subscribeAriaLabel.toLowerCase().includes('subscribe') ||
                                   subscribeButtonText.includes('订阅') ||
                                   subscribeButtonText.includes('訂閱') ||
                                   subscribeButtonText.toLowerCase().includes('subscribe')

          // 检查是否包含"已订阅"相关文字
          const hasSubscribedText = subscribeAriaLabel.includes('已') ||
                                    subscribeButtonText.includes('已') ||
                                    subscribeAriaLabel.toLowerCase().includes('subscribed') ||
                                    subscribeAriaLabel.toLowerCase().includes('unsubscribe') ||
                                    subscribeButtonText.toLowerCase().includes('subscribed')

          // 有"订阅"文字但没有"已订阅" = 未关注
          if (hasSubscribeText && !hasSubscribedText) {
            isFollowed = false
            followedReason = 'has subscribe text without subscribed'
          } else if (hasSubscribedText) {
            isFollowed = true
            followedReason = 'has subscribed text'
          } else {
            isFollowed = true
            followedReason = 'button found but no subscribe text'
          }
        } else {
          isFollowed = true
          followedReason = 'no subscribe button in activeVideo'
        }

        // 获取视频标题 - 在当前视频容器内查找
        let title = ''
        if (activeVideo) {
          title = activeVideo.querySelector('yt-shorts-video-title-view-model h2')?.textContent?.trim() ||
                 activeVideo.querySelector('[class*="ShortsVideoTitle"]')?.textContent?.trim() ||
                 activeVideo.querySelector('h2[class*="title"]')?.textContent?.trim() || ''
        }
        if (!title) {
          title = document.querySelector('yt-shorts-video-title-view-model h2')?.textContent?.trim() ||
                 document.querySelector('[class*="ShortsVideoTitle"]')?.textContent?.trim() || ''
        }

        // 从 factoid 元素获取观看次数、发布日期
        // 注意：这些元素可能在 engagement-panel 中，不在 activeVideo 容器内，所以要在全局搜索
        let viewCount = ''
        let publishDate = ''
        let publishTimeType = ''
        let factoidSource = 'none'
        let factoidDebug = []

        // 方法0: 直接查找 view-count-factoid-renderer 元素 (最可靠)
        const viewCountRenderer = document.querySelector('view-count-factoid-renderer')
        if (viewCountRenderer) {
          // 尝试从 aria-label 提取 (格式如: "收看次數：1,646,279 次" 或 "1,646,279 views")
          const ariaLabel = viewCountRenderer.querySelector('[aria-label]')?.getAttribute('aria-label') || ''
          if (ariaLabel) {
            // 提取数字部分 - 支持各种格式
            const numMatch = ariaLabel.match(/([\d,]+)/);
            if (numMatch) {
              viewCount = numMatch[1]
              factoidSource = 'view-count-factoid-renderer aria-label'
            }
          }
          // 如果 aria-label 没有，尝试从 textContent 提取
          if (!viewCount) {
            const valueEl = viewCountRenderer.querySelector('.ytwFactoidRendererValue')
            if (valueEl) {
              viewCount = valueEl.textContent?.trim() || ''
              factoidSource = 'view-count-factoid-renderer value'
            }
          }
        }

        // 方法0b: 直接查找发布时间的 factoid-renderer 元素
        // 发布时间通常在 engagement-panel 中的另一个 factoid-renderer 里
        const allFactoidDivs = document.querySelectorAll('.ytwFactoidRendererFactoid[aria-label]')
        for (const div of allFactoidDivs) {
          const ariaLabel = div.getAttribute('aria-label') || ''
          // 检查是否是发布时间 (不是播放量)
          // 简体: "3天前", 繁体: "3天前" or "3 日前", 英文: "3 days ago"
          if (ariaLabel.match(/\d+\s*(秒|分钟|分鐘|小时|小時|天|日|周|週|个?月|年)前/) ||
              ariaLabel.match(/\d+\s*(seconds?|minutes?|hours?|days?|weeks?|months?|years?)\s*ago/i) ||
              ariaLabel.match(/\d{4}年\d{1,2}月\d{1,2}日/) ||
              ariaLabel.match(/\d{4}\/\d{1,2}\/\d{1,2}/)) {
            publishDate = ariaLabel
            publishTimeType = ariaLabel.includes('前') || ariaLabel.toLowerCase().includes('ago') ? 'relative' : 'absolute'
            break
          }
        }

        // 方法0c: 如果还没找到发布时间，查找所有带 aria-label 的 factoid 元素
        if (!publishDate) {
          const allAriaLabels = document.querySelectorAll('[aria-label]')
          for (const el of allAriaLabels) {
            const ariaLabel = el.getAttribute('aria-label') || ''
            // 匹配发布时间格式
            const timeMatch = ariaLabel.match(/^(\d+\s*(秒|分钟|分鐘|小时|小時|天|日|周|週|个?月|年)前)$/) ||
                             ariaLabel.match(/^(\d+\s*(seconds?|minutes?|hours?|days?|weeks?|months?|years?)\s*ago)$/i) ||
                             ariaLabel.match(/^(\d{4}年\d{1,2}月\d{1,2}日)$/)
            if (timeMatch) {
              publishDate = timeMatch[1]
              publishTimeType = ariaLabel.includes('前') || ariaLabel.toLowerCase().includes('ago') ? 'relative' : 'absolute'
              break
            }
          }
        }

        // 方法1: 使用 factoid-renderer (新版YouTube) - 在全局搜索
        if (!viewCount) {
          const factoidRenderers = document.querySelectorAll('factoid-renderer, ytd-factoid-renderer')

          if (factoidRenderers.length > 0) {
            factoidSource = 'factoid-renderer'
            for (const renderer of factoidRenderers) {
              const text = renderer.textContent?.trim() || ''
              // 观看次数通常包含 "次观看"(简体), "收看次數"(繁体) 或 "views"(英文)
              if (text.includes('次观看') || text.includes('收看次數') || text.includes('views') || text.includes('Views')) {
                // 提取数字部分
                const match = text.match(/([\d,.]+[万亿KMB]?)\s*(次观看|收看次數|views|Views)/i)
                if (match) {
                  viewCount = match[1]
                } else {
                  viewCount = text.replace(/次观看|收看次數|views/gi, '').trim()
                }
              }
              // 发布时间 (简体/繁体/英文)
              if (text.includes('前') || text.toLowerCase().includes('ago')) {
                publishDate = text
                publishTimeType = 'relative'
              } else if (text.match(/\d{4}年\d{1,2}月\d{1,2}日/)) {
                publishDate = text
                publishTimeType = 'absolute'
              }
            }
          }
        }

        // 方法2: 使用 ytwFactoidRenderer 选择器 - 在全局搜索
        if (!viewCount) {
          // 直接在全局搜索，因为这些元素通常在 engagement-panel 中
          const factoidValues = [...document.querySelectorAll('.ytwFactoidRendererValue')].map(el => el.textContent?.trim())
          const factoidLabels = [...document.querySelectorAll('.ytwFactoidRendererLabel')].map(el => el.textContent?.trim())

          // 记录调试信息
          factoidDebug = factoidValues.map((v, i) => `[${i}] value="${v}" label="${factoidLabels[i] || ''}"`)

          if (factoidValues.length > 0) {
            factoidSource = 'ytwFactoidRenderer'
            for (let i = 0; i < factoidValues.length && i < factoidLabels.length; i++) {
              const value = factoidValues[i] || ''
              const label = factoidLabels[i] || ''

              // 观看次数: label 可能是 "次观看"(简体), "收看次數"(繁体), "views"(英文)
              if (label.includes('观看') || label.includes('收看次數') || label.toLowerCase().includes('view')) {
                viewCount = value
              } else if (label === '前' || label.toLowerCase() === 'ago') {
                publishDate = value + label
                publishTimeType = 'relative'
              } else if (label.includes('年')) {
                publishDate = label + value
                publishTimeType = 'absolute'
              }
            }

            // 如果还没找到观看次数，尝试匹配第一个纯数字值
            if (!viewCount && factoidValues.length > 0) {
              for (const val of factoidValues) {
                // 匹配纯数字或带单位的数字 (如 "1.2万", "12K", "1,234")
                if (val && /^[\d,.]+[万亿KMB]?$/.test(val)) {
                  viewCount = val
                  break
                }
              }
            }
          }
        }

        // 方法3: 查找包含观看次数文本的元素 - 在全局搜索
        if (!viewCount) {
          const allText = document.querySelectorAll('span, yt-formatted-string')
          for (const el of allText) {
            const text = el.textContent?.trim() || ''
            // 匹配 "1.2万次观看"(简体), "1,234收看次數"(繁体) 或 "12K views"(英文) 格式
            const viewMatch = text.match(/^([\d,.]+[万亿KMB]?)\s*(次观看|收看次數|views)$/i)
            if (viewMatch) {
              viewCount = viewMatch[1]
              factoidSource = 'text search'
              break
            }
          }
        }

        // 方法4: 查找发布时间 - 在全局搜索
        if (!publishDate) {
          const allText = document.querySelectorAll('span, yt-formatted-string')
          for (const el of allText) {
            const text = el.textContent?.trim() || ''
            // 相对时间: "3天前", "2周前", "1个月前" (简体/繁体), "3 days ago" (英文)
            if (text.match(/^\d+\s*(秒|分钟|分鐘|小时|小時|天|周|週|个?月|年)前$/) ||
                text.match(/^\d+\s*(seconds?|minutes?|hours?|days?|weeks?|months?|years?)\s*ago$/i)) {
              publishDate = text
              publishTimeType = 'relative'
              break
            }
            // 绝对时间: "2025年1月10日"
            if (text.match(/^\d{4}年\d{1,2}月\d{1,2}日$/)) {
              publishDate = text
              publishTimeType = 'absolute'
              break
            }
          }
        }

        // 获取视频时长 - 从 video 元素获取
        let videoDuration = ''
        let videoDurationSeconds = 0

        // 方法1: 从当前活动视频容器内的 video 元素获取
        let videoElement = null
        if (activeVideo) {
          videoElement = activeVideo.querySelector('video')
        }
        // 方法2: 从全局查找正在播放的 video 元素
        if (!videoElement) {
          const allVideos = document.querySelectorAll('video')
          for (const v of allVideos) {
            // 找到正在播放或有时长的视频
            if (v.duration && v.duration > 0 && !isNaN(v.duration)) {
              videoElement = v
              break
            }
          }
        }

        if (videoElement && videoElement.duration && !isNaN(videoElement.duration)) {
          videoDurationSeconds = Math.round(videoElement.duration)
          // 格式化为 mm:ss 或 m:ss
          const minutes = Math.floor(videoDurationSeconds / 60)
          const seconds = videoDurationSeconds % 60
          videoDuration = `${minutes}:${seconds.toString().padStart(2, '0')}`
        }

        return {
          videoId,
          videoUrl: videoId ? `https://www.youtube.com/watch?v=${videoId}` : url,
          title,
          channelHandle,
          channelName,
          channelUrl,
          viewCount,
          publishDate,
          publishTimeType,
          videoDuration,
          videoDurationSeconds,
          isAd,
          isFollowed,
          // 调试信息
          _debug: {
            activeVideoSource,
            channelSource,
            activeVideoExists: !!activeVideo,
            subscribeSource,
            subscribeAriaLabel,
            subscribeButtonText,
            followedReason,
            factoidSource,
            factoidDebug
          }
        }
      })

      if (videoInfo) {
        console.log('[YouTube] Got Shorts info:')
        console.log('  - videoId:', videoInfo.videoId)
        console.log('  - title:', videoInfo.title?.slice(0, 30))
        console.log('  - channelHandle:', videoInfo.channelHandle)
        console.log('  - channelName:', videoInfo.channelName)
        console.log('  - viewCount:', videoInfo.viewCount)
        console.log('  - publishDate:', videoInfo.publishDate)
        console.log('  - videoDuration:', videoInfo.videoDuration, `(${videoInfo.videoDurationSeconds}s)`)
        console.log('  - isAd:', videoInfo.isAd)
        console.log('  - isFollowed:', videoInfo.isFollowed)
        console.log('  - DEBUG activeVideoSource:', videoInfo._debug?.activeVideoSource)
        console.log('  - DEBUG channelSource:', videoInfo._debug?.channelSource)
        console.log('  - DEBUG factoidSource:', videoInfo._debug?.factoidSource)
        console.log('  - DEBUG factoidDebug:', videoInfo._debug?.factoidDebug)
        console.log('  - DEBUG subscribeSource:', videoInfo._debug?.subscribeSource)
        console.log('  - DEBUG followedReason:', videoInfo._debug?.followedReason)
        return { success: true, video: videoInfo }
      } else {
        return { success: false, error: '当前页面不是 Shorts 页面' }
      }

    } catch (error) {
      console.error('[YouTube] Failed to get Shorts info:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * 滑动到下一个 Shorts 视频
   * @returns {Promise<Object>} 操作结果
   */
  async scrollToNextShorts() {
    if (!this.page) {
      return { success: false, error: '浏览器未启动' }
    }

    try {
      const oldUrl = this.page.url()
      let newUrl = oldUrl
      let retries = 0
      const maxRetries = 3

      // 尝试滚动直到URL改变或达到最大重试次数
      while (newUrl === oldUrl && retries < maxRetries) {
        // 按下方向键下来切换到下一个视频
        await this.page.keyboard.press('ArrowDown')

        // 等待页面切换 - 使用轮询检测URL变化
        for (let i = 0; i < 10; i++) {
          await this.page.waitForTimeout(500)
          newUrl = this.page.url()
          if (newUrl !== oldUrl) {
            break
          }
        }

        retries++
        if (newUrl === oldUrl && retries < maxRetries) {
          console.log(`[YouTube] URL not changed, retry ${retries}/${maxRetries}`)
        }
      }

      // 额外等待确保页面内容加载完成
      await this.page.waitForTimeout(2000)

      const switched = oldUrl !== newUrl
      console.log('[YouTube] Scrolled to next Shorts, switched:', switched, 'retries:', retries)

      return {
        success: true,
        switched,
        oldUrl,
        newUrl
      }
    } catch (error) {
      console.error('[YouTube] Failed to scroll to next Shorts:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * 重新加载 Shorts 页面（页面卡住时使用）
   */
  async reloadShortsPage() {
    if (!this.page) return

    try {
      console.log('[YouTube] Reloading Shorts page...')
      await this.page.goto('https://www.youtube.com/shorts', { waitUntil: 'domcontentloaded', timeout: 15000 })
      await this.page.waitForTimeout(3000)
      console.log('[YouTube] Shorts page reloaded, current URL:', this.page.url())
    } catch (error) {
      console.error('[YouTube] Failed to reload Shorts page:', error.message)
      // 如果 goto 失败，尝试刷新当前页面
      try {
        await this.page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 })
        await this.page.waitForTimeout(3000)
        console.log('[YouTube] Page refreshed instead')
      } catch (e) {
        console.error('[YouTube] Page refresh also failed:', e.message)
      }
    }
  }

  /**
   * 从 Hashtag 页面采集 Shorts 视频ID和播放量
   * @param {Object} options
   * @param {string} options.hashtagUrl - Hashtag 页面 URL
   * @param {Function} options.onProgress - 进度回调
   * @param {Function} options.onSave - 保存回调
   * @returns {Promise<Object>} 采集结果
   */
  async collectFromHashtag(options = {}) {
    const { hashtagUrl, onProgress, onSave } = options

    if (!this.page) {
      return { success: false, error: '浏览器未启动' }
    }

    if (this.isCollecting || this.isRunning) {
      return { success: false, error: '已有采集任务正在运行' }
    }

    if (!hashtagUrl || !hashtagUrl.includes('/hashtag/')) {
      return { success: false, error: '请输入有效的 Hashtag URL' }
    }

    this.isCollecting = true
    const startTime = Date.now()
    const collectedVideos = new Map() // videoId -> { videoId, viewCount }
    let lastCount = 0
    let noNewCount = 0 // 连续没有新视频的滚动次数

    try {
      // 导航到 hashtag 页面
      console.log('[YouTube] Navigating to hashtag page:', hashtagUrl)
      onProgress?.({ type: 'status', message: '正在打开标签页...' })
      await this.page.goto(hashtagUrl, { waitUntil: 'domcontentloaded', timeout: 30000 })
      await this.page.waitForTimeout(3000)

      // 确保在 Shorts 标签下
      const currentUrl = this.page.url()
      if (!currentUrl.includes('/shorts')) {
        // 尝试点击 Shorts 标签
        try {
          await this.page.click('yt-tab-shape[tab-title="Shorts"]')
          await this.page.waitForTimeout(2000)
        } catch (e) {
          console.log('[YouTube] Could not click Shorts tab, may already be on it')
        }
      }

      console.log('[YouTube] Starting to scroll and collect from hashtag page...')
      onProgress?.({ type: 'status', message: '开始滚动加载视频...' })

      // 不断滚动直到没有更多新视频
      while (this.isCollecting) {
        // 提取当前页面上所有 shorts 链接
        const videos = await this.page.evaluate(() => {
          const items = document.querySelectorAll('ytd-rich-item-renderer')
          const result = []
          items.forEach(item => {
            const link = item.querySelector('a[href*="/shorts/"]')
            if (!link) return
            const href = link.getAttribute('href')
            const videoId = href?.match(/\/shorts\/([a-zA-Z0-9_-]+)/)?.[1]
            if (!videoId) return

            // 获取观看次数
            const spans = item.querySelectorAll('span')
            let viewText = ''
            spans.forEach(s => {
              const t = s.textContent.trim()
              if (t.includes('次观看') || t.includes('views')) {
                viewText = t
              }
            })

            // 解析观看次数为实际数字
            // 中文格式: "170万次观看", "2169万次观看", "1.5亿次观看"
            // 英文格式: "1.7M views", "500K views", "1B views"
            let viewCount = 0
            if (viewText) {
              const num = parseFloat(viewText.replace(/,/g, ''))
              if (!isNaN(num)) {
                if (viewText.includes('亿')) {
                  viewCount = Math.round(num * 100000000)
                } else if (viewText.includes('万')) {
                  viewCount = Math.round(num * 10000)
                } else if (viewText.toUpperCase().includes('B')) {
                  viewCount = Math.round(num * 1000000000)
                } else if (viewText.toUpperCase().includes('M')) {
                  viewCount = Math.round(num * 1000000)
                } else if (viewText.toUpperCase().includes('K')) {
                  viewCount = Math.round(num * 1000)
                } else {
                  viewCount = Math.round(num)
                }
              }
            }

            result.push({ videoId, viewText, viewCount })
          })
          return result
        })

        // 合并到已采集的视频中
        let newCount = 0
        for (const v of videos) {
          if (!collectedVideos.has(v.videoId)) {
            collectedVideos.set(v.videoId, {
              videoId: v.videoId,
              videoUrl: `https://www.youtube.com/shorts/${v.videoId}`,
              viewCount: v.viewCount || 0,
              collectedAt: new Date().toISOString()
            })
            newCount++
          }
        }

        const totalCount = collectedVideos.size
        console.log(`[YouTube] Hashtag scroll: found ${videos.length} on page, ${newCount} new, total ${totalCount}`)

        onProgress?.({
          type: 'progress',
          total: totalCount,
          newInThisScroll: newCount,
          message: `已发现 ${totalCount} 个视频，滚动加载中...`
        })

        // 检查是否还有新视频
        if (totalCount === lastCount) {
          noNewCount++
          console.log(`[YouTube] No new videos found (${noNewCount}/5)`)
          if (noNewCount >= 5) {
            console.log('[YouTube] No more new videos after 5 scrolls, stopping')
            break
          }
        } else {
          noNewCount = 0
          lastCount = totalCount
        }

        // 滚动到页面底部
        await this.page.evaluate(() => {
          window.scrollTo(0, document.documentElement.scrollHeight)
        })
        await this.page.waitForTimeout(2000)
      }

      // 批量保存
      console.log(`[YouTube] Hashtag collection done, saving ${collectedVideos.size} videos...`)
      onProgress?.({ type: 'status', message: `滚动完成，正在保存 ${collectedVideos.size} 个视频...` })

      let savedCount = 0
      let duplicateCount = 0
      for (const video of collectedVideos.values()) {
        const saved = onSave?.(video)
        if (saved) {
          savedCount++
        } else {
          duplicateCount++
        }
      }

      const elapsedSeconds = Math.round((Date.now() - startTime) / 1000)
      console.log(`[YouTube] Hashtag collection complete: ${savedCount} saved, ${duplicateCount} duplicates, ${elapsedSeconds}s elapsed`)

      return {
        success: true,
        total: collectedVideos.size,
        saved: savedCount,
        duplicates: duplicateCount,
        elapsedSeconds
      }
    } catch (error) {
      console.error('[YouTube] Hashtag collection error:', error)
      return { success: false, error: error.message }
    } finally {
      this.isCollecting = false
    }
  }

  /**
   * 开始自动采集 Shorts 视频
   * 采集条件：频道不在数据库中 + 未关注的频道 + 非广告
   * 智能浏览逻辑：
   * - 频道在数据库且在选中分组 → 观看视频时长后滑动
   * - 频道在数据库但不在选中分组 → 立即滑动
   * - 频道不在数据库 → 等待3-8秒后滑动（并采集）
   * - 广告 → 立即滑动
   * @param {Object} options - 采集选项
   * @param {number} options.duration - 采集时长（分钟），默认 60
   * @param {string} options.groupName - 选中的频道分组名称
   * @param {Array} options.allBenchmarkChannels - 所有对标频道
   * @param {Array} options.groupChannels - 选中分组的频道
   * @param {Function} options.onProgress - 进度回调
   * @param {Function} options.onSave - 保存回调
   * @returns {Promise<Object>} 采集结果
   */
  async startAutoCollect(options = {}) {
    // 检查是否已有任务在运行，防止重复启动
    if (this.isCollecting || this.isRunning) {
      console.log('[YouTube] Task already running, rejecting new request')
      return { success: false, error: '已有采集任务正在运行，请先停止当前任务' }
    }

    const {
      duration: rawDuration = 60,
      groupName = null,
      allBenchmarkChannels = [],
      groupChannels = [],
      excludedChannelHandles = new Set(),
      onProgress,
      onSave
    } = options
    // 确保 duration 是数字类型
    const duration = Number(rawDuration) || 0

    if (!this.page) {
      return { success: false, error: '浏览器未启动' }
    }

    // 创建频道查找集合（custom_url 去掉 @ 符号后的值）
    const allChannelHandles = new Set(
      allBenchmarkChannels.map(ch => (ch.custom_url || '').replace('@', '').toLowerCase())
    )
    const groupChannelHandles = new Set(
      groupChannels.map(ch => (ch.custom_url || '').replace('@', '').toLowerCase())
    )

    console.log(`[YouTube] Smart browse mode: groupName="${groupName}", allChannels=${allChannelHandles.size}, groupChannels=${groupChannelHandles.size}, excludedChannels=${excludedChannelHandles.size}`)

    this.isCollecting = true
    let collectedCount = 0
    let skippedCount = 0
    let adCount = 0
    let followedCount = 0
    let duplicateCount = 0
    let oldVideoCount = 0
    let watchedCount = 0 // 观看了分组内频道的视频
    let skippedNotInGroupCount = 0 // 跳过了不在分组内的频道
    let excludedCount = 0 // 跳过了排除频道的视频

    // 本次采集会话中已处理的视频ID集合（避免同一视频被重复处理）
    const processedVideoIds = new Set()
    // 本次采集会话中已处理的视频内容集合（基于 title+channel，用于检测页面未完全更新的情况）
    const processedVideoContents = new Set()
    let lastVideoId = ''
    let lastVideoContent = ''  // 格式: title|channelHandle
    let sameVideoCount = 0
    let sameContentCount = 0

    // 时间控制
    const startTime = Date.now()
    const isUnlimited = duration === 0
    const endTime = isUnlimited ? Infinity : startTime + duration * 60 * 1000

    console.log('[YouTube] Starting auto collect, duration:', isUnlimited ? '无限' : duration + ' minutes')

    try {
      while (this.isCollecting && (isUnlimited || Date.now() < endTime)) {
        // 获取当前视频信息
        const result = await this.getCurrentShortsInfo()

        if (!result.success) {
          console.log('[YouTube] Failed to get video info, scrolling to next...')
          await this.scrollToNextShorts()
          skippedCount++
          continue
        }

        const video = result.video

        // 检查视频ID是否有效
        if (!video.videoId) {
          console.log('[YouTube] Invalid video ID, scrolling to next...')
          await this.scrollToNextShorts()
          skippedCount++
          continue
        }

        // 检查是否与上一个视频相同（滚动可能失败）
        if (video.videoId === lastVideoId) {
          sameVideoCount++
          console.log(`[YouTube] Same video detected (${sameVideoCount} times): ${video.videoId}`)
          if (sameVideoCount >= 3) {
            console.log('[YouTube] Stuck on same video, reloading Shorts page...')
            await this.reloadShortsPage()
            sameVideoCount = 0
            sameContentCount = 0
            await this.page.waitForTimeout(3000)
          } else {
            await this.scrollToNextShorts()
          }
          continue
        }

        // 检查内容是否与上一个相同（URL变了但页面内容还没更新）
        const currentContent = `${video.title}|${video.channelHandle}`
        if (currentContent === lastVideoContent && lastVideoContent !== '|') {
          sameContentCount++
          console.log(`[YouTube] Same content detected (${sameContentCount} times), page not fully updated`)
          if (sameContentCount >= 3) {
            console.log('[YouTube] Content stuck, reloading Shorts page...')
            await this.reloadShortsPage()
            sameContentCount = 0
            sameVideoCount = 0
            await this.page.waitForTimeout(3000)
          } else {
            await this.page.waitForTimeout(1000)
          }
          continue
        }

        lastVideoId = video.videoId
        lastVideoContent = currentContent
        sameVideoCount = 0
        sameContentCount = 0

        // 检查本次会话中是否已处理过该视频（基于 videoId）
        if (processedVideoIds.has(video.videoId)) {
          console.log('[YouTube] Video already processed in this session:', video.videoId)
          await this.scrollToNextShorts()
          continue
        }

        // 检查本次会话中是否已处理过相同内容的视频（基于 title+channel）
        // 这可以防止因为页面未完全更新导致的重复采集
        const contentKey = `${video.title}|${video.channelHandle}`
        if (processedVideoContents.has(contentKey) && contentKey !== '|') {
          console.log('[YouTube] Content already processed in this session:', contentKey.slice(0, 50))
          duplicateCount++
          onProgress?.({
            type: 'skipped',
            reason: 'duplicate',
            video,
            stats: { collectedCount, skippedCount, adCount, followedCount, duplicateCount, oldVideoCount }
          })
          await this.scrollToNextShorts()
          continue
        }

        // 标记为已处理
        processedVideoIds.add(video.videoId)
        processedVideoContents.add(contentKey)

        // 检查是否符合采集条件
        if (video.isAd) {
          console.log('[YouTube] Skipping ad video:', video.videoId)
          adCount++
          onProgress?.({
            type: 'skipped',
            reason: 'ad',
            video,
            stats: { collectedCount, skippedCount, adCount, followedCount, duplicateCount, oldVideoCount, watchedCount, skippedNotInGroupCount, excludedCount }
          })
          await this.scrollToNextShorts()
          continue
        }

        // 智能浏览逻辑：根据频道是否在数据库中决定行为
        const channelHandle = (video.channelHandle || '').toLowerCase()
        const isExcluded = excludedChannelHandles.has(channelHandle)
        const isInDatabase = allChannelHandles.has(channelHandle)
        const isInSelectedGroup = groupChannelHandles.has(channelHandle)

        console.log(`[YouTube] Channel "${channelHandle}": excluded=${isExcluded}, inDB=${isInDatabase}, inGroup=${isInSelectedGroup}`)

        // 排除频道 → 立即划走
        if (isExcluded) {
          console.log(`[YouTube] Skipping excluded channel "${channelHandle}" → immediately scroll`)
          excludedCount++
          onProgress?.({
            type: 'skipped',
            reason: 'excluded',
            video,
            stats: { collectedCount, skippedCount, adCount, followedCount, duplicateCount, oldVideoCount, watchedCount, skippedNotInGroupCount, excludedCount }
          })
          await this.scrollToNextShorts()
          continue
        }

        if (isInDatabase) {
          if (isInSelectedGroup && groupName) {
            // 频道在数据库且在选中分组 → 观看视频时长后滑动
            const watchTime = video.videoDurationSeconds || 30 // 默认30秒
            console.log(`[YouTube] Watching video from group channel "${channelHandle}" for ${watchTime}s`)
            watchedCount++
            onProgress?.({
              type: 'watching',
              reason: 'in_group',
              video,
              watchTime,
              stats: { collectedCount, skippedCount, adCount, followedCount, duplicateCount, oldVideoCount, watchedCount, skippedNotInGroupCount, excludedCount }
            })
            // 等待视频时长
            await this.page.waitForTimeout(watchTime * 1000)
            await this.scrollToNextShorts()
            continue
          } else {
            // 频道在数据库但不在选中分组 → 立即滑动
            console.log(`[YouTube] Skipping channel "${channelHandle}" (in DB but not in selected group)`)
            skippedNotInGroupCount++
            onProgress?.({
              type: 'skipped',
              reason: 'not_in_group',
              video,
              stats: { collectedCount, skippedCount, adCount, followedCount, duplicateCount, oldVideoCount, watchedCount, skippedNotInGroupCount, excludedCount }
            })
            await this.scrollToNextShorts()
            continue
          }
        }

        // 频道不在数据库 → 可以采集
        // 但还需要检查其他条件

        if (video.isFollowed) {
          console.log('[YouTube] Skipping followed channel:', video.channelHandle)
          followedCount++
          // 不在数据库的频道，等待3-8秒后滑动
          const waitTime = 3000 + Math.random() * 5000
          onProgress?.({
            type: 'waiting',
            reason: 'new_channel_followed',
            video,
            waitTime,
            stats: { collectedCount, skippedCount, adCount, followedCount, duplicateCount, oldVideoCount, watchedCount, skippedNotInGroupCount, excludedCount }
          })
          console.log(`[YouTube] Waiting ${Math.round(waitTime / 1000)}s before scrolling (new channel, followed)`)
          await this.page.waitForTimeout(waitTime)
          await this.scrollToNextShorts()
          continue
        }

        // 检查视频发布时间是否超过4个月
        if (isOlderThanMonths(video.publishDate, 4)) {
          console.log('[YouTube] Skipping old video (>4 months):', video.publishDate, video.videoId)
          oldVideoCount++
          // 不在数据库的频道，等待3-8秒后滑动
          const waitTime = 3000 + Math.random() * 5000
          onProgress?.({
            type: 'waiting',
            reason: 'new_channel_old_video',
            video,
            waitTime,
            stats: { collectedCount, skippedCount, adCount, followedCount, duplicateCount, oldVideoCount, watchedCount, skippedNotInGroupCount, excludedCount }
          })
          console.log(`[YouTube] Waiting ${Math.round(waitTime / 1000)}s before scrolling (new channel, old video)`)
          await this.page.waitForTimeout(waitTime)
          await this.scrollToNextShorts()
          continue
        }

        // 符合条件，保存视频
        video.collectedAt = new Date().toISOString()

        // 调用保存回调
        const saveResult = onSave?.(video)

        if (saveResult === false) {
          // 视频已存在
          console.log('[YouTube] Video already collected:', video.videoId)
          duplicateCount++
          onProgress?.({
            type: 'skipped',
            reason: 'duplicate',
            video,
            stats: { collectedCount, skippedCount, adCount, followedCount, duplicateCount, oldVideoCount, watchedCount, skippedNotInGroupCount, excludedCount }
          })
        } else {
          // 保存成功
          collectedCount++
          const elapsedMinutes = Math.floor((Date.now() - startTime) / 60000)
          console.log(`[YouTube] Collected video ${collectedCount} (${elapsedMinutes}/${duration}分钟):`, video.title)
          onProgress?.({
            type: 'collected',
            video,
            stats: { collectedCount, skippedCount, adCount, followedCount, duplicateCount, oldVideoCount, watchedCount, skippedNotInGroupCount, excludedCount }
          })
        }

        // 不在数据库的频道，等待3-8秒后滑动
        const waitTime = 3000 + Math.random() * 5000
        onProgress?.({
          type: 'waiting',
          reason: 'new_channel',
          video,
          waitTime,
          stats: { collectedCount, skippedCount, adCount, followedCount, duplicateCount, oldVideoCount, watchedCount, skippedNotInGroupCount, excludedCount }
        })
        console.log(`[YouTube] Waiting ${Math.round(waitTime / 1000)}s before scrolling (new channel)`)
        await this.page.waitForTimeout(waitTime)
        await this.scrollToNextShorts()
      }

      this.isCollecting = false
      const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000)
      const elapsedMinutes = Math.floor(elapsedSeconds / 60)
      console.log(`[YouTube] Auto collect finished. Collected: ${collectedCount}, Watched: ${watchedCount}, SkippedNotInGroup: ${skippedNotInGroupCount}, Elapsed: ${elapsedMinutes} minutes`)

      return {
        success: true,
        collected: collectedCount,
        skipped: skippedCount,
        adCount,
        followedCount,
        duplicateCount,
        oldVideoCount,
        watchedCount,
        skippedNotInGroupCount,
        elapsedSeconds,
        elapsedMinutes
      }

    } catch (error) {
      this.isCollecting = false
      const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000)
      console.error('[YouTube] Auto collect error:', error)
      return { success: false, error: error.message, elapsedSeconds }
    }
  }

  /**
   * 停止自动采集
   */
  stopAutoCollect() {
    this.isCollecting = false
    console.log('[YouTube] Auto collect stopped')
    return { success: true, message: '采集已停止' }
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
      const videoInfo = await this.page.evaluate(() => {
        // 获取当前页面的视频信息
        const url = window.location.href

        // 如果在视频播放页
        if (url.includes('/watch')) {
          const title = document.querySelector('h1.ytd-video-primary-info-renderer')?.textContent?.trim() ||
                       document.querySelector('h1.title')?.textContent?.trim() || ''

          const channelName = document.querySelector('#channel-name a')?.textContent?.trim() ||
                             document.querySelector('ytd-channel-name a')?.textContent?.trim() || ''

          const viewCount = document.querySelector('#count .view-count')?.textContent?.trim() || ''

          const publishDate = document.querySelector('#info-strings yt-formatted-string')?.textContent?.trim() || ''

          const videoId = new URLSearchParams(window.location.search).get('v') || ''

          return {
            videoId,
            title,
            channelName,
            viewCount,
            publishDate,
            videoUrl: videoId ? `https://www.youtube.com/watch?v=${videoId}` : url
          }
        }

        return null
      })

      if (videoInfo) {
        console.log('[YouTube] Got video info:', videoInfo.title)
        return { success: true, video: videoInfo }
      } else {
        return { success: false, error: '当前页面不是视频播放页' }
      }

    } catch (error) {
      console.error('[YouTube] Failed to get video info:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * 获取首页推荐视频列表
   * @returns {Promise<Object>} 视频列表
   */
  async getHomeVideoList() {
    if (!this.page) {
      return { success: false, error: '浏览器未启动' }
    }

    try {
      console.log('[YouTube] Getting home video list...')

      // 等待视频列表加载
      await this.page.waitForSelector('ytd-rich-item-renderer', { timeout: 10000 }).catch(() => null)

      const videos = await this.page.evaluate(() => {
        const videoElements = document.querySelectorAll('ytd-rich-item-renderer')
        const results = []

        videoElements.forEach((el, index) => {
          if (index >= 20) return // 最多获取20个

          const titleEl = el.querySelector('#video-title')
          const channelEl = el.querySelector('#channel-name a, ytd-channel-name a')
          const viewsEl = el.querySelector('#metadata-line span:first-child')
          const timeEl = el.querySelector('#metadata-line span:last-child')
          const thumbnailEl = el.querySelector('img#img')
          const linkEl = el.querySelector('a#thumbnail')

          const href = linkEl?.getAttribute('href') || ''
          const videoId = href.match(/v=([^&]+)/)?.[1] || ''

          if (videoId) {
            results.push({
              videoId,
              title: titleEl?.textContent?.trim() || '',
              channelName: channelEl?.textContent?.trim() || '',
              viewCount: viewsEl?.textContent?.trim() || '',
              publishTime: timeEl?.textContent?.trim() || '',
              thumbnail: thumbnailEl?.src || '',
              videoUrl: videoId ? `https://www.youtube.com/watch?v=${videoId}` : ''
            })
          }
        })

        return results
      })

      console.log(`[YouTube] Found ${videos.length} videos on homepage`)
      return { success: true, videos, count: videos.length }

    } catch (error) {
      console.error('[YouTube] Failed to get home video list:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * 滚动页面加载更多视频
   * @returns {Promise<Object>} 操作结果
   */
  async scrollToLoadMore() {
    if (!this.page) {
      return { success: false, error: '浏览器未启动' }
    }

    try {
      // 滚动到页面底部
      await this.page.evaluate(() => {
        window.scrollBy(0, window.innerHeight * 2)
      })
      await this.page.waitForTimeout(2000)

      console.log('[YouTube] Scrolled to load more videos')
      return { success: true }
    } catch (error) {
      console.error('[YouTube] Failed to scroll:', error)
      return { success: false, error: error.message }
    }
  }

  /**
   * 采集视频信息
   * @param {Function} progressCallback - 进度回调
   * @param {Object} options - 选项
   * @returns {Promise<Object>} 采集结果
   */
  async collectVideos(progressCallback, options = {}) {
    if (!this.page) {
      return { success: false, error: '浏览器未启动' }
    }

    const { maxCount = 20 } = options
    this.isRunning = true
    this.collectedVideos = []

    try {
      console.log('[YouTube] Starting video collection...')

      // 确保在 YouTube 首页
      const currentUrl = this.page.url()
      if (!currentUrl.includes('youtube.com')) {
        await this.page.goto('https://www.youtube.com/', {
          waitUntil: 'domcontentloaded',
          timeout: 30000
        })
        await this.page.waitForTimeout(3000)
      }

      // 获取视频列表
      let scrollCount = 0
      const maxScrolls = 5

      while (this.isRunning && this.collectedVideos.length < maxCount && scrollCount < maxScrolls) {
        if (progressCallback) {
          progressCallback({
            type: 'processing',
            operation: `正在获取视频列表...`,
            current: this.collectedVideos.length
          })
        }

        const result = await this.getHomeVideoList()

        if (result.success && result.videos) {
          for (const video of result.videos) {
            // 检查是否已采集
            const exists = this.collectedVideos.some(v => v.videoId === video.videoId)
            if (!exists && this.collectedVideos.length < maxCount) {
              video.collectedAt = new Date().toISOString()
              this.collectedVideos.push(video)

              if (progressCallback) {
                progressCallback({
                  type: 'collected',
                  current: this.collectedVideos.length,
                  video
                })
              }
            }
          }
        }

        if (this.collectedVideos.length < maxCount) {
          await this.scrollToLoadMore()
          scrollCount++
        }
      }

      console.log(`[YouTube] Collection finished. Collected: ${this.collectedVideos.length}`)

      return {
        success: true,
        videos: this.collectedVideos,
        collected: this.collectedVideos.length
      }

    } catch (error) {
      console.error('[YouTube] Collection failed:', error)
      return {
        success: false,
        error: error.message,
        videos: this.collectedVideos,
        collected: this.collectedVideos.length
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
    console.log('[YouTube] Collection stopped by user')
    return { success: true, message: '采集已停止' }
  }

  /**
   * 关闭浏览器连接
   * @returns {Promise<Object>} 操作结果
   */
  async closeBrowser() {
    try {
      // 根据浏览器类型调用相应的 API 关闭浏览器
      if (this.currentBrowserId && this.currentBrowserType === 'hubstudio') {
        try {
          await this.client.post(`${this.apiUrl}/api/v1/browser/stop`, {
            containerCode: String(this.currentBrowserId)
          })
          console.log('[YouTube] HubStudio browser stopped via API')
        } catch (e) {
          console.log('[YouTube] Failed to stop HubStudio browser via API:', e.message)
        }
      }
      // 注意：BitBrowser 的关闭通过 IPC handler 处理

      if (this.browser) {
        await this.browser.close().catch(() => {})
        console.log('[YouTube] Disconnected from browser')
      }

      this.browser = null
      this.context = null
      this.page = null
      this.currentBrowserId = null
      this.currentBrowserType = null

      return { success: true, message: '浏览器已关闭' }
    } catch (error) {
      console.error('[YouTube] Failed to close browser:', error)
      this.browser = null
      this.context = null
      this.page = null
      this.currentBrowserId = null
      this.currentBrowserType = null
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
      isCollecting: this.isCollecting || this.isRunning,
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
}

// 单例导出
const youtubeService = new YouTubeService()
module.exports = youtubeService
