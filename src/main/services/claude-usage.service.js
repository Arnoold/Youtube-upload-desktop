/**
 * Claude 用量采集服务
 * 打开浏览器访问 claude.ai/settings/usage，拦截 API 响应获取用量数据
 */

class ClaudeUsageService {
  constructor() {
    this.running = false
    this.shouldStop = false
    // 定时任务
    this.scheduleConfig = {
      enabled: false,
      time1: '09:00',
      time2: '21:00',
      lastExecuteKeys: {} // { 'time1_2026-04-06': true }
    }
    this.checkInterval = null
    this.dbService = null
    this.mainWindow = null
    this.deps = null
  }

  /**
   * 初始化定时任务（应用启动时调用）
   */
  async initSchedule(dbService, mainWindow, deps) {
    this.dbService = dbService
    this.mainWindow = mainWindow
    this.deps = deps

    // 从本地数据库加载配置
    try {
      const saved = dbService.getSetting('claude_usage_schedule')
      if (saved) {
        const parsed = JSON.parse(saved)
        this.scheduleConfig = { ...this.scheduleConfig, ...parsed }
      }
    } catch (e) {
      console.error('[ClaudeUsage] 加载定时配置失败:', e.message)
    }

    // 启动检查器
    this.startChecker()
  }

  /**
   * 保存定时配置到本地数据库
   */
  async saveScheduleConfig() {
    if (this.dbService) {
      this.dbService.setSetting('claude_usage_schedule', JSON.stringify(this.scheduleConfig))
    }
  }

  /**
   * 更新定时配置
   */
  async updateScheduleConfig(config) {
    this.scheduleConfig = { ...this.scheduleConfig, ...config }
    await this.saveScheduleConfig()
    return this.scheduleConfig
  }

  /**
   * 获取定时配置
   */
  getScheduleConfig() {
    return {
      enabled: this.scheduleConfig.enabled,
      time1: this.scheduleConfig.time1,
      time1Enabled: this.scheduleConfig.time1Enabled !== false,
      time2: this.scheduleConfig.time2,
      time2Enabled: this.scheduleConfig.time2Enabled !== false
    }
  }

  /**
   * 启动定时检查器（每分钟检查一次）
   */
  startChecker() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval)
    }
    this.checkInterval = setInterval(() => {
      this._checkSchedule()
    }, 60 * 1000)
    console.log('[ClaudeUsage] 定时检查器已启动')
  }

  /**
   * 检查是否到达执行时间
   */
  async _checkSchedule() {
    if (!this.scheduleConfig.enabled || this.running || !this.deps) return

    const now = new Date()
    const today = now.toISOString().split('T')[0]
    const currentTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`

    const times = []
    if (this.scheduleConfig.time1 && this.scheduleConfig.time1Enabled !== false) times.push(this.scheduleConfig.time1)
    if (this.scheduleConfig.time2 && this.scheduleConfig.time2Enabled !== false) times.push(this.scheduleConfig.time2)

    for (const time of times) {
      if (currentTime !== time) continue

      const key = `${time}_${today}`
      if (this.scheduleConfig.lastExecuteKeys[key]) continue

      // 标记已执行，防止重复
      this.scheduleConfig.lastExecuteKeys[key] = true
      // 只保留最近 10 条记录
      const keys = Object.keys(this.scheduleConfig.lastExecuteKeys)
      if (keys.length > 10) {
        keys.sort()
        for (let i = 0; i < keys.length - 10; i++) {
          delete this.scheduleConfig.lastExecuteKeys[keys[i]]
        }
      }
      await this.saveScheduleConfig()

      console.log(`[ClaudeUsage] 定时触发：${time}`)
      const onLog = (type, message) => {
        const logTime = new Date().toLocaleTimeString('zh-CN')
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
          this.mainWindow.webContents.send('claude-usage:log', { type, message, time: logTime })
        }
      }
      onLog('info', `定时任务触发（${time}），开始采集...`)
      await this.fetchAll(this.deps, onLog)
      break // 同一分钟只触发一个
    }
  }

  /**
   * 采集所有 active 状态的浏览器 profile 的 Claude 用量
   * @param {Object} deps - 依赖服务
   * @param {Function} onLog - 日志回调 (type, message)
   */
  async fetchAll(deps, onLog) {
    const { supabaseService, bitBrowserService, hubStudioService } = deps

    if (this.running) {
      onLog('error', '采集任务正在运行中')
      return { success: false, error: '任务正在运行中' }
    }

    if (!supabaseService.client) {
      onLog('error', 'Supabase 未初始化')
      return { success: false, error: 'Supabase 未初始化' }
    }

    this.running = true
    this.shouldStop = false

    try {
      // 1. 查询 active 状态的 profile
      onLog('info', '正在查询使用中的浏览器配置...')
      const { data: profiles, error } = await supabaseService.client
        .from('browser_profiles')
        .select('id, source, profile_id, profile_name, seq')
        .eq('account_status', 'active')
        .order('id', { ascending: true })

      if (error) throw new Error('查询浏览器配置失败: ' + error.message)

      if (!profiles || profiles.length === 0) {
        onLog('info', '没有找到【使用中】状态的浏览器配置')
        return { success: true, total: 0, fetched: 0 }
      }

      onLog('info', `找到 ${profiles.length} 个使用中的浏览器配置`)

      let fetched = 0
      let failed = 0

      // 2. 逐个处理
      for (let i = 0; i < profiles.length; i++) {
        if (this.shouldStop) {
          onLog('info', '用户已停止采集')
          break
        }

        const profile = profiles[i]
        const label = `[${i + 1}/${profiles.length}] ${profile.profile_name || profile.profile_id}`

        const startedAt = new Date()
        try {
          onLog('info', `${label} 开始采集...`)
          await this._fetchOne(profile, deps, onLog, label)
          fetched++
          onLog('success', `${label} 采集完成`)

          // 记录成功日志
          const finishedAt = new Date()
          await this._saveFetchLog(supabaseService, profile.id, 'success', null, startedAt, finishedAt)
        } catch (err) {
          failed++
          onLog('error', `${label} 采集失败: ${err.message}`)

          // 记录失败日志
          const finishedAt = new Date()
          await this._saveFetchLog(supabaseService, profile.id, 'failed', err.message, startedAt, finishedAt)
        }

        // 随机延迟 30-60 秒（最后一个不需要）
        if (i < profiles.length - 1 && !this.shouldStop) {
          const delay = 4
          onLog('info', `等待 ${delay} 秒后处理下一个...`)
          await this._sleep(delay * 1000)
        }
      }

      onLog('info', `采集完成：成功 ${fetched}，失败 ${failed}，共 ${profiles.length}`)
      return { success: true, total: profiles.length, fetched, failed }
    } catch (err) {
      onLog('error', '采集任务异常: ' + err.message)
      return { success: false, error: err.message }
    } finally {
      this.running = false
    }
  }

  /**
   * 停止采集
   */
  stop() {
    this.shouldStop = true
  }

  /**
   * 采集单个 profile
   */
  async _fetchOne(profile, deps, onLog, label) {
    const { supabaseService, bitBrowserService, hubStudioService } = deps
    const { chromium } = require('playwright-core')

    let browser = null
    let browserService = null
    let browserId = null

    try {
      // 1. 启动浏览器
      onLog('info', `${label} 启动 ${profile.source} 浏览器...`)
      let wsEndpoint = ''
      if (profile.source === 'hubstudio') {
        browserService = hubStudioService
        const result = await hubStudioService.startBrowser(profile.profile_id)
        if (!result.success) throw new Error('启动 HubStudio 浏览器失败')
        browserId = result.browserId
        wsEndpoint = result.wsEndpoint
      } else {
        browserService = bitBrowserService
        const result = await bitBrowserService.startBrowser(profile.profile_id)
        if (!result.success) throw new Error('启动 BitBrowser 浏览器失败')
        browserId = result.browserId
        wsEndpoint = result.wsEndpoint
      }

      if (!wsEndpoint) throw new Error('未获取到浏览器 WebSocket 地址')
      onLog('info', `${label} 连接浏览器 CDP...`)
      console.log(`[ClaudeUsage] wsEndpoint: ${wsEndpoint}`)

      browser = await chromium.connectOverCDP(wsEndpoint)
      console.log(`[ClaudeUsage] Connected, contexts: ${browser.contexts().length}`)

      // 等待浏览器稳定
      await new Promise(r => setTimeout(r, 2000))

      const contexts = browser.contexts()
      const context = contexts.length > 0 ? contexts[0] : await browser.newContext()
      const pages = context.pages()
      console.log(`[ClaudeUsage] Pages in context: ${pages.length}`)

      const page = pages.length > 0 ? pages[0] : await context.newPage()

      // 2. 设置 API 拦截
      const apiData = {
        bootstrap: null,
        usage: null,
        oauthTokens: null
      }

      // 监听响应 — 拦截所有 JSON 响应，匹配目标数据结构
      page.on('response', async (response) => {
        const url = response.url()
        const status = response.status()
        if (status !== 200) return
        const contentType = response.headers()['content-type'] || ''
        if (!contentType.includes('json')) return

        try {
          const json = await response.json()

          // bootstrap/auth: 包含 account.email_address 的大 JSON
          if (!apiData.bootstrap && json.account && json.account.email_address) {
            apiData.bootstrap = json
            console.log('[ClaudeUsage] Captured bootstrap from:', url)
          }

          // usage: 包含 five_hour 和 seven_day 的 JSON
          if (!apiData.usage && json.five_hour !== undefined && json.seven_day !== undefined) {
            apiData.usage = json
            console.log('[ClaudeUsage] Captured usage from:', url)
          }

          // oauth_tokens: 数组，每项有 application_name 和 scope
          if (!apiData.oauthTokens && Array.isArray(json) && json.length > 0 && json[0].application_name && json[0].scope) {
            apiData.oauthTokens = json
            console.log('[ClaudeUsage] Captured oauth_tokens from:', url)
          }
          // oauth_tokens 为空数组的情况
          if (!apiData.oauthTokens && Array.isArray(json) && json.length === 0 && url.includes('oauth_tokens')) {
            apiData.oauthTokens = json
            console.log('[ClaudeUsage] Captured empty oauth_tokens from:', url)
          }
        } catch (e) {
          // 忽略非 JSON 响应或解析错误
        }
      })

      // 3. 导航到 Usage 页面
      onLog('info', `${label} 打开 claude.ai/settings/usage...`)
      await page.goto('https://claude.ai/settings/usage', {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      })

      // 等待页面加载和 API 响应
      await page.waitForTimeout(5000)

      // 检查是否需要登录
      const currentUrl = page.url()
      if (currentUrl.includes('/login') || currentUrl.includes('/signin')) {
        throw new Error('需要先登录 Claude 账号')
      }

      // 等待 usage API 返回
      if (!apiData.usage) {
        onLog('info', `${label} 等待 usage 数据...`)
        await page.waitForTimeout(5000)
      }

      // 4. 如果 bootstrap 数据还没拿到，可能已经缓存了，尝试从页面获取 org_id 后直接读
      if (!apiData.bootstrap) {
        onLog('info', `${label} 尝试从页面获取账号信息...`)
        // 尝试通过点击用户菜单获取信息，或者从现有的 cookie/localStorage 获取
        try {
          // 访问一个会触发 bootstrap 的页面
          await page.goto('https://claude.ai/settings/account', {
            waitUntil: 'domcontentloaded',
            timeout: 15000
          })
          await page.waitForTimeout(3000)
        } catch (e) {
          onLog('info', `${label} 无法获取 bootstrap 数据，使用页面信息`)
        }
      }

      // 5. 获取 oauth_tokens（导航到 Claude Code 设置页面）
      if (!apiData.oauthTokens) {
        onLog('info', `${label} 获取授权 token 信息...`)
        await page.goto('https://claude.ai/settings/claude-code', {
          waitUntil: 'domcontentloaded',
          timeout: 15000
        })
        await page.waitForTimeout(3000)
      }

      // 6. 保存数据到 Supabase
      onLog('info', `${label} 保存数据...`)
      await this._saveData(supabaseService, profile.id, apiData, onLog, label)

    } finally {
      // 7. 断开 Playwright CDP 连接
      if (browser) {
        try {
          await browser.close()
        } catch (e) {
          // 忽略断开连接错误
        }
      }

      // 8. 关闭浏览器窗口
      if (browserService) {
        try {
          onLog('info', `${label} 关闭浏览器...`)
          // HubStudio 用 containerCode，BitBrowser 用 profile_id，都是 profile.profile_id
          await browserService.closeBrowser(profile.profile_id)
        } catch (e) {
          onLog('info', `${label} 关闭浏览器失败: ${e.message}`)
        }
      }
    }
  }

  /**
   * 保存采集数据到 Supabase
   */
  async _saveData(supabaseService, browserProfileId, apiData, onLog, label) {
    const { bootstrap, usage, oauthTokens } = apiData

    // 构建 claude_usage upsert 数据
    const usageRow = {
      browser_profile_id: browserProfileId,
      fetched_at: new Date().toISOString()
    }

    // bootstrap 数据
    if (bootstrap && bootstrap.account) {
      const account = bootstrap.account
      const org = account.memberships?.[0]?.organization
      usageRow.account_uuid = account.uuid || null
      usageRow.account_name = account.full_name || account.display_name || null
      usageRow.account_email = account.email_address || null
      usageRow.org_uuid = org?.uuid || null

      // 套餐类型：从 capabilities 提取
      if (org?.capabilities) {
        const caps = org.capabilities
        if (caps.includes('claude_max')) usageRow.plan_type = 'claude_max'
        else if (caps.includes('claude_pro')) usageRow.plan_type = 'claude_pro'
        else if (caps.includes('claude_team')) usageRow.plan_type = 'claude_team'
        else usageRow.plan_type = caps.join(',')
      }

      usageRow.rate_limit_tier = org?.rate_limit_tier || null
      usageRow.billing_type = org?.billing_type || null
    }

    // usage 数据
    if (usage) {
      usageRow.five_hour_utilization = usage.five_hour?.utilization ?? null
      usageRow.five_hour_resets_at = usage.five_hour?.resets_at || null
      usageRow.seven_day_utilization = usage.seven_day?.utilization ?? null
      usageRow.seven_day_resets_at = usage.seven_day?.resets_at || null
      usageRow.seven_day_sonnet_utilization = usage.seven_day_sonnet?.utilization ?? null
      usageRow.seven_day_sonnet_resets_at = usage.seven_day_sonnet?.resets_at || null
      usageRow.seven_day_opus_utilization = usage.seven_day_opus?.utilization ?? null
      usageRow.seven_day_opus_resets_at = usage.seven_day_opus?.resets_at || null
      usageRow.extra_usage_enabled = usage.extra_usage?.is_enabled ?? null
      usageRow.extra_usage_monthly_limit = usage.extra_usage?.monthly_limit ?? null
      usageRow.extra_usage_used_credits = usage.extra_usage?.used_credits ?? null
    }

    // insert claude_usage（保留历史记录）
    const { error: usageError } = await supabaseService.client
      .from('claude_usage')
      .insert(usageRow)
      .select('id')

    if (usageError) {
      onLog('error', `${label} 保存用量数据失败: ${usageError.message}`)
    } else {
      const infoMsg = []
      if (usage) {
        infoMsg.push(`5h=${usage.five_hour?.utilization ?? '-'}%`)
        infoMsg.push(`7d=${usage.seven_day?.utilization ?? '-'}%`)
        infoMsg.push(`sonnet=${usage.seven_day_sonnet?.utilization ?? '-'}%`)
      }
      if (bootstrap?.account) {
        infoMsg.push(`email=${bootstrap.account.email_address}`)
      }
      onLog('success', `${label} 用量: ${infoMsg.join(', ')}`)
    }

    // 保存 claude_auth_tokens
    if (oauthTokens && Array.isArray(oauthTokens)) {
      // Step 1: 将该 profile 下所有现有 token 标记为 offline
      await supabaseService.client
        .from('claude_auth_tokens')
        .update({ is_online: false })
        .eq('browser_profile_id', browserProfileId)

      if (oauthTokens.length > 0) {
        // Step 2: upsert 本次获取到的 token，标记为 online
        const tokenRows = oauthTokens.map(t => ({
          browser_profile_id: browserProfileId,
          token_id: t.id,
          application_name: t.application_name || null,
          scope: t.scope || null,
          is_revoked: t.is_revoked ?? false,
          token_created_at: t.created_at || null,
          token_updated_at: t.updated_at || null,
          is_online: true,
          fetched_at: new Date().toISOString()
        }))

        const { error: tokenError } = await supabaseService.client
          .from('claude_auth_tokens')
          .upsert(tokenRows, { onConflict: 'browser_profile_id,token_id,token_created_at' })
          .select('id')

        if (tokenError) {
          onLog('error', `${label} 保存 token 数据失败: ${tokenError.message}`)
        } else {
          onLog('success', `${label} 授权 token: ${oauthTokens.length} 个在线`)
        }
      } else {
        onLog('info', `${label} 当前无授权 token（已将历史标记为离线）`)
      }
    } else {
      onLog('info', `${label} 未获取到授权 token 数据`)
    }
  }

  /**
   * 保存采集执行日志
   */
  async _saveFetchLog(supabaseService, browserProfileId, status, errorMessage, startedAt, finishedAt) {
    try {
      const durationMs = finishedAt.getTime() - startedAt.getTime()
      await supabaseService.client
        .from('claude_fetch_logs')
        .insert({
          browser_profile_id: browserProfileId,
          status,
          error_message: errorMessage,
          started_at: startedAt.toISOString(),
          finished_at: finishedAt.toISOString(),
          duration_ms: durationMs
        })
    } catch (e) {
      console.error('[ClaudeUsage] 保存采集日志失败:', e.message)
    }
  }

  _sleep(ms) {
    return new Promise(resolve => {
      if (this.shouldStop) return resolve()
      const timer = setTimeout(resolve, ms)
      // 每秒检查是否需要提前停止
      const interval = setInterval(() => {
        if (this.shouldStop) {
          clearTimeout(timer)
          clearInterval(interval)
          resolve()
        }
      }, 1000)
      // 正常结束时清理 interval
      setTimeout(() => clearInterval(interval), ms + 100)
    })
  }

  /**
   * 按 browser_profiles.id 采集单个浏览器的 Claude 用量。
   * 供 IPC（采集按钮）和网页指令轮询(command-poller)复用，行为一致。
   * @returns { success: true, logs } 或 { success: false, error }
   */
  async fetchOneById(profileId, deps) {
    const { supabaseService, bitBrowserService, hubStudioService } = deps
    try {
      if (!supabaseService || !supabaseService.client) {
        return { success: false, error: 'Supabase 未连接' }
      }

      const { data, error } = await supabaseService.client
        .from('browser_profiles')
        .select('id, source, profile_id, profile_name, seq')
        .eq('id', profileId)
        .single()

      if (error || !data) {
        return { success: false, error: '未找到浏览器配置' }
      }

      const logs = []
      const onLog = (type, message) => {
        const time = new Date().toLocaleTimeString('zh-CN')
        logs.push({ type, message, time })
      }

      const startedAt = new Date()
      await this._fetchOne(data, {
        supabaseService,
        bitBrowserService,
        hubStudioService
      }, onLog, `[${data.profile_name || data.profile_id}]`)

      await this._saveFetchLog(supabaseService, profileId, 'success', null, startedAt, new Date())

      return { success: true, logs }
    } catch (err) {
      try {
        await this._saveFetchLog(supabaseService, profileId, 'failed', err.message, new Date(), new Date())
      } catch (e) { }
      return { success: false, error: err.message }
    }
  }
}

module.exports = ClaudeUsageService
