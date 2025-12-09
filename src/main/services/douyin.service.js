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

      return {
        success: true,
        message: '浏览器启动成功'
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
