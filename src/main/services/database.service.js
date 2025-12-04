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

    // 迁移：为 browser_profiles 表添加新字段
    this.migrateBrowserProfiles()

    // 迁移：为 commentary_tasks 表添加时间字段
    this.migrateCommentaryTasks()

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
        folder_path, default_timezone, default_description, default_tags
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      profile.defaultTags || null
    )

    return info.lastInsertRowid
  }

  getBrowserProfiles() {
    return this.db.prepare('SELECT * FROM browser_profiles ORDER BY sort_order ASC, created_at DESC').all()
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
    const stmt = this.db.prepare(`
      UPDATE browser_profiles SET sort_order = ? WHERE id = ?
    `)

    const transaction = this.db.transaction((items) => {
      for (const item of items) {
        stmt.run(item.sortOrder, item.id)
      }
    })

    return transaction(profiles)
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
        SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) as processing
      FROM commentary_task_items
      WHERE task_id = ?
    `).get(taskId)

    return {
      total: stats.total || 0,
      completed: stats.completed || 0,
      failed: stats.failed || 0,
      pending: stats.pending || 0,
      processing: stats.processing || 0
    }
  }

  // 获取所有解说词任务及其统计信息
  getCommentaryTasksWithStats() {
    const tasks = this.db.prepare('SELECT * FROM commentary_tasks ORDER BY created_at DESC').all()
    return tasks.map(task => {
      const stats = this.getCommentaryTaskStats(task.id)
      return {
        ...task,
        filters: JSON.parse(task.filters || '{}'),
        stats
      }
    })
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

  close() {
    if (this.db) {
      this.db.close()
    }
  }
}

module.exports = DatabaseService
