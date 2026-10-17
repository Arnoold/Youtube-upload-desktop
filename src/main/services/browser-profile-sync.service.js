/**
 * 浏览器配置同步服务
 * 从 HubStudio / BitBrowser 本地 API 拉取 profile 数据，映射字段后 upsert 到 Supabase browser_profiles 表
 */

class BrowserProfileSyncService {
  /**
   * 从 Supabase 查询 browser_profiles 列表
   */
  async getProfiles(supabaseService, options = {}) {
    if (!supabaseService.client) {
      throw new Error('Supabase 未初始化，请先在设置中连接')
    }

    const page = options.page || 1
    const pageSize = Math.min(options.pageSize || 50, 1000)
    const offset = (page - 1) * pageSize

    const selectFields = [
      'id', 'source', 'profile_id', 'seq', 'alias', 'profile_name', 'remark',
      'group_id', 'group_name', 'proxy_type', 'proxy_host', 'proxy_port',
      'proxy_username', 'proxy_password', 'proxy_mode', 'dynamic_ip_url',
      'last_ip', 'last_country', 'last_region', 'last_city',
      'platform_url', 'platform_username',
      'user_agent', 'os', 'resolution', 'language', 'timezone',
      'status', 'account_status', 'profile_created_at', 'last_opened_at', 'synced_at', 'created_at'
    ]
    const googleFields = ['google_status', 'google_email', 'google_detail', 'google_checked_at']

    const runQuery = (fields) => {
      let query = supabaseService.client
        .from('browser_profiles')
        .select(fields.join(','))

      if (options.source) {
        query = query.eq('source', options.source)
      }

      return query
        .order('id', { ascending: false })
        .range(offset, offset + pageSize - 1)
    }

    let { data, error } = await runQuery([...selectFields, ...googleFields])

    // google_* 列需要手动在 Supabase 加，还没加时退回不带这几列的查询，列表照常显示
    if (error && /google_/.test(error.message || '')) {
      ({ data, error } = await runQuery(selectFields))
    }

    if (error) throw new Error(error.message)

    return {
      data: data || [],
      page,
      pageSize,
      hasMore: (data || []).length === pageSize
    }
  }

  /**
   * 更新 account_status
   */
  async updateAccountStatus(supabaseService, id, accountStatus) {
    if (!supabaseService.client) {
      throw new Error('Supabase 未初始化')
    }

    const { data, error } = await supabaseService.client
      .from('browser_profiles')
      .update({ account_status: accountStatus })
      .eq('id', id)
      .select('id, account_status')

    if (error) throw new Error(error.message)
    return data?.[0] || null
  }

  /**
   * 同步 HubStudio profiles 到 Supabase
   */
  async syncHubStudio(hubStudioService, supabaseService) {
    if (!supabaseService.client) {
      return { success: false, error: 'Supabase 未初始化，请先在设置中连接' }
    }

    try {
      console.log('[BrowserProfileSync] 开始同步 HubStudio...')
      const response = await hubStudioService.getProfiles()
      const list = response?.data?.list || []

      if (list.length === 0) {
        return { success: true, synced: 0, total: 0, message: 'HubStudio 无环境数据' }
      }

      console.log(`[BrowserProfileSync] HubStudio 获取到 ${list.length} 个环境`)

      const mapped = list.map(item => this._mapHubStudioProfile(item))
      if (mapped.length > 0) {
        console.log('[BrowserProfileSync] HubStudio 第一条映射数据:', JSON.stringify(mapped[0], null, 2))
      }
      const result = await this._batchUpsert(supabaseService, mapped)

      console.log(`[BrowserProfileSync] HubStudio 同步完成: synced=${result.synced}, inserted=${result.inserted}, updated=${result.updated}, failed=${result.failed}`)
      return {
        success: true,
        synced: result.synced,
        inserted: result.inserted || 0,
        updated: result.updated || 0,
        failed: result.failed,
        total: list.length,
        message: `HubStudio 同步完成：更新 ${result.updated || 0} 条，新增 ${result.inserted || 0} 条${result.failed > 0 ? `，失败 ${result.failed} 条` : ''}`
      }
    } catch (err) {
      console.error('[BrowserProfileSync] HubStudio 同步失败:', err.message)
      return { success: false, error: err.message }
    }
  }

  /**
   * 同步 BitBrowser profiles 到 Supabase
   */
  async syncBitBrowser(bitBrowserService, supabaseService) {
    if (!supabaseService.client) {
      return { success: false, error: 'Supabase 未初始化，请先在设置中连接' }
    }

    try {
      console.log('[BrowserProfileSync] 开始同步 BitBrowser...')
      const list = await bitBrowserService.getAllProfiles()

      if (list.length === 0) {
        return { success: true, synced: 0, total: 0, message: '比特浏览器无环境数据' }
      }

      console.log(`[BrowserProfileSync] BitBrowser 获取到 ${list.length} 个环境`)

      const mapped = list.map(item => this._mapBitBrowserProfile(item))
      if (mapped.length > 0) {
        console.log('[BrowserProfileSync] BitBrowser 第一条映射数据:', JSON.stringify(mapped[0], null, 2))
      }
      const result = await this._batchUpsert(supabaseService, mapped)

      console.log(`[BrowserProfileSync] BitBrowser 同步完成: synced=${result.synced}, inserted=${result.inserted}, updated=${result.updated}, failed=${result.failed}`)
      return {
        success: true,
        synced: result.synced,
        inserted: result.inserted || 0,
        updated: result.updated || 0,
        failed: result.failed,
        total: list.length,
        message: `比特浏览器同步完成：更新 ${result.updated || 0} 条，新增 ${result.inserted || 0} 条${result.failed > 0 ? `，失败 ${result.failed} 条` : ''}`
      }
    } catch (err) {
      console.error('[BrowserProfileSync] BitBrowser 同步失败:', err.message)
      return { success: false, error: err.message }
    }
  }

  /**
   * 安全转换时间字段，返回 ISO string 或 null
   */
  _safeTimestamp(value) {
    if (!value) return null
    // 如果是数字（Unix 时间戳），转换
    if (typeof value === 'number') {
      // 秒级时间戳
      const ts = value > 1e12 ? value : value * 1000
      return new Date(ts).toISOString()
    }
    // 如果是字符串，尝试解析
    if (typeof value === 'string') {
      const d = new Date(value)
      if (!isNaN(d.getTime())) return d.toISOString()
    }
    return null
  }

  /**
   * 安全序列化 raw_data，去掉可能导致 JSONB 存储失败的内容
   */
  _safeRawData(item) {
    try {
      // 先 JSON.stringify 再 parse，确保可序列化
      return JSON.parse(JSON.stringify(item))
    } catch {
      return null
    }
  }

  /**
   * 批量同步到 Supabase（显式分离 insert/update，不依赖 UNIQUE 约束）
   */
  async _batchUpsert(supabaseService, profiles) {
    let synced = 0
    let inserted = 0
    let updated = 0
    let failed = 0

    try {
      // 1. 先查出所有已存在的 (source, profile_id) 组合
      const sources = [...new Set(profiles.map(p => p.source))]
      const existingMap = new Map() // key: "source|profile_id" => existing row id

      for (const source of sources) {
        const profileIds = profiles
          .filter(p => p.source === source)
          .map(p => p.profile_id)

        // 分批查询，每批 100 个
        for (let i = 0; i < profileIds.length; i += 100) {
          const batchIds = profileIds.slice(i, i + 100)
          const { data: existing, error } = await supabaseService.client
            .from('browser_profiles')
            .select('id, source, profile_id')
            .eq('source', source)
            .in('profile_id', batchIds)

          if (error) {
            console.error('[BrowserProfileSync] Query existing error:', error.message)
          } else if (existing) {
            for (const row of existing) {
              existingMap.set(`${row.source}|${row.profile_id}`, row.id)
            }
          }
        }
      }

      console.log(`[BrowserProfileSync] Found ${existingMap.size} existing profiles, ${profiles.length - existingMap.size} new profiles`)

      // 2. 分离为 toUpdate 和 toInsert
      const toUpdate = []
      const toInsert = []

      for (const profile of profiles) {
        const key = `${profile.source}|${profile.profile_id}`
        const existingId = existingMap.get(key)
        if (existingId !== undefined) {
          toUpdate.push({ ...profile, id: existingId })
        } else {
          toInsert.push(profile)
        }
      }

      // 3. 批量 UPDATE 已存在的记录
      if (toUpdate.length > 0) {
        console.log(`[BrowserProfileSync] Updating ${toUpdate.length} existing profiles...`)
        const BATCH_SIZE = 50
        for (let i = 0; i < toUpdate.length; i += BATCH_SIZE) {
          const batch = toUpdate.slice(i, i + BATCH_SIZE)
          try {
            const { data, error } = await supabaseService.client
              .from('browser_profiles')
              .upsert(batch, { onConflict: 'id' })
              .select('id')

            if (error) {
              console.error('[BrowserProfileSync] Batch update error:', error.message, error.details, error.hint)
              failed += batch.length
            } else {
              const count = (data || []).length
              updated += count
              synced += count
              console.log(`[BrowserProfileSync] Batch update ok: ${count} rows`)
            }
          } catch (err) {
            console.error('[BrowserProfileSync] Batch update exception:', err.message)
            failed += batch.length
          }
        }
      }

      // 4. 批量 INSERT 新增的记录
      if (toInsert.length > 0) {
        console.log(`[BrowserProfileSync] Inserting ${toInsert.length} new profiles...`)
        const BATCH_SIZE = 50
        for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
          const batch = toInsert.slice(i, i + BATCH_SIZE)
          try {
            const { data, error } = await supabaseService.client
              .from('browser_profiles')
              .insert(batch)
              .select('id')

            if (error) {
              console.error('[BrowserProfileSync] Batch insert error:', error.message, error.details, error.hint)
              failed += batch.length
            } else {
              const count = (data || []).length
              inserted += count
              synced += count
              console.log(`[BrowserProfileSync] Batch insert ok: ${count} rows`)
            }
          } catch (err) {
            console.error('[BrowserProfileSync] Batch insert exception:', err.message)
            failed += batch.length
          }
        }
      }
    } catch (err) {
      console.error('[BrowserProfileSync] _batchUpsert fatal error:', err.message)
      failed += profiles.length - synced
    }

    console.log(`[BrowserProfileSync] Sync result: updated=${updated}, inserted=${inserted}, failed=${failed}`)
    return { synced, inserted, updated, failed }
  }

  /**
   * HubStudio 字段映射
   */
  _mapHubStudioProfile(item) {
    return {
      source: 'hubstudio',
      profile_id: String(item.containerCode),
      seq: item.serialNumber || null,
      profile_name: item.containerName || null,
      remark: item.remark || null,
      group_id: item.tagCode ? String(item.tagCode) : null,
      group_name: item.tagName || null,
      proxy_type: item.proxyTypeName ? item.proxyTypeName.toLowerCase() : null,
      proxy_host: item.proxyHost || null,
      proxy_port: item.proxyPort ? Number(item.proxyPort) : null,
      proxy_username: item.proxyAccount || null,
      proxy_password: item.proxyPassword || null,
      proxy_mode: item.asDynamicType === 1 ? 'static' : item.asDynamicType === 2 ? 'dynamic' : null,
      dynamic_ip_url: item.refreshUrl || null,
      last_ip: item.lastUsedIp || null,
      last_country: item.lastCountry || null,
      last_region: item.lastRegion || null,
      last_city: item.lastCity || null,
      user_agent: item.ua || null,
      // HubStudio list 接口不返回指纹详细字段，留 null
      os: null,
      os_version: null,
      core_version: null,
      resolution: null,
      language: null,
      timezone: null,
      // HubStudio list 接口不返回平台账号字段
      platform_url: null,
      platform_username: null,
      platform_password: null,
      fa_secret_key: null,
      cookie: null,
      profile_created_at: this._safeTimestamp(item.createTime),
      last_opened_at: this._safeTimestamp(item.allOpenTime),
      raw_data: this._safeRawData(item),
      synced_at: new Date().toISOString()
    }
  }

  /**
   * BitBrowser 字段映射
   */
  _mapBitBrowserProfile(item) {
    const fp = item.browserFingerPrint || {}
    return {
      source: 'bitbrowser',
      profile_id: String(item.id),
      seq: item.seq || null,
      profile_name: item.name || null,
      remark: item.remark || null,
      group_id: item.groupId ? String(item.groupId) : null,
      group_name: null, // BitBrowser list 不返回 group_name
      proxy_type: item.proxyType || null,
      proxy_host: item.host || null,
      proxy_port: item.port ? Number(item.port) : null,
      proxy_username: item.proxyUserName || null,
      proxy_password: item.proxyPassword || null,
      proxy_mode: item.proxyMethod === 2 ? 'static' : item.proxyMethod === 3 ? 'dynamic' : null,
      dynamic_ip_url: item.dynamicIpUrl || null,
      last_ip: item.lastIp || null,
      last_country: item.lastCountry || null,
      last_region: item.province || null,
      last_city: item.city || null,
      user_agent: fp.userAgent || null,
      os: fp.os || null,
      os_version: fp.osVersion || null,
      core_version: fp.coreVersion || null,
      resolution: fp.resolution || null,
      language: Array.isArray(fp.languages) ? fp.languages.join(',') : (fp.languages || null),
      timezone: fp.timeZone || null,
      platform_url: item.platform || null,
      platform_username: item.userName || null,
      platform_password: item.password || null,
      fa_secret_key: item.faSecretKey || null,
      cookie: item.cookie || null,
      profile_created_at: this._safeTimestamp(item.createdTime),
      last_opened_at: null, // BitBrowser 不返回
      raw_data: this._safeRawData(item),
      synced_at: new Date().toISOString()
    }
  }
}

module.exports = BrowserProfileSyncService
