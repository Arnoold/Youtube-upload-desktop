const { chromium } = require('playwright-core')

class PlaywrightService {
  constructor() {
    this.browsers = new Map() // 存储浏览器实例
  }

  /**
   * 连接到比特浏览器
   * @param {string} wsEndpoint - WebSocket连接地址
   * @returns {Promise<Object>} 浏览器和页面对象
   */
  async connectBrowser(wsEndpoint) {
    try {
      console.log('Connecting to browser via CDP:', wsEndpoint)

      const browser = await chromium.connectOverCDP(wsEndpoint)
      const context = browser.contexts()[0]
      const page = context.pages()[0] || await context.newPage()

      const browserId = Date.now().toString()
      this.browsers.set(browserId, { browser, context, page })

      console.log('Successfully connected to browser:', browserId)

      return { browserId, browser, context, page }
    } catch (error) {
      console.error('Failed to connect to browser:', error)
      throw new Error(`连接浏览器失败: ${error.message}`)
    }
  }

  /**
   * 断开浏览器连接
   * @param {string} browserId - 浏览器ID
   */
  async disconnectBrowser(browserId) {
    const browserInfo = this.browsers.get(browserId)
    if (browserInfo) {
      try {
        await browserInfo.browser.close()
        this.browsers.delete(browserId)
        console.log('Browser disconnected:', browserId)
      } catch (error) {
        console.error('Error disconnecting browser:', error)
      }
    }
  }

  /**
   * 检查 YouTube 登录状态
   * @param {Object} page - Playwright Page 对象
   * @returns {Promise<Object>} 登录状态
   */
  async checkYouTubeLogin(page) {
    try {
      console.log('Checking YouTube login status...')

      await page.goto('https://studio.youtube.com', {
        waitUntil: 'networkidle',
        timeout: 30000
      })

      // 等待页面加载
      await page.waitForTimeout(3000)

      // 检查是否在登录页面
      const currentUrl = page.url()
      const isLoginPage = currentUrl.includes('accounts.google.com')

      if (isLoginPage) {
        console.log('Not logged in - on Google login page')
        return {
          isLoggedIn: false,
          needManualLogin: true,
          message: '需要登录 YouTube 账号'
        }
      }

      // 检查是否能看到 YouTube Studio 界面
      // 这里需要根据实际页面调整选择器
      const isStudioPage = currentUrl.includes('studio.youtube.com')

      console.log(`Login check result: ${isStudioPage ? 'Logged in' : 'Not logged in'}`)

      return {
        isLoggedIn: isStudioPage,
        needManualLogin: !isStudioPage,
        message: isStudioPage ? '已登录' : '未登录'
      }
    } catch (error) {
      console.error('Error checking YouTube login:', error)
      return {
        isLoggedIn: false,
        error: error.message,
        message: '检查登录状态失败'
      }
    }
  }

  /**
   * 上传视频到 YouTube
   * @param {Object} page - Playwright Page 对象
   * @param {Object} options - 上传选项
   * @param {Function} progressCallback - 进度回调
   * @returns {Promise<Object>} 上传结果
   */
  async uploadVideo(page, options, progressCallback) {
    const {
      videoPath,
      title,
      description = '',
      tags = [],
      privacy = 'public',
      thumbnail = null,
      madeForKids = false,
      channelId = null
    } = options

    try {
      // Step 1: 导航到上传页面
      progressCallback({ step: 1, progress: 10, message: '正在打开上传页面...' })
      console.log('Navigating to upload page...')

      const uploadUrl = channelId
        ? `https://studio.youtube.com/channel/${channelId}/videos/upload`
        : 'https://studio.youtube.com/channel/upload'

      await page.goto(uploadUrl, { waitUntil: 'networkidle', timeout: 30000 })
      await page.waitForTimeout(2000)

      // Step 2: 上传视频文件
      progressCallback({ step: 2, progress: 20, message: '正在上传视频文件...' })
      console.log('Uploading video file:', videoPath)

      // 查找文件上传input
      const fileInput = await page.locator('input[type="file"]').first()
      await fileInput.setInputFiles(videoPath)

      // 等待上传开始 - 等待标题输入框出现
      await page.waitForSelector('#textbox', { timeout: 60000 })
      await page.waitForTimeout(3000)

      // Step 3: 填写标题
      progressCallback({ step: 3, progress: 30, message: '正在填写视频信息...' })
      console.log('Filling in title:', title)

      const titleInput = await page.locator('#textbox').first()
      await titleInput.click()
      await titleInput.fill('')
      await this.typeHumanLike(titleInput, title)

      // Step 4: 填写描述
      if (description) {
        console.log('Filling in description')
        const descriptionBox = await page.locator('#textbox').nth(1)
        await descriptionBox.click()
        await descriptionBox.fill('')
        await this.typeHumanLike(descriptionBox, description)
      }

      // Step 5: 设置"是否为儿童内容"
      progressCallback({ step: 4, progress: 40, message: '设置视频选项...' })
      console.log('Setting made for kids:', madeForKids)

      await page.waitForTimeout(1000)

      const kidsRadio = madeForKids
        ? 'tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_MFK"]'
        : 'tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]'

      await page.click(kidsRadio)

      // Step 6: 点击"下一步" - 详细信息
      progressCallback({ step: 5, progress: 50, message: '进入详细设置...' })
      console.log('Clicking next button (1/3)')

      await page.click('#next-button')
      await page.waitForTimeout(2000)

      // Step 7: 上传缩略图（如果有）
      if (thumbnail) {
        console.log('Uploading thumbnail:', thumbnail)
        try {
          const thumbnailInput = await page.locator('input[type="file"]').nth(1)
          await thumbnailInput.setInputFiles(thumbnail)
          await page.waitForTimeout(2000)
        } catch (error) {
          console.error('Failed to upload thumbnail:', error)
        }
      }

      // Step 8: 点击"下一步" - 视频元素
      console.log('Clicking next button (2/3)')
      await page.click('#next-button')
      await page.waitForTimeout(2000)

      // Step 9: 点击"下一步" - 检查
      progressCallback({ step: 6, progress: 60, message: '等待 YouTube 检查...' })
      console.log('Clicking next button (3/3)')

      await page.click('#next-button')

      // 等待 YouTube 检查完成
      console.log('Waiting for YouTube checks to complete...')
      await page.waitForTimeout(5000)

      // Step 10: 设置隐私选项
      progressCallback({ step: 7, progress: 70, message: '设置发布选项...' })
      console.log('Setting privacy to:', privacy)

      const privacyMap = {
        'public': 'PUBLIC',
        'unlisted': 'UNLISTED',
        'private': 'PRIVATE'
      }

      const privacyButton = `tp-yt-paper-radio-button[name="${privacyMap[privacy]}"]`
      await page.click(privacyButton)
      await page.waitForTimeout(1000)

      // Step 11: 发布视频
      progressCallback({ step: 8, progress: 80, message: '正在发布视频...' })
      console.log('Publishing video...')

      await page.click('#done-button')

      // Step 12: 等待发布完成并获取视频链接
      progressCallback({ step: 9, progress: 90, message: '获取视频链接...' })
      console.log('Waiting for video URL...')

      await page.waitForSelector('a[href*="youtube.com/watch"]', { timeout: 30000 })
      const videoLink = await page.locator('a[href*="youtube.com/watch"]').first()
      const videoUrl = await videoLink.getAttribute('href')
      const videoId = this.extractVideoId(videoUrl)

      progressCallback({ step: 10, progress: 100, message: '上传完成！' })
      console.log('Upload completed successfully:', videoId)

      return {
        success: true,
        videoId,
        videoUrl: `https://www.youtube.com/watch?v=${videoId}`,
        studioUrl: `https://studio.youtube.com/video/${videoId}/edit`
      }

    } catch (error) {
      console.error('Upload failed:', error)
      throw new Error(`上传失败: ${error.message}`)
    }
  }

  /**
   * 模拟真人输入
   * @param {Object} element - Playwright Locator
   * @param {string} text - 要输入的文本
   */
  async typeHumanLike(element, text) {
    for (const char of text) {
      await element.type(char, {
        delay: Math.random() * 100 + 50 // 50-150ms 随机延迟
      })
    }
  }

  /**
   * 从 URL 提取视频 ID
   * @param {string} url - YouTube URL
   * @returns {string|null} 视频 ID
   */
  extractVideoId(url) {
    const match = url.match(/[?&]v=([^&]+)/)
    return match ? match[1] : null
  }

  /**
   * 关闭所有浏览器连接
   */
  async closeAll() {
    for (const [browserId, browserInfo] of this.browsers) {
      try {
        await browserInfo.browser.close()
        console.log('Closed browser:', browserId)
      } catch (error) {
        console.error('Error closing browser:', browserId, error)
      }
    }
    this.browsers.clear()
  }
}

module.exports = PlaywrightService
