const { chromium } = require('playwright-core')
const path = require('path')
const os = require('os')
const fs = require('fs')
const { exec, spawn } = require('child_process')

// 远程调试端口
const REMOTE_DEBUGGING_PORT = 9222

class DouyinService {
  constructor() {
    this.browser = null
    this.context = null
    this.page = null
    this.isRunning = false
    this.collectedVideos = []
    this.currentProfile = null
    this.chromeProcess = null
  }

  /**
   * 获取 Chrome 用户数据目录
   * @returns {string} Chrome 用户数据目录路径
   */
  getChromeUserDataDir() {
    const platform = process.platform
    const homeDir = os.homedir()

    if (platform === 'win32') {
      return path.join(homeDir, 'AppData', 'Local', 'Google', 'Chrome', 'User Data')
    } else if (platform === 'darwin') {
      return path.join(homeDir, 'Library', 'Application Support', 'Google', 'Chrome')
    } else {
      return path.join(homeDir, '.config', 'google-chrome')
    }
  }

  /**
   * 获取 Chrome 可执行文件路径
   * @returns {string} Chrome 可执行文件路径
   */
  getChromePath() {
    const platform = process.platform

    if (platform === 'win32') {
      // Windows 上常见的 Chrome 路径
      const possiblePaths = [
        path.join(process.env['PROGRAMFILES'], 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(process.env['PROGRAMFILES(X86)'] || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
        path.join(os.homedir(), 'AppData', 'Local', 'Google', 'Chrome', 'Application', 'chrome.exe')
      ]

      for (const chromePath of possiblePaths) {
        if (fs.existsSync(chromePath)) {
          return chromePath
        }
      }
    } else if (platform === 'darwin') {
      return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
    } else {
      return '/usr/bin/google-chrome'
    }

    return null
  }

  /**
   * 检测远程调试端口是否可用
   * @returns {Promise<Object>} 检测结果
   */
  async checkDebugPort() {
    return new Promise((resolve) => {
      const http = require('http')

      const req = http.get(`http://127.0.0.1:${REMOTE_DEBUGGING_PORT}/json/version`, (res) => {
        let data = ''
        res.on('data', chunk => data += chunk)
        res.on('end', () => {
          try {
            const info = JSON.parse(data)
            console.log('[Douyin] Chrome debug port available:', info.Browser)
            resolve({
              available: true,
              browser: info.Browser,
              webSocketDebuggerUrl: info.webSocketDebuggerUrl,
              message: `Chrome 调试模式已就绪 (${info.Browser})`
            })
          } catch (e) {
            resolve({
              available: false,
              message: '无法解析 Chrome 调试信息'
            })
          }
        })
      })

      req.on('error', () => {
        resolve({
          available: false,
          message: `Chrome 调试端口 ${REMOTE_DEBUGGING_PORT} 未开启`
        })
      })

      req.setTimeout(3000, () => {
        req.destroy()
        resolve({
          available: false,
          message: '连接超时'
        })
      })
    })
  }

  /**
   * 检测 Chrome 是否正在运行（同时检测调试模式）
   * @returns {Promise<Object>} 检测结果
   */
  async checkChromeRunning() {
    // 首先检查远程调试端口
    const debugStatus = await this.checkDebugPort()

    if (debugStatus.available) {
      return {
        running: true,
        debugMode: true,
        message: debugStatus.message,
        webSocketDebuggerUrl: debugStatus.webSocketDebuggerUrl
      }
    }

    // 检查普通 Chrome 进程
    return new Promise((resolve) => {
      const platform = process.platform

      let command
      if (platform === 'win32') {
        // 使用 tasklist 更可靠地检测
        command = 'tasklist /FI "IMAGENAME eq chrome.exe" /NH'
      } else if (platform === 'darwin') {
        command = 'pgrep -x "Google Chrome"'
      } else {
        command = 'pgrep -x chrome'
      }

      exec(command, (error, stdout, stderr) => {
        if (platform === 'win32') {
          const output = stdout.trim().toLowerCase()
          // tasklist 如果没有找到进程会返回 "信息: 没有运行的任务匹配指定标准" 或 "INFO: No tasks"
          const isRunning = output.includes('chrome.exe')

          console.log('[Douyin] Chrome check (tasklist) - output:', output.substring(0, 100))
          console.log('[Douyin] Chrome check - isRunning:', isRunning, 'debugMode: false')

          resolve({
            running: isRunning,
            debugMode: false,
            message: isRunning
              ? 'Chrome 正在运行（非调试模式）- 请先关闭 Chrome，然后点击"启动调试模式"'
              : 'Chrome 未运行 - 请点击"启动调试模式"按钮'
          })
        } else {
          const isRunning = !error && stdout.trim().length > 0
          resolve({
            running: isRunning,
            debugMode: false,
            message: isRunning
              ? 'Chrome 正在运行（非调试模式）- 请先关闭 Chrome'
              : 'Chrome 未运行 - 请点击"启动调试模式"按钮'
          })
        }
      })
    })
  }

  /**
   * 强制关闭所有 Chrome 进程
   * @returns {Promise<Object>} 操作结果
   */
  async killAllChrome() {
    return new Promise((resolve) => {
      const platform = process.platform

      let command
      if (platform === 'win32') {
        command = 'taskkill /F /IM chrome.exe /T 2>nul'
      } else if (platform === 'darwin') {
        command = 'pkill -9 "Google Chrome"'
      } else {
        command = 'pkill -9 chrome'
      }

      console.log('[Douyin] Killing all Chrome processes...')

      exec(command, (error, stdout, stderr) => {
        // 等待一下让进程完全退出
        setTimeout(() => {
          console.log('[Douyin] Chrome kill command executed')
          resolve({
            success: true,
            message: '已尝试关闭所有 Chrome 进程'
          })
        }, 1000)
      })
    })
  }

  /**
   * 获取所有 Chrome 配置文件
   * @returns {Promise<Array>} 配置文件列表
   */
  async getChromeProfiles() {
    const userDataDir = this.getChromeUserDataDir()
    const profiles = []

    try {
      // 读取 Local State 文件获取配置文件信息
      const localStatePath = path.join(userDataDir, 'Local State')

      if (fs.existsSync(localStatePath)) {
        const localState = JSON.parse(fs.readFileSync(localStatePath, 'utf8'))
        const profileInfo = localState.profile?.info_cache || {}

        for (const [profileDir, info] of Object.entries(profileInfo)) {
          const profilePath = path.join(userDataDir, profileDir)

          // 检查配置文件目录是否存在
          if (fs.existsSync(profilePath)) {
            profiles.push({
              id: profileDir,
              name: info.name || profileDir,
              shortcutName: info.shortcut_name || info.name || profileDir,
              path: profilePath,
              isDefault: profileDir === 'Default',
              avatarIcon: info.avatar_icon || null,
              gaiaName: info.gaia_name || null,
              userName: info.user_name || null,
              lastActive: info.active_time || null
            })
          }
        }
      }

      // 如果没有从 Local State 获取到，尝试直接扫描目录
      if (profiles.length === 0) {
        const entries = fs.readdirSync(userDataDir, { withFileTypes: true })

        for (const entry of entries) {
          if (entry.isDirectory()) {
            // Chrome 配置文件夹通常是 "Default" 或 "Profile X"
            if (entry.name === 'Default' || entry.name.startsWith('Profile ')) {
              const prefsPath = path.join(userDataDir, entry.name, 'Preferences')

              if (fs.existsSync(prefsPath)) {
                try {
                  const prefs = JSON.parse(fs.readFileSync(prefsPath, 'utf8'))
                  profiles.push({
                    id: entry.name,
                    name: prefs.profile?.name || entry.name,
                    path: path.join(userDataDir, entry.name),
                    isDefault: entry.name === 'Default'
                  })
                } catch (e) {
                  profiles.push({
                    id: entry.name,
                    name: entry.name,
                    path: path.join(userDataDir, entry.name),
                    isDefault: entry.name === 'Default'
                  })
                }
              }
            }
          }
        }
      }

      // 按名称排序，Default 排第一
      profiles.sort((a, b) => {
        if (a.isDefault) return -1
        if (b.isDefault) return 1
        return a.name.localeCompare(b.name)
      })

      console.log('[Douyin] Found Chrome profiles:', profiles.map(p => p.name))
      return profiles

    } catch (error) {
      console.error('[Douyin] Failed to get Chrome profiles:', error)
      return []
    }
  }

  /**
   * 启动 Chrome 调试模式
   * @param {string} profileId - 配置文件ID（如 "Default" 或 "Profile 1"）
   * @returns {Promise<Object>} 启动结果
   */
  async startChromeDebugMode(profileId = 'Default') {
    console.log('[Douyin] Starting Chrome in debug mode with profile:', profileId)

    // 检查是否已经有调试模式的 Chrome 在运行
    const debugStatus = await this.checkDebugPort()
    if (debugStatus.available) {
      return {
        success: true,
        message: 'Chrome 调试模式已在运行',
        alreadyRunning: true
      }
    }

    // 检查是否有普通 Chrome 在运行
    const chromeStatus = await this.checkChromeRunning()
    if (chromeStatus.running && !chromeStatus.debugMode) {
      return {
        success: false,
        error: '检测到 Chrome 正在运行（非调试模式）。请先完全关闭所有 Chrome 窗口和后台进程，然后再启动调试模式。',
        needCloseChrome: true
      }
    }

    // 获取 Chrome 路径
    const chromePath = this.getChromePath()
    if (!chromePath) {
      return {
        success: false,
        error: '找不到 Chrome 浏览器，请确保已安装 Google Chrome'
      }
    }

    console.log('[Douyin] Chrome path:', chromePath)

    const userDataDir = this.getChromeUserDataDir()

    // 构建启动参数
    const args = [
      `--remote-debugging-port=${REMOTE_DEBUGGING_PORT}`,
      `--user-data-dir=${userDataDir}`,
      `--profile-directory=${profileId}`,
      '--no-first-run',
      '--no-default-browser-check'
    ]

    console.log('[Douyin] Starting Chrome with args:', args)

    return new Promise((resolve) => {
      try {
        // 使用 spawn 启动 Chrome（不等待进程结束）
        this.chromeProcess = spawn(chromePath, args, {
          detached: true,
          stdio: 'ignore'
        })

        this.chromeProcess.unref()

        // 等待调试端口可用
        let attempts = 0
        const maxAttempts = 20
        const checkInterval = setInterval(async () => {
          attempts++
          const status = await this.checkDebugPort()

          if (status.available) {
            clearInterval(checkInterval)
            console.log('[Douyin] Chrome debug mode started successfully')
            resolve({
              success: true,
              message: 'Chrome 调试模式启动成功',
              profile: profileId
            })
          } else if (attempts >= maxAttempts) {
            clearInterval(checkInterval)
            console.error('[Douyin] Timeout waiting for debug port')
            resolve({
              success: false,
              error: '等待 Chrome 调试端口超时，请重试'
            })
          }
        }, 500)

      } catch (error) {
        console.error('[Douyin] Failed to start Chrome:', error)
        resolve({
          success: false,
          error: `启动 Chrome 失败: ${error.message}`
        })
      }
    })
  }

  /**
   * 连接到已运行的 Chrome 浏览器（使用远程调试）
   * @param {string} profileId - 配置文件ID（仅用于记录）
   * @returns {Promise<Object>} 连接结果
   */
  async launchBrowser(profileId = 'Default') {
    console.log('[Douyin] launchBrowser (connect mode) called')

    if (this.browser) {
      console.log('[Douyin] Already connected to browser')
      return { success: true, message: '已连接到浏览器', profile: this.currentProfile }
    }

    try {
      // 检查调试端口是否可用
      const debugStatus = await this.checkDebugPort()

      if (!debugStatus.available) {
        return {
          success: false,
          error: 'Chrome 调试模式未启动。请先点击"启动调试模式"按钮启动 Chrome。',
          needStartDebugMode: true
        }
      }

      console.log('[Douyin] Connecting to Chrome via CDP...')

      // 使用 CDP 连接到运行中的 Chrome
      this.browser = await chromium.connectOverCDP(`http://127.0.0.1:${REMOTE_DEBUGGING_PORT}`)

      console.log('[Douyin] Connected to Chrome successfully')

      // 获取默认上下文
      const contexts = this.browser.contexts()
      this.context = contexts.length > 0 ? contexts[0] : await this.browser.newContext()

      // 获取或创建页面
      const pages = this.context.pages()
      this.page = pages.length > 0 ? pages[0] : await this.context.newPage()
      this.currentProfile = profileId

      console.log('[Douyin] Browser connected successfully')

      return {
        success: true,
        message: '已连接到 Chrome 浏览器',
        profile: profileId
      }

    } catch (error) {
      console.error('[Douyin] Failed to connect to browser:', error)
      console.error('[Douyin] Error message:', error.message)

      // 清理状态
      this.browser = null
      this.context = null
      this.page = null
      this.currentProfile = null

      if (error.message.includes('connect')) {
        return {
          success: false,
          error: '无法连接到 Chrome。请确保 Chrome 已使用调试模式启动。',
          needStartDebugMode: true
        }
      }

      return { success: false, error: `连接失败: ${error.message}` }
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

      // 检查是否需要登录
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
   * 断开与浏览器的连接（不关闭 Chrome）
   * @returns {Promise<Object>} 操作结果
   */
  async closeBrowser() {
    try {
      if (this.browser) {
        // 断开连接（不关闭 Chrome，用户可以继续使用）
        await this.browser.close()
        console.log('[Douyin] Disconnected from browser')
      }

      this.browser = null
      this.context = null
      this.page = null
      this.currentProfile = null

      return { success: true, message: '已断开浏览器连接' }
    } catch (error) {
      console.error('[Douyin] Failed to disconnect browser:', error)
      // 即使出错也重置状态
      this.browser = null
      this.context = null
      this.page = null
      this.currentProfile = null
      return { success: false, error: error.message }
    }
  }

  /**
   * 获取服务状态
   * @returns {Object} 状态信息
   */
  getStatus() {
    return {
      browserRunning: !!this.context,
      isCollecting: this.isRunning,
      collectedCount: this.collectedVideos.length,
      currentProfile: this.currentProfile
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
const douyinService = new DouyinService()
module.exports = douyinService
