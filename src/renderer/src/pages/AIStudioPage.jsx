import React, { useState, useEffect } from 'react'
import {
  Typography,
  Button,
  message,
  Table,
  Card,
  Space,
  Tag,
  Progress,
  Select,
  Modal,
  Descriptions,
  Alert
} from 'antd'
import {
  SyncOutlined,
  PlayCircleOutlined,
  StopOutlined,
  EyeOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  ClockCircleOutlined
} from '@ant-design/icons'

const { Title, Text, Paragraph } = Typography

const AIStudioPage = () => {
  const [videos, setVideos] = useState([])
  const [loading, setLoading] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(null)
  const [browserProfiles, setBrowserProfiles] = useState([])
  const [selectedProfile, setSelectedProfile] = useState(null)
  const [selectedVideos, setSelectedVideos] = useState([])
  const [statusFilter, setStatusFilter] = useState(null)
  const [supabaseConfig, setSupabaseConfig] = useState(null)
  const [detailVisible, setDetailVisible] = useState(false)
  const [detailVideo, setDetailVideo] = useState(null)

  // 加载 Supabase 配置
  const loadSupabaseConfig = async () => {
    try {
      const config = await window.electron.supabase.getConfig()
      setSupabaseConfig(config)
      return config.isConnected
    } catch (error) {
      console.error('Failed to load Supabase config:', error)
      return false
    }
  }

  // 加载视频列表
  const loadVideos = async () => {
    setLoading(true)
    try {
      const options = {
        limit: 50,
        // 默认只查询待处理的视频（没有脚本的）
        status: statusFilter || 'pending'
      }
      const result = await window.electron.supabase.getVideos(options)
      setVideos(result.data || [])
    } catch (error) {
      message.error(`加载视频列表失败: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  // 加载浏览器配置
  const loadBrowserProfiles = async () => {
    try {
      const profiles = await window.electron.db.getBrowserProfiles()
      setBrowserProfiles(profiles || [])
      if (profiles && profiles.length > 0 && !selectedProfile) {
        setSelectedProfile(profiles[0].bit_browser_id)
      }
    } catch (error) {
      console.error('Failed to load browser profiles:', error)
    }
  }

  // 初始化
  useEffect(() => {
    const init = async () => {
      const isConnected = await loadSupabaseConfig()
      if (isConnected) {
        loadVideos()
      }
      loadBrowserProfiles()
    }
    init()

    // 监听进度
    window.electron.aiStudio.onProgress((data) => {
      setProgress(data)
    })

    return () => {
      window.electron.aiStudio.removeListener('aistudio:progress')
    }
  }, [])

  // 状态筛选变化时重新加载
  useEffect(() => {
    if (supabaseConfig?.isConnected) {
      loadVideos()
    }
  }, [statusFilter])

  // 处理单个视频
  const handleProcess = async (video) => {
    if (!selectedProfile) {
      message.warning('请先选择浏览器配置')
      return
    }

    setProcessing(true)
    setProgress({ step: 0, progress: 0, message: '准备中...' })

    try {
      const result = await window.electron.aiStudio.process(video, selectedProfile)
      if (result.success) {
        message.success('处理完成！')
        loadVideos()
      }
    } catch (error) {
      message.error(`处理失败: ${error.message}`)
    } finally {
      setProcessing(false)
      setProgress(null)
    }
  }

  // 批量处理
  const handleBatchProcess = async () => {
    if (!selectedProfile) {
      message.warning('请先选择浏览器配置')
      return
    }

    if (selectedVideos.length === 0) {
      message.warning('请先选择要处理的视频')
      return
    }

    const videosToProcess = videos.filter(v => selectedVideos.includes(v.id))

    Modal.confirm({
      title: '确认批量处理',
      content: `确定要处理选中的 ${videosToProcess.length} 个视频吗？`,
      onOk: async () => {
        setProcessing(true)
        setProgress({ type: 'batch', current: 0, total: videosToProcess.length, message: '准备中...' })

        try {
          const results = await window.electron.aiStudio.batchProcess(videosToProcess, selectedProfile)
          const successCount = results.filter(r => r.success).length
          message.success(`批量处理完成！成功: ${successCount}/${results.length}`)
          loadVideos()
          setSelectedVideos([])
        } catch (error) {
          message.error(`批量处理失败: ${error.message}`)
        } finally {
          setProcessing(false)
          setProgress(null)
        }
      }
    })
  }

  // 取消处理
  const handleCancel = async () => {
    try {
      await window.electron.aiStudio.cancel()
      message.info('已取消处理')
    } catch (error) {
      message.error(`取消失败: ${error.message}`)
    }
  }

  // 查看详情
  const handleViewDetail = async (video) => {
    // 如果没有脚本内容，从服务器获取完整数据
    if (video.generation_status === 'completed' && !video.script_text) {
      try {
        const fullVideo = await window.electron.supabase.getVideo(video.id)
        setDetailVideo(fullVideo)
      } catch (error) {
        console.error('Failed to load video detail:', error)
        setDetailVideo(video)
      }
    } else {
      setDetailVideo(video)
    }
    setDetailVisible(true)
  }

  // 获取状态标签
  const getStatusTag = (status) => {
    const statusConfig = {
      pending: { color: 'default', icon: <ClockCircleOutlined />, text: '待处理' },
      generating: { color: 'processing', icon: <LoadingOutlined />, text: '生成中' },
      completed: { color: 'success', icon: <CheckCircleOutlined />, text: '已完成' },
      failed: { color: 'error', icon: <CloseCircleOutlined />, text: '失败' }
    }
    const config = statusConfig[status] || statusConfig.pending
    return <Tag color={config.color} icon={config.icon}>{config.text}</Tag>
  }

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 60,
      ellipsis: true
    },
    {
      title: '缩略图',
      dataIndex: 'thumbnail',
      key: 'thumbnail',
      width: 120,
      render: (thumbnail) => thumbnail ? (
        <img src={thumbnail} alt="thumbnail" style={{ width: 100, height: 56, objectFit: 'cover', borderRadius: 4 }} />
      ) : '-'
    },
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      width: 200,
      ellipsis: true,
      render: (title, record) => (
        <a href={record.url} target="_blank" rel="noopener noreferrer">
          {title || record.video_id}
        </a>
      )
    },
    {
      title: '频道',
      dataIndex: 'channel_name',
      key: 'channel_name',
      width: 120,
      ellipsis: true
    },
    {
      title: '状态',
      dataIndex: 'generation_status',
      key: 'generation_status',
      width: 100,
      render: (status) => getStatusTag(status)
    },
    {
      title: '生成时间',
      dataIndex: 'script_generated_at',
      key: 'script_generated_at',
      width: 160,
      render: (time) => time ? new Date(time).toLocaleString() : '-'
    },
    {
      title: '脚本内容',
      dataIndex: 'script_text',
      key: 'script_text',
      width: 200,
      ellipsis: true,
      render: (response) => response ? response.substring(0, 50) + '...' : '-'
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_, record) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<EyeOutlined />}
            onClick={() => handleViewDetail(record)}
          >
            详情
          </Button>
          {record.generation_status !== 'completed' && (
            <Button
              type="link"
              size="small"
              icon={<PlayCircleOutlined />}
              onClick={() => handleProcess(record)}
              disabled={processing}
            >
              处理
            </Button>
          )}
        </Space>
      )
    }
  ]

  // 如果未连接 Supabase
  if (!supabaseConfig?.isConnected) {
    return (
      <div>
        <Title level={2}>AI Studio 任务</Title>
        <Alert
          type="warning"
          showIcon
          message="未连接 Supabase"
          description="请先在 Supabase 设置页面配置数据库连接"
          style={{ marginTop: 24 }}
        />
      </div>
    )
  }

  return (
    <div>
      <Title level={2}>AI Studio 任务</Title>

      {/* 控制面板 */}
      <Card style={{ marginBottom: 24 }}>
        <Space wrap size="middle">
          <span>浏览器配置：</span>
          <Select
            style={{ width: 200 }}
            placeholder="选择浏览器配置"
            value={selectedProfile}
            onChange={setSelectedProfile}
            options={browserProfiles.map(p => ({
              value: p.bit_browser_id,
              label: p.name
            }))}
          />

          <span>状态筛选：</span>
          <Select
            style={{ width: 120 }}
            placeholder="全部"
            allowClear
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: 'pending', label: '待处理' },
              { value: 'generating', label: '生成中' },
              { value: 'completed', label: '已完成' },
              { value: 'failed', label: '失败' }
            ]}
          />

          <Button
            icon={<SyncOutlined />}
            onClick={loadVideos}
            loading={loading}
          >
            刷新
          </Button>

          <Button
            type="primary"
            icon={<PlayCircleOutlined />}
            onClick={handleBatchProcess}
            disabled={processing || selectedVideos.length === 0}
          >
            批量处理 ({selectedVideos.length})
          </Button>

          {processing && (
            <Button
              danger
              icon={<StopOutlined />}
              onClick={handleCancel}
            >
              取消
            </Button>
          )}
        </Space>
      </Card>

      {/* 进度显示 */}
      {progress && (
        <Card style={{ marginBottom: 24 }}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Text strong>
              {progress.type === 'batch'
                ? `批量处理进度: ${progress.current}/${progress.total}`
                : `处理进度: 步骤 ${progress.step}/10`
              }
            </Text>
            <Progress
              percent={progress.progress || 0}
              status="active"
            />
            <Text type="secondary">{progress.message}</Text>
          </Space>
        </Card>
      )}

      {/* 视频列表 */}
      <Table
        columns={columns}
        dataSource={videos}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
        rowSelection={{
          selectedRowKeys: selectedVideos,
          onChange: setSelectedVideos,
          getCheckboxProps: (record) => ({
            disabled: record.generation_status === 'completed'
          })
        }}
      />

      {/* 详情弹窗 */}
      <Modal
        title="视频详情"
        open={detailVisible}
        onCancel={() => setDetailVisible(false)}
        footer={null}
        width={800}
      >
        {detailVideo && (
          <Descriptions column={1} bordered>
            <Descriptions.Item label="ID">{detailVideo.id}</Descriptions.Item>
            <Descriptions.Item label="视频ID">{detailVideo.video_id}</Descriptions.Item>
            <Descriptions.Item label="标题">{detailVideo.title}</Descriptions.Item>
            <Descriptions.Item label="频道">{detailVideo.channel_name}</Descriptions.Item>
            <Descriptions.Item label="视频链接">
              <a href={detailVideo.url} target="_blank" rel="noopener noreferrer">
                {detailVideo.url}
              </a>
            </Descriptions.Item>
            <Descriptions.Item label="状态">
              {getStatusTag(detailVideo.generation_status)}
            </Descriptions.Item>
            <Descriptions.Item label="生成时间">
              {detailVideo.script_generated_at
                ? new Date(detailVideo.script_generated_at).toLocaleString()
                : '-'
              }
            </Descriptions.Item>
            <Descriptions.Item label="脚本内容">
              <Paragraph
                style={{
                  maxHeight: 300,
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap'
                }}
              >
                {detailVideo.script_text || '-'}
              </Paragraph>
            </Descriptions.Item>
            {detailVideo.script_generation_error && (
              <Descriptions.Item label="错误信息">
                <Text type="danger">{detailVideo.script_generation_error}</Text>
              </Descriptions.Item>
            )}
          </Descriptions>
        )}
      </Modal>
    </div>
  )
}

export default AIStudioPage
