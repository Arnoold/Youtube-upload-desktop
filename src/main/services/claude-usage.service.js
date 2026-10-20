/**
 * Claude 用量采集服务
 * 打开浏览器访问 claude.ai/settings/usage，拦截 API 响应获取用量数据
 * 同一次采集里顺带检测该浏览器的 Google 账号状态（写回 browser_profiles.google_*）
 */

// ===== 采集超时配置（毫秒）=====
// 页面导航超时
const NAV_TIMEOUT = 45000
// 等待 usage 接口返回的最长时间
const WAIT_USAGE = 30000
// 等待 bootstrap（账号信息）接口返回的最长时间
const WAIT_BOOTSTRAP = 20000
// 等待 oauth_tokens 接口返回的最长时间（网络慢时该接口最容易拖延，超时后还会刷新重试一次）
const WAIT_TOKENS = 30000
// 轮询检查间隔
const POLL_INTERVAL = 500
// Google 账号检测预留的时长（从总时长里扣出来，Claude 步骤不会占用这段）
const GOOGLE_TIMEOUT = 40000
// 单个账号采集的总时长上限：超过就放弃这个号，关掉浏览器直接跑下一个
const PROFILE_TIMEOUT = 150000 + GOOGLE_TIMEOUT

// 能启动并采集的浏览器来源；必得D（bide）等其他来源一律跳过
const COLLECTABLE_SOURCES = ['bitbrowser', 'hubstudio']

// 检测 Google 账号状态用的页面
const GOOGLE_MYACCOUNT_URL = 'https://myaccount.google.com/'
// 账号被停用的页面文案（中英文都可能出现，取决于浏览器语言）
const GOOGLE_DISABLED_TEXT = /account (has been )?(disabled|suspended)|account disabled|[帐账帳][号號户戶]已(被)?停用/i

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
        .in('source', COLLECTABLE_SOURCES)
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

    // 单个账号的总时长上限：超时立即抛错，走 finally 关掉浏览器并交回给上层跑下一个
    const deadline = Date.now() + PROFILE_TIMEOUT
    // Claude 步骤的等待截止时间，留出 GOOGLE_TIMEOUT 给后面的 Google 检测
    const claudeDeadline = deadline - GOOGLE_TIMEOUT

    try {
      const work = (async () => {
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

        // Claude 步骤失败（如未登录）不中断，先把错误存下来，等 Google 检测做完再抛
        // Claude 号登不上往往就是 Google 号出了问题，这时候最需要 Google 状态
        let claudeError = null
        try {
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
            timeout: NAV_TIMEOUT
          })

          // 先短暂等待，让可能的登录跳转发生
          await page.waitForTimeout(3000)

          // 检查是否需要登录
          const currentUrl = page.url()
          if (currentUrl.includes('/login') || currentUrl.includes('/signin')) {
            throw new Error('需要先登录 Claude 账号')
          }

          // 等待 usage API 返回（抓到就立即继续，最多等 WAIT_USAGE 毫秒）
          if (!apiData.usage) {
            onLog('info', `${label} 等待 usage 数据...`)
            const ok = await this._waitForData(page, () => !!apiData.usage, WAIT_USAGE, claudeDeadline, onLog, label, 'usage')
            if (!ok) onLog('info', `${label} 等待 usage 数据超时（${WAIT_USAGE / 1000}s）`)
          }

          // 4. 如果 bootstrap 数据还没拿到，可能已经缓存了，尝试从页面获取 org_id 后直接读
          if (!apiData.bootstrap) {
            onLog('info', `${label} 尝试从页面获取账号信息...`)
            // 尝试通过点击用户菜单获取信息，或者从现有的 cookie/localStorage 获取
            try {
              // 访问一个会触发 bootstrap 的页面
              await page.goto('https://claude.ai/settings/account', {
                waitUntil: 'domcontentloaded',
                timeout: NAV_TIMEOUT
              })
              const ok = await this._waitForData(page, () => !!apiData.bootstrap, WAIT_BOOTSTRAP, claudeDeadline, onLog, label, 'bootstrap')
              if (!ok) onLog('info', `${label} 等待账号信息超时（${WAIT_BOOTSTRAP / 1000}s）`)
            } catch (e) {
              onLog('info', `${label} 无法获取 bootstrap 数据，使用页面信息`)
            }
          }

          // 5. 获取 oauth_tokens（导航到 Claude Code 设置页面）
          // 该页面接口经常受网络影响返回较慢，改为轮询等待：抓到就立即继续，最多等 WAIT_TOKENS 毫秒
          if (!apiData.oauthTokens) {
            onLog('info', `${label} 获取授权 token 信息...`)
            try {
              await page.goto('https://claude.ai/settings/claude-code', {
                waitUntil: 'domcontentloaded',
                timeout: NAV_TIMEOUT
              })
            } catch (e) {
              onLog('info', `${label} 打开 claude-code 页面超时，继续等待接口返回...`)
            }
            const ok = await this._waitForData(page, () => !!apiData.oauthTokens, WAIT_TOKENS, claudeDeadline, onLog, label, 'oauth_tokens')
            if (!ok) {
              // 兜底：再刷新一次页面，重新触发接口
              onLog('info', `${label} 未拿到授权 token，刷新页面重试一次...`)
              try {
                await page.reload({ waitUntil: 'domcontentloaded', timeout: NAV_TIMEOUT })
              } catch (e) { /* 忽略刷新超时，继续等待接口 */ }
              const retryOk = await this._waitForData(page, () => !!apiData.oauthTokens, WAIT_TOKENS, claudeDeadline, onLog, label, 'oauth_tokens')
              if (!retryOk) onLog('info', `${label} 等待授权 token 超时（重试后仍未返回）`)
            }
          }

          // 6. 保存数据到 Supabase
          onLog('info', `${label} 保存数据...`)
          await this._saveData(supabaseService, profile.id, apiData, onLog, label)
        } catch (e) {
          claudeError = e
        }

        // 7. 检测 Google 账号状态（自身不抛错，失败记为 unknown）
        await this._checkGoogle(context, supabaseService, profile.id, deadline, onLog, label)

        if (claudeError) throw claudeError

      })()
      // 超时后被丢弃的 work 仍会因浏览器关闭而 reject，先吞掉避免 unhandledRejection
      work.catch(() => {})
      await this._withDeadline(work, deadline, `${label} 单个账号采集超时（${PROFILE_TIMEOUT / 1000}s），跳过`)
    } finally {
      // 8. 断开 Playwright CDP 连接
      if (browser) {
        try {
          await browser.close()
        } catch (e) {
          // 忽略断开连接错误
        }
      }

      // 9. 关闭浏览器窗口
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
   * 检测浏览器里 Google 账号的状态，结果写回 browser_profiles。
   * 只打开页面看结果，不做任何登录操作。自身不抛错，出问题记为 unknown。
   * 状态：normal 正常 / logged_out 掉登录 / need_verify 需验证 / disabled 被封 / unknown 未知
   * 注意不能用 context.request 发请求：它走 Node 端，不走浏览器配置的代理，会暴露本机 IP。
   */
  async _checkGoogle(context, supabaseService, browserProfileId, hardDeadline, onLog, label) {
    let page = null
    const result = { status: 'unknown', email: null, detail: null }

    try {
      onLog('info', `${label} 检测 Google 账号状态...`)
      page = await context.newPage()
      const navTimeout = Math.max(1000, Math.min(NAV_TIMEOUT, hardDeadline - Date.now() - 2000))

      // 1. 打开个人中心，按最终停留的页面判断状态
      await page.goto(GOOGLE_MYACCOUNT_URL, { waitUntil: 'domcontentloaded', timeout: navTimeout })
      // 等登录/验证跳转走完
      await page.waitForTimeout(3000)
      try {
        await page.waitForLoadState('domcontentloaded', { timeout: 5000 })
      } catch (e) { /* 忽略 */ }

      const finalUrl = page.url()
      let bodyText = ''
      try {
        bodyText = ((await page.evaluate(() => document.body?.innerText || '')) || '').slice(0, 5000)
      } catch (e) { /* 页面还在跳转时可能取不到，只按 URL 判断 */ }

      result.status = this._classifyGoogle(finalUrl, bodyText)
      result.detail = finalUrl
      // 邮箱直接从页面文字取：个人中心和「选择账号」页都会显示
      // （ListAccounts 接口直接打开会返回 400，只认 Chrome 内部调用，用不了）
      result.email = (bodyText.match(/[\w.+-]+@[\w-]+(\.[\w-]+)+/) || [])[0] || null
    } catch (e) {
      result.status = 'unknown'
      // Playwright 报错后面会跟一大段 Call log，只留第一行就够看出原因
      result.detail = (e.message || '').split('\n')[0]
    } finally {
      if (page) {
        try { await page.close() } catch (e) { /* 忽略 */ }
      }
    }

    const STATUS_TEXT = { normal: '正常', logged_out: '掉登录', need_verify: '需验证', disabled: '被封', unknown: '未知' }
    onLog(result.status === 'normal' ? 'success' : 'error',
      `${label} Google 状态: ${STATUS_TEXT[result.status]}` +
      (result.email ? `，邮箱=${result.email}` : '') +
      (result.status !== 'normal' && result.detail ? `｜${result.detail}` : ''))

    // 3. 写回 browser_profiles
    try {
      const { error } = await supabaseService.client
        .from('browser_profiles')
        .update({
          google_status: result.status,
          google_email: result.email,
          google_detail: result.detail,
          google_checked_at: new Date().toISOString()
        })
        .eq('id', browserProfileId)

      if (error) {
        if (error.code === 'PGRST204' || /google_/.test(error.message || '')) {
          onLog('error', `${label} browser_profiles 缺少 google_* 列，请先在 Supabase 执行加列 SQL`)
        } else {
          onLog('error', `${label} 保存 Google 状态失败: ${error.message}`)
        }
      }
    } catch (e) {
      onLog('error', `${label} 保存 Google 状态失败: ${e.message}`)
    }
  }

  /**
   * 根据 myaccount.google.com 最终停留的 URL 和页面文字判断 Google 账号状态
   */
  _classifyGoogle(url, bodyText) {
    let u
    try {
      u = new URL(url)
    } catch (e) {
      return 'unknown'
    }
    const path = u.pathname

    // 被停用可能出现在各种路径下，先看文案
    if (/\/disabled|\/signin\/rejected/.test(path) || GOOGLE_DISABLED_TEXT.test(bodyText)) return 'disabled'

    if (u.hostname === 'myaccount.google.com') {
      // 未登录时个人中心会落到介绍页
      return /^\/intro/.test(path) ? 'logged_out' : 'normal'
    }

    // 浏览器里完全没有 Google 账号时，个人中心会跳到 google.com/account/about 介绍页
    if (/^(www\.)?google\.com$/.test(u.hostname) && /^\/account\/about/.test(path)) return 'logged_out'

    if (u.hostname === 'accounts.google.com') {
      // 记住了账号但会话过期，只要求重新输密码 —— 算掉登录
      if (/\/challenge\/pwd/.test(path)) return 'logged_out'
      // 手机号 / 二次验证 / 风控确认页
      if (/challenge|speedbump|recovery|deniedsigninrejected/i.test(path)) return 'need_verify'
      if (/ServiceLogin|signin|AccountChooser/i.test(path)) return 'logged_out'
    }

    return 'unknown'
  }

  /**
   * 给一个 promise 套上截止时间。到点直接 reject，让调用方的 finally 立刻做清理。
   * 注意：被放弃的 promise 仍在后台跑，调用方需自行 catch 掉它的后续 rejection。
   */
  _withDeadline(promise, deadline, message) {
    const ms = Math.max(0, deadline - Date.now())
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(message)), ms)
      promise.then(
        (v) => { clearTimeout(timer); resolve(v) },
        (e) => { clearTimeout(timer); reject(e) }
      )
    })
  }

  /**
   * 轮询等待某个接口数据被拦截到。
   * 抓到就立即返回 true（不浪费时间），超时返回 false。
   * 期间如果页面跳到登录页，直接抛错，避免白等一整个超时。
   * @param {import('playwright-core').Page} page
   * @param {Function} predicate - 返回 true 表示数据已拿到
   * @param {number} timeoutMs - 本步最长等待时间
   * @param {number} hardDeadline - 该账号的总截止时间戳（由 _fetchOne 传入，不用实例字段以免并发互相覆盖）
   * @param {Function} onLog
   * @param {string} label
   * @param {string} what - 数据名称，仅用于日志
   */
  async _waitForData(page, predicate, timeoutMs, hardDeadline, onLog, label, what) {
    // 不能超过该账号的总时长上限，否则单步等待会把整体拖过头
    const startedAt = Date.now()
    const deadline = Math.min(startedAt + timeoutMs, hardDeadline || Infinity)
    const budget = Math.round((deadline - startedAt) / 1000)
    let lastTick = 0
    while (Date.now() < deadline) {
      if (predicate()) return true
      if (this.shouldStop) return predicate()

      // 页面被踢回登录页时立即中止
      try {
        const url = page.url()
        if (url.includes('/login') || url.includes('/signin')) {
          throw new Error('需要先登录 Claude 账号')
        }
      } catch (e) {
        if (e.message.includes('需要先登录')) throw e
        // page.url() 在页面导航中可能瞬时抛错，忽略继续等
      }

      // 每 10 秒提示一次，方便在日志里看出是在等网络
      const elapsed = Math.floor((Date.now() - startedAt) / 1000)
      if (elapsed >= lastTick + 10) {
        lastTick = elapsed
        onLog('info', `${label} 仍在等待 ${what} 数据（已等 ${elapsed}s / 最多 ${budget}s）...`)
      }

      await page.waitForTimeout(POLL_INTERVAL)
    }
    return predicate()
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

      // 新版接口把「按模型的 7 天额度」从 seven_day_opus / seven_day_sonnet
      // 挪到了 limits[] 里 kind='weekly_scoped' 的条目（模型名在 scope.model.display_name），
      // 旧字段现在恒为 null。这里按模型名回填旧列，保证历史看板不断档；
      // 完整明细（含 Fable 等新模型）统一进 claude_usage_limits 子表。
      const scopedWeekly = Array.isArray(usage.limits)
        ? usage.limits.filter(l => l.kind === 'weekly_scoped')
        : []
      const findScoped = (keyword) => scopedWeekly.find(
        l => (l.scope?.model?.display_name || '').toLowerCase().includes(keyword)
      )
      const sonnetLimit = findScoped('sonnet')
      if (sonnetLimit) {
        usageRow.seven_day_sonnet_utilization = sonnetLimit.percent ?? usageRow.seven_day_sonnet_utilization
        usageRow.seven_day_sonnet_resets_at = sonnetLimit.resets_at || usageRow.seven_day_sonnet_resets_at
      }
      const opusLimit = findScoped('opus')
      if (opusLimit) {
        usageRow.seven_day_opus_utilization = opusLimit.percent ?? usageRow.seven_day_opus_utilization
        usageRow.seven_day_opus_resets_at = opusLimit.resets_at || usageRow.seven_day_opus_resets_at
      }
    }

    // insert claude_usage（保留历史记录）
    const { data: usageInserted, error: usageError } = await supabaseService.client
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
        // 按模型的额度改从 limits[] 读，模型名不再写死
        const scoped = Array.isArray(usage.limits)
          ? usage.limits.filter(l => l.kind === 'weekly_scoped')
          : []
        for (const l of scoped) {
          infoMsg.push(`${l.scope?.model?.display_name || 'scoped'}=${l.percent ?? '-'}%`)
        }
      }
      if (bootstrap?.account) {
        infoMsg.push(`email=${bootstrap.account.email_address}`)
      }
      onLog('success', `${label} 用量: ${infoMsg.join(', ')}`)

      // 限额明细写子表
      const usageId = usageInserted?.[0]?.id
      if (usageId) {
        await this._saveLimits(
          supabaseService, usageId, browserProfileId,
          usage?.limits, usageRow.fetched_at, onLog, label
        )
      }
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
   * 保存 usage.limits[] 到 claude_usage_limits 子表。
   * limits[] 是新版接口的规范来源，一条限额一行，模型换代（Opus -> Fable）无需改代码。
   * kind: session（5 小时）/ weekly_all（7 天总额）/ weekly_scoped（7 天单模型额度）
   */
  async _saveLimits(supabaseService, usageId, browserProfileId, limits, fetchedAt, onLog, label) {
    if (!Array.isArray(limits) || limits.length === 0) {
      onLog('info', `${label} 本次未返回 limits 明细`)
      return
    }

    const rows = limits.map(l => ({
      usage_id: usageId,
      browser_profile_id: browserProfileId,
      kind: l.kind || null,
      limit_group: l.group || null,        // group 是 SQL 保留字，列名改为 limit_group
      percent: l.percent ?? null,
      severity: l.severity || null,
      resets_at: l.resets_at || null,
      model_id: l.scope?.model?.id || null,
      model_name: l.scope?.model?.display_name || null,
      surface: l.scope?.surface || null,
      is_active: l.is_active ?? null,
      fetched_at: fetchedAt
    }))

    // 正常路径：一次批量写入（一次采集才 3-5 行）
    const { error } = await supabaseService.client
      .from('claude_usage_limits')
      .insert(rows)

    if (!error) {
      this._logLimits(rows, rows.length, onLog, label)
      return
    }

    // 表还没建时给出明确提示，但不影响主流程（用量主记录已经存下了）。
    // 注意只认 PGRST205 和这句特定文案：约束错误的 message 里同样含表名，不能用表名做判断。
    if (error.code === 'PGRST205' || /Could not find the table/i.test(error.message || '')) {
      onLog('error', `${label} claude_usage_limits 表不存在，请先在 Supabase 执行建表 SQL`)
      return
    }

    // 退化路径：批量 insert 是全有或全无，只要上游多返回一条形状不对的数据
    // （新出现的 kind、percent 变成字符串、resets_at 格式变了……）整批就全丢。
    // 这里逐条重试，把损失缩小到出问题的那一条，其余照常入库。
    onLog('error', `${label} 限额明细批量写入失败（${error.message}），改为逐条写入...`)

    let okCount = 0
    for (let i = 0; i < rows.length; i++) {
      const { error: rowError } = await supabaseService.client
        .from('claude_usage_limits')
        .insert(rows[i])

      if (rowError) {
        // 打出上游原始 JSON —— 出现新 kind 时要能直接看到它叫什么，不用回头翻接口
        onLog('error',
          `${label} 限额明细第 ${i + 1}/${rows.length} 条写入失败: ${rowError.message}` +
          `｜原始数据: ${JSON.stringify(limits[i])}`)
      } else {
        okCount++
      }
    }

    this._logLimits(rows, okCount, onLog, label)
  }

  /**
   * 打一行限额明细摘要
   */
  _logLimits(rows, okCount, onLog, label) {
    const active = rows.find(r => r.is_active)
    // percent 正常是数字；上游若返回了字符串（如 "88%"）原样打出来，别再补一个 %
    const fmtPercent = (v) => {
      if (v === null || v === undefined) return '-'
      return typeof v === 'number' ? `${v}%` : String(v)
    }
    const desc = rows
      .map(r => `${r.kind}${r.model_name ? `(${r.model_name})` : ''}=${fmtPercent(r.percent)}`)
      .join(', ')
    const head = okCount === rows.length
      ? `限额明细 ${rows.length} 条`
      : `限额明细 ${okCount}/${rows.length} 条写入成功`
    onLog(okCount === rows.length ? 'success' : 'error',
      `${label} ${head}: ${desc}` +
      (active ? `｜当前生效: ${active.kind}${active.model_name ? `(${active.model_name})` : ''}` : ''))
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

    // logs / startedAt 必须在 try 之外，否则失败时 catch 拿不到已经收集的日志，
    // 而失败恰恰是最需要看日志的时候（超时到了第几步、哪条限额被拒等）
    const logs = []
    const onLog = (type, message) => {
      const time = new Date().toLocaleTimeString('zh-CN')
      logs.push({ type, message, time })
    }
    const startedAt = new Date()

    try {
      if (!supabaseService || !supabaseService.client) {
        return { success: false, error: 'Supabase 未连接', logs }
      }

      const { data, error } = await supabaseService.client
        .from('browser_profiles')
        .select('id, source, profile_id, profile_name, seq')
        .eq('id', profileId)
        .single()

      if (error || !data) {
        return { success: false, error: '未找到浏览器配置', logs }
      }

      if (!COLLECTABLE_SOURCES.includes(data.source)) {
        return { success: false, error: `${data.source === 'bide' ? '必得D' : data.source} 浏览器不采集，已跳过`, logs }
      }

      await this._fetchOne(data, {
        supabaseService,
        bitBrowserService,
        hubStudioService
      }, onLog, `[${data.profile_name || data.profile_id}]`)

      await this._saveFetchLog(supabaseService, profileId, 'success', null, startedAt, new Date())

      return { success: true, logs }
    } catch (err) {
      onLog('error', `采集失败: ${err.message}`)
      try {
        await this._saveFetchLog(supabaseService, profileId, 'failed', err.message, startedAt, new Date())
      } catch (e) { }
      return { success: false, error: err.message, logs }
    }
  }
}

module.exports = ClaudeUsageService
