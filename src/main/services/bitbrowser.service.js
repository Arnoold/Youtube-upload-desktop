const axios = require('axios')

class BitBrowserService {
  constructor() {
    // 比特浏览器默认API地址
    this.apiUrl = 'http://127.0.0.1:54345'
    // 创建 axios 实例，禁用代理，防止系统代理干扰本地连接
    this.client = axios.create({
      proxy: false
    })
  }

  /**
   * 设置比特浏览器API地址
   * @param {string} url - API地址
   */
  setApiUrl(url) {
    this.apiUrl = url
    console.log('BitBrowser API URL set to:', url)
  }

  /**
   * 测试API连接
   * @returns {Promise<Object>} 连接状态
   */
  async testConnection() {
    try {
      console.log(`Testing connection to ${this.apiUrl}/browser/list...`)
      // 比特浏览器API需要分页参数
      const response = await this.client.post(`${this.apiUrl}/browser/list`, {
        page: 0,
        pageSize: 10
      }, {
        timeout: 5000
      })
      console.log('BitBrowser connection test successful')
      return {
        success: true,
        message: '连接成功',
        data: response.data
      }
    } catch (error) {
      console.error('BitBrowser connection test failed:', error.message)
      console.error('Full error details:', {
        code: error.code,
        address: error.address,
        port: error.port,
        response: error.response?.data
      })

      let message = error.message
      if (error.code === 'ECONNREFUSED') {
        message = `无法连接到 ${this.apiUrl}，请检查比特浏览器是否启动且端口正确`
      } else if (error.code === 'ETIMEDOUT') {
        message = `连接超时，请检查比特浏览器是否卡顿`
      }

      return {
        success: false,
        message: message,
        error: error.message
      }
    }
  }

  /**
   * 获取浏览器配置列表
   * @returns {Promise<Array>} 配置列表
   */
  async getProfiles() {
    try {
      // 比特浏览器API需要分页参数
      const response = await this.client.post(`${this.apiUrl}/browser/list`, {
        page: 0,
        pageSize: 100
      })
      console.log(`Retrieved ${response.data.data?.list?.length || 0} browser profiles`)
      return response.data
    } catch (error) {
      console.error('Failed to get browser profiles:', error.message)
      throw new Error(`获取浏览器配置失败: ${error.message}`)
    }
  }

  /**
   * 创建浏览器配置
   * @param {Object} config - 配置信息
   * @returns {Promise<Object>} 创建结果
   */
  async createProfile(config) {
    try {
      const payload = {
        name: config.name,
        remark: config.remark || '',
        proxyType: config.proxyType || 'noproxy',
        proxyHost: config.proxyHost || '',
        proxyPort: config.proxyPort || '',
        proxyUser: config.proxyUser || '',
        proxyPassword: config.proxyPassword || '',
        fingerprint: config.fingerprint || {}
      }

      const response = await this.client.post(`${this.apiUrl}/browser/update`, payload)
      console.log('Browser profile created:', response.data)
      return response.data
    } catch (error) {
      console.error('Failed to create browser profile:', error.message)
      throw new Error(`创建浏览器配置失败: ${error.message}`)
    }
  }

  /**
   * 启动浏览器实例
   * @param {string} profileId - 浏览器配置ID
   * @returns {Promise<Object>} 浏览器信息
   */
  async startBrowser(profileId) {
    try {
      console.log('Starting browser with profile ID:', profileId)

      const response = await this.client.post(`${this.apiUrl}/browser/open`, {
        id: profileId,
        loadExtensions: false,
        args: [],
        headless: false
      })

      if (response.data.success) {
        const browserData = response.data.data
        console.log('BitBrowser start response:', JSON.stringify(response.data, null, 2))

        // 尝试获取 WebSocket 地址
        let wsEndpoint = ''
        if (browserData.ws) {
          if (typeof browserData.ws === 'string') {
            wsEndpoint = browserData.ws
          } else {
            wsEndpoint = browserData.ws.playwright || browserData.ws.puppeteer || ''
          }
        }

        // 如果没有获取到 WS 地址，但有 HTTP 调试地址，尝试从 HTTP 接口获取
        if (!wsEndpoint && browserData.http) {
          try {
            console.log(`Fetching WS URL from http://${browserData.http}/json/version...`)
            const versionResponse = await this.client.get(`http://${browserData.http}/json/version`)
            if (versionResponse.data && versionResponse.data.webSocketDebuggerUrl) {
              wsEndpoint = versionResponse.data.webSocketDebuggerUrl
              console.log('Fetched WS URL from /json/version:', wsEndpoint)
            }
          } catch (err) {
            console.error('Failed to fetch WS URL from /json/version:', err.message)
          }
        }

        console.log('Extracted wsEndpoint:', wsEndpoint)

        return {
          success: true,
          browserId: browserData.browserId || browserData.id, // 兼容不同字段名
          wsEndpoint: wsEndpoint,
          http: browserData.http,
          webdriver: browserData.webdriver
        }
      } else {
        throw new Error(response.data.msg || '启动浏览器失败')
      }
    } catch (error) {
      console.error('Failed to start browser:', error.message)
      throw new Error(`启动浏览器失败: ${error.response?.data?.msg || error.message}`)
    }
  }

  /**
   * 关闭浏览器实例
   * @param {string} browserId - 浏览器ID
   * @returns {Promise<Object>} 关闭结果
   */
  async closeBrowser(browserId) {
    try {
      console.log('Closing browser:', browserId)

      const response = await this.client.post(`${this.apiUrl}/browser/close`, {
        id: browserId
      })

      console.log('Browser closed successfully')
      return response.data
    } catch (error) {
      console.error('Failed to close browser:', error.message)
      // 关闭浏览器失败不抛出异常，因为可能已经手动关闭了
      return { success: false, error: error.message }
    }
  }

  /**
   * 删除浏览器配置
   * @param {string} profileId - 配置ID
   * @returns {Promise<Object>} 删除结果
   */
  async deleteProfile(profileId) {
    try {
      const response = await this.client.post(`${this.apiUrl}/browser/delete`, {
        id: profileId
      })
      console.log('Browser profile deleted:', profileId)
      return response.data
    } catch (error) {
      console.error('Failed to delete browser profile:', error.message)
      throw new Error(`删除浏览器配置失败: ${error.message}`)
    }
  }

  /**
   * 更新浏览器配置
   * @param {string} profileId - 配置ID
   * @param {Object} config - 更新的配置
   * @returns {Promise<Object>} 更新结果
   */
  async updateProfile(profileId, config) {
    try {
      const payload = {
        id: profileId,
        ...config
      }

      const response = await this.client.post(`${this.apiUrl}/browser/update`, payload)
      console.log('Browser profile updated:', profileId)
      return response.data
    } catch (error) {
      console.error('Failed to update browser profile:', error.message)
      throw new Error(`更新浏览器配置失败: ${error.message}`)
    }
  }

  /**
   * 检查浏览器状态
   * @param {string} browserId - 浏览器ID
   * @returns {Promise<Object>} 浏览器状态
   */
  async checkBrowserStatus(browserId) {
    try {
      const response = await this.client.post(`${this.apiUrl}/browser/status`, {
        id: browserId
      })
      return response.data
    } catch (error) {
      console.error('Failed to check browser status:', error.message)
      return { success: false, error: error.message }
    }
  }
}

module.exports = BitBrowserService
