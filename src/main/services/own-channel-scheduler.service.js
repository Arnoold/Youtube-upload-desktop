/**
 * 自有频道定时任务服务
 * 用于定时执行自有频道解说词获取任务
 */

class OwnChannelSchedulerService {
  constructor() {
    this.checkInterval = null
    this.isRunning = false
    this.config = {
      enabled: false,
      executeTime: '09:00', // 默认09:00，与对标频道08:00错开
      daysBack: 3,
      daysForward: 1,
      minViews: 10, // 万
      lastExecuteDate: null,
      lastExecuteKey: null, // 日期+时间的组合，用于防止修改时间后不执行的问题
      selectedBrowserIds: [], // 预选的浏览器ID列表，空数组表示使用所有启用的浏览器
      generationStatus: 'pending_all' // 生成状态: 'pending_all'=待生成(null+pending), 'generating'=生成中, 'completed'=已完成, 'failed'=失败, 'all'=全部
    }
    this.services = null
    this.mainWindow = null
    this.logs = []
    this.maxLogs = 100 // 最多保存100条日志
  }

  /**
   * 初始化服务
   */
  init(services, mainWindow) {
    this.services = services
    this.mainWindow = mainWindow
    this.loadConfig()
    this.startChecker()
    console.log('[OwnChannelScheduler] 服务已初始化')
  }

  /**
   * 加载配置
   */
  async loadConfig() {
    try {
      const { dbService } = this.services
      const savedConfig = await dbService.getSetting('own_channel_scheduler_config')
      if (savedConfig) {
        this.config = { ...this.config, ...JSON.parse(savedConfig) }
      }
      const savedLogs = await dbService.getSetting('own_channel_scheduler_logs')
      if (savedLogs) {
        this.logs = JSON.parse(savedLogs)
      }
      console.log('[OwnChannelScheduler] 配置已加载:', this.config)
    } catch (error) {
      console.error('[OwnChannelScheduler] 加载配置失败:', error)
    }
  }

  /**
   * 保存配置
   */
  async saveConfig() {
    try {
      const { dbService } = this.services
      await dbService.setSetting('own_channel_scheduler_config', JSON.stringify(this.config))
      console.log('[OwnChannelScheduler] 配置已保存')
    } catch (error) {
      console.error('[OwnChannelScheduler] 保存配置失败:', error)
    }
  }

  /**
   * 保存日志
   */
  async saveLogs() {
    try {
      const { dbService } = this.services
      // 只保留最近的日志
      if (this.logs.length > this.maxLogs) {
        this.logs = this.logs.slice(-this.maxLogs)
      }
      await dbService.setSetting('own_channel_scheduler_logs', JSON.stringify(this.logs))
    } catch (error) {
      console.error('[OwnChannelScheduler] 保存日志失败:', error)
    }
  }

  /**
   * 添加日志
   */
  addLog(type, message, details = null) {
    const log = {
      time: new Date().toISOString(),
      type, // 'info' | 'success' | 'error' | 'warning'
      message,
      details
    }
    this.logs.push(log)
    this.saveLogs()

    // 通知前端
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('own-channel-scheduler:log', log)
    }

    console.log(`[OwnChannelScheduler] [${type.toUpperCase()}] ${message}`)
  }

  /**
   * 启动定时检查器
   */
  startChecker() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval)
    }

    // 每分钟检查一次
    this.checkInterval = setInterval(() => {
      this.checkAndExecute()
    }, 60 * 1000)

    // 立即检查一次
    this.checkAndExecute()

    console.log('[OwnChannelScheduler] 定时检查器已启动')
  }

  /**
   * 停止定时检查器
   */
  stopChecker() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval)
      this.checkInterval = null
    }
    console.log('[OwnChannelScheduler] 定时检查器已停止')
  }

  /**
   * 检查是否需要执行
   */
  async checkAndExecute() {
    if (!this.config.enabled) {
      return
    }

    if (this.isRunning) {
      console.log('[OwnChannelScheduler] 任务正在执行中，跳过本次检查')
      return
    }

    const now = new Date()
    const today = now.toISOString().split('T')[0] // YYYY-MM-DD

    // 检查是否到达执行时间
    const [targetHour, targetMinute] = this.config.executeTime.split(':').map(Number)
    const currentHour = now.getHours()
    const currentMinute = now.getMinutes()

    if (currentHour === targetHour && currentMinute === targetMinute) {
      // 生成今天这个时间点的唯一标识（日期+时间）
      const executeKey = `${today}_${this.config.executeTime}`

      // 检查这个时间点是否已经执行过
      if (this.config.lastExecuteKey === executeKey) {
        return
      }

      console.log('[OwnChannelScheduler] 到达执行时间，开始执行定时任务')
      this.addLog('info', `到达执行时间 ${this.config.executeTime}，开始执行定时任务`)
      await this.executeTask()
    }
  }

  /**
   * 执行定时任务
   * @param {boolean} updateLastExecuteDate - 是否更新最后执行日期（定时执行时为 true，手动执行时为 false）
   */
  async executeTask(updateLastExecuteDate = true) {
    if (this.isRunning) {
      this.addLog('warning', '任务正在执行中，请勿重复执行')
      return { success: false, message: '任务正在执行中' }
    }

    this.isRunning = true
    const startTime = Date.now()

    try {
      const { dbService, supabaseService, aiStudioService } = this.services

      // 通知前端任务开始
      this.notifyStatus({ status: 'running', step: 'start', message: '定时任务开始执行...' })

      // 1. 计算日期范围
      const now = new Date()
      const startDate = new Date(now)
      startDate.setDate(startDate.getDate() - this.config.daysBack)
      startDate.setHours(0, 0, 0, 0)

      const endDate = new Date(now)
      endDate.setDate(endDate.getDate() + this.config.daysForward)
      endDate.setHours(23, 59, 59, 999)

      const statusLabels = {
        'pending_all': '待生成',
        'generating': '生成中',
        'completed': '已完成',
        'failed': '失败',
        'all': '全部'
      }
      const statusLabel = statusLabels[this.config.generationStatus] || '待生成'
      this.addLog('info', `查询视频: ${startDate.toLocaleDateString()} ~ ${endDate.toLocaleDateString()}, 最小播放量: ${this.config.minViews}万, 生成状态: ${statusLabel}`)
      this.notifyStatus({ status: 'running', step: 'query', message: '正在查询符合条件的视频...' })

      // 2. 查询视频（自有频道视频表）
      const queryOptions = {
        dateRange: [startDate.toISOString(), endDate.toISOString()],
        minViews: this.config.minViews * 10000,
        status: this.config.generationStatus || 'pending_all',
        limit: 500,
        sortBy: 'published_at',
        sortOrder: 'desc',
        tableName: 'own_videos' // 关键：指定查询自有频道视频表
      }

      let allVideos = []
      let page = 1
      let hasMore = true

      while (hasMore) {
        const result = await supabaseService.getVideos({ ...queryOptions, page })
        allVideos = allVideos.concat(result.data)

        if (result.data.length < queryOptions.limit || allVideos.length >= result.total) {
          hasMore = false
        } else {
          page++
        }
      }

      if (allVideos.length === 0) {
        this.addLog('info', '没有找到符合条件的视频，任务结束')
        this.notifyStatus({ status: 'completed', step: 'done', message: '没有找到符合条件的视频' })
        if (updateLastExecuteDate) {
          this.updateLastExecuteDate()
        }
        this.isRunning = false
        return { success: true, message: '没有找到符合条件的视频' }
      }

      this.addLog('success', `找到 ${allVideos.length} 个符合条件的视频`)
      this.notifyStatus({ status: 'running', step: 'create_task', message: `找到 ${allVideos.length} 个视频，正在创建任务...` })

      // 3. 创建任务（自有频道任务）
      const taskName = `自有频道定时_${now.toLocaleDateString('zh-CN').replace(/\//g, '-')}_${now.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }).replace(':', '')}`

      const taskId = dbService.createOwnChannelTask({
        name: taskName,
        filters: {
          daysBack: this.config.daysBack,
          daysForward: this.config.daysForward,
          minViews: this.config.minViews,
          generationStatus: this.config.generationStatus,
          scheduledTask: true // 标记为定时任务创建
        },
        status: 'pending'
      })

      // 4. 添加任务项（循环添加到自有频道任务项表）
      // 注意：own_videos 表可能没有 url 字段，需要手动构建
      for (const video of allVideos) {
        const videoInfo = {
          id: video.id,  // Supabase 记录 ID，用于更新状态
          video_id: video.video_id,
          url: video.url || `https://www.youtube.com/watch?v=${video.video_id}`,
          title: video.title,
          channel_id: video.channel_id
        }
        dbService.addOwnChannelTaskItem(taskId, video.video_id, videoInfo)
      }

      this.addLog('success', `任务创建成功: ${taskName} (ID: ${taskId})`)
      this.notifyStatus({ status: 'running', step: 'get_browsers', message: '正在获取可用浏览器...' })

      // 5. 获取浏览器
      const accounts = dbService.getAIStudioAccounts()
      const activeBrowsers = accounts.filter(a => a.status === 'active')

      // 根据预选配置筛选浏览器
      let browsersToUse = activeBrowsers
      if (this.config.selectedBrowserIds && this.config.selectedBrowserIds.length > 0) {
        // 使用预选的浏览器（必须是启用状态的）
        browsersToUse = activeBrowsers.filter(b => this.config.selectedBrowserIds.includes(b.bit_browser_id))
      }

      if (browsersToUse.length === 0) {
        this.addLog('error', '没有可用的浏览器账号，任务暂停')
        this.notifyStatus({ status: 'error', step: 'error', message: '没有可用的浏览器账号' })
        this.isRunning = false
        return { success: false, message: '没有可用的浏览器账号' }
      }

      this.addLog('info', `使用 ${browsersToUse.length} 个浏览器并行执行`)
      this.notifyStatus({ status: 'running', step: 'execute', message: `使用 ${browsersToUse.length} 个浏览器开始执行...` })

      // 6. 执行任务（使用 'own_channel' 任务类型）
      const browserIds = browsersToUse.map(b => b.bit_browser_id)

      // 设置进度回调
      const progressCallback = (progress) => {
        // 发送 scheduler 状态更新
        this.notifyStatus({
          status: 'running',
          step: 'processing',
          message: progress.message || '处理中...',
          progress: {
            current: progress.current,
            total: progress.total,
            percent: Math.round((progress.current / progress.total) * 100)
          }
        })

        // 同时发送 aistudio:progress 事件，让 OwnChannelCommentaryPage 也能显示进度
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send('aistudio:progress', progress)
        }
      }

      await aiStudioService.startParallelTask(taskId, browserIds, progressCallback, 'own_channel')

      // 7. 完成
      const duration = Math.round((Date.now() - startTime) / 1000)
      this.addLog('success', `定时任务执行完成，耗时 ${duration} 秒`)
      this.notifyStatus({ status: 'completed', step: 'done', message: `任务执行完成，耗时 ${duration} 秒` })

      // 更新最后执行日期（仅定时执行时更新，手动执行不更新）
      if (updateLastExecuteDate) {
        this.updateLastExecuteDate()
      }

      this.isRunning = false
      return { success: true, message: '任务执行完成', duration }

    } catch (error) {
      this.addLog('error', `定时任务执行失败: ${error.message}`)
      this.notifyStatus({ status: 'error', step: 'error', message: `执行失败: ${error.message}` })
      this.isRunning = false
      return { success: false, message: error.message }
    }
  }

  /**
   * 更新最后执行日期和执行标识
   */
  updateLastExecuteDate() {
    const today = new Date().toISOString().split('T')[0]
    this.config.lastExecuteDate = today
    // 同时更新执行标识（日期+时间），用于防止同一时间点重复执行
    this.config.lastExecuteKey = `${today}_${this.config.executeTime}`
    this.saveConfig()
  }

  /**
   * 通知前端状态
   */
  notifyStatus(status) {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('own-channel-scheduler:status', status)
    }
  }

  /**
   * 获取配置
   */
  getConfig() {
    return {
      ...this.config,
      isRunning: this.isRunning,
      nextExecuteTime: this.getNextExecuteTime()
    }
  }

  /**
   * 更新配置
   */
  async updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig }
    await this.saveConfig()
    return this.getConfig()
  }

  /**
   * 启用定时任务
   */
  async enable() {
    this.config.enabled = true
    await this.saveConfig()
    this.addLog('info', '定时任务已启用')
    return this.getConfig()
  }

  /**
   * 禁用定时任务
   */
  async disable() {
    this.config.enabled = false
    await this.saveConfig()
    this.addLog('info', '定时任务已禁用')
    return this.getConfig()
  }

  /**
   * 获取下次执行时间
   */
  getNextExecuteTime() {
    if (!this.config.enabled) {
      return null
    }

    const now = new Date()
    const today = now.toISOString().split('T')[0]
    const [targetHour, targetMinute] = this.config.executeTime.split(':').map(Number)

    let nextDate = new Date(now)
    nextDate.setHours(targetHour, targetMinute, 0, 0)

    // 如果今天已经执行过或者已经过了执行时间，则设为明天
    if (this.config.lastExecuteDate === today || now >= nextDate) {
      nextDate.setDate(nextDate.getDate() + 1)
    }

    return nextDate.toISOString()
  }

  /**
   * 获取日志
   */
  getLogs(limit = 50) {
    return this.logs.slice(-limit).reverse()
  }

  /**
   * 清空日志
   */
  async clearLogs() {
    this.logs = []
    await this.saveLogs()
    this.addLog('info', '日志已清空')
    return { success: true }
  }

  /**
   * 立即执行一次（用于测试）
   * 手动执行不会更新 lastExecuteDate，这样定时任务仍然会在设定时间执行
   */
  async executeNow() {
    this.addLog('info', '手动触发执行')
    return await this.executeTask(false) // false = 不更新 lastExecuteDate
  }

  /**
   * 获取运行状态
   */
  getStatus() {
    return {
      isRunning: this.isRunning,
      enabled: this.config.enabled,
      lastExecuteDate: this.config.lastExecuteDate,
      nextExecuteTime: this.getNextExecuteTime()
    }
  }
}

// 导出单例
module.exports = new OwnChannelSchedulerService()
