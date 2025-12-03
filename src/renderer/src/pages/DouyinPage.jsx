import React, { useState, useEffect } from 'react'
import {
  Card,
  Button,
  Table,
  Space,
  message,
  InputNumber,
  Typography,
  Tag,
  Tooltip,
  Alert,
  Progress,
  Popconfirm,
  Select,
  Badge,
  Divider
} from 'antd'
import {
  PlayCircleOutlined,
  PauseCircleOutlined,
  ReloadOutlined,
  UpOutlined,
  DownOutlined,
  CopyOutlined,
  DeleteOutlined,
  ChromeOutlined,
  CloseOutlined,
  LinkOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  UserOutlined
} from '@ant-design/icons'

const { Title, Text, Paragraph } = Typography

const DouyinPage = () => {
  const [browserStatus, setBrowserStatus] = useState({
    browserRunning: false,
    isCollecting: false,
    collectedCount: 0,
    currentProfile: null
  })
  const [chromeStatus, setChromeStatus] = useState({
    running: false,
    debugMode: false,
    message: ''
  })
  const [profiles, setProfiles] = useState([])
  const [selectedProfile, setSelectedProfile] = useState(null)
  const [videos, setVideos] = useState([])
  const [loading, setLoading] = useState(false)
  const [startingDebugMode, setStartingDebugMode] = useState(false)
  const [collectCount, setCollectCount] = useState(10)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [currentVideo, setCurrentVideo] = useState(null)

  // 检查 Chrome 状态和获取配置文件
  const checkChromeStatus = async () => {
    try {
      const [chromeResult, profilesList, status] = await Promise.all([
        window.electron.douyin.checkChrome(),
        window.electron.douyin.getProfiles(),
        window.electron.douyin.getStatus()
      ])

      setChromeStatus(chromeResult)
      setProfiles(profilesList)
      setBrowserStatus(status)

      // 默认选择第一个配置文件
      if (profilesList.length > 0 && !selectedProfile) {
        setSelectedProfile(profilesList[0].id)
      }
    } catch (error) {
      console.error('Failed to check Chrome status:', error)
    }
  }

  // 获取服务状态
  const fetchStatus = async () => {
    try {
      const status = await window.electron.douyin.getStatus()
      setBrowserStatus(status)

      if (status.browserRunning) {
        const collected = await window.electron.douyin.getCollected()
        setVideos(collected)
      }
    } catch (error) {
      console.error('Failed to fetch status:', error)
    }
  }

  // 监听采集进度
  useEffect(() => {
    window.electron.douyin.onProgress((data) => {
      setProgress({ current: data.current, total: data.total })
      if (data.video) {
        setVideos(prev => {
          const exists = prev.some(v => v.videoId === data.video.videoId)
          if (!exists) {
            return [...prev, data.video]
          }
          return prev
        })
      }
    })

    // 初始化检查
    checkChromeStatus()
    fetchStatus()

    // 定时刷新 Chrome 状态
    const interval = setInterval(checkChromeStatus, 5000)

    return () => {
      window.electron.douyin.removeListener('douyin:progress')
      clearInterval(interval)
    }
  }, [])

  // 启动 Chrome 调试模式
  const handleStartDebugMode = async () => {
    if (!selectedProfile) {
      message.warning('请先选择一个 Chrome 配置文件')
      return
    }

    console.log('[DouyinPage] Starting debug mode with profile:', selectedProfile)
    setStartingDebugMode(true)

    try {
      const result = await window.electron.douyin.startDebugMode(selectedProfile)
      console.log('[DouyinPage] Start debug mode result:', result)

      if (result.success) {
        message.success(result.message)
        await checkChromeStatus()
      } else {
        if (result.needCloseChrome) {
          message.warning(result.error)
        } else {
          message.error(result.error || '启动失败')
        }
      }
    } catch (error) {
      console.error('[DouyinPage] Start debug mode error:', error)
      message.error('启动调试模式失败: ' + error.message)
    } finally {
      setStartingDebugMode(false)
    }
  }

  // 连接到浏览器
  const handleLaunch = async () => {
    console.log('[DouyinPage] handleLaunch called')
    setLoading(true)

    try {
      console.log('[DouyinPage] Calling window.electron.douyin.launch...')
      const result = await window.electron.douyin.launch(selectedProfile)
      console.log('[DouyinPage] Launch result:', result)

      if (result.success) {
        message.success(result.message)
        await fetchStatus()
      } else {
        if (result.needStartDebugMode) {
          message.warning(result.error)
        } else {
          message.error(result.error || '连接失败')
        }
      }
    } catch (error) {
      console.error('[DouyinPage] Launch error:', error)
      message.error('连接浏览器失败: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  // 打开抖音
  const handleOpenDouyin = async () => {
    setLoading(true)
    try {
      const result = await window.electron.douyin.open()
      if (result.success) {
        message.success('抖音页面已打开')
      } else {
        message.error(result.error || '打开失败')
      }
    } catch (error) {
      message.error('打开抖音失败: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  // 获取当前视频
  const handleGetCurrent = async () => {
    try {
      const result = await window.electron.douyin.getCurrentVideo()
      if (result.success) {
        setCurrentVideo(result.video)
        message.success('获取视频信息成功')
      } else {
        message.warning(result.error || '无法获取视频信息')
      }
    } catch (error) {
      message.error('获取视频失败: ' + error.message)
    }
  }

  // 滑动到下一个
  const handleScrollNext = async () => {
    try {
      await window.electron.douyin.scrollNext()
    } catch (error) {
      message.error('滑动失败: ' + error.message)
    }
  }

  // 滑动到上一个
  const handleScrollPrev = async () => {
    try {
      await window.electron.douyin.scrollPrev()
    } catch (error) {
      message.error('滑动失败: ' + error.message)
    }
  }

  // 开始自动采集
  const handleCollect = async () => {
    setLoading(true)
    setProgress({ current: 0, total: collectCount })
    try {
      const result = await window.electron.douyin.collect(collectCount)
      if (result.success) {
        message.success(`采集完成，共获取 ${result.count} 个视频`)
        setVideos(result.videos)
      } else {
        message.warning(result.error || '采集中断')
        if (result.videos) {
          setVideos(result.videos)
        }
      }
    } catch (error) {
      message.error('采集失败: ' + error.message)
    } finally {
      setLoading(false)
      setProgress({ current: 0, total: 0 })
      await fetchStatus()
    }
  }

  // 停止采集
  const handleStop = async () => {
    try {
      await window.electron.douyin.stop()
      message.info('采集已停止')
      await fetchStatus()
    } catch (error) {
      message.error('停止失败: ' + error.message)
    }
  }

  // 断开浏览器连接
  const handleClose = async () => {
    try {
      await window.electron.douyin.close()
      message.success('已断开浏览器连接')
      setBrowserStatus({
        browserRunning: false,
        isCollecting: false,
        collectedCount: 0,
        currentProfile: null
      })
      // 刷新 Chrome 状态
      await checkChromeStatus()
    } catch (error) {
      message.error('断开连接失败: ' + error.message)
    }
  }

  // 清空列表
  const handleClear = async () => {
    try {
      await window.electron.douyin.clear()
      setVideos([])
      message.success('列表已清空')
    } catch (error) {
      message.error('清空失败: ' + error.message)
    }
  }

  // 复制链接
  const handleCopyLink = (url) => {
    navigator.clipboard.writeText(url)
    message.success('链接已复制')
  }

  // 复制所有链接
  const handleCopyAll = () => {
    const links = videos.map(v => v.videoUrl).filter(Boolean).join('\n')
    if (links) {
      navigator.clipboard.writeText(links)
      message.success(`已复制 ${videos.filter(v => v.videoUrl).length} 个链接`)
    } else {
      message.warning('没有可复制的链接')
    }
  }

  // 刷新配置文件列表
  const handleRefreshProfiles = async () => {
    await checkChromeStatus()
    message.success('已刷新配置文件列表')
  }

  // 表格列定义
  const columns = [
    {
      title: '序号',
      key: 'index',
      width: 60,
      render: (_, __, index) => index + 1
    },
    {
      title: '视频ID',
      dataIndex: 'videoId',
      key: 'videoId',
      width: 180,
      ellipsis: true,
      render: (id) => (
        <Tooltip title={id}>
          <Text copyable={{ text: id }}>{id}</Text>
        </Tooltip>
      )
    },
    {
      title: '作者',
      dataIndex: 'authorName',
      key: 'authorName',
      width: 120,
      ellipsis: true,
      render: (name, record) => (
        <Tooltip title={`@${record.authorId || 'unknown'}`}>
          {name || '-'}
        </Tooltip>
      )
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (desc) => (
        <Tooltip title={desc}>
          <Paragraph ellipsis={{ rows: 1 }} style={{ marginBottom: 0 }}>
            {desc || '-'}
          </Paragraph>
        </Tooltip>
      )
    },
    {
      title: '互动数据',
      key: 'stats',
      width: 180,
      render: (_, record) => (
        <Space size="small">
          {record.likes && <Tag color="red">{record.likes} 赞</Tag>}
          {record.comments && <Tag color="blue">{record.comments} 评</Tag>}
          {record.shares && <Tag color="green">{record.shares} 转</Tag>}
        </Space>
      )
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_, record) => (
        <Space>
          {record.videoUrl && (
            <>
              <Tooltip title="复制链接">
                <Button
                  type="link"
                  size="small"
                  icon={<CopyOutlined />}
                  onClick={() => handleCopyLink(record.videoUrl)}
                />
              </Tooltip>
              <Tooltip title="打开链接">
                <Button
                  type="link"
                  size="small"
                  icon={<LinkOutlined />}
                  onClick={() => window.open(record.videoUrl, '_blank')}
                />
              </Tooltip>
            </>
          )}
        </Space>
      )
    }
  ]

  return (
    <div>
      <Title level={4}>抖音视频采集</Title>

      {/* Chrome 状态 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space split={<Divider type="vertical" />}>
          <span>
            Chrome 调试模式：
            {chromeStatus.debugMode ? (
              <Badge status="success" text={<Text type="success">已就绪</Text>} />
            ) : chromeStatus.running ? (
              <Badge status="warning" text={<Text type="warning">运行中（非调试模式）</Text>} />
            ) : (
              <Badge status="default" text="未启动" />
            )}
          </span>
          <span>
            连接状态：
            {browserStatus.browserRunning ? (
              <Badge status="success" text={<Text type="success">已连接</Text>} />
            ) : (
              <Badge status="default" text="未连接" />
            )}
          </span>
          <Button size="small" icon={<ReloadOutlined />} onClick={checkChromeStatus}>
            刷新状态
          </Button>
        </Space>
      </Card>

      {/* 操作指引 */}
      {!browserStatus.browserRunning && (
        <Alert
          message="使用说明"
          description={
            <div>
              <p style={{ marginBottom: 8 }}>
                <strong>步骤 1：</strong>选择您已登录抖音的 Chrome 配置文件
              </p>
              <p style={{ marginBottom: 8 }}>
                <strong>步骤 2：</strong>点击「启动调试模式」启动 Chrome（会自动打开您选择的配置文件，保留登录状态）
              </p>
              <p style={{ marginBottom: 8 }}>
                <strong>步骤 3：</strong>Chrome 启动后，点击「连接浏览器」建立控制连接
              </p>
              <p style={{ marginBottom: 0 }}>
                <strong>注意：</strong>如果您的 Chrome 正在运行，请先完全关闭它（包括后台进程），然后再启动调试模式
              </p>
            </div>
          }
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {chromeStatus.running && !chromeStatus.debugMode && (
        <Alert
          message="Chrome 正在运行（非调试模式）"
          description={
            <div>
              <p style={{ marginBottom: 8 }}>
                检测到 Chrome 正在以普通模式运行。要使用抖音采集功能，请先关闭所有 Chrome 窗口和后台进程，然后点击「启动调试模式」重新启动。
              </p>
              <Button
                danger
                size="small"
                onClick={async () => {
                  const result = await window.electron.douyin.killChrome()
                  if (result.success) {
                    message.success('已关闭 Chrome 进程，请稍后刷新状态')
                    setTimeout(() => checkChromeStatus(), 1500)
                  }
                }}
              >
                强制关闭所有 Chrome 进程
              </Button>
            </div>
          }
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {/* 配置文件选择 */}
      <Card title="选择 Chrome 配置文件" style={{ marginBottom: 16 }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Space>
            <Select
              style={{ width: 300 }}
              placeholder="选择 Chrome 配置文件"
              value={selectedProfile}
              onChange={setSelectedProfile}
              disabled={browserStatus.browserRunning}
              options={profiles.map(p => ({
                value: p.id,
                label: (
                  <Space>
                    <UserOutlined />
                    {p.name}
                    {p.gaiaName && <Text type="secondary">({p.gaiaName})</Text>}
                    {p.isDefault && <Tag color="blue" size="small">默认</Tag>}
                  </Space>
                )
              }))}
            />
            <Button
              icon={<ReloadOutlined />}
              onClick={handleRefreshProfiles}
              disabled={browserStatus.browserRunning}
            >
              刷新
            </Button>
          </Space>

          {profiles.length === 0 && (
            <Alert
              message="未找到 Chrome 配置文件"
              description="请确保已安装 Chrome 浏览器并至少使用过一次。"
              type="info"
              showIcon
            />
          )}
        </Space>
      </Card>

      {/* 控制面板 */}
      <Card title="控制面板" style={{ marginBottom: 16 }}>
        <Space wrap>
          {!browserStatus.browserRunning ? (
            <>
              {/* 步骤1：启动调试模式 */}
              <Button
                type={chromeStatus.debugMode ? 'default' : 'primary'}
                icon={<ChromeOutlined />}
                onClick={handleStartDebugMode}
                loading={startingDebugMode}
                disabled={!selectedProfile || chromeStatus.debugMode || browserStatus.browserRunning}
              >
                {chromeStatus.debugMode ? '调试模式已启动' : '启动调试模式'}
              </Button>

              {/* 步骤2：连接浏览器 */}
              <Button
                type={chromeStatus.debugMode ? 'primary' : 'default'}
                icon={<PlayCircleOutlined />}
                onClick={handleLaunch}
                loading={loading}
                disabled={!chromeStatus.debugMode}
              >
                连接浏览器
              </Button>
            </>
          ) : (
            <>
              <Button
                icon={<PlayCircleOutlined />}
                onClick={handleOpenDouyin}
                loading={loading}
              >
                打开抖音
              </Button>

              <Button.Group>
                <Button icon={<UpOutlined />} onClick={handleScrollPrev}>
                  上一个
                </Button>
                <Button icon={<DownOutlined />} onClick={handleScrollNext}>
                  下一个
                </Button>
              </Button.Group>

              <Button icon={<ReloadOutlined />} onClick={handleGetCurrent}>
                获取当前视频
              </Button>

              <Space.Compact>
                <InputNumber
                  min={1}
                  max={100}
                  value={collectCount}
                  onChange={setCollectCount}
                  style={{ width: 80 }}
                  disabled={browserStatus.isCollecting}
                />
                {!browserStatus.isCollecting ? (
                  <Button
                    type="primary"
                    onClick={handleCollect}
                    loading={loading}
                  >
                    自动采集
                  </Button>
                ) : (
                  <Button
                    danger
                    icon={<PauseCircleOutlined />}
                    onClick={handleStop}
                  >
                    停止
                  </Button>
                )}
              </Space.Compact>

              <Button
                danger
                icon={<CloseOutlined />}
                onClick={handleClose}
              >
                断开连接
              </Button>
            </>
          )}
        </Space>

        {/* 采集进度 */}
        {progress.total > 0 && (
          <div style={{ marginTop: 16 }}>
            <Progress
              percent={Math.round((progress.current / progress.total) * 100)}
              status="active"
              format={() => `${progress.current}/${progress.total}`}
            />
          </div>
        )}

        {/* 当前视频信息 */}
        {currentVideo && (
          <Card size="small" style={{ marginTop: 16 }} title="当前视频">
            <p><strong>视频ID:</strong> {currentVideo.videoId}</p>
            <p><strong>作者:</strong> {currentVideo.authorName} (@{currentVideo.authorId})</p>
            <p><strong>描述:</strong> {currentVideo.description}</p>
            {currentVideo.videoUrl && (
              <p>
                <strong>链接:</strong>{' '}
                <a href={currentVideo.videoUrl} target="_blank" rel="noreferrer">
                  {currentVideo.videoUrl}
                </a>
              </p>
            )}
          </Card>
        )}
      </Card>

      {/* 采集结果 */}
      <Card
        title={`采集结果 (${videos.length} 个视频)`}
        extra={
          <Space>
            <Button
              icon={<CopyOutlined />}
              onClick={handleCopyAll}
              disabled={videos.length === 0}
            >
              复制所有链接
            </Button>
            <Popconfirm
              title="确定要清空列表吗？"
              onConfirm={handleClear}
              okText="确定"
              cancelText="取消"
            >
              <Button
                danger
                icon={<DeleteOutlined />}
                disabled={videos.length === 0}
              >
                清空
              </Button>
            </Popconfirm>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={videos}
          rowKey="videoId"
          size="small"
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 个视频`
          }}
        />
      </Card>
    </div>
  )
}

export default DouyinPage
