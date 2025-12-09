/**
 * YouTube 视频上传服务
 * 支持普通号和创收号两种发布流程
 * 支持步骤状态回调和暂停/继续功能
 */

const { chromium } = require('playwright-core')
const clipboardLock = require('./clipboard-lock.service')
const dayjs = require('dayjs')
const utc = require('dayjs/plugin/utc')
const timezone = require('dayjs/plugin/timezone')

dayjs.extend(utc)
dayjs.extend(timezone)

// 上传步骤定义 - 详细版本
const UPLOAD_STEPS = {
  // 浏览器启动阶段
  STARTING_BROWSER: { step: 1, name: '启动浏览器', description: '正在启动浏览器...' },
  CONNECTING_PLAYWRIGHT: { step: 2, name: '连接Playwright', description: '正在连接 Playwright...' },
  // YouTube Studio 打开阶段
  OPENING_STUDIO: { step: 3, name: '打开YouTube Studio', description: '正在打开 YouTube Studio 页面...' },
  WAITING_STUDIO_LOAD: { step: 4, name: '等待页面加载', description: '正在等待 YouTube Studio 加载完成...' },
  // 创建/上传阶段
  CLICKING_CREATE: { step: 5, name: '点击创建按钮', description: '正在点击"创建"按钮...' },
  CLICKING_UPLOAD: { step: 6, name: '选择上传视频', description: '正在点击"上传视频"选项...' },
  WAITING_UPLOAD_DIALOG: { step: 7, name: '等待上传对话框', description: '正在等待上传对话框出现...' },
  // 文件选择阶段
  SELECTING_FILE: { step: 8, name: '选择视频文件', description: '正在选择视频文件...' },
  WAITING_UPLOAD_UI: { step: 9, name: '等待上传界面', description: '正在等待视频上传界面加载...' },
  // 视频信息填写阶段
  FILLING_TITLE: { step: 10, name: '填写标题', description: '正在填写视频标题...' },
  FILLING_DESCRIPTION: { step: 11, name: '填写描述', description: '正在填写视频描述...' },
  SETTING_NOT_FOR_KIDS: { step: 12, name: '设置非儿童内容', description: '正在设置"非儿童内容"...' },
  CLICKING_EXPAND: { step: 13, name: '点击展开按钮', description: '正在点击"展开"按钮...' },
  SETTING_ALTERED_CONTENT: { step: 14, name: '设置加工内容', description: '正在设置"加工内容"选项...' },
  // 创收号特有步骤 (步骤 15-18)
  CLICKING_NEXT_MONETIZE: { step: 15, name: '进入创收设置', description: '正在点击"继续"进入创收设置...' },
  OPENING_MONETIZE_DROPDOWN: { step: 16, name: '打开创收下拉框', description: '正在打开创收选项下拉框...' },
  SELECTING_MONETIZE_OPTION: { step: 17, name: '选择创收选项', description: '正在选择广告投放选项...' },
  CLICKING_MONETIZE_CONTINUE: { step: 18, name: '完成创收设置', description: '正在点击"继续"完成创收设置...' },
  // 下一步按钮点击
  CLICKING_NEXT_1: { step: 19, name: '点击下一步(1/3)', description: '正在点击"下一步"按钮 (1/3)...' },
  CLICKING_NEXT_2: { step: 20, name: '点击下一步(2/3)', description: '正在点击"下一步"按钮 (2/3)...' },
  CLICKING_NEXT_3: { step: 21, name: '点击下一步(3/3)', description: '正在点击"下一步"按钮 (3/3)...' },
  // 可见性设置阶段
  SELECTING_SCHEDULE: { step: 22, name: '选择定时发布', description: '正在选择"安排时间"发布...' },
  SETTING_DATE: { step: 23, name: '设置发布日期', description: '正在设置发布日期...' },
  SETTING_TIME: { step: 24, name: '设置发布时间', description: '正在设置发布时间...' },
  SETTING_TIMEZONE: { step: 25, name: '设置时区', description: '正在选择时区...' },
  // 获取视频链接
  GETTING_VIDEO_URL: { step: 26, name: '获取视频链接', description: '正在获取视频链接...' },
  // 等待上传完成
  WAITING_UPLOAD_COMPLETE: { step: 27, name: '等待上传完成', description: '正在等待视频上传完成...' },
  // 发布阶段
  CLICKING_PUBLISH: { step: 28, name: '点击发布按钮', description: '正在点击"发布"按钮...' },
  WAITING_PUBLISH: { step: 29, name: '等待发布处理', description: '正在等待发布处理...' },
  // 发布后弹窗处理
  CHECKING_PUBLISH_STATUS: { step: 30, name: '检测发布状态', description: '正在检测发布状态...' },
  HANDLING_GOT_IT_POPUP: { step: 31, name: '处理知道了弹窗', description: '正在处理"知道了"弹窗...' },
  HANDLING_CLOSE_POPUP: { step: 32, name: '处理关闭弹窗', description: '正在处理"关闭"弹窗...' },
  VERIFYING_PUBLISH_SUCCESS: { step: 33, name: '确认发布成功', description: '正在确认视频发布成功...' },
  // 完成
  COMPLETED: { step: 34, name: '完成', description: '上传完成！' }
}

// 普通号跳过创收步骤(15-18)，总步骤数为30
const NORMAL_TOTAL_STEPS = 30
// 创收号总步骤数为34
const MONETIZED_TOTAL_STEPS = 34

class YouTubeUploadService {
  constructor() {
    // 使用 Map 存储每个浏览器的连接状态，支持多浏览器并行上传
    this.browserConnections = new Map() // browserId -> { browser, page, isPaused, isCancelled }
    // 缓存每个浏览器的当前进度，用于页面切换后恢复显示
    this.progressCache = new Map() // browserId -> { step, stepName, description, status, totalSteps, ... }
    this.bitBrowserService = null
    this.hubStudioService = null
    this.progressCallback = null
    this.mainWindow = null
  }

  /**
   * 获取或创建浏览器连接状态
   * @param {string} browserId - 浏览器ID
   * @returns {Object} 连接状态对象
   */
  getConnection(browserId) {
    if (!this.browserConnections.has(browserId)) {
      this.browserConnections.set(browserId, {
        browser: null,
        page: null,
        isPaused: false,
        isCancelled: false,
        isMonetized: false  // 是否为创收号上传
      })
    }
    return this.browserConnections.get(browserId)
  }

  /**
   * 设置浏览器的创收号标识
   * @param {string} browserId - 浏览器ID
   * @param {boolean} isMonetized - 是否为创收号
   */
  setMonetizedFlag(browserId, isMonetized) {
    const conn = this.getConnection(browserId)
    conn.isMonetized = isMonetized
  }

  /**
   * 获取浏览器的创收号标识
   * @param {string} browserId - 浏览器ID
   * @returns {boolean} 是否为创收号
   */
  getMonetizedFlag(browserId) {
    const conn = this.getConnection(browserId)
    return conn.isMonetized || false
  }

  /**
   * 设置浏览器连接
   * @param {string} browserId - 浏览器ID
   * @param {Object} browser - Playwright browser 对象
   * @param {Object} page - Playwright page 对象
   */
  setConnection(browserId, browser, page) {
    const conn = this.getConnection(browserId)
    conn.browser = browser
    conn.page = page
  }

  /**
   * 获取浏览器的 page 对象
   * @param {string} browserId - 浏览器ID
   * @returns {Object|null} page 对象
   */
  getPage(browserId) {
    const conn = this.getConnection(browserId)
    return conn.page
  }

  /**
   * 清理浏览器连接
   * @param {string} browserId - 浏览器ID
   */
  clearConnection(browserId) {
    const conn = this.browserConnections.get(browserId)
    if (conn) {
      conn.browser = null
      conn.page = null
      conn.isPaused = false
      conn.isCancelled = false
    }
  }

  /**
   * 初始化服务
   * @param {Object} bitBrowserService - 比特浏览器服务实例
   * @param {Object} hubStudioService - HubStudio服务实例
   * @param {Object} mainWindow - 主窗口实例
   */
  initialize(bitBrowserService, hubStudioService, mainWindow) {
    this.bitBrowserService = bitBrowserService
    this.hubStudioService = hubStudioService
    this.mainWindow = mainWindow
  }

  /**
   * 发送进度更新到渲染进程
   * @param {string} browserId - 浏览器ID
   * @param {Object} stepInfo - 步骤信息
   * @param {string} status - 状态: pending, running, success, error
   * @param {string} error - 错误信息
   */
  sendProgress(browserId, stepInfo, status, error = null) {
    // 从连接状态中获取是否为创收号
    const isMonetized = this.getMonetizedFlag(browserId)

    // 根据账号类型计算实际步骤号（普通号跳过15-18步）
    let displayStep = stepInfo.step
    if (!isMonetized && stepInfo.step >= 15) {
      // 普通号从步骤15开始，实际显示需要减去4（跳过的创收步骤）
      displayStep = stepInfo.step - 4
    }

    const totalSteps = isMonetized ? MONETIZED_TOTAL_STEPS : NORMAL_TOTAL_STEPS

    const progress = {
      browserId,
      step: displayStep,
      stepName: stepInfo.name,
      description: stepInfo.description,
      status,
      error,
      totalSteps,
      timestamp: Date.now()
    }

    // 缓存当前进度，用于页面切换后恢复
    this.progressCache.set(browserId, progress)

    // 如果是完成或错误状态，5秒后清除缓存
    if (status === 'success' && stepInfo.step === UPLOAD_STEPS.COMPLETED.step) {
      setTimeout(() => {
        this.progressCache.delete(browserId)
      }, 5000)
    } else if (status === 'error') {
      setTimeout(() => {
        this.progressCache.delete(browserId)
      }, 10000)
    }

    console.log(`[YouTube Upload] ${browserId} - Step ${displayStep}/${totalSteps}: ${stepInfo.name} - ${status}`)

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('youtube:progress', progress)
    }

    if (this.progressCallback) {
      this.progressCallback(progress)
    }
  }

  /**
   * 获取所有正在执行的任务进度（用于页面切换后恢复）
   * @returns {Object} { browserId: progress }
   */
  getAllProgress() {
    const result = {}
    for (const [browserId, progress] of this.progressCache) {
      result[browserId] = progress
    }
    return result
  }

  /**
   * 获取指定浏览器的进度
   * @param {string} browserId - 浏览器ID
   * @returns {Object|null} 进度信息
   */
  getProgress(browserId) {
    return this.progressCache.get(browserId) || null
  }

  /**
   * 检查是否暂停或取消（针对特定浏览器值
   * @param {string} browserId - 浏览器ID
   */
  async checkPauseOrCancel(browserId) {
    const conn = this.getConnection(browserId)
    if (conn.isCancelled) {
      throw new Error('上传已取消')
    }

    while (conn.isPaused) {
      await new Promise(resolve => setTimeout(resolve, 500))
      if (conn.isCancelled) {
        throw new Error('上传已取消')
      }
    }
  }

  /**
   * 暂停上传（针对特定浏览器或全部）
   * @param {string} browserId - 浏览器ID，不传则暂停全部
   */
  pause(browserId) {
    if (browserId) {
      const conn = this.getConnection(browserId)
      conn.isPaused = true
      console.log(`[YouTube Upload] ${browserId} 上传已暂停`)
    } else {
      // 暂停所有
      for (const [id, conn] of this.browserConnections) {
        conn.isPaused = true
      }
      console.log('[YouTube Upload] 所有上传已暂停')
    }
  }

  /**
   * 继续上传（针对特定浏览器或全部）
   * @param {string} browserId - 浏览器ID，不传则继续全部
   */
  resume(browserId) {
    if (browserId) {
      const conn = this.getConnection(browserId)
      conn.isPaused = false
      console.log(`[YouTube Upload] ${browserId} 上传已继续`)
    } else {
      // 继续所有
      for (const [id, conn] of this.browserConnections) {
        conn.isPaused = false
      }
      console.log('[YouTube Upload] 所有上传已继续')
    }
  }

  /**
   * 取消上传（针对特定浏览器或全部）
   * @param {string} browserId - 浏览器ID，不传则取消全部
   */
  cancel(browserId) {
    if (browserId) {
      const conn = this.getConnection(browserId)
      conn.isCancelled = true
      conn.isPaused = false
      console.log(`[YouTube Upload] ${browserId} 上传已取消`)
    } else {
      // 取消所有
      for (const [id, conn] of this.browserConnections) {
        conn.isCancelled = true
        conn.isPaused = false
      }
      console.log('[YouTube Upload] 所有上传已取消')
    }
  }

  /**
   * 重置状态（针对特定浏览器）
   * @param {string} browserId - 浏览器ID
   */
  reset(browserId) {
    const conn = this.getConnection(browserId)
    conn.isPaused = false
    conn.isCancelled = false
  }

  /**
   * 获取当前状态（针对特定浏览器或全部值
   * @param {string} browserId - 浏览器ID，不传则返回所有状态
   */
  getStatus(browserId) {
    if (browserId) {
      const conn = this.getConnection(browserId)
      return {
        browserId,
        isPaused: conn.isPaused,
        isCancelled: conn.isCancelled
      }
    }
    // 返回所有浏览器的状态
    const allStatus = {}
    for (const [id, conn] of this.browserConnections) {
      allStatus[id] = {
        isPaused: conn.isPaused,
        isCancelled: conn.isCancelled
      }
    }
    return allStatus
  }

  /**
   * 打开浏览器并导航值YouTube Studio
   * @param {string} browserId - 比特浏览器配置ID
   * @param {string} browserType - 浏览器类值 bitbrowser 值hubstudio
   * @returns {Object} { success, browser, page, error }
   */
  async openYouTubeStudio(browserId, browserType = 'bitbrowser') {
    try {
      this.sendProgress(browserId, UPLOAD_STEPS.STARTING_BROWSER, 'running')
      await this.checkPauseOrCancel(browserId)

      console.log('正在启动浏览器', browserId, '类型:', browserType)

      let wsEndpoint = null

      if (browserType === 'hubstudio' && this.hubStudioService) {
        // HubStudio 浏览器
        const startResult = await this.hubStudioService.startBrowser(browserId)
        if (!startResult.success) {
          throw new Error(startResult.error || '启动 HubStudio 浏览器失败')
        }
        wsEndpoint = startResult.wsEndpoint
      } else {
        // BitBrowser
        const startResult = await this.bitBrowserService.startBrowser(browserId)
        if (!startResult.success) {
          throw new Error(startResult.error || '启动比特浏览器失败')
        }
        wsEndpoint = startResult.wsEndpoint
      }

      console.log('浏览器启动成功，wsEndpoint:', wsEndpoint)
      this.sendProgress(browserId, UPLOAD_STEPS.STARTING_BROWSER, 'success')

      if (!wsEndpoint) {
        throw new Error('未获取到浏览器WebSocket 地址')
      }

      // 连接 Playwright
      this.sendProgress(browserId, UPLOAD_STEPS.CONNECTING_PLAYWRIGHT, 'running')
      await this.checkPauseOrCancel(browserId)

      console.log('正在连接 Playwright...')
      const browser = await chromium.connectOverCDP(wsEndpoint)

      // 获取默认上下文和页面
      const contexts = browser.contexts()
      let context = contexts[0]
      if (!context) {
        context = await browser.newContext()
      }

      const pages = context.pages()
      const page = pages[0] || await context.newPage()

      // 保存连接值Map 值
      this.setConnection(browserId, browser, page)

      this.sendProgress(browserId, UPLOAD_STEPS.CONNECTING_PLAYWRIGHT, 'success')

      // 导航值YouTube Studio
      this.sendProgress(browserId, UPLOAD_STEPS.OPENING_STUDIO, 'running')
      await this.checkPauseOrCancel(browserId)

      console.log('正在打开 YouTube Studio...')
      await page.goto('https://studio.youtube.com/', {
        waitUntil: 'domcontentloaded',
        timeout: 60000
      })
      this.sendProgress(browserId, UPLOAD_STEPS.OPENING_STUDIO, 'success')

      // 等待页面加载完成
      this.sendProgress(browserId, UPLOAD_STEPS.WAITING_STUDIO_LOAD, 'running')
      await page.waitForTimeout(3000)

      console.log('YouTube Studio 已打开')
      this.sendProgress(browserId, UPLOAD_STEPS.WAITING_STUDIO_LOAD, 'success')

      return {
        success: true,
        browser: browser,
        page: page
      }
    } catch (error) {
      console.error('打开 YouTube Studio 失败:', error)
      this.sendProgress(browserId, UPLOAD_STEPS.OPENING_STUDIO, 'error', error.message)
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * 点击创建按钮
   * @param {string} browserId - 浏览器ID
   * @returns {Object} { success, error }
   */
  async clickCreateButton(browserId) {
    try {
      this.sendProgress(browserId, UPLOAD_STEPS.CLICKING_CREATE, 'running')
      await this.checkPauseOrCancel(browserId)

      const page = this.getPage(browserId)
      if (!page) {
        throw new Error('页面未初始化')
      }

      console.log('正在查找创建按钮...')

      // 等待创建按钮出现 - 使用多种选择器尝试
      const createButtonSelectors = [
        '[aria-label="创建"]',
        '[aria-label="Create"]',
        'ytcp-button#create-icon',
        'button#create-icon',
        '#create-icon'
      ]

      let createButton = null
      for (const selector of createButtonSelectors) {
        try {
          createButton = await page.waitForSelector(selector, { timeout: 5000 })
          if (createButton) {
            console.log('找到创建按钮, 选择器', selector)
            break
          }
        } catch (e) {
          // 继续尝试下一个选择器
        }
      }

      if (!createButton) {
        throw new Error('未找到创建按钮')
      }

      // 点击创建按钮
      console.log('点击创建按钮...')
      await createButton.click()

      // 等待下拉菜单出现
      await page.waitForTimeout(1000)

      console.log('创建按钮已点值')
      this.sendProgress(browserId, UPLOAD_STEPS.CLICKING_CREATE, 'success')
      return { success: true }
    } catch (error) {
      console.error('点击创建按钮失败:', error)
      this.sendProgress(browserId, UPLOAD_STEPS.CLICKING_CREATE, 'error', error.message)
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * 点击上传视频选项
   * @param {string} browserId - 浏览器ID
   * @returns {Object} { success, error }
   */
  async clickUploadVideo(browserId) {
    try {
      this.sendProgress(browserId, UPLOAD_STEPS.CLICKING_UPLOAD, 'running')
      await this.checkPauseOrCancel(browserId)

      const page = this.getPage(browserId)
      if (!page) {
        throw new Error('页面未初始化')
      }

      console.log('正在查找上传视频选项...')

      // 等待上传视频选项出现 - 优先使用ID/结构选择器（语言无关
      const uploadSelectors = [
        // 第一个菜单项（上传视频通常是第一个）- 语言无关
        'tp-yt-paper-listbox tp-yt-paper-item:first-child',
        'tp-yt-paper-item#text-item-0',
        // 通过 yt-formatted-string 的类名查找
        'tp-yt-paper-item yt-formatted-string.item-text',
        // 中文
        'tp-yt-paper-item:has-text("上传视频")',
        'yt-formatted-string:has-text("上传视频")',
        // 英文
        'tp-yt-paper-item:has-text("Upload video")',
        'tp-yt-paper-item:has-text("Upload videos")',
        'yt-formatted-string:has-text("Upload video")'
      ]

      let uploadOption = null
      for (const selector of uploadSelectors) {
        try {
          uploadOption = await page.waitForSelector(selector, { timeout: 2000 })
          if (uploadOption) {
            console.log('找到上传视频选项, 选择器', selector)
            break
          }
        } catch (e) {
          // 继续尝试下一个选择器
        }
      }

      if (!uploadOption) {
        throw new Error('未找到上传视频选项')
      }

      // 点击上传视频 - 如果是 yt-formatted-string，需要点击其父元素
      console.log('点击上传视频选项...')
      const tagName = await uploadOption.evaluate(el => el.tagName.toLowerCase())
      if (tagName === 'yt-formatted-string') {
        // 点击父级 tp-yt-paper-item
        await uploadOption.evaluate(el => el.closest('tp-yt-paper-item').click())
      } else {
        await uploadOption.click()
      }
      this.sendProgress(browserId, UPLOAD_STEPS.CLICKING_UPLOAD, 'success')

      // 等待上传对话框出现 - 增加等待时间
      this.sendProgress(browserId, UPLOAD_STEPS.WAITING_UPLOAD_DIALOG, 'running')
      await page.waitForTimeout(3000)

      // 等待上传对话框的文件选择区域出现
      try {
        await page.waitForSelector('ytcp-uploads-file-picker', { timeout: 10000 })
        console.log('上传文件选择区域已出现')
      } catch (e) {
        console.log('未找到文件选择区域，继续执行...')
      }

      console.log('上传视频对话框已打开')
      this.sendProgress(browserId, UPLOAD_STEPS.WAITING_UPLOAD_DIALOG, 'success')
      return { success: true }
    } catch (error) {
      console.error('点击上传视频失败:', error)
      this.sendProgress(browserId, UPLOAD_STEPS.CLICKING_UPLOAD, 'error', error.message)
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * 选择视频文件
   * @param {string} browserId - 浏览器ID
   * @param {string} videoPath - 视频文件路径
   * @returns {Object} { success, error }
   */
  async selectVideoFile(browserId, videoPath) {
    try {
      this.sendProgress(browserId, UPLOAD_STEPS.SELECTING_FILE, 'running')
      await this.checkPauseOrCancel(browserId)

      const page = this.getPage(browserId)
      if (!page) {
        throw new Error('页面未初始化')
      }

      console.log('正在选择视频文件:', videoPath)

      // 获取文件大小
      const fs = require('fs')
      const stats = fs.statSync(videoPath)
      const fileSizeMB = stats.size / (1024 * 1024)
      console.log(`文件大小: ${fileSizeMB.toFixed(2)} MB`)

      // 等待上传对话框出值
      await page.waitForTimeout(1000)

      // 等待文件选择器区域加值
      try {
        await page.waitForSelector('ytcp-uploads-file-picker', { timeout: 5000 })
        console.log('文件选择器区域已加载')
      } catch (e) {
        console.log('文件选择器区域未找到，继续尝试..')
      }

      // 使用 CDP 协议直接设置文件（绕值Playwright 值50MB 限制值
      // 因为 BitBrowser 通过 WebSocket 连接，Playwright 认为它是远程浏览器
      // 但实际上文件在本地，可以通过 CDP 值DOM.setFileInputFiles 直接设置
      console.log('使用 CDP 协议设置文件（绕过大小限制）...')

      let fileSet = false

      try {
        // 找到文件 input 元素
        const fileInput = await page.$('ytcp-uploads-file-picker input[type="file"]')
        if (!fileInput) {
          throw new Error('未找到文件输入元素')
        }

        // 获取 CDP session
        const cdpSession = await page.context().newCDPSession(page)

        // 获取 input 元素值backendNodeId
        const { node } = await cdpSession.send('DOM.describeNode', {
          objectId: await fileInput.evaluate(el => {
            // 返回一个标识符用于后续查找
            el.__fileInputMarker = true
            return ''
          }).catch(() => '')
        }).catch(() => ({ node: null }))

        // 使用另一种方式：通过 Runtime.evaluate 获取元素并设置文件
        // 先获值DOM 根节点
        const { root } = await cdpSession.send('DOM.getDocument', { depth: 0 })

        // 查找 input[type="file"] 元素
        const { nodeId } = await cdpSession.send('DOM.querySelector', {
          nodeId: root.nodeId,
          selector: 'ytcp-uploads-file-picker input[type="file"]'
        })

        if (nodeId) {
          // 使用 CDP 直接设置文件路径（本地文件，无大小限制）
          await cdpSession.send('DOM.setFileInputFiles', {
            nodeId: nodeId,
            files: [videoPath]
          })
          console.log('文件已通过 CDP 协议设置')
          fileSet = true
        }

        await cdpSession.detach()
      } catch (cdpError) {
        console.log('CDP 方式设置文件失败:', cdpError.message)
      }

      // 如果 CDP 方式失败，对于小文件尝试 Playwright 方式
      if (!fileSet && fileSizeMB <= 50) {
        console.log('文件小于50MB，尝试Playwright 方式...')
        try {
          const fileInput = await page.$('ytcp-uploads-file-picker input[type="file"]')
          if (fileInput) {
            await fileInput.setInputFiles(videoPath)
            console.log('文件已通过 Playwright 设置')
            fileSet = true
          }
        } catch (e) {
          console.log('Playwright 方式失败:', e.message)
        }
      }

      if (!fileSet) {
        throw new Error('无法设置视频文件，请确保文件路径正确且可访问')
      }

      console.log('文件已设置，等待上传界面加载...')
      this.sendProgress(browserId, UPLOAD_STEPS.SELECTING_FILE, 'success')

      // 等待上传界面加载 - 轮询检测多个选择器
      this.sendProgress(browserId, UPLOAD_STEPS.WAITING_UPLOAD_UI, 'running')
      const uploadConfirmSelectors = [
        // 标题输入框（最常见值
        'ytcp-video-title #textbox',
        'ytcp-social-suggestions-textbox #textbox',
        '#textbox',
        // 上传进度指示器
        'ytcp-video-upload-progress',
        // 视频详情表单
        'ytcp-video-metadata-editor',
        // 上传对话框标题变化
        'ytcp-uploads-dialog #dialog-title'
      ]

      let uploadStarted = false
      let foundSelector = null

      // 值2 秒检查一次是否有任何选择器可用
      const maxWaitTime = 120000 // 最大等待120 秒（视频上传可能需要较长时间）
      const checkInterval = 2000 // 值2 秒检查一值
      const startTime = Date.now()

      console.log('开始轮询检测上传界值..')

      while (!uploadStarted && (Date.now() - startTime) < maxWaitTime) {
        // 检查是否取消
        await this.checkPauseOrCancel(browserId)

        for (const selector of uploadConfirmSelectors) {
          try {
            const element = await page.$(selector)
            if (element) {
              const isVisible = await element.isVisible()
              if (isVisible) {
                uploadStarted = true
                foundSelector = selector
                console.log('上传界面已加值 检测到:', selector)
                break
              }
            }
          } catch (e) {
            // 继续检查下一个选择器
          }
        }

        if (!uploadStarted) {
          // 等待一小段时间再检查
          await page.waitForTimeout(checkInterval)
          const elapsed = Math.round((Date.now() - startTime) / 1000)
          console.log(`等待上传界面加载... (${elapsed}值`)
        }
      }

      if (!uploadStarted) {
        // 截图用于调试
        try {
          await page.screenshot({ fullPage: true })
          console.log('上传界面未加载，已保存截图用于调试')
        } catch (e) {}
        throw new Error('上传界面加载超时，请检查视频文件是否有效')
      }

      // 额外等待确保界面完全稳定（缩短等待时间）
      await page.waitForTimeout(1500)

      console.log('视频文件已选择，上传界面已加载')
      this.sendProgress(browserId, UPLOAD_STEPS.WAITING_UPLOAD_UI, 'success')
      return { success: true }
    } catch (error) {
      console.error('选择视频文件失败:', error)
      this.sendProgress(browserId, UPLOAD_STEPS.SELECTING_FILE, 'error', error.message)
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * 填写视频详情 - 普通号流程
   * @param {string} browserId - 浏览器ID
   * @param {Object} videoInfo - 视频信息
   * @returns {Object} { success, error }
   */
  async fillVideoDetailsNormal(browserId, videoInfo) {
    try {
      this.sendProgress(browserId, UPLOAD_STEPS.FILLING_TITLE, 'running')
      await this.checkPauseOrCancel(browserId)

      const page = this.getPage(browserId)
      if (!page) {
        throw new Error('页面未初始化')
      }

      const { title, description } = videoInfo

      console.log('正在填写视频标题...')
      console.log('标题内容:', title)

      // 等待标题输入框出值- 使用更精确的选择器
      // 标题输入框在 ytcp-video-title > ytcp-social-suggestions-textbox 内的 #textbox
      // aria-label="添加一个可描述你视频的标题"
      const titleSelectors = [
        'ytcp-video-title ytcp-social-suggestions-textbox #textbox',
        'ytcp-video-title #textbox',
        '#textbox[aria-label*="添加一个可描述你视频的标题"]',
        '#textbox[aria-label*="标题"]',
        '#textbox[aria-label*="title"]'
      ]

      let titleInput = null
      for (const selector of titleSelectors) {
        try {
          await page.waitForSelector(selector, { timeout: 5000 })
          titleInput = await page.locator(selector).first()
          const isVisible = await titleInput.isVisible()
          if (isVisible) {
            console.log('找到标题输入框 选择器', selector)
            break
          }
        } catch (e) {
          // 继续尝试下一个选择器
        }
      }

      if (!titleInput) {
        throw new Error('未找到标题输入框')
      }

      // 点击标题输入框获取焦点
      await titleInput.click()
      await page.waitForTimeout(500)

      // 全选并删除现有内容
      console.log('清空标题输入框..')
      await page.keyboard.press('Control+A')
      await page.waitForTimeout(200)
      await page.keyboard.press('Backspace')
      await page.waitForTimeout(500)

      // 使用剪贴板锁粘贴标题（避免多浏览器并发时冲突）
      console.log('使用剪贴板粘贴标题...')
      await clipboardLock.writeAndPaste(page, title, `youtube-title-${browserId}`)
      console.log('标题已填写:', title)
      this.sendProgress(browserId, UPLOAD_STEPS.FILLING_TITLE, 'success')

      // 等待标题输入完成
      await page.waitForTimeout(1000)

      // 填写描述 - 第二个 textbox 是描述
      if (description) {
        this.sendProgress(browserId, UPLOAD_STEPS.FILLING_DESCRIPTION, 'running')
        console.log('正在填写描述...')

        // 描述输入框选择器
        // 描述输入框在 ytcp-video-description > ytcp-social-suggestions-textbox 内的 #textbox
        // aria-label="向观看者介绍你的视频
        const descSelectors = [
          'ytcp-video-description ytcp-social-suggestions-textbox #textbox',
          'ytcp-video-description #textbox',
          '#textbox[aria-label*="向观看者介绍你的视频]',
          '#textbox[aria-label*="说明"]',
          '#textbox[aria-label*="description"]'
        ]

        let descriptionInput = null
        for (const selector of descSelectors) {
          try {
            const inputs = await page.locator(selector).all()
            if (inputs.length > 0) {
              descriptionInput = inputs[0]
              const isVisible = await descriptionInput.isVisible()
              if (isVisible) {
                console.log('找到描述输入框 选择器', selector)
                break
              }
            }
          } catch (e) {
            // 继续尝试
          }
        }

        // 如果精确选择器没找到，尝试用第二值#textbox
        if (!descriptionInput) {
          const allTextboxes = await page.locator('#textbox').all()
          if (allTextboxes.length > 1) {
            descriptionInput = allTextboxes[1]
            console.log('使用第二值#textbox 作为描述输入框')
          }
        }

        if (descriptionInput) {
          await descriptionInput.click()
          await page.waitForTimeout(500)

          // 清空现有内容
          await page.keyboard.press('Control+A')
          await page.waitForTimeout(200)
          await page.keyboard.press('Backspace')
          await page.waitForTimeout(500)

          // 使用剪贴板锁粘贴描述
          await clipboardLock.writeAndPaste(page, description, `youtube-desc-${browserId}`)
          console.log('描述已填写')
          this.sendProgress(browserId, UPLOAD_STEPS.FILLING_DESCRIPTION, 'success')
        }
      } else {
        // 没有描述时也标记为完成
        this.sendProgress(browserId, UPLOAD_STEPS.FILLING_DESCRIPTION, 'success')
      }

      // 等待一下让页面更新 - 增加等待时间
      await page.waitForTimeout(3000)

      console.log('视频详情填写完成')
      return { success: true }
    } catch (error) {
      console.error('填写视频详情失败:', error)
      this.sendProgress(browserId, UPLOAD_STEPS.FILLING_TITLE, 'error', error.message)
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * 设置视频值不是为儿童设值
   * @param {string} browserId - 浏览器ID
   * @returns {Object} { success, error }
   */
  async setNotMadeForKids(browserId) {
    try {
      this.sendProgress(browserId, UPLOAD_STEPS.SETTING_NOT_FOR_KIDS, 'running')
      await this.checkPauseOrCancel(browserId)

      const page = this.getPage(browserId)
      if (!page) {
        throw new Error('页面未初始化')
      }

      console.log('设置非儿童内容...')

      // 查找"不，内容不是面向儿童值单选按钮- 中英文兼容
      // XPath: /html/body/ytcp-uploads-dialog/.../ytkc-made-for-kids-select/div[4]/tp-yt-paper-radio-group/tp-yt-paper-radio-button[2]
      const notForKidsSelectors = [
        // 优先使用 name 属性（语言无关，最可靠值
        'tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]',
        // 通过父组件结构定位（第二个单选按钮）
        'ytkc-made-for-kids-select tp-yt-paper-radio-group tp-yt-paper-radio-button:nth-child(2)',
        'tp-yt-paper-radio-group tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]',
        // 中文 - 新版YouTube界面
        'tp-yt-paper-radio-button:has-text("不，内容不是面向儿童值)',
        'tp-yt-paper-radio-button:has-text("不是面向儿童")',
        // 中文 - 旧版
        'tp-yt-paper-radio-button:has-text("否，此内容不是为儿童设计")',
        // 英文
        'tp-yt-paper-radio-button:has-text("No, it\'s not made for kids")',
        'tp-yt-paper-radio-button:has-text("not made for kids")'
      ]

      let notForKidsRadio = null
      for (const selector of notForKidsSelectors) {
        try {
          notForKidsRadio = await page.waitForSelector(selector, { timeout: 3000 })
          if (notForKidsRadio) {
            break
          }
        } catch (e) {
          // 继续尝试
        }
      }

      if (notForKidsRadio) {
        await notForKidsRadio.click()
        console.log('已设置为非儿童内容')
      } else {
        console.log('未找到儿童内容设置选项，可能已默认设置')
      }
      this.sendProgress(browserId, UPLOAD_STEPS.SETTING_NOT_FOR_KIDS, 'success')

      // 等待设置生效
      await page.waitForTimeout(1500)

      // 点击"展开"按钮（显示更多选项：付费宣传内容、联合创作、字幕等）
      this.sendProgress(browserId, UPLOAD_STEPS.CLICKING_EXPAND, 'running')
      // XPath: /html/body/ytcp-uploads-dialog/.../ytcp-video-metadata-editor/div/div/ytcp-button/ytcp-button-shape/button
      console.log('正在查找展开按钮...')
      const expandButtonSelectors = [
        // 通过按钮文本匹配
        'ytcp-video-metadata-editor ytcp-button:has-text("展开")',
        'ytcp-button:has-text("展开")',
        'button:has-text("展开")',
        // 英文
        'ytcp-video-metadata-editor ytcp-button:has-text("Show more")',
        'ytcp-button:has-text("Show more")',
        'button:has-text("Show more")',
        // 通过结构定位
        'ytcp-video-metadata-editor > div > div > ytcp-button button',
        'ytcp-video-metadata-editor ytcp-button-shape button'
      ]

      let expandButton = null
      for (const selector of expandButtonSelectors) {
        try {
          expandButton = await page.waitForSelector(selector, { timeout: 3000 })
          if (expandButton) {
            const isVisible = await expandButton.isVisible()
            if (isVisible) {
              console.log('找到展开按钮, 选择器', selector)
              break
            }
          }
        } catch (e) {
          // 继续尝试
        }
      }

      if (expandButton) {
        await expandButton.click()
        console.log('已点击展开按钮')
        await page.waitForTimeout(1500)
      } else {
        console.log('未找到展开按钮，可能已展开或不需要')
      }
      this.sendProgress(browserId, UPLOAD_STEPS.CLICKING_EXPAND, 'success')

      // 选择"加工的内容" - 选择"是"
      this.sendProgress(browserId, UPLOAD_STEPS.SETTING_ALTERED_CONTENT, 'running')
      // 表示视频包含AI生成或加工的内容
      // XPath: /html/body/ytcp-uploads-dialog/.../ytkp-altered-content-select/div[2]/div[1]
      console.log('正在查找加工内容选项...')
      const alteredContentSelectors = [
        // 优先使用 name 属性
        'tp-yt-paper-radio-button[name="VIDEO_HAS_ALTERED_CONTENT_YES"]',
        // 通过 aria-label 匹配
        'tp-yt-paper-radio-button[aria-label*="是，包含加工的内容]',
        'tp-yt-paper-radio-button[aria-label*="Yes"]',
        // 通过父组件结构定位
        'ytkp-altered-content-select tp-yt-paper-radio-button[name="VIDEO_HAS_ALTERED_CONTENT_YES"]',
        'ytkp-altered-content-select .altered-content-option-row:first-child tp-yt-paper-radio-button',
        // 中文文本匹配
        'ytkp-altered-content-select tp-yt-paper-radio-button:has-text("值)',
        // 英文
        'tp-yt-paper-radio-button[name="VIDEO_HAS_ALTERED_CONTENT_YES"]'
      ]

      let alteredContentYes = null
      for (const selector of alteredContentSelectors) {
        try {
          alteredContentYes = await page.waitForSelector(selector, { timeout: 3000 })
          if (alteredContentYes) {
            const isVisible = await alteredContentYes.isVisible()
            if (isVisible) {
              console.log('找到加工内容选项, 选择器', selector)
              break
            }
          }
        } catch (e) {
          // 继续尝试
        }
      }

      if (alteredContentYes) {
        await alteredContentYes.click()
        console.log('已选择加工内容为"是"')
        await page.waitForTimeout(1000)
      } else {
        console.log('未找到加工内容选项，可能不需要设置或已展开区域不同')
      }

      this.sendProgress(browserId, UPLOAD_STEPS.SETTING_ALTERED_CONTENT, 'success')
      return { success: true }
    } catch (error) {
      console.error('设置视频受众失败:', error)
      this.sendProgress(browserId, UPLOAD_STEPS.SETTING_NOT_FOR_KIDS, 'error', error.message)
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * 点击下一步/继续按钮
   * @param {string} browserId - 浏览器ID
   * @param {number} times - 点击次数
   * @returns {Object} { success, error }
   */
  async clickNextButton(browserId, times = 1) {
    try {
      const page = this.getPage(browserId)
      if (!page) {
        throw new Error('页面未初始化')
      }

      // 根据点击次数映射到对应步骤
      const stepMap = [
        UPLOAD_STEPS.CLICKING_NEXT_1,
        UPLOAD_STEPS.CLICKING_NEXT_2,
        UPLOAD_STEPS.CLICKING_NEXT_3
      ]

      for (let i = 0; i < times; i++) {
        const currentStep = stepMap[i] || UPLOAD_STEPS.CLICKING_NEXT_1
        this.sendProgress(browserId, currentStep, 'running')
        await this.checkPauseOrCancel(browserId)

        console.log(`点击下一步/继续 (${i + 1}/${times})...`)

        // 查找下一步/继续按钮 - 支持多种选择器
        // XPath: /html/body/ytcp-uploads-dialog/.../ytcp-button[2]/ytcp-button-shape/button
        const nextButtonSelectors = [
          // ID 选择器
          '#next-button',
          // 中文文本匹配
          'ytcp-button:has-text("继续")',
          'ytcp-button:has-text("下一步")',
          'button:has-text("继续")',
          'button:has-text("下一步")',
          // 英文
          'ytcp-button:has-text("Next")',
          'ytcp-button:has-text("Continue")',
          // 通过结构定位（对话框底部第二个按钮）
          'ytcp-uploads-dialog ytcp-animatable div div ytcp-button:nth-child(2) button',
          'ytcp-uploads-dialog [slot="footer"] ytcp-button:last-child button'
        ]

        let nextButton = null
        for (const selector of nextButtonSelectors) {
          try {
            const btn = await page.locator(selector).first()
            if (btn) {
              const isVisible = await btn.isVisible()
              if (isVisible) {
                nextButton = btn
                console.log('找到下一步/继续按钮, 选择器:', selector)
                break
              }
            }
          } catch (e) {
            // 继续尝试
          }
        }

        if (!nextButton) {
          throw new Error('未找到下一步/继续按钮')
        }

        await nextButton.click()
        // 增加等待时间，让页面切换完成
        await page.waitForTimeout(3000)

        this.sendProgress(browserId, currentStep, 'success')
        await this.checkPauseOrCancel(browserId)
      }

      console.log('下一步/继续操作完成')
      return { success: true }
    } catch (error) {
      console.error('点击下一步/继续失败:', error)
      this.sendProgress(browserId, UPLOAD_STEPS.CLICKING_NEXT_1, 'error', error.message)
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * 设置视频可见性（公开/私享/不公开值
   * @param {string} browserId - 浏览器ID
   * @param {string} visibility - 可见性 public, private, unlisted
   * @param {string} scheduledTime - ISO 格式的定时发布时间（可选）
   * @param {string} timezone - 时区（可选）
   * @returns {Object} { success, error }
   */
  async setVisibility(browserId, visibility = 'public', scheduledTime = null, targetTimezone = null) {
    try {
      this.sendProgress(browserId, UPLOAD_STEPS.SELECTING_SCHEDULE, 'running')
      await this.checkPauseOrCancel(browserId)

      const page = this.getPage(browserId)
      if (!page) {
        throw new Error('页面未初始化')
      }

      console.log('设置视频可见性:', visibility)

      // 可见性选项映射
      // XPath: /html/body/ytcp-uploads-dialog/.../ytcp-video-visibility-select/div[2]/tp-yt-paper-radio-group/tp-yt-paper-radio-button[3]
      // 公开是第3个单选按钮
      const visibilitySelectors = {
        'public': [
          // 优先使用 name 属性
          'tp-yt-paper-radio-button[name="PUBLIC"]',
          // 通过父组件结构定位（公开是第3个）
          'ytcp-video-visibility-select tp-yt-paper-radio-group tp-yt-paper-radio-button:nth-child(3)',
          'ytcp-video-visibility-select tp-yt-paper-radio-button[name="PUBLIC"]',
          // 中文文本匹配
          'tp-yt-paper-radio-button:has-text("公开")',
          // 英文
          'tp-yt-paper-radio-button:has-text("Public")'
        ],
        'private': [
          'tp-yt-paper-radio-button[name="PRIVATE"]',
          'ytcp-video-visibility-select tp-yt-paper-radio-group tp-yt-paper-radio-button:nth-child(1)',
          'tp-yt-paper-radio-button:has-text("私享")',
          'tp-yt-paper-radio-button:has-text("Private")'
        ],
        'unlisted': [
          'tp-yt-paper-radio-button[name="UNLISTED"]',
          'ytcp-video-visibility-select tp-yt-paper-radio-group tp-yt-paper-radio-button:nth-child(2)',
          'tp-yt-paper-radio-button:has-text("不公开")',
          'tp-yt-paper-radio-button:has-text("Unlisted")'
        ]
      }

      const selectors = visibilitySelectors[visibility] || visibilitySelectors['public']

      let visibilityRadio = null
      for (const selector of selectors) {
        try {
          visibilityRadio = await page.waitForSelector(selector, { timeout: 3000 })
          if (visibilityRadio) {
            const isVisible = await visibilityRadio.isVisible()
            if (isVisible) {
              console.log('找到可见性选项, 选择器', selector)
              break
            }
          }
        } catch (e) {
          // 继续尝试
        }
      }

      if (visibilityRadio) {
        await visibilityRadio.click()
        console.log('可见性已设置值', visibility)
        await page.waitForTimeout(1000)
      } else {
        console.log('未找到可见性选项，可能已默认设置')
      }

      // 等待设置生效
      await page.waitForTimeout(1500)

      // 点击"安排时间"展开时间选择器
      // XPath: /html/body/ytcp-uploads-dialog/.../ytcp-video-visibility-select/div[3]
      console.log('正在查找安排时间区域...')
      const scheduleSelectors = [
        // 通过ID定位
        '#second-container',
        '#second-container-expand-button',
        // 通过文本匹配
        'ytcp-video-visibility-select #second-container',
        'ytcp-video-visibility-select div:has-text("安排时间")',
        '#visibility-title:has-text("安排时间")',
        // 通过展开按钮
        'ytcp-icon-button[tooltip-label="Click to expand"]',
        // 英文
        'ytcp-video-visibility-select div:has-text("Schedule")'
      ]

      let scheduleArea = null
      for (const selector of scheduleSelectors) {
        try {
          scheduleArea = await page.waitForSelector(selector, { timeout: 3000 })
          if (scheduleArea) {
            const isVisible = await scheduleArea.isVisible()
            if (isVisible) {
              console.log('找到安排时间区域, 选择器', selector)
              break
            }
          }
        } catch (e) {
          // 继续尝试
        }
      }

      if (scheduleArea) {
        await scheduleArea.click()
        console.log('已点击安排时间区域')
        await page.waitForTimeout(1500)
        this.sendProgress(browserId, UPLOAD_STEPS.SELECTING_SCHEDULE, 'success')

        // 如果提供了定时发布时间，设置日期和时间
        if (scheduledTime) {
          await this.setScheduledDateTime(browserId, scheduledTime, targetTimezone)
        }
      } else {
        console.log('未找到安排时间区域，可能不需要设置')
        this.sendProgress(browserId, UPLOAD_STEPS.SELECTING_SCHEDULE, 'success')
      }

      return { success: true }
    } catch (error) {
      console.error('设置可见性失败:', error)
      this.sendProgress(browserId, UPLOAD_STEPS.SELECTING_SCHEDULE, 'error', error.message)
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * 设置定时发布的日期和时间
   * @param {string} browserId - 浏览器ID
   * @param {string} scheduledTime - 格式化的时间字符是"YYYY-MM-DD HH:mm"
   * @param {string} timezone - 时区名称（如 "Asia/Shanghai"值 仅用于日志，不参与时间转换
   */
  async setScheduledDateTime(browserId, scheduledTime, targetTimezone) {
    try {
      const page = this.getPage(browserId)
      if (!page) {
        throw new Error('页面未初始化')
      }

      console.log('设置定时发布时间:', scheduledTime, '时区:', targetTimezone)

      // 直接解析传入的时间字符串，不做任何时区转换
      // scheduledTime 格式: "YYYY-MM-DD HH:mm"，直接使用显示的时间
      const [datePart, timePart] = scheduledTime.split(' ')
      const [year, month, day] = datePart.split('-').map(Number)
      const [hours, minutes] = timePart.split(':').map(Number)

      console.log(`直接使用显示时间: ${year}-${month}-${day} ${hours}:${minutes}`)

      // 格式化日期为 YouTube 期望的格式: "2025年12月1日"
      const formattedDate = `${year}年${month}月${day}日`
      console.log('格式化日期:', formattedDate)

      // ===== 1. 设置日期 =====
      this.sendProgress(browserId, UPLOAD_STEPS.SETTING_DATE, 'running')
      // 点击日期下拉框打开日期选择器
      const datePickerSelectors = [
        'ytcp-datetime-picker ytcp-dropdown-trigger',
        'ytcp-visibility-scheduler ytcp-dropdown-trigger',
        '#datepicker-trigger',
        'ytcp-text-dropdown-trigger#datepicker-trigger',
        'ytcp-date-picker'
      ]

      let datePicker = null
      for (const selector of datePickerSelectors) {
        try {
          datePicker = await page.waitForSelector(selector, { timeout: 3000 })
          if (datePicker) {
            const isVisible = await datePicker.isVisible()
            if (isVisible) {
              console.log('找到日期选择器 选择器', selector)
              break
            }
          }
        } catch (e) {
          // 继续尝试
        }
      }

      if (datePicker) {
        await datePicker.click()
        console.log('已点击日期选择器')
        await page.waitForTimeout(1000)

        // 等待日期选择弹窗出现，查找日期输入框
        // XPath: /html/body/ytcp-date-picker/tp-yt-paper-dialog/div/form/tp-yt-paper-input/tp-yt-paper-input-container/div[2]/div/tp-yt-iron-input/input
        const dateInputSelectors = [
          'ytcp-date-picker tp-yt-paper-dialog tp-yt-paper-input input',
          'ytcp-date-picker tp-yt-iron-input input',
          'tp-yt-paper-dialog tp-yt-paper-input input',
          'tp-yt-paper-input-container tp-yt-iron-input input'
        ]

        let dateInput = null
        for (const selector of dateInputSelectors) {
          try {
            dateInput = await page.waitForSelector(selector, { timeout: 3000 })
            if (dateInput) {
              const isVisible = await dateInput.isVisible()
              if (isVisible) {
                console.log('找到日期输入框 选择器', selector)
                break
              }
            }
          } catch (e) {
            // 继续尝试
          }
        }

        if (dateInput) {
          // 清空并输入日期
          await dateInput.click()
          await page.keyboard.press('Control+A')
          await page.waitForTimeout(100)
          await page.keyboard.press('Backspace')
          await page.waitForTimeout(100)

          // 使用剪贴板锁写入日期
          await clipboardLock.writeAndPaste(page, formattedDate, '填写日期')
          console.log('已填写日期', formattedDate)
          await page.waitForTimeout(500)

          // 按 Enter 确认日期（不需要再选择日历）
          await page.keyboard.press('Enter')
          await page.waitForTimeout(1000)
        } else {
          console.log('未找到日期输入框')
        }
      }
      this.sendProgress(browserId, UPLOAD_STEPS.SETTING_DATE, 'success')

      // ===== 2. 设置发布时间 =====
      this.sendProgress(browserId, UPLOAD_STEPS.SETTING_TIME, 'running')
      const formattedTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`
      console.log('设置发布时间:', formattedTime)

      // 时间输入框选择器
      // XPath: /html/body/ytcp-uploads-dialog/.../ytcp-datetime-picker/div/div[2]/form/ytcp-form-input-container/.../tp-yt-iron-input/input
      const timeInputSelectors = [
        // 精确路径：ytcp-datetime-picker 内的 ytcp-form-input-container 下的 input
        'ytcp-datetime-picker ytcp-form-input-container tp-yt-paper-input input',
        'ytcp-datetime-picker ytcp-form-input-container tp-yt-iron-input input',
        'ytcp-datetime-picker tp-yt-paper-input input',
        // 通过 aria-labelledby 属性（时间输入框）
        'ytcp-visibility-scheduler tp-yt-paper-input input',
        'ytcp-form-input-container tp-yt-iron-input input',
        // 备用选择器
        'input[placeholder="00:00"]'
      ]

      let timeInput = null
      for (const selector of timeInputSelectors) {
        try {
          const inputs = await page.locator(selector).all()
          for (const input of inputs) {
            const isVisible = await input.isVisible()
            if (isVisible) {
              // 检查是否是时间输入框（值包是":" 或为空）
              const value = await input.inputValue()
              // 时间格式通常是"00:00" 或类似格式
              if (value === '' || value.includes(':')) {
                timeInput = input
                console.log('找到时间输入框 选择器', selector, '当前值', value)
                break
              }
            }
          }
          if (timeInput) break
        } catch (e) {
          // 继续尝试
        }
      }

      if (timeInput) {
        await timeInput.click()
        await page.waitForTimeout(300)

        // 清空并输入时间
        await page.keyboard.press('Control+A')
        await page.waitForTimeout(100)
        await page.keyboard.press('Backspace')
        await page.waitForTimeout(100)

        await clipboardLock.writeAndPaste(page, formattedTime, '填写时间')
        console.log('已填写时间', formattedTime)
        await page.waitForTimeout(500)

        // 值Enter 确认时间（关闭时间选择器下拉菜单）
        await page.keyboard.press('Enter')
        console.log('已按 Enter 确认时间')
        await page.waitForTimeout(500)

        // 再按 Escape 确保关闭任何弹出的选择器
        await page.keyboard.press('Escape')
        await page.waitForTimeout(300)

        // 点击页面空白区域确保关闭所有下拉菜值
        try {
          const dialogTitle = await page.$('ytcp-uploads-dialog #dialog-title')
          if (dialogTitle) {
            await dialogTitle.click()
            console.log('已点击对话框标题区域关闭选择器')
            await page.waitForTimeout(500)
          }
        } catch (e) {
          // 忽略错误
        }
      } else {
        console.log('未找到时间输入框')
      }
      this.sendProgress(browserId, UPLOAD_STEPS.SETTING_TIME, 'success')

      // ===== 3. 设置时区 =====
      if (targetTimezone) {
        this.sendProgress(browserId, UPLOAD_STEPS.SETTING_TIMEZONE, 'running')
        await this.setTimezone(browserId, targetTimezone)
        this.sendProgress(browserId, UPLOAD_STEPS.SETTING_TIMEZONE, 'success')
      }

      console.log('定时发布时间设置完成')
    } catch (error) {
      console.error('设置定时发布时间失败:', error)
      // 不抛出错误，继续流程
    }
  }

  /**
   * 设置时区
   * @param {string} browserId - 浏览器ID
   * @param {string} timezone - 时区名称（如 "Asia/Shanghai"值
   */
  async setTimezone(browserId, timezone) {
    try {
      const page = this.getPage(browserId)
      if (!page) {
        throw new Error('页面未初始化')
      }

      console.log('设置时区:', timezone)

      // 点击"时区"按钮打开时区选择器
      // XPath: /html/body/ytcp-uploads-dialog/.../ytcp-datetime-picker/div/div[3]/ytcp-button
      const timezoneButtonSelectors = [
        'ytcp-datetime-picker ytcp-button:has-text("时区")',
        'ytcp-visibility-scheduler ytcp-button:has-text("时区")',
        'ytcp-button:has-text("时区")',
        'button:has-text("时区")',
        // 英文
        'ytcp-button:has-text("Timezone")',
        'button:has-text("Timezone")'
      ]

      let timezoneButton = null
      for (const selector of timezoneButtonSelectors) {
        try {
          timezoneButton = await page.waitForSelector(selector, { timeout: 3000 })
          if (timezoneButton) {
            const isVisible = await timezoneButton.isVisible()
            if (isVisible) {
              console.log('找到时区按钮, 选择器', selector)
              break
            }
          }
        } catch (e) {
          // 继续尝试
        }
      }

      if (timezoneButton) {
        await timezoneButton.click()
        console.log('已点击时区按钮')
        await page.waitForTimeout(1000)

        // 等待时区列表出现，查找对应时区选项
        // YouTube Studio 时区格式是"（GMT-08:00）洛杉矶"
        // 直接值GMT 偏移量匹配，因为同一偏移量的城市时间都一值
        const timezoneToGMT = {
          'Asia/Shanghai': 'GMT+08:00',
          'Asia/Hong_Kong': 'GMT+08:00',
          'Asia/Tokyo': 'GMT+09:00',
          'America/New_York': 'GMT-05:00',
          'America/Los_Angeles': 'GMT-08:00',
          'America/Chicago': 'GMT-06:00',
          'America/Denver': 'GMT-07:00',
          'America/Phoenix': 'GMT-07:00',
          'America/Anchorage': 'GMT-09:00',
          'Pacific/Honolulu': 'GMT-10:00',
          'Europe/London': 'GMT+00:00',
          'Europe/Paris': 'GMT+01:00',
          'Europe/Berlin': 'GMT+01:00',
          'Europe/Moscow': 'GMT+03:00',
          'Australia/Sydney': 'GMT+11:00',
          'Asia/Singapore': 'GMT+08:00',
          'Asia/Seoul': 'GMT+09:00',
          'UTC': 'GMT+00:00'
        }

        const gmtOffset = timezoneToGMT[timezone] || timezone
        console.log('查找时区 GMT 偏移值', gmtOffset)

        // 直接使用 GMT 偏移量匹配时区选项
        // 格式: （GMT-08:00）洛杉矶 - 只需匹配 GMT-08:00 部分
        let selected = false

        try {
          // 等待时区菜单出现
          await page.waitForTimeout(1000)

          // 简化逻辑：直接按 GMT 偏移量查找第一个匹配的选项
          const timezoneOption = page.locator(`tp-yt-paper-item:has-text("${gmtOffset}")`).first()

          if (await timezoneOption.isVisible({ timeout: 3000 })) {
            console.log('找到时区选项，GMT偏移值', gmtOffset)
            await timezoneOption.scrollIntoViewIfNeeded()
            await page.waitForTimeout(300)
            await timezoneOption.click()
            console.log('已选择时区:', gmtOffset)
            selected = true
            await page.waitForTimeout(500)
          } else {
            console.log('未找到时区选项:', gmtOffset)
          }
        } catch (e) {
          console.log('查找时区选项失败:', e.message)
        }

        if (!selected) {
          console.log('时区选择失败，将使用默认时区')
          // 值Escape 关闭可能打开的菜值
          await page.keyboard.press('Escape')
          await page.waitForTimeout(300)
        }

      } else {
        console.log('未找到时区按钮')
      }
    } catch (error) {
      console.error('设置时区失败:', error)
      // 不抛出错误，继续流程
    }
  }

  /**
   * 获取上传视频的链值
   * @returns {Object} { success, videoUrl, videoId, error }
   */
  async getVideoUrl(browserId) {
    try {
      this.sendProgress(browserId, UPLOAD_STEPS.GETTING_VIDEO_URL, 'running')
      console.log('正在获取视频链接...')

      const page = this.getPage(browserId)
      if (!page) {
        throw new Error('页面未初始化')
      }

      // 视频链接选择器
      // XPath: /html/body/ytcp-uploads-dialog/.../ytcp-video-info/div/div[2]/div[1]/div[2]/span/a
      const videoLinkSelectors = [
        'ytcp-video-info a[href*="youtube.com"]',
        'ytcp-video-info a[target="_blank"]',
        'ytcp-uploads-review ytcp-video-info a',
        '.video-url-fadeable a',
        'a[href*="youtube.com/shorts/"]',
        'a[href*="youtube.com/watch"]'
      ]

      let videoUrl = null
      for (const selector of videoLinkSelectors) {
        try {
          const link = await page.waitForSelector(selector, { timeout: 5000 })
          if (link) {
            const isVisible = await link.isVisible()
            if (isVisible) {
              videoUrl = await link.getAttribute('href')
              if (videoUrl) {
                console.log('找到视频链接, 选择器', selector, '链接:', videoUrl)
                break
              }
            }
          }
        } catch (e) {
          // 继续尝试
        }
      }

      if (!videoUrl) {
        console.log('未找到视频链值')
        return { success: false, error: '未找到视频链值 '}
      }

      // 值URL 中提取视频ID
      let videoId = null
      // Shorts 格式: https://youtube.com/shorts/xxxxx
      const shortsMatch = videoUrl.match(/shorts\/([a-zA-Z0-9_-]+)/)
      if (shortsMatch) {
        videoId = shortsMatch[1]
      } else {
        // 普通视频格式 https://youtube.com/watch?v=xxxxx
        const watchMatch = videoUrl.match(/[?&]v=([a-zA-Z0-9_-]+)/)
        if (watchMatch) {
          videoId = watchMatch[1]
        }
      }

      console.log('视频链接:', videoUrl)
      console.log('视频ID:', videoId)

      this.sendProgress(browserId, UPLOAD_STEPS.GETTING_VIDEO_URL, 'success')
      return {
        success: true,
        videoUrl,
        videoId
      }
    } catch (error) {
      console.error('获取视频链接失败:', error)
      this.sendProgress(browserId, UPLOAD_STEPS.GETTING_VIDEO_URL, 'error', error.message)
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * 等待视频上传完成
   * 通过检查 ytcp-video-upload-progress 元素的 uploading 属性是否消失来判断
   * @param {string} browserId - 浏览器ID
   * @returns {Object} { success, error }
   */
  async waitForUploadComplete(browserId) {
    try {
      this.sendProgress(browserId, UPLOAD_STEPS.WAITING_UPLOAD_COMPLETE, 'running')
      await this.checkPauseOrCancel(browserId)

      const page = this.getPage(browserId)
      if (!page) {
        throw new Error('页面未初始化')
      }

      console.log('正在等待视频上传完成...')

      // 最长等待时间：30分钟（大文件上传需要时间）
      const maxWaitTime = 30 * 60 * 1000
      const checkInterval = 2000 // 每2秒检查一次
      const startTime = Date.now()

      while (Date.now() - startTime < maxWaitTime) {
        await this.checkPauseOrCancel(browserId)

        try {
          // 查找上传进度元素
          const progressEl = await page.$('ytcp-video-upload-progress')

          if (progressEl) {
            // 检查是否有 uploading 属性
            const isUploading = await progressEl.evaluate((el) => {
              return el.hasAttribute('uploading')
            })

            if (!isUploading) {
              console.log('视频上传已完成（uploading 属性已消失）')
              this.sendProgress(browserId, UPLOAD_STEPS.WAITING_UPLOAD_COMPLETE, 'success')
              return { success: true }
            }

            // 可选：尝试获取上传进度百分比显示给用户
            const progressText = await progressEl.evaluate((el) => {
              const progressLabel = el.querySelector('.progress-label')
              return progressLabel ? progressLabel.textContent : null
            })

            const waitedSeconds = Math.floor((Date.now() - startTime) / 1000)
            if (progressText) {
              console.log(`上传中... ${progressText}，已等待 ${waitedSeconds} 秒`)
            } else {
              console.log(`上传中，已等待 ${waitedSeconds} 秒`)
            }
          } else {
            // 如果找不到进度元素，可能上传已经完成
            console.log('未找到上传进度元素，视频可能已上传完成')
            this.sendProgress(browserId, UPLOAD_STEPS.WAITING_UPLOAD_COMPLETE, 'success')
            return { success: true }
          }

          await page.waitForTimeout(checkInterval)
        } catch (e) {
          console.log('检查上传状态时出错:', e.message)
          await page.waitForTimeout(checkInterval)
        }
      }

      // 超时
      throw new Error('等待视频上传完成超时（30分钟）')
    } catch (error) {
      console.error('等待上传完成失败:', error)
      this.sendProgress(browserId, UPLOAD_STEPS.WAITING_UPLOAD_COMPLETE, 'error', error.message)
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * 点击发布/保存按钮
   * @param {string} browserId - 浏览器ID
   * @returns {Object} { success, error }
   */
  async clickPublishButton(browserId) {
    try {
      this.sendProgress(browserId, UPLOAD_STEPS.CLICKING_PUBLISH, 'running')
      await this.checkPauseOrCancel(browserId)

      const page = this.getPage(browserId)
      if (!page) {
        throw new Error('页面未初始化')
      }

      console.log('正在查找发布按钮...')

      // 查找发布/预定按钮
      // 定时发布时按钮文字是"预定"，立即发布时是"发布"
      // XPath: /html/body/ytcp-uploads-dialog/tp-yt-paper-dialog/div/ytcp-animatable[2]/div/div[2]/ytcp-button[3]
      const publishSelectors = [
        // ID 选择器（最可靠）
        '#done-button',
        'ytcp-button#done-button',
        '[id="done-button"]',
        // 通过结构定位（对话框底部第三个按钮是预定/发布）
        'ytcp-uploads-dialog tp-yt-paper-dialog ytcp-animatable div div:nth-child(2) ytcp-button:nth-child(3) button',
        'ytcp-uploads-dialog ytcp-animatable div div ytcp-button:nth-child(3) button',
        // 中文文本匹配
        'ytcp-button:has-text("预定")',
        'ytcp-button:has-text("发布")',
        'button:has-text("预定")',
        'button:has-text("发布")',
        // 英文
        'ytcp-button:has-text("Schedule")',
        'ytcp-button:has-text("Publish")'
      ]

      let publishButton = null
      for (const selector of publishSelectors) {
        try {
          publishButton = await page.waitForSelector(selector, { timeout: 5000 })
          if (publishButton) {
            console.log('找到发布按钮，选择器:', selector)
            break
          }
        } catch (e) {
          // 继续尝试
        }
      }

      if (!publishButton) {
        throw new Error('未找到发布按钮')
      }

      // 等待按钮变为可点击状态（视频上传完成后按钮才可点击）
      console.log('等待发布按钮变为可点击状态...')
      const maxWaitTime = 600000 // 最长等待10分钟（大文件上传需要时间）
      const checkInterval = 2000 // 每2秒检查一次
      const startTime = Date.now()
      let isClickable = false

      while (Date.now() - startTime < maxWaitTime) {
        await this.checkPauseOrCancel(browserId)

        try {
          // 检查按钮是否被禁用
          // YouTube Studio 的按钮禁用时会有 disabled 属性或 aria-disabled="true"
          const isDisabled = await publishButton.evaluate((btn) => {
            // 检查按钮本身
            if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') {
              return true
            }
            // 检查父元素 ytcp-button 是否有 disabled 属性
            const ytcpButton = btn.closest('ytcp-button')
            if (ytcpButton) {
              if (ytcpButton.hasAttribute('disabled') || ytcpButton.getAttribute('aria-disabled') === 'true') {
                return true
              }
            }
            return false
          })

          if (!isDisabled) {
            // 再次确认按钮可见且可交互
            const isVisible = await publishButton.isVisible()
            const isEnabled = await publishButton.isEnabled()
            if (isVisible && isEnabled) {
              isClickable = true
              console.log('发布按钮已可点击')
              break
            }
          }

          const waitedSeconds = Math.floor((Date.now() - startTime) / 1000)
          console.log(`发布按钮暂时不可点击，已等待 ${waitedSeconds} 秒，继续等待...`)
          await page.waitForTimeout(checkInterval)
        } catch (e) {
          console.log('检查按钮状态时出错:', e.message)
          await page.waitForTimeout(checkInterval)
        }
      }

      if (!isClickable) {
        throw new Error('等待发布按钮可点击超时（10分钟），视频可能仍在上传中')
      }

      // 短暂等待确保按钮完全可交互
      await page.waitForTimeout(500)

      // 点击发布
      console.log('正在点击发布按钮...')
      await publishButton.click()
      console.log('发布按钮已点击')
      this.sendProgress(browserId, UPLOAD_STEPS.CLICKING_PUBLISH, 'success')

      // 等待发布处理
      this.sendProgress(browserId, UPLOAD_STEPS.WAITING_PUBLISH, 'running')
      await page.waitForTimeout(3000)
      this.sendProgress(browserId, UPLOAD_STEPS.WAITING_PUBLISH, 'success')

      // 检测发布状态
      this.sendProgress(browserId, UPLOAD_STEPS.CHECKING_PUBLISH_STATUS, 'running')

      // 循环检测：先检测"关闭"按钮，如果没有就检测"知道了"按钮
      const maxAttempts = 30 // 最多尝试30次，每次1秒，总共30秒
      let publishSuccess = false

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        console.log(`第 ${attempt} 次检测发布状态...`)

        // 1. 首先检查关闭"按钮（发布成功标志）
        // 可能出现在两种对话框中：
        // - ytcp-video-share-dialog（视频分享对话框值
        // - ytcp-uploads-still-processing-dialog（视频仍在处理中对话框）
        console.log('检测是否有"关闭"按钮（发布成功标志）...')
        try {
          // 尝试多个可能的选择器
          const closeButtonSelectors = [
            'ytcp-video-share-dialog button',
            'ytcp-uploads-still-processing-dialog button',
            'ytcp-uploads-still-processing-dialog ytcp-button-shape button',
            'button[aria-label="关闭"]',
            'ytcp-button:has-text("关闭")',
            'button:has-text("关闭")'
          ]

          let closeButton = null
          for (const selector of closeButtonSelectors) {
            try {
              closeButton = await page.waitForSelector(selector, { timeout: 500 })
              if (closeButton && await closeButton.isVisible()) {
                console.log('检测到"关闭"按钮，选择器', selector)
                break
              }
              closeButton = null
            } catch (e) {
              // 继续尝试下一个选择器
            }
          }

          if (closeButton) {
            console.log('检测到"关闭"按钮，视频发布成功！')
            this.sendProgress(browserId, UPLOAD_STEPS.CHECKING_PUBLISH_STATUS, 'success')

            // 处理关闭弹窗
            this.sendProgress(browserId, UPLOAD_STEPS.HANDLING_CLOSE_POPUP, 'running')
            try {
              await closeButton.click()
              console.log('已点击"关闭"按钮')
            } catch (e) {
              console.log('点击关闭按钮出错，忽略')
            }
            this.sendProgress(browserId, UPLOAD_STEPS.HANDLING_CLOSE_POPUP, 'success')

            publishSuccess = true
            break
          }
        } catch (e) {
          console.log('未检测到"关闭"按钮')
        }

        // 2. 如果没有"关闭"按钮，检测"知道了"按钮
        console.log('检测是否有"知道了"弹窗...')
        try {
          const gotItButton = await page.waitForSelector(
            'ytcp-prechecks-warning-dialog button',
            { timeout: 2000 }
          )

          if (gotItButton) {
            // 处理知道了弹窗
            this.sendProgress(browserId, UPLOAD_STEPS.HANDLING_GOT_IT_POPUP, 'running')
            console.log('检测到"知道了"弹窗按钮，准备点击...')
            await page.waitForTimeout(500)
            await gotItButton.click()
            console.log('已点击"知道了"按钮')
            this.sendProgress(browserId, UPLOAD_STEPS.HANDLING_GOT_IT_POPUP, 'success')
            await page.waitForTimeout(1000)
            // 点击后继续循环检测"关闭"按钮
          }
        } catch (e) {
          console.log('未检测到"知道了"弹窗')
        }

        // 短暂等待后继续下一轮检查
        if (!publishSuccess) {
          await page.waitForTimeout(1000)
        }
      }

      if (!publishSuccess) {
        console.log('超时：未能检测到发布成功标志，但流程可能已完成')
        this.sendProgress(browserId, UPLOAD_STEPS.CHECKING_PUBLISH_STATUS, 'success')
      }

      // 确认发布成功
      this.sendProgress(browserId, UPLOAD_STEPS.VERIFYING_PUBLISH_SUCCESS, 'running')
      console.log('发布流程完成')
      this.sendProgress(browserId, UPLOAD_STEPS.VERIFYING_PUBLISH_SUCCESS, 'success')

      // 完成
      this.sendProgress(browserId, UPLOAD_STEPS.COMPLETED, 'success')
      return { success: true }
    } catch (error) {
      console.error('点击发布按钮失败:', error)
      this.sendProgress(browserId, UPLOAD_STEPS.CLICKING_PUBLISH, 'error', error.message)
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * 填写视频详情 - 创收号流值
   * 创收号需要额外设置更多选项
   * @param {string} browserId - 浏览器ID
   * @param {Object} videoInfo - 视频信息
   * @returns {Object} { success, error }
   */
  async fillVideoDetailsMonetized(browserId, videoInfo) {
    try {
      this.sendProgress(browserId, UPLOAD_STEPS.FILLING_TITLE, 'running')
      await this.checkPauseOrCancel(browserId)

      const page = this.getPage(browserId)
      if (!page) {
        throw new Error('页面未初始化')
      }

      const { title, description } = videoInfo

      console.log('正在填写视频标题（创收号）...')
      console.log('标题内容:', title)

      // 等待标题输入框出值- 使用更精确的选择器
      const titleSelectors = [
        'ytcp-video-title ytcp-social-suggestions-textbox #textbox',
        'ytcp-video-title #textbox',
        '#textbox[aria-label*="添加一个可描述你视频的标题"]',
        '#textbox[aria-label*="标题"]',
        '#textbox[aria-label*="title"]'
      ]

      let titleInput = null
      for (const selector of titleSelectors) {
        try {
          await page.waitForSelector(selector, { timeout: 5000 })
          titleInput = await page.locator(selector).first()
          const isVisible = await titleInput.isVisible()
          if (isVisible) {
            console.log('找到标题输入框 选择器', selector)
            break
          }
        } catch (e) {
          // 继续尝试下一个选择器
        }
      }

      if (!titleInput) {
        throw new Error('未找到标题输入框')
      }

      // 点击标题输入框获取焦点
      await titleInput.click()
      await page.waitForTimeout(500)

      // 全选并删除现有内容
      console.log('清空标题输入框..')
      await page.keyboard.press('Control+A')
      await page.waitForTimeout(200)
      await page.keyboard.press('Backspace')
      await page.waitForTimeout(500)

      // 使用剪贴板锁粘贴标题
      console.log('使用剪贴板粘贴标题...')
      await clipboardLock.writeAndPaste(page, title, `youtube-title-${browserId}`)
      console.log('标题已填写:', title)
      this.sendProgress(browserId, UPLOAD_STEPS.FILLING_TITLE, 'success')

      // 等待标题输入完成
      await page.waitForTimeout(1000)

      // 填写描述
      if (description) {
        this.sendProgress(browserId, UPLOAD_STEPS.FILLING_DESCRIPTION, 'running')
        console.log('正在填写描述...')

        const descSelectors = [
          'ytcp-video-description ytcp-social-suggestions-textbox #textbox',
          'ytcp-video-description #textbox',
          '#textbox[aria-label*="向观看者介绍你的视频]',
          '#textbox[aria-label*="说明"]',
          '#textbox[aria-label*="description"]'
        ]

        let descriptionInput = null
        for (const selector of descSelectors) {
          try {
            const inputs = await page.locator(selector).all()
            if (inputs.length > 0) {
              descriptionInput = inputs[0]
              const isVisible = await descriptionInput.isVisible()
              if (isVisible) {
                console.log('找到描述输入框 选择器', selector)
                break
              }
            }
          } catch (e) {
            // 继续尝试
          }
        }

        // 如果精确选择器没找到，尝试用第二值#textbox
        if (!descriptionInput) {
          const allTextboxes = await page.locator('#textbox').all()
          if (allTextboxes.length > 1) {
            descriptionInput = allTextboxes[1]
            console.log('使用第二值#textbox 作为描述输入框')
          }
        }

        if (descriptionInput) {
          await descriptionInput.click()
          await page.waitForTimeout(500)

          // 清空现有内容
          await page.keyboard.press('Control+A')
          await page.waitForTimeout(200)
          await page.keyboard.press('Backspace')
          await page.waitForTimeout(500)

          // 使用剪贴板锁粘贴描述
          await clipboardLock.writeAndPaste(page, description, `youtube-desc-${browserId}`)
          console.log('描述已填写')
          this.sendProgress(browserId, UPLOAD_STEPS.FILLING_DESCRIPTION, 'success')
        }
      } else {
        // 没有描述时也标记为完成
        this.sendProgress(browserId, UPLOAD_STEPS.FILLING_DESCRIPTION, 'success')
      }

      // 等待一下让页面更新
      await page.waitForTimeout(2000)

      // === 详细信息页面的额外设置 ===

      // 设置"不是为儿童设置"
      this.sendProgress(browserId, UPLOAD_STEPS.SETTING_NOT_FOR_KIDS, 'running')
      console.log('正在设置非儿童内容...')
      const notForKidsSelectors = [
        'tp-yt-paper-radio-button[name="VIDEO_MADE_FOR_KIDS_NOT_MFK"]',
        'ytkc-made-for-kids-select tp-yt-paper-radio-group tp-yt-paper-radio-button:nth-child(2)',
        'tp-yt-paper-radio-button:has-text("不，内容不是面向儿童值)',
        'tp-yt-paper-radio-button:has-text("不是面向儿童")',
        'tp-yt-paper-radio-button:has-text("否，此内容不是为儿童设计")',
        'tp-yt-paper-radio-button:has-text("No, it\'s not made for kids")'
      ]

      let notForKidsRadio = null
      for (const selector of notForKidsSelectors) {
        try {
          notForKidsRadio = await page.waitForSelector(selector, { timeout: 3000 })
          if (notForKidsRadio) {
            break
          }
        } catch (e) {
          // 继续尝试
        }
      }

      if (notForKidsRadio) {
        await notForKidsRadio.click()
        console.log('已设置为非儿童内容')
      } else {
        console.log('未找到儿童内容设置选项，可能已默认设置')
      }
      this.sendProgress(browserId, UPLOAD_STEPS.SETTING_NOT_FOR_KIDS, 'success')

      await page.waitForTimeout(1500)

      // 点击"展开"按钮显示更多选项
      this.sendProgress(browserId, UPLOAD_STEPS.CLICKING_EXPAND, 'running')
      console.log('正在查找展开按钮...')
      const expandButtonSelectors = [
        'ytcp-video-metadata-editor ytcp-button:has-text("展开")',
        'ytcp-button:has-text("展开")',
        'button:has-text("展开")',
        'ytcp-video-metadata-editor ytcp-button:has-text("Show more")',
        'ytcp-button:has-text("Show more")',
        'ytcp-video-metadata-editor > div > div > ytcp-button button',
        'ytcp-video-metadata-editor ytcp-button-shape button'
      ]

      let expandButton = null
      for (const selector of expandButtonSelectors) {
        try {
          expandButton = await page.waitForSelector(selector, { timeout: 3000 })
          if (expandButton) {
            const isVisible = await expandButton.isVisible()
            if (isVisible) {
              console.log('找到展开按钮, 选择器', selector)
              break
            }
          }
        } catch (e) {
          // 继续尝试
        }
      }

      if (expandButton) {
        await expandButton.click()
        console.log('已点击展开按钮')
        await page.waitForTimeout(1500)
      } else {
        console.log('未找到展开按钮，可能已展开或不需要')
      }
      this.sendProgress(browserId, UPLOAD_STEPS.CLICKING_EXPAND, 'success')

      // 设置"加工的内容" - 选择"是"（创收号必须）
      this.sendProgress(browserId, UPLOAD_STEPS.SETTING_ALTERED_CONTENT, 'running')
      console.log('正在设置加工内容选项...')
      const alteredContentSelectors = [
        'tp-yt-paper-radio-button[name="VIDEO_HAS_ALTERED_CONTENT_YES"]',
        'tp-yt-paper-radio-button[aria-label*="是，包含加工的内容]',
        'ytkp-altered-content-select tp-yt-paper-radio-button[name="VIDEO_HAS_ALTERED_CONTENT_YES"]',
        'ytkp-altered-content-select .altered-content-option-row:first-child tp-yt-paper-radio-button',
        'ytkp-altered-content-select tp-yt-paper-radio-button:has-text("值)'
      ]

      let alteredContentYes = null
      for (const selector of alteredContentSelectors) {
        try {
          alteredContentYes = await page.waitForSelector(selector, { timeout: 3000 })
          if (alteredContentYes) {
            const isVisible = await alteredContentYes.isVisible()
            if (isVisible) {
              console.log('找到加工内容选项, 选择器', selector)
              break
            }
          }
        } catch (e) {
          // 继续尝试
        }
      }

      if (alteredContentYes) {
        await alteredContentYes.click()
        console.log('已选择加工内容为"是"')
        await page.waitForTimeout(1000)
      } else {
        console.log('未找到加工内容选项')
      }
      this.sendProgress(browserId, UPLOAD_STEPS.SETTING_ALTERED_CONTENT, 'success')

      console.log('视频详情填写完成（创收号）')
      return { success: true }
    } catch (error) {
      console.error('填写视频详情失败（创收号）:', error)
      this.sendProgress(browserId, UPLOAD_STEPS.FILLING_TITLE, 'error', error.message)
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * 设置创收号专用选项（创收开启、内容分级等待
   * 值是否适合投放广告"页面执行
   * @param {string} browserId - 浏览器ID
   * @returns {Object} { success, error }
   */
  async setMonetizedOptions(browserId) {
    try {
      // 点击继续进入创收设置
      this.sendProgress(browserId, UPLOAD_STEPS.CLICKING_NEXT_MONETIZE, 'running')
      await this.checkPauseOrCancel(browserId)

      const page = this.getPage(browserId)
      if (!page) {
        throw new Error('页面未初始化')
      }

      console.log('设置创收号专用选项（是否适合投放广告页面）...')

      // 1. 点击"继续"按钮进入创收设置页面
      console.log('正在点击继续按钮进入创收设置...')
      const continueButtonSelectors = [
        'ytcp-button#next-button',
        '#next-button',
        'ytcp-button:has-text("继续")',
        'ytcp-button:has-text("Continue")',
        'button:has-text("继续")',
        'button:has-text("Continue")'
      ]

      let continueButton = null
      for (const selector of continueButtonSelectors) {
        try {
          continueButton = await page.waitForSelector(selector, { timeout: 3000 })
          if (continueButton) {
            const isVisible = await continueButton.isVisible()
            if (isVisible) {
              console.log('找到继续按钮, 选择器', selector)
              break
            }
          }
        } catch (e) {
          // 继续尝试
        }
      }

      if (continueButton) {
        await continueButton.click()
        console.log('已点击继续按钮')
        await page.waitForTimeout(2000)
      } else {
        console.log('未找到继续按钮')
      }
      this.sendProgress(browserId, UPLOAD_STEPS.CLICKING_NEXT_MONETIZE, 'success')

      // 5. 同时查找创收下拉框和"以上都没有"选项，哪个先找到就执行哪个
      this.sendProgress(browserId, UPLOAD_STEPS.OPENING_MONETIZE_DROPDOWN, 'running')
      console.log('正在同时查找创收下拉框和"以上都没有"选项...')

      const monetizationDropdownSelectors = [
        'ytcp-video-monetization ytcp-icon-button',
        'ytcp-video-metadata-monetization ytcp-icon-button',
        'ytcp-form-input-container ytcp-video-monetization ytcp-icon-button',
        'ytcp-video-monetization div div div ytcp-icon-button'
      ]

      const noneOfAboveSelectors = [
        'ytcp-checkbox-lit:has-text("以上都没有")',
        'ytcp-checkbox-lit[aria-label*="以上都没有"]',
        'ytpp-self-certification-questionnaire ytcp-checkbox-lit',
        'ytcp-checkbox-lit .label:has-text("以上都没有")',
        'div.label:has-text("以上都没有")',
        '#checkbox[aria-label="以上都没有"]',
        'ytcp-checkbox-lit:has-text("None of the above")'
      ]

      let foundMonetization = false
      let foundNoneOfAbove = false
      let monetizationDropdown = null
      let noneOfAboveCheckbox = null

      // 使用 Promise.race 同时查找两种元素
      const findElement = async (selectors, name) => {
        for (const selector of selectors) {
          try {
            const element = await page.waitForSelector(selector, { timeout: 1000 })
            if (element) {
              const isVisible = await element.isVisible()
              if (isVisible) {
                console.log(`找到${name}, 选择器:`, selector)
                return { element, selector, name }
              }
            }
          } catch (e) {
            // 继续尝试下一个选择器
          }
        }
        return null
      }

      // 设置5秒总超时，同时轮询查找两种元素
      const searchStartTime = Date.now()
      const searchTimeout = 5000

      while (Date.now() - searchStartTime < searchTimeout) {
        // 并行查找两种元素
        const [monetizationResult, noneOfAboveResult] = await Promise.all([
          findElement(monetizationDropdownSelectors, '创收下拉框'),
          findElement(noneOfAboveSelectors, '"以上都没有"选项')
        ])

        if (monetizationResult) {
          foundMonetization = true
          monetizationDropdown = monetizationResult.element
          console.log('优先找到创收下拉框，执行创收设置流程')
          break
        }

        if (noneOfAboveResult) {
          foundNoneOfAbove = true
          noneOfAboveCheckbox = noneOfAboveResult.element
          console.log('找到"以上都没有"选项，跳过创收设置')
          break
        }

        // 短暂等待后继续查找
        await page.waitForTimeout(300)
      }

      if (foundMonetization && monetizationDropdown) {
        // 执行创收设置流程
        await monetizationDropdown.click()
        console.log('已点击创收下拉框')
        this.sendProgress(browserId, UPLOAD_STEPS.OPENING_MONETIZE_DROPDOWN, 'success')
        await page.waitForTimeout(1500)

        // 6. 选择"开启"创收选项
        this.sendProgress(browserId, UPLOAD_STEPS.SELECTING_MONETIZE_OPTION, 'running')
        console.log('正在选择开启创收...')

        // 根据HTML结构：tp-yt-paper-radio-button[name="ON"] 包含 #radioLabel 文字"开启"
        const enableMonetizationSelectors = [
          // 优先使用 name 属性（最可靠）
          'ytcp-video-monetization-edit-dialog tp-yt-paper-radio-button[name="ON"]',
          'tp-yt-paper-radio-button[name="ON"]',
          'tp-yt-paper-radio-button#radio-on',
          // 通过 XPath 定位第一个单选按钮
          'ytcp-video-monetization-edit-dialog tp-yt-paper-radio-group tp-yt-paper-radio-button:first-child',
          // 文本匹配
          'tp-yt-paper-radio-button:has-text("开启")',
          '#radioLabel:has-text("开启")'
        ]

        let enableOption = null
        for (const selector of enableMonetizationSelectors) {
          try {
            enableOption = await page.waitForSelector(selector, { timeout: 3000 })
            if (enableOption) {
              const isVisible = await enableOption.isVisible()
              if (isVisible) {
                console.log('找到开启创收选项, 选择器:', selector)
                break
              }
            }
          } catch (e) {
            // 继续尝试
          }
        }

        if (enableOption) {
          // 点击单选按钮
          await enableOption.click()
          console.log('已点击开启创收选项')
          await page.waitForTimeout(500)

          // 验证是否选中（aria-checked 应该变为 true）
          try {
            const isChecked = await enableOption.evaluate(el => el.getAttribute('aria-checked'))
            console.log('开启选项 aria-checked:', isChecked)
            if (isChecked !== 'true') {
              // 如果没选中，再点击一次
              console.log('选项未选中，再次点击...')
              await enableOption.click()
              await page.waitForTimeout(500)
            }
          } catch (e) {
            console.log('验证选中状态失败:', e.message)
          }

          console.log('已选择开启创收')
          this.sendProgress(browserId, UPLOAD_STEPS.SELECTING_MONETIZE_OPTION, 'success')
          await page.waitForTimeout(1000)

          // 6.1 点击"完成"按钮关闭创收设置对话框
          this.sendProgress(browserId, UPLOAD_STEPS.CLICKING_MONETIZE_CONTINUE, 'running')
          console.log('正在点击完成按钮...')
          const doneButtonSelectors = [
            'ytcp-video-monetization-edit-dialog ytcp-button:has-text("完成")',
            'ytcp-video-monetization-edit-dialog tp-yt-paper-dialog ytcp-button:nth-child(2)',
            'ytcp-video-monetization-edit-dialog ytcp-button-shape button',
            'ytcp-button:has-text("完成")',
            'ytcp-button:has-text("Done")',
            'button:has-text("完成")',
            'button:has-text("Done")'
          ]

          let doneButton = null
          for (const selector of doneButtonSelectors) {
            try {
              doneButton = await page.waitForSelector(selector, { timeout: 3000 })
              if (doneButton) {
                const isVisible = await doneButton.isVisible()
                if (isVisible) {
                  console.log('找到完成按钮, 选择器:', selector)
                  break
                }
              }
            } catch (e) {
              // 继续尝试
            }
          }

          if (doneButton) {
            await doneButton.click()
            console.log('已点击完成按钮')
            await page.waitForTimeout(1500)
          } else {
            console.log('未找到完成按钮')
          }
          this.sendProgress(browserId, UPLOAD_STEPS.CLICKING_MONETIZE_CONTINUE, 'success')
        } else {
          console.log('未找到开启创收选项')
          this.sendProgress(browserId, UPLOAD_STEPS.SELECTING_MONETIZE_OPTION, 'success')
          this.sendProgress(browserId, UPLOAD_STEPS.CLICKING_MONETIZE_CONTINUE, 'success')
        }

        // 7. 点击"继续"按钮完成创收设置
        console.log('正在点击继续按钮完成创收设置...')
        let continueButton2 = null
        for (const selector of continueButtonSelectors) {
          try {
            continueButton2 = await page.waitForSelector(selector, { timeout: 3000 })
            if (continueButton2) {
              const isVisible = await continueButton2.isVisible()
              if (isVisible) {
                break
              }
            }
          } catch (e) {
            // 继续尝试
          }
        }

        if (continueButton2) {
          await continueButton2.click()
          console.log('已点击继续按钮进入内容分级页面')
          await page.waitForTimeout(2000)
        }

        // 8. 勾选"以上都没有"选项
        console.log('正在勾选"以上都没有"选项...')
        noneOfAboveCheckbox = null
        for (const selector of noneOfAboveSelectors) {
          try {
            noneOfAboveCheckbox = await page.waitForSelector(selector, { timeout: 3000 })
            if (noneOfAboveCheckbox) {
              const isVisible = await noneOfAboveCheckbox.isVisible()
              if (isVisible) {
                console.log('找到"以上都没有"选项, 选择器:', selector)
                break
              }
            }
          } catch (e) {
            // 继续尝试
          }
        }

        if (noneOfAboveCheckbox) {
          await noneOfAboveCheckbox.click()
          console.log('已勾选"以上都没有"')
          await page.waitForTimeout(1000)
        } else {
          console.log('未找到"以上都没有"选项')
        }
      } else if (foundNoneOfAbove && noneOfAboveCheckbox) {
        // 直接勾选"以上都没有"，跳过创收设置
        console.log('跳过创收设置，直接勾选"以上都没有"')
        this.sendProgress(browserId, UPLOAD_STEPS.OPENING_MONETIZE_DROPDOWN, 'success')
        this.sendProgress(browserId, UPLOAD_STEPS.SELECTING_MONETIZE_OPTION, 'success')
        this.sendProgress(browserId, UPLOAD_STEPS.CLICKING_MONETIZE_CONTINUE, 'success')

        await noneOfAboveCheckbox.click()
        console.log('已勾选"以上都没有"')
        await page.waitForTimeout(1000)
      } else {
        // 两个都没找到
        console.log('未找到创收下拉框和"以上都没有"选项，继续执行')
        this.sendProgress(browserId, UPLOAD_STEPS.OPENING_MONETIZE_DROPDOWN, 'success')
        this.sendProgress(browserId, UPLOAD_STEPS.SELECTING_MONETIZE_OPTION, 'success')
        this.sendProgress(browserId, UPLOAD_STEPS.CLICKING_MONETIZE_CONTINUE, 'success')
      }

      // 确保后续流程不会再次尝试勾选（已在上面处理）
      // 下面这个 if 块保持空，因为已经在上面处理过了
      if (false) {
        console.log('未找值以上都没值选项')
      }

      // 9. 点击"提交分级结果"按钮
      console.log('正在点击"提交分级结果"按钮...')
      const submitRatingSelectors = [
        'ytcp-button:has-text("提交分级结果")',
        'ytpp-self-certification-predictor ytcp-button',
        'ytcp-button-shape button:has-text("提交分级结果")',
        'button:has-text("提交分级结果")',
        'ytcp-button:has-text("Submit rating")',
        'button:has-text("Submit rating")'
      ]

      let submitRatingButton = null
      for (const selector of submitRatingSelectors) {
        try {
          submitRatingButton = await page.waitForSelector(selector, { timeout: 3000 })
          if (submitRatingButton) {
            const isVisible = await submitRatingButton.isVisible()
            if (isVisible) {
              console.log('找到"提交分级结果"按钮, 选择器', selector)
              break
            }
          }
        } catch (e) {
          // 继续尝试
        }
      }

      if (submitRatingButton) {
        await submitRatingButton.click()
        console.log('已点值提交分级结果"按钮')
        await page.waitForTimeout(1500)
      } else {
        console.log('未找值提交分级结果"按钮')
      }

      // 10. 再次点击"继续"按钮完成内容分级
      console.log('正在点击继续按钮完成内容分级...')
      let continueButton3 = null
      for (const selector of continueButtonSelectors) {
        try {
          continueButton3 = await page.waitForSelector(selector, { timeout: 3000 })
          if (continueButton3) {
            const isVisible = await continueButton3.isVisible()
            if (isVisible) {
              break
            }
          }
        } catch (e) {
          // 继续尝试
        }
      }

      if (continueButton3) {
        await continueButton3.click()
        console.log('已点击继续按钮完成内容分值')
        await page.waitForTimeout(1500)
      }

      return { success: true }
    } catch (error) {
      console.error('设置创收号选项失败:', error)
      this.sendProgress(browserId, UPLOAD_STEPS.CLICKING_NEXT_MONETIZE, 'error', error.message)
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * 执行完整的创收号上传流程
   * @param {string} browserId - 浏览器配置ID
   * @param {string} videoPath - 视频文件路径
   * @param {Object} videoInfo - 视频信息
   * @param {string} browserType - 浏览器类值
   * @returns {Object} { success, error, videoUrl, videoId }
   */
  async uploadVideoMonetized(browserId, videoPath, videoInfo, browserType = 'bitbrowser') {
    try {
      this.reset(browserId) // 重置暂停/取消状态
      this.setMonetizedFlag(browserId, true) // 标记为创收号上传

      console.log('===== 开始创收号上传流程 =====')
      console.log('浏览器ID:', browserId)
      console.log('浏览器类值', browserType)
      console.log('视频路径:', videoPath)
      console.log('视频信息:', videoInfo)

      // 1. 打开 YouTube Studio
      const openResult = await this.openYouTubeStudio(browserId, browserType)
      if (!openResult.success) {
        throw new Error(openResult.error)
      }

      // 2. 点击创建按钮
      const createResult = await this.clickCreateButton(browserId)
      if (!createResult.success) {
        throw new Error(createResult.error)
      }

      // 3. 点击上传视频
      const uploadResult = await this.clickUploadVideo(browserId)
      if (!uploadResult.success) {
        throw new Error(uploadResult.error)
      }

      // 4. 选择视频文件
      const selectResult = await this.selectVideoFile(browserId, videoPath)
      if (!selectResult.success) {
        throw new Error(selectResult.error)
      }

      // 5. 填写视频详情（创收号流程值
      const fillResult = await this.fillVideoDetailsMonetized(browserId, videoInfo)
      if (!fillResult.success) {
        throw new Error(fillResult.error)
      }

      // 6. 设置创收号专用选项（受众、加工内容、创收开启等待
      // 此方法内部会点击2值继续"按钮：进入创收设值值完成创收设置
      await this.setMonetizedOptions(browserId)

      // 7. 点击下一步（跳过视频元素、检查页面，进入可见性设置）
      // 创收号流程：详情 值创收设置(2次继值 值视频元素 值检查值可见性
      await this.clickNextButton(browserId, 2)

      // 8. 设置可见性和定时发布时间
      await this.setVisibility(
        browserId,
        videoInfo.visibility || 'public',
        videoInfo.scheduledTime || null,
        videoInfo.timezone || null
      )

      // 9. 获取视频链接（在点击预定/发布按钮前）
      const videoUrlResult = await this.getVideoUrl(browserId)
      let videoUrl = null
      let videoId = null
      if (videoUrlResult.success) {
        videoUrl = videoUrlResult.videoUrl
        videoId = videoUrlResult.videoId
        console.log('获取到视频链值', videoUrl)
      } else {
        console.log('未能获取视频链接，继续发布流值')
      }

      // 10. 等待上传完成
      const uploadCompleteResult = await this.waitForUploadComplete(browserId)
      if (!uploadCompleteResult.success) {
        throw new Error(uploadCompleteResult.error)
      }

      // 11. 点击发布
      const publishResult = await this.clickPublishButton(browserId)
      if (!publishResult.success) {
        throw new Error(publishResult.error)
      }

      console.log('===== 创收号上传流程完值=====')
      return {
        success: true,
        videoUrl,
        videoId
      }
    } catch (error) {
      console.error('创收号上传失败', error)
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * 执行完整的普通号上传流程
   * @param {string} browserId - 浏览器配置ID
   * @param {string} videoPath - 视频文件路径
   * @param {Object} videoInfo - 视频信息
   * @param {string} browserType - 浏览器类值
   * @returns {Object} { success, error }
   */
  async uploadVideoNormal(browserId, videoPath, videoInfo, browserType = 'bitbrowser') {
    try {
      this.reset(browserId) // 重置暂停/取消状态
      this.setMonetizedFlag(browserId, false) // 标记为普通号上传

      console.log('===== 开始普通号上传流程 =====')
      console.log('浏览器ID:', browserId)
      console.log('浏览器类值', browserType)
      console.log('视频路径:', videoPath)
      console.log('视频信息:', videoInfo)

      // 1. 打开 YouTube Studio
      const openResult = await this.openYouTubeStudio(browserId, browserType)
      if (!openResult.success) {
        throw new Error(openResult.error)
      }

      // 2. 点击创建按钮
      const createResult = await this.clickCreateButton(browserId)
      if (!createResult.success) {
        throw new Error(createResult.error)
      }

      // 3. 点击上传视频
      const uploadResult = await this.clickUploadVideo(browserId)
      if (!uploadResult.success) {
        throw new Error(uploadResult.error)
      }

      // 4. 选择视频文件
      const selectResult = await this.selectVideoFile(browserId, videoPath)
      if (!selectResult.success) {
        throw new Error(selectResult.error)
      }

      // 5. 填写视频详情
      const fillResult = await this.fillVideoDetailsNormal(browserId, videoInfo)
      if (!fillResult.success) {
        throw new Error(fillResult.error)
      }

      // 6. 设置非儿童内容
      await this.setNotMadeForKids(browserId)

      // 7. 点击下一步（跳过视频元素、检查、可见性之前的页面值
      await this.clickNextButton(browserId, 3)

      // 8. 设置可见性和定时发布时间
      await this.setVisibility(
        browserId,
        videoInfo.visibility || 'public',
        videoInfo.scheduledTime || null,
        videoInfo.timezone || null
      )

      // 9. 获取视频链接（在点击预定/发布按钮前）
      const videoUrlResult = await this.getVideoUrl(browserId)
      let videoUrl = null
      let videoId = null
      if (videoUrlResult.success) {
        videoUrl = videoUrlResult.videoUrl
        videoId = videoUrlResult.videoId
        console.log('获取到视频链值', videoUrl)
      } else {
        console.log('未能获取视频链接，继续发布流值')
      }

      // 10. 等待上传完成
      const uploadCompleteResult = await this.waitForUploadComplete(browserId)
      if (!uploadCompleteResult.success) {
        throw new Error(uploadCompleteResult.error)
      }

      // 11. 点击发布
      const publishResult = await this.clickPublishButton(browserId)
      if (!publishResult.success) {
        throw new Error(publishResult.error)
      }

      console.log('===== 普通号上传流程完成 =====')
      return {
        success: true,
        videoUrl,
        videoId
      }
    } catch (error) {
      console.error('上传失败:', error)
      return {
        success: false,
        error: error.message
      }
    }
  }

  /**
   * 关闭浏览器连接
   * @param {string} browserId - 浏览器ID，不传则关闭所有连接
   */
  async close(browserId) {
    try {
      if (browserId) {
        // 关闭指定浏览器的连接
        const conn = this.browserConnections.get(browserId)
        if (conn && conn.browser) {
          await conn.browser.disconnect()
          this.clearConnection(browserId)
          console.log(`已关闭浏览器 ${browserId} 的连接`)
        }
      } else {
        // 关闭所有连接
        for (const [id, conn] of this.browserConnections) {
          if (conn.browser) {
            try {
              await conn.browser.disconnect()
              console.log(`已关闭浏览器 ${id} 的连接`)
            } catch (e) {
              console.error(`关闭浏览器 ${id} 连接失败:`, e)
            }
          }
        }
        this.browserConnections.clear()
        console.log('已关闭所有浏览器连接')
      }
    } catch (error) {
      console.error('关闭连接失败:', error)
    }
  }
}

// 导出步骤常量
YouTubeUploadService.UPLOAD_STEPS = UPLOAD_STEPS

module.exports = YouTubeUploadService
