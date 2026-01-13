const Database = require('better-sqlite3')
const path = require('path')
const { app } = require('electron')
const fs = require('fs-extra')

class DatabaseService {
  constructor() {
    this.db = null
  }

  async initialize() {
    try {
      const userDataPath = app.getPath('userData')
      await fs.ensureDir(userDataPath)

      const dbPath = path.join(userDataPath, 'uploads.db')
      console.log('Database path:', dbPath)

      this.db = new Database(dbPath)
      this.initTables()

      console.log('Database initialized successfully')
      return true
    } catch (error) {
      console.error('Failed to initialize database:', error)
      throw error
    }
  }

  initTables() {
    // 创建上传任务表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS upload_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        video_path TEXT NOT NULL,
        video_name TEXT NOT NULL,
        video_size INTEGER,
        title TEXT NOT NULL,
        description TEXT,
        tags TEXT,
        privacy TEXT DEFAULT 'public',
        thumbnail_path TEXT,
        made_for_kids INTEGER DEFAULT 0,
        channel_id TEXT,
        browser_profile_id INTEGER,
        status TEXT DEFAULT 'pending',
        progress INTEGER DEFAULT 0,
        youtube_video_id TEXT,
        youtube_video_url TEXT,
        error_message TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        started_at DATETIME,
        completed_at DATETIME
      )
    `)

    // 创建浏览器配置表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS browser_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        bit_browser_id TEXT,
        channel_id TEXT,
        channel_name TEXT,
        youtube_email TEXT,
        is_logged_in INTEGER DEFAULT 0,
        sort_order INTEGER DEFAULT 0,
        last_used_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // 检查是否存在 sort_order 列，如果不存在则添加
    try {
      this.db.exec(`
        ALTER TABLE browser_profiles ADD COLUMN sort_order INTEGER DEFAULT 0
      `)
    } catch (error) {
      // 列已存在，忽略错误
    }

    // 检查是否存在 browser_type 列，如果不存在则添加
    try {
      this.db.exec(`
        ALTER TABLE browser_profiles ADD COLUMN browser_type TEXT DEFAULT 'bitbrowser'
      `)
    } catch (error) {
      // 列已存在，忽略错误
    }

    // 创建设置表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // 创建 AI Studio 账号表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ai_studio_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        bit_browser_id TEXT,
        browser_type TEXT DEFAULT 'bitbrowser',
        status TEXT DEFAULT 'active',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // 迁移：为 ai_studio_accounts 添加 browser_type 字段
    this.migrateAIStudioAccounts()

    // 创建解说词任务表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS commentary_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        filters TEXT,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // 创建解说词任务项表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS commentary_task_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL,
        video_id TEXT NOT NULL,
        video_info TEXT,
        status TEXT DEFAULT 'pending',
        result TEXT,
        error TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (task_id) REFERENCES commentary_tasks (id)
      )
    `)

    // 创建自有频道任务表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS own_channel_tasks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT,
        filters TEXT,
        status TEXT DEFAULT 'pending',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        started_at DATETIME,
        finished_at DATETIME
      )
    `)

    // 创建自有频道任务项表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS own_channel_task_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id INTEGER NOT NULL,
        video_id TEXT NOT NULL,
        video_info TEXT,
        status TEXT DEFAULT 'pending',
        result TEXT,
        error TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (task_id) REFERENCES own_channel_tasks (id)
      )
    `)

    // 迁移：为 browser_profiles 表添加新字段
    this.migrateBrowserProfiles()

    // 迁移：为 commentary_tasks 表添加时间字段
    this.migrateCommentaryTasks()

    // 迁移：为 own_channel_tasks 表添加 name 字段
    this.migrateOwnChannelTasks()

    // 创建采集账号表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS collect_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        bit_browser_id TEXT NOT NULL,
        platform TEXT DEFAULT 'douyin',
        status TEXT DEFAULT 'active',
        remark TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // 创建抖音采集视频表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS douyin_collected_videos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        author_name TEXT,
        publish_time TEXT,
        like_count TEXT,
        duration TEXT,
        video_link TEXT,
        short_link TEXT,
        final_link TEXT,
        favorited INTEGER DEFAULT 0,
        account_id TEXT,
        account_name TEXT,
        collected_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // 迁移：为 douyin_collected_videos 添加 short_link 和 final_link 字段
    try {
      this.db.exec(`ALTER TABLE douyin_collected_videos ADD COLUMN short_link TEXT`)
    } catch (e) {}
    try {
      this.db.exec(`ALTER TABLE douyin_collected_videos ADD COLUMN final_link TEXT`)
    } catch (e) {}

    // 创建上传日志表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS upload_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        browser_id TEXT NOT NULL,
        browser_name TEXT,
        browser_type TEXT DEFAULT 'bitbrowser',
        file_path TEXT NOT NULL,
        file_name TEXT NOT NULL,
        video_title TEXT,
        video_description TEXT,
        visibility TEXT DEFAULT 'public',
        scheduled_time TEXT,
        video_url TEXT,
        video_id TEXT,
        producer_name TEXT,
        producer_id INTEGER,
        production_date TEXT,
        status TEXT DEFAULT 'pending',
        error_message TEXT,
        start_time DATETIME,
        end_time DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // 创建用户缓存表（从Supabase同步）
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS cached_users (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        phone TEXT,
        role TEXT,
        status TEXT,
        synced_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // 创建 AI Studio 账号使用统计表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS ai_studio_usage_stats (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id INTEGER NOT NULL,
        daily_count INTEGER DEFAULT 0,
        total_count INTEGER DEFAULT 0,
        daily_success_count INTEGER DEFAULT 0,
        total_success_count INTEGER DEFAULT 0,
        last_reset_date TEXT,
        last_used_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (account_id) REFERENCES ai_studio_accounts (id)
      )
    `)

    // 迁移：为 ai_studio_usage_stats 添加成功次数字段
    this.migrateAIStudioUsageStats()

    // 迁移：为 upload_logs 表添加时区字段（必须在表创建之后）
    this.migrateUploadLogs()

    console.log('Database tables created/verified')
  }

  migrateBrowserProfiles() {
    const columns = this.db.pragma('table_info(browser_profiles)')
    const columnNames = columns.map(col => col.name)

    // 添加 folder_path 字段
    if (!columnNames.includes('folder_path')) {
      this.db.exec('ALTER TABLE browser_profiles ADD COLUMN folder_path TEXT')
      console.log('Added folder_path column to browser_profiles')
    }

    // 添加 default_timezone 字段
    if (!columnNames.includes('default_timezone')) {
      this.db.exec("ALTER TABLE browser_profiles ADD COLUMN default_timezone TEXT DEFAULT 'Asia/Shanghai'")
      console.log('Added default_timezone column to browser_profiles')
    }

    // 添加 default_description 字段
    if (!columnNames.includes('default_description')) {
      this.db.exec('ALTER TABLE browser_profiles ADD COLUMN default_description TEXT')
      console.log('Added default_description column to browser_profiles')
    }

    // 添加 default_tags 字段
    if (!columnNames.includes('default_tags')) {
      this.db.exec('ALTER TABLE browser_profiles ADD COLUMN default_tags TEXT')
      console.log('Added default_tags column to browser_profiles')
    }

    // 添加 status 字段
    if (!columnNames.includes('status')) {
      this.db.exec("ALTER TABLE browser_profiles ADD COLUMN status TEXT DEFAULT 'active'")
      console.log('Added status column to browser_profiles')
    }

    // 添加 account_type 字段（普通号 normal / 创收号 monetized）
    if (!columnNames.includes('account_type')) {
      this.db.exec("ALTER TABLE browser_profiles ADD COLUMN account_type TEXT DEFAULT 'normal'")
      console.log('Added account_type column to browser_profiles')
    }
  }

  migrateAIStudioAccounts() {
    const columns = this.db.pragma('table_info(ai_studio_accounts)')
    const columnNames = columns.map(col => col.name)

    // 添加 browser_type 字段
    if (!columnNames.includes('browser_type')) {
      this.db.exec("ALTER TABLE ai_studio_accounts ADD COLUMN browser_type TEXT DEFAULT 'bitbrowser'")
      console.log('Added browser_type column to ai_studio_accounts')
    }
  }

  migrateCommentaryTasks() {
    const columns = this.db.pragma('table_info(commentary_tasks)')
    const columnNames = columns.map(col => col.name)

    // 添加 started_at 字段（任务开始执行时间）
    if (!columnNames.includes('started_at')) {
      this.db.exec('ALTER TABLE commentary_tasks ADD COLUMN started_at DATETIME')
      console.log('Added started_at column to commentary_tasks')
    }

    // 添加 finished_at 字段（任务完成时间）
    if (!columnNames.includes('finished_at')) {
      this.db.exec('ALTER TABLE commentary_tasks ADD COLUMN finished_at DATETIME')
      console.log('Added finished_at column to commentary_tasks')
    }
  }

  migrateOwnChannelTasks() {
    const columns = this.db.pragma('table_info(own_channel_tasks)')
    const columnNames = columns.map(col => col.name)

    // 添加 name 字段（任务名称）
    if (!columnNames.includes('name')) {
      this.db.exec('ALTER TABLE own_channel_tasks ADD COLUMN name TEXT')
      console.log('Added name column to own_channel_tasks')
    }
  }

  migrateUploadLogs() {
    const columns = this.db.pragma('table_info(upload_logs)')
    const columnNames = columns.map(col => col.name)

    // 添加 scheduled_timezone 字段（定时发布时区）
    if (!columnNames.includes('scheduled_timezone')) {
      this.db.exec("ALTER TABLE upload_logs ADD COLUMN scheduled_timezone TEXT")
      console.log('Added scheduled_timezone column to upload_logs')
    }
  }

  migrateAIStudioUsageStats() {
    const columns = this.db.pragma('table_info(ai_studio_usage_stats)')
    const columnNames = columns.map(col => col.name)

    // 添加 daily_success_count 字段
    if (!columnNames.includes('daily_success_count')) {
      this.db.exec('ALTER TABLE ai_studio_usage_stats ADD COLUMN daily_success_count INTEGER DEFAULT 0')
      console.log('Added daily_success_count column to ai_studio_usage_stats')
    }

    // 添加 total_success_count 字段
    if (!columnNames.includes('total_success_count')) {
      this.db.exec('ALTER TABLE ai_studio_usage_stats ADD COLUMN total_success_count INTEGER DEFAULT 0')
      console.log('Added total_success_count column to ai_studio_usage_stats')
    }
  }

  // ===== 上传任务相关方法 =====

  createUploadTask(task) {
    const stmt = this.db.prepare(`
      INSERT INTO upload_tasks (
        video_path, video_name, video_size, title, description,
        tags, privacy, thumbnail_path, made_for_kids,
        channel_id, browser_profile_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const info = stmt.run(
      task.videoPath,
      task.videoName,
      task.videoSize || 0,
      task.title,
      task.description || '',
      JSON.stringify(task.tags || []),
      task.privacy || 'public',
      task.thumbnailPath || null,
      task.madeForKids ? 1 : 0,
      task.channelId || null,
      task.browserProfileId || null
    )

    return info.lastInsertRowid
  }

  getUploadTasks(status = null) {
    let query = 'SELECT * FROM upload_tasks ORDER BY created_at DESC'
    if (status) {
      query = 'SELECT * FROM upload_tasks WHERE status = ? ORDER BY created_at DESC'
      return this.db.prepare(query).all(status)
    }
    return this.db.prepare(query).all()
  }

  getUploadTaskById(id) {
    return this.db.prepare('SELECT * FROM upload_tasks WHERE id = ?').get(id)
  }

  updateUploadTask(id, updates) {
    const fields = Object.keys(updates).map(key => {
      // 转换驼峰命名为下划线命名
      const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase()
      return `${snakeKey} = ?`
    }).join(', ')

    const values = Object.values(updates)
    values.push(id)

    const stmt = this.db.prepare(`
      UPDATE upload_tasks SET ${fields} WHERE id = ?
    `)

    return stmt.run(...values)
  }

  deleteUploadTask(id) {
    return this.db.prepare('DELETE FROM upload_tasks WHERE id = ?').run(id)
  }

  // ===== 浏览器配置相关方法 =====

  createBrowserProfile(profile) {
    const stmt = this.db.prepare(`
      INSERT INTO browser_profiles (
        name, bit_browser_id, channel_id, channel_name, youtube_email,
        folder_path, default_timezone, default_description, default_tags, account_type, browser_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)

    const info = stmt.run(
      profile.name,
      profile.bitBrowserId || null,
      profile.channelId || null,
      profile.channelName || null,
      profile.youtubeEmail || null,
      profile.folderPath || null,
      profile.defaultTimezone || 'Asia/Shanghai',
      profile.defaultDescription || null,
      profile.defaultTags || null,
      profile.accountType || 'normal',
      profile.browserType || 'bitbrowser'
    )

    return info.lastInsertRowid
  }

  getBrowserProfiles() {
    // 使用 COALESCE 处理 NULL 值，将 NULL 视为 999999（排在最后）
    const profiles = this.db.prepare(`
      SELECT * FROM browser_profiles
      ORDER BY COALESCE(sort_order, 999999) ASC, created_at DESC
    `).all()
    console.log('getBrowserProfiles 返回:', profiles.map(p => ({ id: p.id, name: p.name, sort_order: p.sort_order })))
    return profiles
  }

  getBrowserProfileById(id) {
    return this.db.prepare('SELECT * FROM browser_profiles WHERE id = ?').get(id)
  }

  updateBrowserProfile(id, updates) {
    const fields = Object.keys(updates).map(key => {
      const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase()
      return `${snakeKey} = ?`
    }).join(', ')

    const values = Object.values(updates)
    values.push(id)

    return this.db.prepare(`
      UPDATE browser_profiles SET ${fields} WHERE id = ?
    `).run(...values)
  }

  deleteBrowserProfile(id) {
    return this.db.prepare('DELETE FROM browser_profiles WHERE id = ?').run(id)
  }

  // 批量更新浏览器配置排序
  updateBrowserProfilesOrder(profiles) {
    console.log('updateBrowserProfilesOrder 收到数据:', JSON.stringify(profiles))

    const stmt = this.db.prepare(`
      UPDATE browser_profiles SET sort_order = ? WHERE id = ?
    `)

    const transaction = this.db.transaction((items) => {
      let totalChanges = 0
      for (const item of items) {
        // 支持 sort_order 或 sortOrder 两种命名
        const sortOrder = item.sort_order !== undefined ? item.sort_order : item.sortOrder
        console.log(`更新 ID ${item.id} 的 sort_order 为 ${sortOrder}`)
        const result = stmt.run(sortOrder, item.id)
        console.log(`更新结果: changes=${result.changes}`)
        totalChanges += result.changes
      }
      return { success: true, changes: totalChanges }
    })

    const result = transaction(profiles)
    console.log('事务执行完成, 结果:', result)
    return result
  }

  // ===== AI Studio 账号相关方法 =====

  createAIStudioAccount(account) {
    const stmt = this.db.prepare(`
      INSERT INTO ai_studio_accounts (
        name, bit_browser_id, browser_type, status
      ) VALUES (?, ?, ?, ?)
    `)

    const info = stmt.run(
      account.name,
      account.bitBrowserId || null,
      account.browserType || 'bitbrowser',
      account.status || 'active'
    )

    return info.lastInsertRowid
  }

  getAIStudioAccounts() {
    return this.db.prepare('SELECT * FROM ai_studio_accounts ORDER BY created_at DESC').all()
  }

  getAIStudioAccountByBrowserId(bitBrowserId) {
    return this.db.prepare('SELECT * FROM ai_studio_accounts WHERE bit_browser_id = ?').get(bitBrowserId)
  }

  updateAIStudioAccount(id, updates) {
    const fields = Object.keys(updates).map(key => {
      const snakeKey = key.replace(/([A-Z])/g, '_$1').toLowerCase()
      return `${snakeKey} = ?`
    }).join(', ')

    const values = Object.values(updates)
    values.push(id)

    return this.db.prepare(`
      UPDATE ai_studio_accounts SET ${fields} WHERE id = ?
    `).run(...values)
  }

  deleteAIStudioAccount(id) {
    return this.db.prepare('DELETE FROM ai_studio_accounts WHERE id = ?').run(id)
  }

  // ===== 解说词任务相关方法 =====

  createCommentaryTask(task) {
    const stmt = this.db.prepare(`
      INSERT INTO commentary_tasks (
        name, filters, status
      ) VALUES (?, ?, ?)
    `)

    const info = stmt.run(
      task.name,
      JSON.stringify(task.filters || {}),
      task.status || 'pending'
    )

    return info.lastInsertRowid
  }

  getCommentaryTasks() {
    const tasks = this.db.prepare('SELECT * FROM commentary_tasks ORDER BY created_at DESC').all()
    return tasks.map(task => ({
      ...task,
      filters: JSON.parse(task.filters || '{}')
    }))
  }

  getCommentaryTaskById(id) {
    const task = this.db.prepare('SELECT * FROM commentary_tasks WHERE id = ?').get(id)
    if (task) {
      task.filters = JSON.parse(task.filters || '{}')
    }
    return task
  }

  updateCommentaryTaskStatus(id, status) {
    return this.db.prepare('UPDATE commentary_tasks SET status = ? WHERE id = ?').run(status, id)
  }

  // 更新任务开始时间
  updateCommentaryTaskStartTime(id) {
    return this.db.prepare('UPDATE commentary_tasks SET started_at = CURRENT_TIMESTAMP WHERE id = ?').run(id)
  }

  // 更新任务结束时间
  updateCommentaryTaskFinishTime(id) {
    return this.db.prepare('UPDATE commentary_tasks SET finished_at = CURRENT_TIMESTAMP WHERE id = ?').run(id)
  }

  deleteCommentaryTask(id) {
    // 级联删除任务项
    this.db.prepare('DELETE FROM commentary_task_items WHERE task_id = ?').run(id)
    return this.db.prepare('DELETE FROM commentary_tasks WHERE id = ?').run(id)
  }

  addCommentaryTaskItems(taskId, items) {
    const stmt = this.db.prepare(`
      INSERT INTO commentary_task_items (
        task_id, video_id, video_info, status
      ) VALUES (?, ?, ?, ?)
    `)

    const transaction = this.db.transaction((items) => {
      for (const item of items) {
        stmt.run(
          taskId,
          item.video_id || item.id, // 兼容不同字段名
          JSON.stringify(item),
          'pending'
        )
      }
    })

    return transaction(items)
  }

  getCommentaryTaskItems(taskId) {
    const items = this.db.prepare('SELECT * FROM commentary_task_items WHERE task_id = ? ORDER BY id ASC').all(taskId)
    return items.map(item => ({
      ...item,
      video_info: JSON.parse(item.video_info || '{}')
    }))
  }

  updateCommentaryTaskItemStatus(id, status, result = null, error = null) {
    return this.db.prepare(`
      UPDATE commentary_task_items
      SET status = ?, result = ?, error = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, result ? JSON.stringify(result) : null, error, id)
  }

  // 获取解说词任务的统计信息
  getCommentaryTaskStats(taskId) {
    const stats = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' OR status = 'error' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing,
        SUM(CASE WHEN status = 'video_deleted' THEN 1 ELSE 0 END) as video_deleted
      FROM commentary_task_items
      WHERE task_id = ?
    `).get(taskId)

    return {
      total: stats.total || 0,
      completed: stats.completed || 0,
      failed: stats.failed || 0,
      pending: stats.pending || 0,
      processing: stats.processing || 0,
      video_deleted: stats.video_deleted || 0
    }
  }

  // 获取所有解说词任务及其统计信息（优化版：单次查询所有统计）
  getCommentaryTasksWithStats() {
    // 使用 LEFT JOIN 和 GROUP BY 一次性获取所有任务及其统计信息
    const tasksWithStats = this.db.prepare(`
      SELECT
        t.*,
        COUNT(i.id) as total,
        SUM(CASE WHEN i.status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN i.status = 'failed' OR i.status = 'error' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN i.status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN i.status = 'processing' THEN 1 ELSE 0 END) as processing,
        SUM(CASE WHEN i.status = 'video_deleted' THEN 1 ELSE 0 END) as video_deleted
      FROM commentary_tasks t
      LEFT JOIN commentary_task_items i ON t.id = i.task_id
      GROUP BY t.id
      ORDER BY t.created_at DESC
    `).all()

    return tasksWithStats.map(task => ({
      id: task.id,
      name: task.name,
      status: task.status,
      filters: JSON.parse(task.filters || '{}'),
      created_at: task.created_at,
      started_at: task.started_at,
      finished_at: task.finished_at,
      stats: {
        total: task.total || 0,
        completed: task.completed || 0,
        failed: task.failed || 0,
        pending: task.pending || 0,
        processing: task.processing || 0,
        video_deleted: task.video_deleted || 0
      }
    }))
  }

  // ===== 设置相关方法 =====

  getSetting(key) {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key)
    return row ? row.value : null
  }

  setSetting(key, value) {
    return this.db.prepare(`
      INSERT OR REPLACE INTO settings (key, value, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
    `).run(key, value)
  }

  // ===== 采集账号相关方法 =====

  createCollectAccount(account) {
    const stmt = this.db.prepare(`
      INSERT INTO collect_accounts (name, bit_browser_id, platform, remark)
      VALUES (?, ?, ?, ?)
    `)
    const info = stmt.run(
      account.name,
      account.bitBrowserId,
      account.platform || 'douyin',
      account.remark || ''
    )
    return info.lastInsertRowid
  }

  getCollectAccounts(platform = null) {
    if (platform) {
      return this.db.prepare('SELECT * FROM collect_accounts WHERE platform = ? ORDER BY created_at DESC').all(platform)
    }
    return this.db.prepare('SELECT * FROM collect_accounts ORDER BY created_at DESC').all()
  }

  getCollectAccountById(id) {
    return this.db.prepare('SELECT * FROM collect_accounts WHERE id = ?').get(id)
  }

  updateCollectAccount(id, account) {
    return this.db.prepare(`
      UPDATE collect_accounts
      SET name = ?, bit_browser_id = ?, platform = ?, remark = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      account.name,
      account.bitBrowserId,
      account.platform || 'douyin',
      account.remark || '',
      id
    )
  }

  deleteCollectAccount(id) {
    return this.db.prepare('DELETE FROM collect_accounts WHERE id = ?').run(id)
  }

  // ===== 上传日志相关方法 =====

  createUploadLog(log) {
    const stmt = this.db.prepare(`
      INSERT INTO upload_logs (
        browser_id, browser_name, browser_type, file_path, file_name,
        video_title, video_description, visibility, scheduled_time, scheduled_timezone,
        producer_name, producer_id, production_date, status, start_time
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const info = stmt.run(
      log.browser_id || log.browserId,
      log.browser_name || log.browserName || null,
      log.browser_type || log.browserType || 'bitbrowser',
      log.file_path || log.filePath,
      log.file_name || log.fileName,
      log.video_title || log.videoTitle || null,
      log.video_description || log.videoDescription || null,
      log.visibility || 'public',
      log.scheduled_time || log.scheduledTime || null,
      log.scheduled_timezone || log.scheduledTimezone || null,
      log.producer_name || log.producerName || null,
      log.producer_id || log.producerId || null,
      log.production_date || log.productionDate || null,
      log.status || 'pending',
      log.start_time || new Date().toISOString()
    )
    return info.lastInsertRowid
  }

  updateUploadLog(id, updates) {
    const fields = []
    const values = []

    if (updates.status !== undefined) {
      fields.push('status = ?')
      values.push(updates.status)
    }
    if (updates.video_url !== undefined || updates.videoUrl !== undefined) {
      fields.push('video_url = ?')
      values.push(updates.video_url || updates.videoUrl)
    }
    if (updates.video_id !== undefined || updates.videoId !== undefined) {
      fields.push('video_id = ?')
      values.push(updates.video_id || updates.videoId)
    }
    if (updates.error_message !== undefined || updates.errorMessage !== undefined) {
      fields.push('error_message = ?')
      values.push(updates.error_message || updates.errorMessage)
    }
    if (updates.end_time !== undefined || updates.endTime !== undefined) {
      fields.push('end_time = ?')
      values.push(updates.end_time || updates.endTime)
    }

    fields.push('updated_at = CURRENT_TIMESTAMP')
    values.push(id)

    return this.db.prepare(`
      UPDATE upload_logs SET ${fields.join(', ')} WHERE id = ?
    `).run(...values)
  }

  getUploadLogs(options = {}) {
    let sql = 'SELECT * FROM upload_logs'
    const params = []
    const conditions = []

    if (options.browserId) {
      conditions.push('browser_id = ?')
      params.push(options.browserId)
    }
    if (options.status) {
      conditions.push('status = ?')
      params.push(options.status)
    }
    if (options.startDate) {
      conditions.push('start_time >= ?')
      params.push(options.startDate)
    }
    if (options.endDate) {
      conditions.push('start_time <= ?')
      params.push(options.endDate)
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ')
    }

    sql += ' ORDER BY created_at DESC'

    if (options.limit) {
      sql += ' LIMIT ?'
      params.push(options.limit)
    }

    return this.db.prepare(sql).all(...params)
  }

  getUploadLogById(id) {
    return this.db.prepare('SELECT * FROM upload_logs WHERE id = ?').get(id)
  }

  deleteUploadLog(id) {
    return this.db.prepare('DELETE FROM upload_logs WHERE id = ?').run(id)
  }

  clearUploadLogs() {
    return this.db.prepare('DELETE FROM upload_logs').run()
  }

  // ===== 用户缓存相关方法 =====

  syncCachedUsers(users) {
    // 清空现有缓存
    this.db.prepare('DELETE FROM cached_users').run()

    // 插入新数据
    const stmt = this.db.prepare(`
      INSERT INTO cached_users (id, name, phone, role, status, synced_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `)

    const insertMany = this.db.transaction((users) => {
      for (const user of users) {
        stmt.run(user.id, user.name, user.phone || null, user.role || null, user.status || null)
      }
    })

    insertMany(users)
    return users.length
  }

  getCachedUsers() {
    return this.db.prepare('SELECT * FROM cached_users ORDER BY name ASC').all()
  }

  getCachedUserByName(name) {
    return this.db.prepare('SELECT * FROM cached_users WHERE name = ?').get(name)
  }

  getCachedUserById(id) {
    return this.db.prepare('SELECT * FROM cached_users WHERE id = ?').get(id)
  }

  getLastUserSyncTime() {
    const row = this.db.prepare('SELECT MAX(synced_at) as last_sync FROM cached_users').get()
    return row ? row.last_sync : null
  }

  // ==================== AI Studio 使用统计方法 ====================

  /**
   * 获取当前太平洋时间的日期字符串（用于判断是否需要重置）
   * Google AI Studio 在太平洋时间午夜重置
   */
  getPacificDateString() {
    const now = new Date()
    // 太平洋时间偏移：冬令时 UTC-8，夏令时 UTC-7
    // 使用 Intl.DateTimeFormat 来自动处理夏令时
    const formatter = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
    return formatter.format(now) // 返回 YYYY-MM-DD 格式
  }

  /**
   * 记录一次 AI Studio 发送（点击发送按钮就算一次）
   * @param {number} accountId - AI Studio 账号 ID
   */
  recordAIStudioUsage(accountId) {
    const currentPacificDate = this.getPacificDateString()

    // 查找该账号的统计记录
    let stats = this.db.prepare(`
      SELECT * FROM ai_studio_usage_stats WHERE account_id = ?
    `).get(accountId)

    if (!stats) {
      // 创建新记录
      this.db.prepare(`
        INSERT INTO ai_studio_usage_stats (account_id, daily_count, total_count, daily_success_count, total_success_count, last_reset_date, last_used_at)
        VALUES (?, 1, 1, 0, 0, ?, CURRENT_TIMESTAMP)
      `).run(accountId, currentPacificDate)
    } else {
      // 检查是否需要重置每日计数（太平洋时间新的一天）
      if (stats.last_reset_date !== currentPacificDate) {
        // 新的一天，重置 daily_count 和 daily_success_count
        this.db.prepare(`
          UPDATE ai_studio_usage_stats
          SET daily_count = 1, total_count = total_count + 1, daily_success_count = 0, last_reset_date = ?, last_used_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE account_id = ?
        `).run(currentPacificDate, accountId)
      } else {
        // 同一天，累加计数
        this.db.prepare(`
          UPDATE ai_studio_usage_stats
          SET daily_count = daily_count + 1, total_count = total_count + 1, last_used_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE account_id = ?
        `).run(accountId)
      }
    }
  }

  /**
   * 记录一次 AI Studio 成功获取解说词
   * @param {number} accountId - AI Studio 账号 ID
   */
  recordAIStudioSuccess(accountId) {
    const currentPacificDate = this.getPacificDateString()

    // 查找该账号的统计记录
    let stats = this.db.prepare(`
      SELECT * FROM ai_studio_usage_stats WHERE account_id = ?
    `).get(accountId)

    if (!stats) {
      // 不应该发生，因为 recordAIStudioUsage 应该先被调用
      // 但为了安全，还是创建一条记录
      this.db.prepare(`
        INSERT INTO ai_studio_usage_stats (account_id, daily_count, total_count, daily_success_count, total_success_count, last_reset_date, last_used_at)
        VALUES (?, 0, 0, 1, 1, ?, CURRENT_TIMESTAMP)
      `).run(accountId, currentPacificDate)
    } else {
      // 检查是否需要重置每日计数
      if (stats.last_reset_date !== currentPacificDate) {
        // 新的一天，重置后加1
        this.db.prepare(`
          UPDATE ai_studio_usage_stats
          SET daily_success_count = 1, total_success_count = total_success_count + 1, last_reset_date = ?, updated_at = CURRENT_TIMESTAMP
          WHERE account_id = ?
        `).run(currentPacificDate, accountId)
      } else {
        // 同一天，累加成功计数
        this.db.prepare(`
          UPDATE ai_studio_usage_stats
          SET daily_success_count = daily_success_count + 1, total_success_count = total_success_count + 1, updated_at = CURRENT_TIMESTAMP
          WHERE account_id = ?
        `).run(accountId)
      }
    }
  }

  // ===== 自有频道任务相关方法 =====

  /**
   * 创建自有频道任务
   */
  createOwnChannelTask(task) {
    const stmt = this.db.prepare(`
      INSERT INTO own_channel_tasks (
        name, filters, status
      ) VALUES (?, ?, ?)
    `)

    const info = stmt.run(
      task.name,
      JSON.stringify(task.filters || {}),
      task.status || 'pending'
    )

    return info.lastInsertRowid
  }

  /**
   * 添加自有频道任务项
   */
  addOwnChannelTaskItem(taskId, videoId, videoInfo) {
    const stmt = this.db.prepare(`
      INSERT INTO own_channel_task_items (
        task_id, video_id, video_info, status
      ) VALUES (?, ?, ?, ?)
    `)

    return stmt.run(
      taskId,
      videoId,
      JSON.stringify(videoInfo || {}),
      'pending'
    )
  }

  /**
   * 获取所有自有频道任务
   */
  getOwnChannelTasks() {
    const tasks = this.db.prepare('SELECT * FROM own_channel_tasks ORDER BY created_at DESC').all()
    return tasks.map(task => ({
      ...task,
      filters: JSON.parse(task.filters || '{}')
    }))
  }

  /**
   * 根据 ID 获取自有频道任务
   */
  getOwnChannelTaskById(id) {
    const task = this.db.prepare('SELECT * FROM own_channel_tasks WHERE id = ?').get(id)
    if (task) {
      task.filters = JSON.parse(task.filters || '{}')
    }
    return task
  }

  /**
   * 获取自有频道任务项
   */
  getOwnChannelTaskItems(taskId) {
    const items = this.db.prepare('SELECT * FROM own_channel_task_items WHERE task_id = ? ORDER BY id ASC').all(taskId)
    return items.map(item => ({
      ...item,
      video_info: JSON.parse(item.video_info || '{}')
    }))
  }

  /**
   * 获取自有频道任务统计
   */
  getOwnChannelTaskStats(taskId) {
    const stats = this.db.prepare(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' OR status = 'error' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing,
        SUM(CASE WHEN status = 'video_deleted' THEN 1 ELSE 0 END) as video_deleted
      FROM own_channel_task_items
      WHERE task_id = ?
    `).get(taskId)

    return {
      total: stats.total || 0,
      completed: stats.completed || 0,
      failed: stats.failed || 0,
      pending: stats.pending || 0,
      processing: stats.processing || 0,
      video_deleted: stats.video_deleted || 0
    }
  }

  /**
   * 获取所有自有频道任务及统计信息
   */
  getOwnChannelTasksWithStats() {
    const tasks = this.db.prepare('SELECT * FROM own_channel_tasks ORDER BY created_at DESC').all()

    // 获取每个任务的统计信息
    return tasks.map(task => {
      const stats = this.db.prepare(`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
          SUM(CASE WHEN status = 'failed' OR status = 'error' THEN 1 ELSE 0 END) as failed,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
          SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing,
          SUM(CASE WHEN status = 'video_deleted' THEN 1 ELSE 0 END) as video_deleted
        FROM own_channel_task_items
        WHERE task_id = ?
      `).get(task.id)

      return {
        ...task,
        filters: JSON.parse(task.filters || '{}'),
        stats: stats || { total: 0, completed: 0, failed: 0, pending: 0, processing: 0, video_deleted: 0 }
      }
    })
  }

  /**
   * 更新自有频道任务状态
   */
  updateOwnChannelTaskStatus(id, status) {
    return this.db.prepare('UPDATE own_channel_tasks SET status = ? WHERE id = ?').run(status, id)
  }

  /**
   * 更新自有频道任务开始时间
   */
  updateOwnChannelTaskStartTime(id) {
    return this.db.prepare('UPDATE own_channel_tasks SET started_at = CURRENT_TIMESTAMP WHERE id = ?').run(id)
  }

  /**
   * 更新自有频道任务结束时间
   */
  updateOwnChannelTaskEndTime(id) {
    return this.db.prepare('UPDATE own_channel_tasks SET finished_at = CURRENT_TIMESTAMP WHERE id = ?').run(id)
  }

  /**
   * 更新自有频道任务项状态
   */
  updateOwnChannelTaskItemStatus(id, status, result = null, error = null) {
    return this.db.prepare(`
      UPDATE own_channel_task_items
      SET status = ?, result = ?, error = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(status, result ? JSON.stringify(result) : null, error, id)
  }

  /**
   * 删除自有频道任务
   */
  deleteOwnChannelTask(id) {
    // 级联删除任务项
    this.db.prepare('DELETE FROM own_channel_task_items WHERE task_id = ?').run(id)
    return this.db.prepare('DELETE FROM own_channel_tasks WHERE id = ?').run(id)
  }

  /**
   * 获取 AI Studio 账号使用统计
   * @param {number} accountId - 账号 ID（可选，不传则返回所有账号统计）
   */
  getAIStudioUsageStats(accountId = null) {
    const currentPacificDate = this.getPacificDateString()

    if (accountId) {
      const stats = this.db.prepare(`
        SELECT s.*, a.name as account_name, a.bit_browser_id
        FROM ai_studio_usage_stats s
        JOIN ai_studio_accounts a ON s.account_id = a.id
        WHERE s.account_id = ?
      `).get(accountId)

      if (stats) {
        // 如果日期不匹配，说明需要重置每日计数（但不更新数据库，只在返回时显示为0）
        if (stats.last_reset_date !== currentPacificDate) {
          stats.daily_count = 0
          stats.daily_success_count = 0
        }
      }
      return stats
    }

    // 返回所有账号的统计，并关联账号信息
    const allStats = this.db.prepare(`
      SELECT a.id as account_id, a.name as account_name, a.bit_browser_id, a.status,
             COALESCE(s.daily_count, 0) as daily_count,
             COALESCE(s.total_count, 0) as total_count,
             COALESCE(s.daily_success_count, 0) as daily_success_count,
             COALESCE(s.total_success_count, 0) as total_success_count,
             s.last_reset_date,
             s.last_used_at
      FROM ai_studio_accounts a
      LEFT JOIN ai_studio_usage_stats s ON a.id = s.account_id
      WHERE a.status = 'active'
      ORDER BY a.name
    `).all()

    // 检查并调整每日计数
    return allStats.map(stats => {
      if (stats.last_reset_date !== currentPacificDate) {
        stats.daily_count = 0
        stats.daily_success_count = 0
      }
      return stats
    })
  }

  /**
   * 手动重置某个账号的每日计数
   */
  resetAIStudioDailyCount(accountId) {
    const currentPacificDate = this.getPacificDateString()
    this.db.prepare(`
      UPDATE ai_studio_usage_stats
      SET daily_count = 0, last_reset_date = ?, updated_at = CURRENT_TIMESTAMP
      WHERE account_id = ?
    `).run(currentPacificDate, accountId)
  }

  /**
   * 重置所有账号的每日计数
   */
  resetAllAIStudioDailyCounts() {
    const currentPacificDate = this.getPacificDateString()
    this.db.prepare(`
      UPDATE ai_studio_usage_stats
      SET daily_count = 0, last_reset_date = ?, updated_at = CURRENT_TIMESTAMP
    `).run(currentPacificDate)
  }

  // ============ 抖音采集视频相关方法 ============

  /**
   * 保存采集的抖音视频
   */
  saveDouyinVideo(video) {
    const stmt = this.db.prepare(`
      INSERT INTO douyin_collected_videos
      (author_name, publish_time, like_count, duration, video_link, short_link, final_link, favorited, account_id, account_name, collected_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const result = stmt.run(
      video.authorName || '',
      video.publishTime || '',
      video.likeCount || '',
      video.duration || '',
      video.videoLink || '',
      video.shortLink || '',
      video.finalLink || '',
      video.favorited ? 1 : 0,
      video.accountId || '',
      video.accountName || '',
      video.collectedAt || new Date().toISOString()
    )
    return result.lastInsertRowid
  }

  /**
   * 批量保存采集的抖音视频
   */
  saveDouyinVideos(videos, accountId, accountName) {
    const stmt = this.db.prepare(`
      INSERT INTO douyin_collected_videos
      (author_name, publish_time, like_count, duration, video_link, favorited, account_id, account_name, collected_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const insertMany = this.db.transaction((items) => {
      for (const video of items) {
        stmt.run(
          video.authorName || '',
          video.publishTime || '',
          video.likeCount || '',
          video.duration || '',
          video.videoLink || '',
          video.favorited ? 1 : 0,
          accountId || '',
          accountName || '',
          video.collectedAt || new Date().toISOString()
        )
      }
    })
    insertMany(videos)
    return videos.length
  }

  /**
   * 获取抖音采集视频列表
   */
  getDouyinVideos(options = {}) {
    const { limit = 100, offset = 0, date } = options
    let sql = `SELECT * FROM douyin_collected_videos`
    const params = []

    if (date) {
      sql += ` WHERE DATE(collected_at) = DATE(?)`
      params.push(date)
    }

    sql += ` ORDER BY collected_at DESC LIMIT ? OFFSET ?`
    params.push(limit, offset)

    return this.db.prepare(sql).all(...params)
  }

  /**
   * 获取抖音采集视频总数
   */
  getDouyinVideoCount(date) {
    let sql = `SELECT COUNT(*) as count FROM douyin_collected_videos`
    const params = []

    if (date) {
      sql += ` WHERE DATE(collected_at) = DATE(?)`
      params.push(date)
    }

    return this.db.prepare(sql).get(...params).count
  }

  /**
   * 删除抖音采集视频
   */
  deleteDouyinVideo(id) {
    return this.db.prepare(`DELETE FROM douyin_collected_videos WHERE id = ?`).run(id)
  }

  /**
   * 清空所有抖音采集视频
   */
  clearDouyinVideos() {
    return this.db.prepare(`DELETE FROM douyin_collected_videos`).run()
  }

  /**
   * 获取抖音采集的日期列表 (用于筛选)
   */
  getDouyinCollectionDates() {
    return this.db.prepare(`
      SELECT DISTINCT DATE(collected_at) as date, COUNT(*) as count
      FROM douyin_collected_videos
      GROUP BY DATE(collected_at)
      ORDER BY date DESC
    `).all()
  }

  close() {
    if (this.db) {
      this.db.close()
    }
  }
}

module.exports = DatabaseService
