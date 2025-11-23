const EventEmitter = require('events')

class UploadService extends EventEmitter {
  constructor(dbService, bitBrowserService, playwrightService) {
    super()
    this.db = dbService
    this.bitBrowserService = bitBrowserService
    this.playwrightService = playwrightService

    this.activeUploads = new Map() // 当前正在上传的任务
    this.queue = [] // 待上传队列
    this.isProcessing = false
  }

  /**
   * 添加上传任务到队列
   * @param {Object} taskData - 任务数据
   * @returns {number} 任务ID
   */
  async addTask(taskData) {
    const taskId = this.db.createUploadTask(taskData)
    this.queue.push(taskId)

    console.log(`Task ${taskId} added to queue`)
    this.emit('task-added', { taskId })

    // 如果没有正在处理的任务，立即开始
    if (!this.isProcessing) {
      this.processQueue()
    }

    return taskId
  }

  /**
   * 处理队列
   */
  async processQueue() {
    if (this.queue.length === 0) {
      this.isProcessing = false
      console.log('Queue is empty')
      return
    }

    this.isProcessing = true
    const taskId = this.queue.shift()

    try {
      await this.executeTask(taskId)
    } catch (error) {
      console.error(`Task ${taskId} failed:`, error)
    }

    // 处理下一个任务
    setTimeout(() => this.processQueue(), 1000)
  }

  /**
   * 执行单个上传任务
   * @param {number} taskId - 任务ID
   */
  async executeTask(taskId) {
    console.log(`Starting task ${taskId}`)

    const task = this.db.getUploadTaskById(taskId)
    if (!task) {
      throw new Error(`Task ${taskId} not found`)
    }

    // 更新状态为上传中
    this.db.updateUploadTask(taskId, {
      status: 'uploading',
      startedAt: new Date().toISOString()
    })

    this.emit('task-update', { taskId, status: 'uploading', progress: 0 })

    let browserInfo = null
    let playwrightBrowserId = null

    try {
      // Step 1: 启动比特浏览器
      this.emitProgress(taskId, { step: 1, progress: 5, message: '正在启动浏览器...' })

      browserInfo = await this.bitBrowserService.startBrowser(task.bit_browser_id || task.browser_profile_id)

      if (!browserInfo.success) {
        throw new Error(browserInfo.message || '启动浏览器失败')
      }

      // Step 2: 连接 Playwright
      this.emitProgress(taskId, { step: 2, progress: 10, message: '正在连接浏览器...' })

      const { browserId, page } = await this.playwrightService.connectBrowser(browserInfo.wsEndpoint)
      playwrightBrowserId = browserId

      // Step 3: 检查登录状态
      this.emitProgress(taskId, { step: 3, progress: 15, message: '正在检查登录状态...' })

      const loginStatus = await this.playwrightService.checkYouTubeLogin(page)

      if (!loginStatus.isLoggedIn) {
        throw new Error('YouTube 未登录，请先在比特浏览器中登录 YouTube 账号')
      }

      // Step 4: 上传视频
      const result = await this.playwrightService.uploadVideo(
        page,
        {
          videoPath: task.video_path,
          title: task.title,
          description: task.description,
          tags: task.tags ? JSON.parse(task.tags) : [],
          privacy: task.privacy || 'public',
          thumbnail: task.thumbnail_path,
          madeForKids: task.made_for_kids === 1,
          channelId: task.channel_id
        },
        (progress) => {
          // 进度回调
          const totalProgress = 15 + Math.floor(progress.progress * 0.85)
          this.emitProgress(taskId, {
            ...progress,
            progress: totalProgress
          })

          // 更新数据库
          this.db.updateUploadTask(taskId, {
            progress: totalProgress
          })
        }
      )

      // Step 5: 更新任务为成功
      this.db.updateUploadTask(taskId, {
        status: 'completed',
        progress: 100,
        youtubeVideoId: result.videoId,
        youtubeVideoUrl: result.videoUrl,
        completedAt: new Date().toISOString()
      })

      this.emit('task-update', {
        taskId,
        status: 'completed',
        result
      })

      console.log(`Task ${taskId} completed successfully`)

    } catch (error) {
      console.error(`Task ${taskId} failed:`, error)

      // 更新任务为失败
      this.db.updateUploadTask(taskId, {
        status: 'failed',
        errorMessage: error.message
      })

      this.emit('task-update', {
        taskId,
        status: 'failed',
        error: error.message
      })

      throw error

    } finally {
      // 清理资源
      if (playwrightBrowserId) {
        try {
          await this.playwrightService.disconnectBrowser(playwrightBrowserId)
        } catch (error) {
          console.error('Error disconnecting Playwright:', error)
        }
      }

      if (browserInfo && browserInfo.browserId) {
        try {
          await this.bitBrowserService.closeBrowser(browserInfo.browserId)
        } catch (error) {
          console.error('Error closing BitBrowser:', error)
        }
      }
    }
  }

  /**
   * 发送进度更新
   * @param {number} taskId - 任务ID
   * @param {Object} progress - 进度信息
   */
  emitProgress(taskId, progress) {
    this.emit('task-progress', { taskId, ...progress })
  }

  /**
   * 取消任务
   * @param {number} taskId - 任务ID
   */
  async cancelTask(taskId) {
    // 从队列中移除
    const index = this.queue.indexOf(taskId)
    if (index > -1) {
      this.queue.splice(index, 1)
      console.log(`Task ${taskId} removed from queue`)
    }

    // 更新状态
    this.db.updateUploadTask(taskId, {
      status: 'cancelled'
    })

    this.emit('task-update', { taskId, status: 'cancelled' })
  }

  /**
   * 获取所有任务
   * @param {string} status - 状态筛选
   * @returns {Array} 任务列表
   */
  getTasks(status = null) {
    return this.db.getUploadTasks(status)
  }

  /**
   * 获取队列状态
   * @returns {Object} 队列信息
   */
  getQueueStatus() {
    return {
      queueLength: this.queue.length,
      isProcessing: this.isProcessing,
      activeUploads: this.activeUploads.size
    }
  }
}

module.exports = UploadService
