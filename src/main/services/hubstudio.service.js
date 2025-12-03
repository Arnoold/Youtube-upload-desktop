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
        if (statusResponse.data.code === 0 && statusResponse.data.data) {
          const browserStatus = statusResponse.data.data.find(b => b.containerCode === containerCode)
          // 状态 0 表示已开启
          if (browserStatus && browserStatus.status === 0) {
            console.log('Browser is already running, will try to connect to existing instance')
            existingBrowser = browserStatus
          }
        }
      } catch (e) {
        console.log('Failed to check existing browser status:', e.message)
      }

      // 如果浏览器已经在运行，尝试直接获取连接信息
      if (existingBrowser) {
        console.log('Existing browser found:', JSON.stringify(existingBrowser, null, 2))
        let debugPort = existingBrowser.debuggingPort
        let wsEndpoint = ''

        if (debugPort) {
          wsEndpoint = await this.getWsEndpointFromPort(debugPort)
        }

        // 如果没有 debuggingPort，尝试扫描端口
        if (!wsEndpoint) {
          wsEndpoint = await this.scanForBrowserPort()
        }

        if (wsEndpoint) {
          return {
            success: true,
            browserId: existingBrowser.browserID || containerCode,
            wsEndpoint: wsEndpoint,
            debugPort: debugPort,
            webdriver: existingBrowser.webdriver
          }
        }
        // 如果连接失败，继续尝试启动（不关闭现有的）
        console.log('Could not connect to existing browser, will try to start/refresh')
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

        // HubStudio 返回格式: { data: { debuggingPort, browserID, webdriver, ... } }
        let debugPort = browserData?.debuggingPort || browserData?.debugging_port
        const browserId = browserData?.browserID || browserData?.containerId || containerCode
        const webdriver = browserData?.webdriver

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

              if (statusResponse.data.code === 0 && statusResponse.data.data) {
                const statusData = statusResponse.data.data
                if (Array.isArray(statusData)) {
                  const browserStatus = statusData.find(b => b.containerCode === containerCode)
                  if (browserStatus?.debuggingPort) {
                    debugPort = browserStatus.debuggingPort
                    console.log('Got debuggingPort from status:', debugPort)
                    break
                  }
                  // 检查状态是否为已开启 (status === 0)
                  if (browserStatus?.status === 0) {
                    console.log('Browser is running but no debuggingPort, will try port scanning...')
                  }
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
            if (activeResponse.data.code === 0 && activeResponse.data.data) {
              const activeBrowsers = activeResponse.data.data
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

        // 如果仍然没有找到端口，尝试扫描常见的调试端口范围
        if (!wsEndpoint) {
          wsEndpoint = await this.scanForBrowserPort()
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
   * 扫描常见端口查找浏览器
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
        const statusList = response.data.data || []
        // 查找匹配的环境状态
        const envStatus = statusList.find(item => item.containerCode === containerCode)
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
