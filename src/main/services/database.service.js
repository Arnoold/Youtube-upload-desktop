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
        folder_path TEXT,
        channel_id TEXT,
        channel_name TEXT,
        youtube_email TEXT,
        is_logged_in INTEGER DEFAULT 0,
        last_used_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    // 创建设置表
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key TEXT PRIMARY KEY,
        value TEXT,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `)

    console.log('Database tables created/verified')
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
        name, bit_browser_id, folder_path, channel_id, channel_name, youtube_email
      ) VALUES (?, ?, ?, ?, ?, ?)
    `)

    const info = stmt.run(
      profile.name,
      profile.bitBrowserId || null,
      profile.folderPath || null,
      profile.channelId || null,
      profile.channelName || null,
      profile.youtubeEmail || null
    )

    return info.lastInsertRowid
  }

  getBrowserProfiles() {
    return this.db.prepare('SELECT * FROM browser_profiles ORDER BY created_at DESC').all()
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
