/**
 * Supabase 数据库服务
 * 用于连接 Supabase 数据库，读写视频数据
 */

class SupabaseService {
  constructor() {
    this.client = null
    this.createClientFn = null
    this.config = {
      url: '',
      apiKey: '',
      tableName: 'benchmark_videos'
    }
  }

  /**
   * 获取 Supabase createClient（延迟加载）
   * 使用 require 而不是 import 来避免模块初始化时的冲突
   */
  getCreateClient() {
    if (!this.createClientFn) {
      // 使用 require 延迟加载
      const { createClient } = require('@supabase/supabase-js')
      this.createClientFn = createClient
    }
    return this.createClientFn
  }

  /**
   * 初始化 Supabase 客户端
   */
  initialize(url, apiKey) {
    if (!url || !apiKey) {
      throw new Error('Supabase URL 和 API Key 不能为空')
    }

    const createClientFn = this.getCreateClient()
    this.config.url = url
    this.config.apiKey = apiKey

    // 自定义 fetch，增加超时控制
    const fetchWithTimeout = async (url, options = {}) => {
      const timeout = 120000 // 120 秒超时
      const controller = new AbortController()
      const timeoutId = setTimeout(() => controller.abort(), timeout)

      try {
        const response = await fetch(url, {
          ...options,
          signal: controller.signal
        })
        return response
      } finally {
        clearTimeout(timeoutId)
      }
    }

    this.client = createClientFn(url, apiKey, {
      db: {
        schema: 'public'
      },
      global: {
        fetch: fetchWithTimeout
      }
    })

    return true
  }

  /**
   * 设置表名
   */
  setTableName(tableName) {
    this.config.tableName = tableName
  }

  /**
   * 获取当前配置
   */
  getConfig() {
    return {
      url: this.config.url,
      apiKey: this.config.apiKey ? '***' + this.config.apiKey.slice(-4) : '',
      tableName: this.config.tableName,
      isConnected: !!this.client
    }
  }

  /**
   * 测试连接
   */
  async testConnection() {
    if (!this.client) {
      return { success: false, error: '未初始化 Supabase 客户端' }
    }

    try {
      // 只查询 id 字段，避免超时
      const { data, error } = await this.client
        .from(this.config.tableName)
        .select('id')
        .limit(1)

      if (error) {
        return { success: false, error: error.message }
      }

      return { success: true, message: '连接成功' }
    } catch (err) {
      return { success: false, error: err.message }
    }
  }

  /**
   * 获取视频记录
   * @param {Object} options - 查询选项
   * @param {string} options.status - 生成状态筛选 (pending, generating, completed, failed)
   * @param {number} options.limit - 限制数量 (默认20，最大100)
   * @param {number} options.page - 页码 (默认1)
   * @param {boolean} options.includeScript - 是否包含脚本内容
   * @param {number} options.days - 最近N天
   * @param {number} options.minViews - 最小播放量
   * @param {string} options.groupName - 分组名称
   * @param {string[]} options.channelIds - 频道ID数组（多选）
   * @param {string} options.channelId - 频道ID（单选，兼容旧版）
   * @param {boolean} options.channelIsActive - 频道是否启用筛选
   * @param {string} options.sortBy - 排序字段 (id, published_at, view_count, created_at)
   * @param {string} options.sortOrder - 排序方向 (asc, desc)
   * @param {string} options.tableName - 表名 (可选，默认为配置的表名)
   */
  async getVideos(options = {}) {
    if (!this.client) {
      throw new Error('未初始化 Supabase 客户端')
    }

    // 最小化字段，避免查询超时
    // 只选择列表展示需要的字段，避免查询过慢
    // 注意：不要包含 script_text 等大字段，会导致查询超时
    const tableName = options.tableName || this.config.tableName
    const isOwnChannel = tableName === 'own_videos' || tableName === 'own_channel_videos'

    // 最小化字段，避免查询超时
    // 只选择列表展示需要的字段，避免查询过慢
    // 注意：不要包含 script_text 等大字段，会导致查询超时
    let selectFields = options.select

    if (!selectFields) {
      if (isOwnChannel) {
        // 自有频道表字段 (不包含 channel_name, group_name)
        selectFields = [
          'id', 'video_id', 'channel_id', 'title',
          'description', // 对应 video_description
          'thumbnail', 'duration', 'published_at',
          'view_count', 'like_count', 'comment_count',
          'tags',
          'created_at', 'updated_at'
        ].join(',')
      } else {
        // 对标视频表字段 - 精简到最小必需，避免查询超时
        selectFields = [
          'id', 'video_id', 'channel_id', 'title',
          'channel_name', 'published_at',
          'view_count', 'generation_status'
        ].join(',')
      }
    }

    // 如果需要脚本内容，添加更多字段
    if (options.includeScript && !options.select) {
      selectFields += ', script_text, script_generated_at, script_generation_error'
    }

    // 如果需要按频道状态筛选，先获取符合条件的频道ID列表
    let filteredChannelIds = options.channelIds || []
    if (options.channelIsActive !== undefined) {
      const { data: channels, error: channelError } = await this.client
        .from('benchmark_channels')
        .select('channel_id')
        .eq('is_active', options.channelIsActive)

      if (channelError) {
        throw new Error('查询频道状态失败: ' + channelError.message)
      }

      const activeChannelIds = (channels || []).map(c => c.channel_id)

      // 如果同时指定了 channelIds，取交集
      if (filteredChannelIds.length > 0) {
        filteredChannelIds = filteredChannelIds.filter(id => activeChannelIds.includes(id))
      } else {
        filteredChannelIds = activeChannelIds
      }

      // 如果没有符合条件的频道，直接返回空结果
      if (filteredChannelIds.length === 0) {
        return {
          data: [],
          total: 0,
          page: options.page || 1,
          pageSize: options.limit || 20
        }
      }
    }

    // const tableName = options.tableName || this.config.tableName // Moved up
    // 完全禁用 count 查询，因为它会导致超时
    // 前端将通过分页加载的方式判断是否还有更多数据
    let query = this.client
      .from(tableName)
      .select(selectFields)

    // 生成状态筛选（支持多选）
    if (options.statusList && options.statusList.length > 0) {
      // 多选模式
      const hasPendingAll = options.statusList.includes('pending_all')
      if (hasPendingAll) {
        // pending_all 表示同时查询 null 和 pending 两种状态
        const otherStatuses = options.statusList.filter(s => s !== 'pending_all')
        if (otherStatuses.length > 0) {
          // 有其他状态，使用 or 条件组合
          const orConditions = ['generation_status.is.null', 'generation_status.eq.pending']
          otherStatuses.forEach(s => orConditions.push(`generation_status.eq.${s}`))
          query = query.or(orConditions.join(','))
        } else {
          // 只有 pending_all，查询 null 和 pending
          query = query.or('generation_status.is.null,generation_status.eq.pending')
        }
      } else {
        const statusValues = options.statusList
        query = query.in('generation_status', statusValues)
      }
    } else if (options.status) {
      // 兼容旧的单选模式
      if (options.status === 'pending_all' || options.status === 'null') {
        // pending_all 表示同时查询 null 和 pending 两种状态
        query = query.or('generation_status.is.null,generation_status.eq.pending')
      } else if (options.status !== 'all') {
        query = query.eq('generation_status', options.status)
      }
    }

    // 发布时间范围筛选
    if (options.dateRange && options.dateRange.length === 2) {
      query = query.gte('published_at', options.dateRange[0])
        .lte('published_at', options.dateRange[1])
    }

    // 添加时间范围筛选（视频被采集到系统的时间）
    if (options.createdAtRange && options.createdAtRange.length === 2) {
      query = query.gte('created_at', options.createdAtRange[0])
        .lte('created_at', options.createdAtRange[1])
    }

    // 最近N天筛选 (如果指定了 dateRange，则忽略 days)
    if (options.days && !options.dateRange) {
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - options.days)
      query = query.gte('published_at', startDate.toISOString())
    } else if (!options.dateRange && !options.createdAtRange && !isOwnChannel) {
      // 没有指定任何时间范围时，默认只查询最近90天的数据，避免全表扫描
      const defaultStartDate = new Date()
      defaultStartDate.setDate(defaultStartDate.getDate() - 90)
      query = query.gte('published_at', defaultStartDate.toISOString())
      console.log('[Supabase] 未指定时间范围，默认查询最近90天数据')
    }

    // 最小播放量筛选
    if (options.minViews) {
      query = query.gte('view_count', options.minViews)
    }

    // 分组筛选
    if (options.groupName) {
      query = query.eq('group_name', options.groupName)
    }

    // 频道筛选（包括状态筛选后的结果）
    // 注意：如果频道ID数量太多（超过100个），IN查询可能会很慢
    // 这种情况下，我们不使用IN筛选，而是在获取数据后再过滤
    const MAX_IN_CHANNEL_IDS = 100
    let postFilterChannelIds = null

    if (filteredChannelIds.length > 0) {
      if (filteredChannelIds.length <= MAX_IN_CHANNEL_IDS) {
        // 频道数量较少，直接使用IN查询
        query = query.in('channel_id', filteredChannelIds)
      } else {
        // 频道数量太多，跳过IN查询，后续在内存中过滤
        // 但这种情况下需要获取更多数据来保证分页正确
        console.log(`[Supabase] 频道数量 ${filteredChannelIds.length} 超过 ${MAX_IN_CHANNEL_IDS}，将在内存中过滤`)
        postFilterChannelIds = new Set(filteredChannelIds)
      }
    } else if (options.channelId) {
      // 兼容旧的单选参数
      query = query.eq('channel_id', options.channelId)
    }

    // 排序 (默认按 id 降序，利用主键索引)
    const sortBy = options.sortBy || 'id'
    const sortOrder = options.sortOrder === 'asc' ? true : false
    query = query.order(sortBy, { ascending: sortOrder })

    // 分页 (最奇50条，避免查询超时)
    const limit = Math.min(options.limit || 20, 50)
    const page = options.page || 1
    const offset = (page - 1) * limit

    // 如果需要内存过滤，需要获取更多数据
    if (postFilterChannelIds) {
      // 获取足够多的数据来支持分页（最多获取5000条）
      const fetchLimit = Math.min(5000, limit * 10)
      query = query.range(0, fetchLimit - 1)
    } else {
      query = query.range(offset, offset + limit - 1)
    }

    const { data, error } = await query

    if (error) {
      throw new Error(error.message)
    }

    // 如果需要内存过滤
    if (postFilterChannelIds && data) {
      const filteredData = data.filter(item => postFilterChannelIds.has(item.channel_id))
      const totalFiltered = filteredData.length
      // 应用分页
      const pagedData = filteredData.slice(offset, offset + limit)
      return {
        data: pagedData,
        total: totalFiltered,
        page,
        pageSize: limit
      }
    }

    return {
      data: data || [],
      // 不再返回 total，前端通过判断 data.length < limit 来确定是否有更多数据
      total: -1,
      page,
      pageSize: limit
    }
  }

  /**
   * 搜索频道列表 (用于筛选)
   * 从 benchmark_channels 表搜索频道数据
   * @param {string} keyword - 搜索关键词（频道名称或频道ID模糊匹配）
   * @param {number} limit - 返回数量限制，默认20
   */
  async searchChannels(keyword = '', limit = 20) {
    if (!this.client) {
      throw new Error('未初始化 Supabase 客户端')
    }

    let query = this.client
      .from('benchmark_channels')
      .select('channel_id, channel_name')

    // 如果有关键词，同时搜索 channel_name 和 channel_id
    if (keyword && keyword.trim()) {
      const searchTerm = keyword.trim()
      // 使用 or 条件同时匹配频道名称和频道ID
      query = query.or(`channel_name.ilike.%${searchTerm}%,channel_id.ilike.%${searchTerm}%`)
    }

    query = query
      .order('channel_name', { ascending: true })
      .limit(limit)

    const { data, error } = await query

    if (error) {
      throw new Error(error.message)
    }

    // 转换为下拉选项格式
    return (data || []).map(item => ({
      value: item.channel_id,
      label: item.channel_name || item.channel_id
    }))
  }

  /**
   * 搜索自有频道列表 (用于筛选)
   * 从 own_channels 表搜索频道数据
   * @param {string} keyword - 搜索关键词（频道名称或频道ID模糊匹配）
   * @param {number} limit - 返回数量限制，默认20
   */
  async searchOwnChannels(keyword = '', limit = 20) {
    if (!this.client) {
      throw new Error('未初始化 Supabase 客户端')
    }

    let query = this.client
      .from('own_channels')
      .select('channel_id, channel_name')

    // 如果有关键词，同时搜索 channel_name 和 channel_id
    if (keyword && keyword.trim()) {
      const searchTerm = keyword.trim()
      // 使用 or 条件同时匹配频道名称和频道ID
      query = query.or(`channel_name.ilike.%${searchTerm}%,channel_id.ilike.%${searchTerm}%`)
    }

    query = query
      .order('channel_name', { ascending: true })
      .limit(limit)

    const { data, error } = await query

    if (error) {
      throw new Error(error.message)
    }

    // 转换为下拉选项格式
    return (data || []).map(item => ({
      value: item.channel_id,
      label: item.channel_name || item.channel_id
    }))
  }

  /**
   * 获取所有自有频道分组列表 (用于筛选)
   * 从 own_channels 表获取分组数据 (去重)
   */
  async getOwnChannelGroups() {
    if (!this.client) {
      throw new Error('未初始化 Supabase 客户端')
    }

    // 获取所有不为空的分组名，并去重
    const { data, error } = await this.client
      .from('own_channels')
      .select('group_name')
      .not('group_name', 'is', null)
      .neq('group_name', '')

    if (error) {
      throw new Error(error.message)
    }

    // 去重
    const uniqueGroups = [...new Set((data || []).map(item => item.group_name))]

    // 排序
    uniqueGroups.sort()

    // 转换为下拉选项格式
    return uniqueGroups.map(group => ({
      value: group,
      label: group
    }))
  }

  /**
   * 获取所有分组列表 (用于筛选)
   * 从 benchmark_channel_groups 表获取分组数据
   */
  async getGroups() {
    if (!this.client) {
      throw new Error('未初始化 Supabase 客户端')
    }

    const { data, error } = await this.client
      .from('benchmark_channel_groups')
      .select('id, name, description, color, sort_order, channel_count')
      .order('sort_order', { ascending: true })

    if (error) {
      throw new Error(error.message)
    }

    // 转换为下拉选项格式
    return (data || []).map(item => ({
      value: item.name,
      label: item.name,
      id: item.id,
      color: item.color,
      description: item.description,
      channelCount: item.channel_count
    }))
  }

  /**
   * 获取单个视频记录
   */
  async getVideo(id) {
    if (!this.client) {
      throw new Error('未初始化 Supabase 客户端')
    }

    const { data, error } = await this.client
      .from(this.config.tableName)
      .select('*')
      .eq('id', id)
      .single()

    if (error) {
      throw new Error(error.message)
    }

    return data
  }

  /**
   * 更新视频记录的 AI 回复（脚本内容）
   * @param {string} id - 视频 ID
   * @param {string|Object} aiResponse - AI 回复内容 (JSON 字符串或对象)
   * @param {string} status - 生成状态
   * @param {string} tableName - 表名 (可选)
   */
  async updateAIResponse(id, aiResponse, status = 'completed', tableName = null) {
    if (!this.client) {
      throw new Error('未初始化 Supabase 客户端')
    }

    const targetTable = tableName || this.config.tableName

    let updateData = {
      generation_status: status,
      script_generated_at: new Date().toISOString()
    }

    // 辅助函数：将字符串转换为数组
    const toArray = (value) => {
      if (!value) return null
      if (Array.isArray(value)) return value
      if (typeof value === 'string') {
        // 优先按换行符分割
        if (value.includes('\n')) {
          return value.split('\n').map(s => s.trim()).filter(s => s.length > 0)
        }
        // 如果包含中文，使用正向匹配提取 "英文 - 中文" 模式的关键词
        // 例如: "Magic trick - 魔术揭秘 Illusion - 幻术" -> ["Magic trick - 魔术揭秘", "Illusion - 幻术"]
        if (/[\u4e00-\u9fa5]/.test(value)) {
          // 匹配: 英文单词 - 中文字符（非贪婪，遇到下一个英文大写字母前停止）
          const pattern = /[A-Za-z][A-Za-z\s]*?\s*-\s*[\u4e00-\u9fa5]+/g
          const matches = value.match(pattern)
          if (matches && matches.length > 0) {
            return matches.map(s => s.trim()).filter(s => s.length > 0)
          }
        }
        // 如果都不行，作为单个元素的数组返回
        return [value.trim()]
      }
      return null
    }

    // 如果是对象，说明已经解析过，直接映射字段
    if (typeof aiResponse === 'object' && aiResponse !== null) {
      updateData = {
        ...updateData,
        // 不再存储 script_text，直接存到独立字段，节省空间
        video_description: aiResponse.videoDescription,
        original_script: aiResponse.originalScript,
        chinese_script: aiResponse.chineseScript,
        video_language: aiResponse.videoLanguage,
        search_keywords: toArray(aiResponse.searchKeywords), // 确保是数组格式
        video_highlights: aiResponse.videoHighlights,
        video_type: aiResponse.videoType,
        script_value_add: aiResponse.scriptValueAdd // 文案增值分析
      }
    } else {
      // 如果是字符串，尝试解析
      try {
        const parsed = JSON.parse(aiResponse)
        updateData = {
          ...updateData,
          // 不再存储 script_text，直接存到独立字段，节省空间
          video_description: parsed.videoDescription,
          original_script: parsed.originalScript,
          chinese_script: parsed.chineseScript,
          video_language: parsed.videoLanguage,
          search_keywords: toArray(parsed.searchKeywords), // 确保是数组格式
          video_highlights: parsed.videoHighlights,
          video_type: parsed.videoType,
          script_value_add: parsed.scriptValueAdd // 文案增值分析
        }
      } catch (e) {
        // 解析失败，存到 script_text 作为备份
        console.warn('Failed to parse AI response for individual fields:', e)
        updateData.script_text = aiResponse
      }
    }

    const { data, error } = await this.client
      .from(targetTable)
      .update(updateData)
      .eq('id', id)
      .select()

    if (error) {
      throw new Error(error.message)
    }

    return data
  }

  /**
   * @param {string} id - 视频 ID
   * @param {string} status - 新状态
   * @param {string} errorMessage - 错误信息
   * @param {Object} options - 额外选项，如 tableName
   */
  async updateStatus(id, status, errorMessage = null, options = {}) {
    if (!this.client) {
      throw new Error('未初始化 Supabase 客户端')
    }

    const updateData = { generation_status: status }
    if (errorMessage) {
      updateData.script_generation_error = errorMessage
    }

    const targetTable = options && options.tableName ? options.tableName : this.config.tableName
    const { data, error } = await this.client
      .from(targetTable)
      .update(updateData)
      .eq('id', id)
      .select()

    if (error) {
      throw new Error(error.message)
    }

    return data
  }

  /**
   * 批量更新状态
   */
  async batchUpdateStatus(ids, status) {
    if (!this.client) {
      throw new Error('未初始化 Supabase 客户端')
    }

    const { data, error } = await this.client
      .from(this.config.tableName)
      .update({ generation_status: status })
      .in('id', ids)
      .select()

    if (error) {
      throw new Error(error.message)
    }

    return data
  }

  /**
   * 获取表的列信息（用于动态获取字段）
   */
  async getTableColumns() {
    if (!this.client) {
      throw new Error('未初始化 Supabase 客户端')
    }

    // 返回预定义的列名，避免查询超时
    return [
      'id', 'video_id', 'channel_id', 'title', 'description',
      'channel_name', 'channel_avatar', 'published_at', 'duration',
      'thumbnail', 'url', 'view_count', 'like_count', 'comment_count',
      'group_name', 'tags', 'generation_status', 'script_generated_at',
      'script_text', 'script_generation_error', 'created_at', 'updated_at',
      // AI 分析字段
      'video_description', 'original_script', 'chinese_script',
      'video_language', 'search_keywords', 'video_highlights', 'video_type',
      'script_value_add' // 文案增值分析
    ]
  }

  /**
   * 获取用户列表（从users表）
   * 用于同步到本地缓存
   */
  async getUsers() {
    if (!this.client) {
      throw new Error('未初始化 Supabase 客户端')
    }

    const { data, error } = await this.client
      .from('users')
      .select('id, name, phone, role, status')
      .order('name', { ascending: true })

    if (error) {
      throw new Error(error.message)
    }

    return data || []
  }

  /**
   * 解析播放量字符串为数字
   * @param {string} viewCount - 播放量字符串，如 "1.2M", "500K", "12,345"
   * @returns {number} 数字格式的播放量
   */
  parseViewCount(viewCount) {
    if (!viewCount) return 0
    const str = String(viewCount).trim().toUpperCase()

    // 处理 K/M/B 后缀
    if (str.endsWith('K')) {
      return Math.round(parseFloat(str.replace('K', '')) * 1000)
    }
    if (str.endsWith('M')) {
      return Math.round(parseFloat(str.replace('M', '')) * 1000000)
    }
    if (str.endsWith('B')) {
      return Math.round(parseFloat(str.replace('B', '')) * 1000000000)
    }

    // 处理中文单位
    if (str.includes('万')) {
      return Math.round(parseFloat(str.replace('万', '')) * 10000)
    }
    if (str.includes('亿')) {
      return Math.round(parseFloat(str.replace('亿', '')) * 100000000)
    }

    // 去掉逗号和空格
    const cleaned = str.replace(/[,\s]/g, '')
    const num = parseInt(cleaned, 10)
    return isNaN(num) ? 0 : num
  }

  /**
   * 保存 YouTube 采集视频到 Supabase
   * @param {Object} video - 视频数据
   * @param {string} video.videoId - YouTube视频ID
   * @param {string} video.videoUrl - 完整视频链接
   * @param {string} video.title - 视频标题
   * @param {string} video.channelHandle - 频道@ID
   * @param {string} video.channelName - 频道名称
   * @param {string} video.viewCount - 观看次数
   * @param {string} video.publishDate - 发布时间
   * @param {string} video.collectedAt - 采集时间
   * @returns {Promise<Object>} 保存结果
   */
  async saveYouTubeCollectedVideo(video) {
    if (!this.client) {
      console.log('[Supabase] Client not initialized, skipping YouTube video save')
      return { success: false, error: 'Supabase 未初始化' }
    }

    try {
      const insertData = {
        video_id: video.videoId,
        video_url: video.videoUrl,
        title: video.title,
        channel_handle: video.channelHandle,
        channel_name: video.channelName,
        view_count: video.viewCount,
        view_count_num: this.parseViewCount(video.viewCount),
        publish_date: video.publishDate,
        collected_at: video.collectedAt || new Date().toISOString(),
        source: 'desktop',
        status: 'pending'
      }

      const { data, error } = await this.client
        .from('youtube_collected_videos')
        .upsert(insertData, {
          onConflict: 'video_id',
          ignoreDuplicates: true
        })
        .select()

      if (error) {
        // 如果是重复键错误，不算失败
        if (error.code === '23505' || error.message.includes('duplicate')) {
          console.log('[Supabase] YouTube video already exists:', video.videoId)
          return { success: true, duplicate: true }
        }
        console.error('[Supabase] Failed to save YouTube video:', error.message)
        return { success: false, error: error.message }
      }

      console.log('[Supabase] Saved YouTube video:', video.videoId)
      return { success: true, data }
    } catch (err) {
      console.error('[Supabase] Error saving YouTube video:', err.message)
      return { success: false, error: err.message }
    }
  }

  /**
   * 批量保存 YouTube 采集视频到 Supabase
   * @param {Array} videos - 视频数据数组
   * @returns {Promise<Object>} 保存结果
   */
  async saveYouTubeCollectedVideos(videos) {
    if (!this.client) {
      console.log('[Supabase] Client not initialized, skipping YouTube videos save')
      return { success: false, error: 'Supabase 未初始化' }
    }

    if (!videos || videos.length === 0) {
      return { success: true, count: 0 }
    }

    try {
      const insertData = videos.map(video => ({
        // 所有采集字段（带 collected_ 前缀，区分于后续API字段）
        collected_video_id: video.videoId || video.video_id,
        collected_video_url: video.videoUrl || video.video_url,
        collected_title: video.title,
        collected_channel_handle: video.channelHandle || video.channel_handle,
        collected_channel_name: video.channelName || video.channel_name,
        collected_view_count: video.viewCount || video.view_count,
        collected_view_count_num: this.parseViewCount(video.viewCount || video.view_count),
        collected_publish_date: video.publishDate || video.publish_date,
        collected_channel_url: video.channelUrl || video.channel_url || null,
        collected_publish_time_type: video.publishTimeType || video.publish_time_type || null,
        collected_video_duration: video.videoDuration || video.video_duration || null,
        collected_video_duration_seconds: video.videoDurationSeconds || video.video_duration_seconds || 0,
        collected_is_ad: video.isAd || video.is_ad || false,
        collected_is_followed: video.isFollowed || video.is_followed || false,
        collected_account_id: video.accountId || video.account_id || null,
        collected_account_name: video.accountName || video.account_name || null,
        // 系统字段
        collected_at: video.collectedAt || video.collected_at || new Date().toISOString(),
        source: 'desktop',
        status: 'pending'
      }))

      const { data, error } = await this.client
        .from('youtube_collected_videos')
        .upsert(insertData, {
          onConflict: 'collected_video_id',
          ignoreDuplicates: true
        })
        .select()

      if (error) {
        console.error('[Supabase] Failed to save YouTube videos:', error.message)
        return { success: false, error: error.message }
      }

      console.log('[Supabase] Saved', insertData.length, 'YouTube videos')
      return { success: true, count: insertData.length, data }
    } catch (err) {
      console.error('[Supabase] Error saving YouTube videos:', err.message)
      return { success: false, error: err.message }
    }
  }

  /**
   * 获取对标频道分组列表
   */
  async getBenchmarkChannelGroups() {
    if (!this.client) {
      console.log('[Supabase] Client not initialized')
      return { success: false, error: 'Supabase 未初始化', data: [] }
    }

    try {
      const { data, error } = await this.client
        .from('benchmark_channel_groups')
        .select('*')
        .order('sort_order', { ascending: true })

      if (error) {
        console.error('[Supabase] Failed to get benchmark channel groups:', error.message)
        return { success: false, error: error.message, data: [] }
      }

      console.log('[Supabase] Got', data.length, 'benchmark channel groups')
      return { success: true, data }
    } catch (err) {
      console.error('[Supabase] Error getting benchmark channel groups:', err.message)
      return { success: false, error: err.message, data: [] }
    }
  }

  /**
   * 获取对标频道列表
   */
  async getBenchmarkChannels() {
    if (!this.client) {
      console.log('[Supabase] Client not initialized')
      return { success: false, error: 'Supabase 未初始化', data: [] }
    }

    try {
      const { data, error } = await this.client
        .from('benchmark_channels')
        .select('id, channel_id, channel_name, title, thumbnail_url, channel_avatar, subscriber_count, video_count, view_count, total_views, country, description, published_at, custom_url, group_name, status, is_active, languages, weekly_video_count, weekly_view_count, monthly_video_count, monthly_view_count, rpm, remark, created_at, updated_at')
        .eq('is_active', true)
        .order('subscriber_count', { ascending: false })

      if (error) {
        console.error('[Supabase] Failed to get benchmark channels:', error.message)
        return { success: false, error: error.message, data: [] }
      }

      console.log('[Supabase] Got', data.length, 'benchmark channels')
      return { success: true, data }
    } catch (err) {
      console.error('[Supabase] Error getting benchmark channels:', err.message)
      return { success: false, error: err.message, data: [] }
    }
  }

  /**
   * 获取排除频道列表
   */
  async getExcludedChannels() {
    if (!this.client) {
      console.log('[Supabase] Client not initialized')
      return { success: false, error: 'Supabase 未初始化', data: [] }
    }

    try {
      const { data, error } = await this.client
        .from('excluded_channels')
        .select('id, channel_id, channel_title, channel_thumbnail_url, channel_custom_url, subscriber_count, video_count, view_count, country, published_at, exclude_reason, remark, created_at, updated_at')
        .order('created_at', { ascending: false })

      if (error) {
        console.error('[Supabase] Failed to get excluded channels:', error.message)
        return { success: false, error: error.message, data: [] }
      }

      console.log('[Supabase] Got', data.length, 'excluded channels')
      return { success: true, data }
    } catch (err) {
      console.error('[Supabase] Error getting excluded channels:', err.message)
      return { success: false, error: err.message, data: [] }
    }
  }

  /**
   * 获取Supabase中已存在的YouTube采集视频ID列表
   * @param {Array<string>} videoIds - 要检查的视频ID数组
   * @returns {Promise<Set<string>>} 已存在的视频ID集合
   */
  async getExistingYouTubeVideoIds(videoIds) {
    if (!this.client) {
      console.log('[Supabase] Client not initialized')
      return new Set()
    }

    if (!videoIds || videoIds.length === 0) {
      return new Set()
    }

    try {
      // 分批查询，每批最多100个ID
      const BATCH_SIZE = 100
      const existingIds = new Set()

      for (let i = 0; i < videoIds.length; i += BATCH_SIZE) {
        const batch = videoIds.slice(i, i + BATCH_SIZE)
        const { data, error } = await this.client
          .from('youtube_collected_videos')
          .select('collected_video_id')
          .in('collected_video_id', batch)

        if (error) {
          console.error('[Supabase] Failed to check existing videos:', error.message)
          continue
        }

        if (data) {
          data.forEach(item => existingIds.add(item.collected_video_id))
        }
      }

      console.log(`[Supabase] Found ${existingIds.size} existing videos out of ${videoIds.length}`)
      return existingIds
    } catch (err) {
      console.error('[Supabase] Error checking existing videos:', err.message)
      return new Set()
    }
  }

  /**
   * 同步本地YouTube采集视频到Supabase
   * 只同步Supabase中不存在的视频
   * @param {Array} localVideos - 本地视频数组
   * @param {Function} onProgress - 进度回调
   * @returns {Promise<Object>} 同步结果
   */
  async syncLocalVideosToSupabase(localVideos, onProgress) {
    if (!this.client) {
      return { success: false, error: 'Supabase 未初始化' }
    }

    if (!localVideos || localVideos.length === 0) {
      return { success: true, synced: 0, skipped: 0, total: 0 }
    }

    try {
      // 1. 获取所有本地视频ID
      const localVideoIds = localVideos.map(v => v.video_id)

      onProgress?.({ status: 'checking', message: '正在检查已存在的视频...' })

      // 2. 查询Supabase中已存在的视频ID
      const existingIds = await this.getExistingYouTubeVideoIds(localVideoIds)

      // 3. 过滤出需要同步的视频
      const videosToSync = localVideos.filter(v => !existingIds.has(v.video_id))

      if (videosToSync.length === 0) {
        return {
          success: true,
          synced: 0,
          skipped: localVideos.length,
          total: localVideos.length,
          message: '所有视频已存在于Supabase中'
        }
      }

      onProgress?.({
        status: 'syncing',
        message: `正在同步 ${videosToSync.length} 个新视频...`,
        total: videosToSync.length
      })

      // 4. 分批上传（每批50个）
      const BATCH_SIZE = 50
      let syncedCount = 0
      let errorCount = 0

      for (let i = 0; i < videosToSync.length; i += BATCH_SIZE) {
        const batch = videosToSync.slice(i, i + BATCH_SIZE)
        const result = await this.saveYouTubeCollectedVideos(batch)

        if (result.success) {
          syncedCount += batch.length
        } else {
          errorCount += batch.length
          console.error('[Supabase] Batch sync error:', result.error)
        }

        onProgress?.({
          status: 'syncing',
          message: `已同步 ${syncedCount}/${videosToSync.length}`,
          synced: syncedCount,
          total: videosToSync.length
        })
      }

      return {
        success: true,
        synced: syncedCount,
        skipped: existingIds.size,
        failed: errorCount,
        total: localVideos.length,
        message: `同步完成：${syncedCount} 个新视频，${existingIds.size} 个已存在`
      }
    } catch (err) {
      console.error('[Supabase] Sync error:', err.message)
      return { success: false, error: err.message }
    }
  }

  /**
   * 断开连接
   */
  disconnect() {
    this.client = null
    this.config.url = ''
    this.config.apiKey = ''
  }
}

// 导出单例
module.exports = new SupabaseService()
