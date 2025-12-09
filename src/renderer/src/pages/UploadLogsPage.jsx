import React, { useState, useEffect } from 'react'
import {
  Table,
  Button,
  Space,
  Typography,
  Tag,
  DatePicker,
  Input,
  message,
  Modal,
  Tooltip,
  Card,
  Statistic,
  Row,
  Col,
  Popconfirm
} from 'antd'
import {
  ReloadOutlined,
  DeleteOutlined,
  SyncOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  LoadingOutlined,
  LinkOutlined,
  UserOutlined,
  CalendarOutlined
} from '@ant-design/icons'
import dayjs from 'dayjs'

const { Title, Text } = Typography
const { RangePicker } = DatePicker
const { Search } = Input

const UploadLogsPage = () => {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(false)
  const [syncingUsers, setSyncingUsers] = useState(false)
  const [lastSyncTime, setLastSyncTime] = useState(null)
  const [userCount, setUserCount] = useState(0)

  // 过滤条件
  const [filters, setFilters] = useState({
    status: null,
    dateRange: null,
    keyword: ''
  })

  // 统计数据 - 总记录
  const [stats, setStats] = useState({
    total: 0,
    completed: 0,
    failed: 0,
    uploading: 0
  })

  // 统计数据 - 今日记录
  const [todayStats, setTodayStats] = useState({
    total: 0,
    completed: 0,
    failed: 0,
    uploading: 0
  })

  // 加载日志列表
  const loadLogs = async () => {
    setLoading(true)
    try {
      const options = {}
      if (filters.status) {
        options.status = filters.status
      }
      if (filters.dateRange && filters.dateRange.length === 2) {
        options.startDate = filters.dateRange[0].startOf('day').toISOString()
        options.endDate = filters.dateRange[1].endOf('day').toISOString()
      }

      const data = await window.electron.uploadLog.list(options)

      // 过滤关键词
      let filteredData = data || []
      if (filters.keyword) {
        const keyword = filters.keyword.toLowerCase()
        filteredData = filteredData.filter(log =>
          (log.file_name && log.file_name.toLowerCase().includes(keyword)) ||
          (log.browser_name && log.browser_name.toLowerCase().includes(keyword)) ||
          (log.producer_name && log.producer_name.toLowerCase().includes(keyword)) ||
          (log.video_title && log.video_title.toLowerCase().includes(keyword))
        )
      }

      setLogs(filteredData)

      // 计算总统计数据
      const total = filteredData.length
      const completed = filteredData.filter(l => l.status === 'completed').length
      const failed = filteredData.filter(l => l.status === 'failed').length
      const uploading = filteredData.filter(l => l.status === 'uploading').length
      setStats({ total, completed, failed, uploading })

      // 计算今日统计数据
      const today = dayjs().startOf('day')
      const todayData = filteredData.filter(l => l.start_time && dayjs(l.start_time).isAfter(today))
      const todayTotal = todayData.length
      const todayCompleted = todayData.filter(l => l.status === 'completed').length
      const todayFailed = todayData.filter(l => l.status === 'failed').length
      const todayUploading = todayData.filter(l => l.status === 'uploading').length
      setTodayStats({ total: todayTotal, completed: todayCompleted, failed: todayFailed, uploading: todayUploading })
    } catch (error) {
      message.error(`加载日志失败: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  // 加载用户同步信息
  const loadUserSyncInfo = async () => {
    try {
      const [lastSync, users] = await Promise.all([
        window.electron.users.getLastSync(),
        window.electron.users.getCached()
      ])
      setLastSyncTime(lastSync)
      setUserCount(users?.length || 0)
    } catch (error) {
      console.error('获取用户同步信息失败:', error)
    }
  }

  // 同步用户
  const handleSyncUsers = async () => {
    setSyncingUsers(true)
    try {
      const result = await window.electron.users.sync()
      if (result.success) {
        message.success(`成功同步 ${result.count} 个用户`)
        await loadUserSyncInfo()
      } else {
        message.error(`同步失败: ${result.error}`)
      }
    } catch (error) {
      message.error(`同步失败: ${error.message}`)
    } finally {
      setSyncingUsers(false)
    }
  }

  // 删除日志
  const handleDelete = async (id) => {
    try {
      const result = await window.electron.uploadLog.delete(id)
      if (result.success) {
        message.success('删除成功')
        loadLogs()
      } else {
        message.error(`删除失败: ${result.error}`)
      }
    } catch (error) {
      message.error(`删除失败: ${error.message}`)
    }
  }

  useEffect(() => {
    loadLogs()
    loadUserSyncInfo()
  }, [])

  // 状态标签
  const getStatusTag = (status) => {
    switch (status) {
      case 'completed':
        return <Tag icon={<CheckCircleOutlined />} color="success">已完成</Tag>
      case 'failed':
        return <Tag icon={<CloseCircleOutlined />} color="error">失败</Tag>
      case 'uploading':
        return <Tag icon={<LoadingOutlined />} color="processing">上传中</Tag>
      case 'pending':
        return <Tag icon={<ClockCircleOutlined />} color="default">等待中</Tag>
      default:
        return <Tag>{status}</Tag>
    }
  }

  // 表格列定义
  const columns = [
    {
      title: '文件名',
      dataIndex: 'file_name',
      key: 'file_name',
      width: 250,
      ellipsis: true,
      render: (text) => (
        <Tooltip title={text}>
          <Text ellipsis style={{ maxWidth: 230 }}>{text}</Text>
        </Tooltip>
      )
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      width: 100,
      filters: [
        { text: '已完成', value: 'completed' },
        { text: '失败', value: 'failed' },
        { text: '上传中', value: 'uploading' },
        { text: '等待中', value: 'pending' }
      ],
      onFilter: (value, record) => record.status === value,
      render: (status) => getStatusTag(status)
    },
    {
      title: '视频标题',
      dataIndex: 'video_title',
      key: 'video_title',
      width: 200,
      ellipsis: true,
      render: (text) => (
        <Tooltip title={text}>
          <Text ellipsis style={{ maxWidth: 180 }}>{text || '-'}</Text>
        </Tooltip>
      )
    },
    {
      title: '浏览器',
      dataIndex: 'browser_name',
      key: 'browser_name',
      width: 120,
      ellipsis: true
    },
    {
      title: '制作人',
      dataIndex: 'producer_name',
      key: 'producer_name',
      width: 180,
      render: (text, record) => (
        <Space>
          {text ? (
            <>
              <UserOutlined />
              {text}
              {record.producer_id && <Tag color="green" style={{ marginLeft: 4 }}>已匹配</Tag>}
            </>
          ) : '-'}
        </Space>
      )
    },
    {
      title: '制作日期',
      dataIndex: 'production_date',
      key: 'production_date',
      width: 120,
      render: (text) => text ? (
        <Space>
          <CalendarOutlined />
          {text}
        </Space>
      ) : '-'
    },
    {
      title: '发布时间',
      dataIndex: 'scheduled_time',
      key: 'scheduled_time',
      width: 160,
      render: (text) => text ? (
        <Space>
          <ClockCircleOutlined />
          {dayjs(text).format('YYYY-MM-DD HH:mm')}
        </Space>
      ) : '-'
    },
    {
      title: '发布时区',
      dataIndex: 'scheduled_timezone',
      key: 'scheduled_timezone',
      width: 140,
      render: (text) => text || '-'
    },
    {
      title: '开始时间',
      dataIndex: 'start_time',
      key: 'start_time',
      width: 160,
      sorter: (a, b) => new Date(a.start_time) - new Date(b.start_time),
      render: (text) => text ? dayjs(text).format('YYYY-MM-DD HH:mm:ss') : '-'
    },
    {
      title: '结束时间',
      dataIndex: 'end_time',
      key: 'end_time',
      width: 160,
      render: (text) => text ? dayjs(text).format('YYYY-MM-DD HH:mm:ss') : '-'
    },
    {
      title: '耗时',
      key: 'duration',
      width: 80,
      render: (_, record) => {
        if (!record.start_time || !record.end_time) return '-'
        const start = dayjs(record.start_time)
        const end = dayjs(record.end_time)
        const duration = end.diff(start, 'second')
        if (duration < 60) return `${duration}秒`
        return `${Math.floor(duration / 60)}分${duration % 60}秒`
      }
    },
    {
      title: '视频链接',
      dataIndex: 'video_url',
      key: 'video_url',
      width: 100,
      render: (url) => url ? (
        <a href={url} target="_blank" rel="noopener noreferrer">
          <LinkOutlined /> 查看
        </a>
      ) : '-'
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_, record) => (
        <Popconfirm
          title="确定删除此记录？"
          onConfirm={() => handleDelete(record.id)}
          okText="确定"
          cancelText="取消"
        >
          <Button type="text" danger size="small" icon={<DeleteOutlined />} />
        </Popconfirm>
      )
    }
  ]

  // 展开行显示错误信息
  const expandedRowRender = (record) => {
    if (!record.error_message) return null
    return (
      <div style={{ padding: '8px 0' }}>
        <Text type="danger">错误信息: {record.error_message}</Text>
      </div>
    )
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 统计信息 - 紧凑布局 */}
      <Row gutter={16} style={{ marginBottom: 12 }} align="middle">
        <Col>
          <Space size="large">
            <Space size={4}>
              <Text type="secondary" style={{ fontSize: 12 }}>总记录:</Text>
              <Text style={{ fontSize: 12 }}>总计 <Text strong>{stats.total}</Text></Text>
              <Text style={{ fontSize: 12, color: '#52c41a' }}>完成 <Text strong style={{ color: '#52c41a' }}>{stats.completed}</Text></Text>
              <Text style={{ fontSize: 12, color: '#ff4d4f' }}>失败 <Text strong style={{ color: '#ff4d4f' }}>{stats.failed}</Text></Text>
              <Text style={{ fontSize: 12, color: '#1890ff' }}>上传中 <Text strong style={{ color: '#1890ff' }}>{stats.uploading}</Text></Text>
            </Space>
            <Text type="secondary">|</Text>
            <Space size={4}>
              <Text type="secondary" style={{ fontSize: 12 }}>今日({dayjs().format('MM-DD')}):</Text>
              <Text style={{ fontSize: 12 }}>总计 <Text strong>{todayStats.total}</Text></Text>
              <Text style={{ fontSize: 12, color: '#52c41a' }}>完成 <Text strong style={{ color: '#52c41a' }}>{todayStats.completed}</Text></Text>
              <Text style={{ fontSize: 12, color: '#ff4d4f' }}>失败 <Text strong style={{ color: '#ff4d4f' }}>{todayStats.failed}</Text></Text>
              <Text style={{ fontSize: 12, color: '#1890ff' }}>上传中 <Text strong style={{ color: '#1890ff' }}>{todayStats.uploading}</Text></Text>
            </Space>
          </Space>
        </Col>
        <Col flex="auto" style={{ textAlign: 'right' }}>
          <Button
            icon={<SyncOutlined spin={syncingUsers} />}
            onClick={handleSyncUsers}
            loading={syncingUsers}
            size="small"
          >
            同步用户
          </Button>
          <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
            {userCount}人
            {lastSyncTime && <> | {dayjs(lastSyncTime).format('MM-DD HH:mm')}</>}
          </Text>
        </Col>
      </Row>

      {/* 操作栏 */}
      <Space style={{ marginBottom: 12 }} wrap>
        <Button
          type="primary"
          icon={<ReloadOutlined />}
          onClick={loadLogs}
          loading={loading}
        >
          刷新
        </Button>

        <RangePicker
          onChange={(dates) => setFilters(prev => ({ ...prev, dateRange: dates }))}
          placeholder={['开始日期', '结束日期']}
        />

        <Search
          placeholder="搜索文件名/浏览器/制作人"
          allowClear
          style={{ width: 250 }}
          onSearch={(value) => {
            setFilters(prev => ({ ...prev, keyword: value }))
            loadLogs()
          }}
          onChange={(e) => setFilters(prev => ({ ...prev, keyword: e.target.value }))}
        />

        <Button
          onClick={() => {
            setFilters({ status: null, dateRange: null, keyword: '' })
            loadLogs()
          }}
        >
          重置筛选
        </Button>
      </Space>

      {/* 日志表格 */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <Table
          columns={columns}
          dataSource={logs}
          rowKey="id"
          loading={loading}
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条`,
            position: ['bottomCenter'],
            locale: {
              items_per_page: '条/页',
              jump_to: '跳至',
              jump_to_confirm: '确定',
              page: '页',
              prev_page: '上一页',
              next_page: '下一页',
              prev_5: '向前 5 页',
              next_5: '向后 5 页',
              prev_3: '向前 3 页',
              next_3: '向后 3 页'
            },
            style: { margin: '4px 0 0 0', padding: 0 }
          }}
          scroll={{ x: 1800, y: 'calc(100vh - 208px)' }}
          expandable={{
            expandedRowRender,
            rowExpandable: (record) => !!record.error_message
          }}
          size="small"
        />
      </div>
    </div>
  )
}

export default UploadLogsPage
