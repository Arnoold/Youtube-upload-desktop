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
    this.client = createClientFn(url, apiKey)

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
   */
  async getVideos(options = {}) {
    if (!this.client) {
      throw new Error('未初始化 Supabase 客户端')
    }

    // 最小化字段，避免查询超时
    // 只选择列表展示需要的字段，避免查询过慢
    // 注意：不要包含 script_text 等大字段，会导致查询超时
    let selectFields = options.select || [
      'id', 'video_id', 'channel_id', 'title',
      'channel_name', 'channel_avatar', 'published_at', 'duration',
      'thumbnail', 'url', 'view_count', 'like_count', 'comment_count',
      'group_name', 'tags', 'generation_status', 'script_generated_at',
      'script_generation_error', 'created_at', 'updated_at',
      // 只包含小字段用于预览
      'video_description'
    ].join(',')

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

    let query = this.client
      .from(this.config.tableName)
      .select(selectFields, { count: 'exact' })

    // 生成状态筛选
    if (options.status) {
      if (options.status === 'pending_all' || options.status === 'null') {
        // 筛选待生成的记录（数据库中所有新记录都是 pending 状态）
        // 兼容旧的 'null' 选项值
        query = query.eq('generation_status', 'pending')
      } else if (options.status !== 'all') {
        query = query.eq('generation_status', options.status)
      }
      // status === 'all' 时不添加筛选条件
    }

    // 日期范围筛选
    if (options.dateRange && options.dateRange.length === 2) {
      query = query.gte('published_at', options.dateRange[0])
        .lte('published_at', options.dateRange[1])
    }

    // 最近N天筛选 (如果指定了 dateRange，则忽略 days)
    if (options.days && !options.dateRange) {
      const startDate = new Date()
      startDate.setDate(startDate.getDate() - options.days)
      query = query.gte('published_at', startDate.toISOString())
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

    // 分页 (最大500条，避免查询过慢)
    const limit = Math.min(options.limit || 20, 500)
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

    const { data, error, count } = await query

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
      total: count || 0,
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
   */
  async updateAIResponse(id, aiResponse, status = 'completed') {
    if (!this.client) {
      throw new Error('未初始化 Supabase 客户端')
    }

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
      .from(this.config.tableName)
      .update(updateData)
      .eq('id', id)
      .select()

    if (error) {
      throw new Error(error.message)
    }

    return data
  }

  /**
   * 更新视频状态
   */
  async updateStatus(id, status, errorMessage = null) {
    if (!this.client) {
      throw new Error('未初始化 Supabase 客户端')
    }

    const updateData = { generation_status: status }
    if (errorMessage) {
      updateData.script_generation_error = errorMessage
    }

    const { data, error } = await this.client
      .from(this.config.tableName)
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
