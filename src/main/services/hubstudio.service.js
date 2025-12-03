const axios = require('axios')

class HubStudioService {
  constructor() {
    // HubStudio 默认API地址
    this.apiUrl = 'http://127.0.0.1:6873'
    // API 认证凭证
    this.appId = ''
    this.appSecret = ''
    this.groupCode = ''
    // 创建 axios 实例，禁用代理
    this.client = axios.create({
      proxy: false
    })
  }

  /**
   * 设置 HubStudio API 凭证
   * @param {string} appId - App ID
   * @param {string} appSecret - App Secret
   * @param {string} groupCode - 团队代码
   */
  setCredentials(appId, appSecret, groupCode) {
    this.appId = appId
    this.appSecret = appSecret
    this.groupCode = groupCode
    console.log('HubStudio credentials set, appId:', appId ? appId.substring(0, 8) + '...' : 'empty')
  }

  /**
   * 获取当前凭证配置
   */
  getCredentials() {
    return {
      appId: this.appId,
      appSecret: this.appSecret ? '******' : '',
      groupCode: this.groupCode,
      apiUrl: this.apiUrl
    }
  }

  /**
   * 设置 HubStudio API地址
   * @param {string} url - API地址
   */
  setApiUrl(url) {
    this.apiUrl = url
    console.log('HubStudio API URL set to:', url)
  }

  /**
   * 获取通用请求参数（包含认证信息）
   */
  getCommonParams() {
    return {
      app_id: this.appId,
      app_secret: this.appSecret,
      group_code: this.groupCode
    }
  }

  /**
   * 测试API连接
   * @returns {Promise<Object>} 连接状态
   */
  async testConnection() {
    try {
      // HubStudio 客户端已登录时，不需要传递认证参数
      // 直接调用环境列表接口测试连接
      console.log(`Testing connection to ${this.apiUrl}/api/v1/env/list...`)
      const response = await this.client.post(`${this.apiUrl}/api/v1/env/list`, {
        page: 1,
        page_size: 10
      }, {
        timeout: 5000
      })

      console.log('HubStudio connection test response:', response.data)

      if (response.data.code === 0) {
        return {
          success: true,
          message: '连接成功',
          data: response.data
        }
      } else {
        return {
          success: false,
          message: response.data.msg || '连接失败',
          error: response.data.msg
        }
      }
    } catch (error) {
      console.error('HubStudio connection test failed:', error.message)

      let message = error.message
      if (error.code === 'ECONNREFUSED') {
        message = `无法连接到 ${this.apiUrl}，请检查 HubStudio 是否启动且端口正确`
      } else if (error.code === 'ETIMEDOUT') {
        message = `连接超时，请检查 HubStudio 是否卡顿`
      }

      return {
        success: false,
        message: message,
        error: error.message
      }
    }
  }

  /**
   * 获取环境列表（浏览器配置列表）
   * @returns {Promise<Object>} 配置列表
   */
  async getProfiles() {
    try {
      // HubStudio 客户端已登录时，不需要传递认证参数
      const response = await this.client.post(`${this.apiUrl}/api/v1/env/list`, {
        page: 1,
        page_size: 100
      })

      if (response.data.code === 0) {
        console.log(`Retrieved ${response.data.data?.list?.length || 0} HubStudio environments`)
        return response.data
      } else {
        throw new Error(response.data.msg || '获取环境列表失败')
      }
    } catch (error) {
      console.error('Failed to get HubStudio environments:', error.message)
      throw new Error(`获取 HubStudio 环境列表失败: ${error.message}`)
    }
  }

  /**
   * 从 API 响应中提取浏览器状态列表
   * HubStudio API 返回格式: { code: 0, data: { containers: [...], statusCode: "0", ... } }
   */
  extractContainersList(responseData) {
    if (!responseData || !responseData.data) {
      return []
    }
    const data = responseData.data
    // API 返回 data.containers 数组
    if (data.containers && Array.isArray(data.containers)) {
      return data.containers
    }
    // 兼容：如果 data 本身是数组
    if (Array.isArray(data)) {
      return data
    }
    return []
  }

  /**
   * 启动浏览器实例
   * @param {string} containerCode - 环境ID (containerCode)
   * @returns {Promise<Object>} 浏览器信息
   */
  async startBrowser(containerCode) {
    try {
      console.log('Starting HubStudio browser with containerCode:', containerCode)

      // 先检查浏览器是否已经在运行
      let existingBrowser = null
      try {
        const statusResponse = await this.client.post(`${this.apiUrl}/api/v1/browser/all-browser-status`, {
          containerCodes: [containerCode]
        })
        if (statusResponse.data.code === 0) {
          const containersList = this.extractContainersList(statusResponse.data)
          console.log('Containers list:', JSON.stringify(containersList, null, 2))
          const browserStatus = containersList.find(b => b.containerCode === containerCode)
          // 状态 0 表示已开启
          if (browserStatus && browserStatus.status === 0) {
            console.log('Browser is already running, will try to connect to existing instance')
            existingBrowser = browserStatus
          }
        }
      } catch (e) {
        console.log('Failed to check existing browser status:', e.message)
      }

      // 如果浏览器已经在运行，尝试直接获取连接信息（权限开通后 API 会返回 debuggingPort）
      if (existingBrowser) {
        console.log('Existing browser found:', JSON.stringify(existingBrowser, null, 2))
        let debugPort = existingBrowser.debuggingPort
        let wsEndpoint = ''

        // 权限开通后，all-browser-status API 应该返回 debuggingPort
        if (debugPort) {
          console.log('Got debuggingPort from status API:', debugPort)
          wsEndpoint = await this.getWsEndpointFromPort(debugPort)
        }

        if (wsEndpoint) {
          console.log('Successfully connected to existing browser without calling start API')
          return {
            success: true,
            browserId: existingBrowser.browserID || containerCode,
            wsEndpoint: wsEndpoint,
            debugPort: debugPort,
            webdriver: existingBrowser.webdriver
          }
        }

        // 如果 status API 没有返回 debuggingPort，说明权限可能还没生效，继续调用 start API
        console.log('No debuggingPort in status API response, will call start API')
      }

      // HubStudio API - 启动浏览器（如果已经运行，这个调用会返回现有浏览器的信息）
      // extractIp: true 表示需要返回调试端口信息
      const response = await this.client.post(`${this.apiUrl}/api/v1/browser/start`, {
        containerCode: containerCode,
        extractIp: true,
        headless: false
      })

      console.log('HubStudio start response:', JSON.stringify(response.data, null, 2))

      if (response.data.code === 0) {
        const browserData = response.data.data

        // HubStudio 返回格式: { data: { debuggingPort, browserID, webdriver, duplicate, ... } }
        let debugPort = browserData?.debuggingPort || browserData?.debugging_port
        const browserId = browserData?.browserID || browserData?.containerId || containerCode
        const webdriver = browserData?.webdriver
        const isDuplicate = browserData?.duplicate  // 如果浏览器已经在运行，会返回 duplicate 字段

        // 如果是重复启动（浏览器已运行），debuggingPort 通常为空
        // 需要通过其他方式获取连接信息
        if (isDuplicate) {
          console.log('Browser is already running (duplicate detected), need to get debug port from status API')
        }

        // 如果 debuggingPort 为空，等待浏览器启动完成后再次获取状态
        if (!debugPort) {
          console.log('debuggingPort is empty, waiting for browser to fully start...')

          // 多次重试获取状态，每次间隔增加
          for (let retry = 0; retry < 5 && !debugPort; retry++) {
            const waitTime = 2000 + retry * 1000  // 2s, 3s, 4s, 5s, 6s
            console.log(`Retry ${retry + 1}/5: waiting ${waitTime}ms for browser status...`)
            await new Promise(resolve => setTimeout(resolve, waitTime))

            // 尝试通过状态接口获取调试端口
            try {
              const statusResponse = await this.client.post(`${this.apiUrl}/api/v1/browser/all-browser-status`, {
                containerCodes: [containerCode]
              })
              console.log('Browser status response:', JSON.stringify(statusResponse.data, null, 2))

              if (statusResponse.data.code === 0) {
                const containersList = this.extractContainersList(statusResponse.data)
                const browserStatus = containersList.find(b => b.containerCode === containerCode)
                if (browserStatus?.debuggingPort) {
                  debugPort = browserStatus.debuggingPort
                  console.log('Got debuggingPort from status:', debugPort)
                  break
                }
                // 检查状态是否为已开启 (status === 0)
                if (browserStatus?.status === 0) {
                  console.log('Browser is running but no debuggingPort in status response')
                }
              }
            } catch (e) {
              console.error('Failed to get browser status:', e.message)
            }
          }
        }

        // 如果还是没有调试端口，尝试扫描常用端口范围
        let wsEndpoint = ''
        if (debugPort) {
          wsEndpoint = await this.getWsEndpointFromPort(debugPort)
        }

        // 如果仍然没有 wsEndpoint，尝试从活动浏览器列表中查找
        if (!wsEndpoint) {
          console.log('Trying to find wsEndpoint from active browsers...')
          try {
            const activeResponse = await this.client.post(`${this.apiUrl}/api/v1/browser/all-browser-status`, {
              containerCodes: []  // 获取所有活动浏览器
            })
            if (activeResponse.data.code === 0) {
              const activeBrowsers = this.extractContainersList(activeResponse.data)
              console.log('Active browsers:', JSON.stringify(activeBrowsers, null, 2))

              const targetBrowser = activeBrowsers.find(b =>
                b.containerCode === containerCode ||
                String(b.containerId) === String(containerCode) ||
                String(b.browserID) === String(browserId)
              )

              if (targetBrowser?.debuggingPort) {
                debugPort = targetBrowser.debuggingPort
                wsEndpoint = await this.getWsEndpointFromPort(debugPort)
              }
            }
          } catch (e) {
            console.error('Failed to get active browsers:', e.message)
          }
        }

        // 如果还是没有 wsEndpoint，尝试通过 browser/detail 接口获取
        if (!wsEndpoint) {
          console.log('Trying to get debug port from browser/detail API...')
          try {
            const detailResponse = await this.client.post(`${this.apiUrl}/api/v1/browser/detail`, {
              containerCode: containerCode
            })
            console.log('Browser detail response:', JSON.stringify(detailResponse.data, null, 2))
            if (detailResponse.data.code === 0 && detailResponse.data.data) {
              const detailData = detailResponse.data.data
              if (detailData.debuggingPort) {
                debugPort = detailData.debuggingPort
                wsEndpoint = await this.getWsEndpointFromPort(debugPort)
              }
            }
          } catch (e) {
            console.log('browser/detail API not available or failed:', e.message)
          }
        }

        // 如果 HubStudio API 没有返回 debuggingPort，尝试扫描端口
        // 使用浏览器的 backgroundPluginId 来验证是否连接到正确的浏览器
        if (!wsEndpoint) {
          console.log('Trying port scanning to find browser...')
          const pluginId = browserData?.backgroundPluginId || ''
          if (pluginId) {
            console.log('Expected backgroundPluginId:', pluginId)
          }
          wsEndpoint = await this.scanForBrowserByContainerCode(containerCode, pluginId)
          if (wsEndpoint) {
            console.log('Found browser via port scanning:', wsEndpoint)
          }
        }

        // 尝试其他可能的字段
        if (!wsEndpoint && browserData.ws) {
          if (typeof browserData.ws === 'string') {
            wsEndpoint = browserData.ws
          } else {
            wsEndpoint = browserData.ws.playwright || browserData.ws.puppeteer || ''
          }
        }

        if (!wsEndpoint && browserData.webSocketDebuggerUrl) {
          wsEndpoint = browserData.webSocketDebuggerUrl
        }

        console.log('Final extracted wsEndpoint:', wsEndpoint)
        console.log('Final debugPort:', debugPort)

        if (!wsEndpoint) {
          throw new Error('无法获取浏览器 WebSocket 地址，请确保 HubStudio 浏览器启动成功并支持远程调试')
        }

        return {
          success: true,
          browserId: browserId,
          wsEndpoint: wsEndpoint,
          debugPort: debugPort,
          webdriver: webdriver
        }
      } else {
        throw new Error(response.data.msg || '启动浏览器失败')
      }
    } catch (error) {
      console.error('Failed to start HubStudio browser:', error.message)
      throw new Error(`启动 HubStudio 浏览器失败: ${error.response?.data?.msg || error.message}`)
    }
  }

  /**
   * 通过 WebSocket 连接到浏览器并获取命令行参数（包含 user-data-dir）
   * @param {string} wsEndpoint - WebSocket 地址
   * @returns {Promise<string>} 返回 user-data-dir 路径
   */
  async getBrowserUserDataDir(wsEndpoint) {
    return new Promise((resolve) => {
      const WebSocket = require('ws')
      const ws = new WebSocket(wsEndpoint)
      let resolved = false

      const timeout = setTimeout(() => {
        if (!resolved) {
          resolved = true
          ws.close()
          resolve('')
        }
      }, 2000)

      ws.on('open', () => {
        // 发送 Browser.getBrowserCommandLine 命令
        ws.send(JSON.stringify({
          id: 1,
          method: 'Browser.getBrowserCommandLine'
        }))
      })

      ws.on('message', (data) => {
        try {
          const msg = JSON.parse(data.toString())
          if (msg.id === 1 && msg.result && msg.result.arguments) {
            const args = msg.result.arguments
            // 查找 --user-data-dir 参数
            for (const arg of args) {
              if (arg.startsWith('--user-data-dir=')) {
                const userDataDir = arg.replace('--user-data-dir=', '')
                if (!resolved) {
                  resolved = true
                  clearTimeout(timeout)
                  ws.close()
                  resolve(userDataDir)
                }
                return
              }
            }
          }
          if (!resolved) {
            resolved = true
            clearTimeout(timeout)
            ws.close()
            resolve('')
          }
        } catch (e) {
          if (!resolved) {
            resolved = true
            clearTimeout(timeout)
            ws.close()
            resolve('')
          }
        }
      })

      ws.on('error', () => {
        if (!resolved) {
          resolved = true
          clearTimeout(timeout)
          resolve('')
        }
      })
    })
  }

  /**
   * 扫描端口并通过 containerCode 验证是否是目标浏览器
   * HubStudio 浏览器的 userDataDir 包含 containerCode，可以通过 CDP 获取
   * @param {string} containerCode - 期望的环境ID
   * @param {string} expectedPluginId - 期望的插件ID（可选）
   */
  async scanForBrowserByContainerCode(containerCode, expectedPluginId = '') {
    console.log('Scanning ports to find browser with containerCode:', containerCode)

    // HubStudio 使用动态端口，范围很广（1000-20000+）
    // 优先扫描常见端口范围
    const portsToScan = []

    // 第一优先级：常见调试端口
    const priorityPorts = [9222, 9223, 9224, 9225, 9226, 9227, 9228, 9229, 9230]
    for (const p of priorityPorts) {
      portsToScan.push(p)
    }

    // 第二优先级：HubStudio 常用端口范围 1000-2000
    for (let i = 1000; i <= 2000; i++) {
      if (!priorityPorts.includes(i)) {
        portsToScan.push(i)
      }
    }

    // 第三优先级：9000-9500 范围
    for (let i = 9000; i <= 9500; i++) {
      if (!priorityPorts.includes(i)) {
        portsToScan.push(i)
      }
    }

    // 第四优先级：10000-20000 范围（HubStudio 有时使用高端口如 14229）
    for (let i = 10000; i <= 20000; i++) {
      portsToScan.push(i)
    }

    // 存储找到的所有浏览器，用于后续选择
    const foundBrowsers = []

    // 并行扫描端口（每批50个，加快扫描速度）
    const batchSize = 50
    for (let i = 0; i < portsToScan.length; i += batchSize) {
      const batch = portsToScan.slice(i, i + batchSize)
      const results = await Promise.all(
        batch.map(async port => {
          try {
            const httpUrl = `http://127.0.0.1:${port}`
            // 获取浏览器版本信息
            const versionResponse = await this.client.get(`${httpUrl}/json/version`, { timeout: 500 })
            if (versionResponse.data && versionResponse.data.webSocketDebuggerUrl) {
              const wsEndpoint = versionResponse.data.webSocketDebuggerUrl
              const userAgent = versionResponse.data['User-Agent'] || ''

              // 获取页面列表
              const pagesResponse = await this.client.get(`${httpUrl}/json/list`, { timeout: 500 })
              const pages = pagesResponse.data || []

              // 方法1: 通过 CDP 获取 user-data-dir 并检查是否包含 containerCode
              let userDataDir = ''
              let matchesContainerCode = false
              if (containerCode) {
                userDataDir = await this.getBrowserUserDataDir(wsEndpoint)
                if (userDataDir) {
                  // HubStudio 的 userDataDir 路径通常包含 containerCode
                  // 例如: C:\Users\xxx\AppData\Local\HubStudio\cache\containerCode\...
                  matchesContainerCode = userDataDir.includes(containerCode)
                  console.log(`Port ${port} userDataDir: ${userDataDir}, matches: ${matchesContainerCode}`)
                }
              }

              // 方法2: 检查扩展插件ID（如果提供）
              let hasMatchingExtension = false
              if (expectedPluginId) {
                hasMatchingExtension = pages.some(page =>
                  page.url && page.url.includes(expectedPluginId)
                )
              }

              return {
                port,
                wsEndpoint,
                userAgent,
                userDataDir,
                pages,
                matchesContainerCode,
                hasMatchingExtension
              }
            }
          } catch (e) {
            // 忽略连接错误
          }
          return null
        })
      )

      // 收集所有找到的浏览器
      for (const r of results) {
        if (r !== null) {
          foundBrowsers.push(r)

          // 如果找到匹配 containerCode 的浏览器，立即返回
          if (r.matchesContainerCode) {
            console.log(`Found matching browser at port ${r.port} with containerCode in userDataDir`)
            return r.wsEndpoint
          }

          // 如果找到匹配插件的浏览器，立即返回
          if (r.hasMatchingExtension) {
            console.log(`Found matching browser at port ${r.port} with extension ${expectedPluginId}`)
            return r.wsEndpoint
          }
        }
      }
    }

    // 如果没有通过 containerCode 或插件ID找到，返回第一个找到的浏览器
    // （只有一个浏览器运行时可用）
    if (foundBrowsers.length === 1) {
      console.log(`Found single browser at port ${foundBrowsers[0].port}, assuming it's the target`)
      return foundBrowsers[0].wsEndpoint
    }

    if (foundBrowsers.length > 1) {
      console.log(`Found ${foundBrowsers.length} browsers, cannot determine which is the target`)
      console.log('Browsers found:', foundBrowsers.map(b => ({
        port: b.port,
        userDataDir: b.userDataDir
      })))
      // 如果有多个浏览器但没找到匹配的，返回空（不能随便连接）
    }

    console.log('No matching browser found via port scanning')
    return ''
  }

  /**
   * 扫描端口并通过 backgroundPluginId 验证是否是目标浏览器
   * @param {string} expectedPluginId - 期望的插件ID
   * @deprecated 使用 scanForBrowserByContainerCode 代替
   */
  async scanForBrowserWithPluginId(expectedPluginId) {
    return this.scanForBrowserByContainerCode('', expectedPluginId)
  }

  /**
   * 扫描常见端口查找浏览器（不验证身份，仅作为最后手段）
   */
  async scanForBrowserPort() {
    console.log('Scanning common debugging ports...')
    // HubStudio 通常使用 9000+ 范围的端口，优先扫描常见端口
    const priorityPorts = [9222, 9223, 9224, 9225, 9226, 9227, 9228, 9229, 9230]

    // 先尝试优先端口（并行扫描）
    const priorityResults = await Promise.all(
      priorityPorts.map(async port => {
        const endpoint = await this.getWsEndpointFromPort(port, true)
        return endpoint ? { port, endpoint } : null
      })
    )

    const found = priorityResults.find(r => r !== null)
    if (found) {
      console.log(`Found browser at port ${found.port}`)
      return found.endpoint
    }

    // 如果优先端口没找到，扫描更大范围
    console.log('Scanning extended port range 9000-9100...')
    for (let i = 9000; i <= 9100; i++) {
      if (priorityPorts.includes(i)) continue
      const endpoint = await this.getWsEndpointFromPort(i, true)
      if (endpoint) {
        console.log(`Found browser at port ${i}`)
        return endpoint
      }
    }

    return ''
  }

  /**
   * 从调试端口获取 WebSocket 地址
   * @param {number} debugPort - 调试端口
   * @param {boolean} quiet - 是否静默模式（不打印错误日志）
   */
  async getWsEndpointFromPort(debugPort, quiet = false) {
    if (!debugPort) return ''
    try {
      const httpUrl = `http://127.0.0.1:${debugPort}`
      if (!quiet) {
        console.log(`Fetching WS URL from ${httpUrl}/json/version...`)
      }
      const versionResponse = await this.client.get(`${httpUrl}/json/version`, { timeout: 1000 })
      if (versionResponse.data && versionResponse.data.webSocketDebuggerUrl) {
        const wsEndpoint = versionResponse.data.webSocketDebuggerUrl
        console.log('Fetched WS URL from /json/version:', wsEndpoint)
        return wsEndpoint
      }
    } catch (err) {
      if (!quiet) {
        console.error('Failed to fetch WS URL from /json/version:', err.message)
      }
    }
    return ''
  }

  /**
   * 关闭浏览器实例
   * @param {string} containerCode - 环境ID
   * @returns {Promise<Object>} 关闭结果
   */
  async closeBrowser(containerCode) {
    try {
      console.log('Closing HubStudio browser:', containerCode)

      // HubStudio 正确的 API 端点是 /api/v1/browser/stop
      const response = await this.client.post(`${this.apiUrl}/api/v1/browser/stop`, {
        containerCode: containerCode
      })

      if (response.data.code === 0) {
        console.log('HubStudio browser closed successfully')
        return { success: true, data: response.data }
      } else {
        console.error('Failed to close HubStudio browser:', response.data.msg)
        return { success: false, error: response.data.msg }
      }
    } catch (error) {
      console.error('Failed to close HubStudio browser:', error.message)
      return { success: false, error: error.message }
    }
  }

  /**
   * 检查浏览器状态（通过获取活动环境列表）
   * @param {string} containerCode - 环境ID
   * @returns {Promise<Object>} 浏览器状态
   */
  async checkBrowserStatus(containerCode) {
    try {
      // HubStudio 正确的 API 端点是 /api/v1/browser/all-browser-status
      // 状态值: 1-开启中 | 0-已开启 | 2-关闭中 | 3-已关闭
      const response = await this.client.post(`${this.apiUrl}/api/v1/browser/all-browser-status`, {
        containerCodes: [containerCode]
      })

      if (response.data.code === 0) {
        const containersList = this.extractContainersList(response.data)
        // 查找匹配的环境状态
        const envStatus = containersList.find(item => item.containerCode === containerCode)
        // 状态 0 表示已开启（Active）
        const isActive = envStatus && envStatus.status === 0
        return {
          success: true,
          data: {
            status: isActive ? 'Active' : 'Inactive',
            rawStatus: envStatus?.status
          }
        }
      } else {
        return { success: false, error: response.data.msg }
      }
    } catch (error) {
      console.error('Failed to check HubStudio browser status:', error.message)
      return { success: false, error: error.message }
    }
  }
}

module.exports = HubStudioService
