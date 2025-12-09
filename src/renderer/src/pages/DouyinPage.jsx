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
  UserOutlined,
  CloudDownloadOutlined,
  HeartOutlined,
  MessageOutlined,
  ShareAltOutlined,
  StarOutlined
} from '@ant-design/icons'

const { Title, Text, Paragraph } = Typography

const DouyinPage = () => {
  const [browserStatus, setBrowserStatus] = useState({
    browserRunning: false,
    isCollecting: false,
    collectedCount: 0,
    currentBrowserId: null
  })
  const [accounts, setAccounts] = useState([])
  const [selectedAccount, setSelectedAccount] = useState(null)
  const [videos, setVideos] = useState([])
  const [loading, setLoading] = useState(false)
  const [connectingBrowser, setConnectingBrowser] = useState(false)
  const [collectCount, setCollectCount] = useState(10)
  const [progress, setProgress] = useState({ current: 0, total: 0 })
  const [currentVideo, setCurrentVideo] = useState(null)
  const [pageData, setPageData] = useState([])
  const [fetchingPageData, setFetchingPageData] = useState(false)

  // 加载采集账号列表
  const loadAccounts = async () => {
    try {
      const data = await window.electron.collectAccount.list('douyin')
      setAccounts(data)
      // 默认选择第一个账号
      if (data.length > 0 && !selectedAccount) {
        setSelectedAccount(data[0].bit_browser_id)
      }
    } catch (error) {
      console.error('Failed to load accounts:', error)
      message.error('加载采集账号失败')
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

    // 初始化
    loadAccounts()
    fetchStatus()

    return () => {
      window.electron.douyin.removeListener('douyin:progress')
    }
  }, [])

  // 连接到比特浏览器
  const handleLaunch = async () => {
    if (!selectedAccount) {
      message.warning('请先选择一个采集账号')
      return
    }

    console.log('[DouyinPage] Launching BitBrowser:', selectedAccount)
    setConnectingBrowser(true)

    try {
      const result = await window.electron.douyin.launch(selectedAccount)
      console.log('[DouyinPage] Launch result:', result)

      if (result.success) {
        message.success(result.message)
        await fetchStatus()
      } else {
        message.error(result.error || '启动浏览器失败')
      }
    } catch (error) {
      console.error('[DouyinPage] Launch error:', error)
      message.error('启动浏览器失败: ' + error.message)
    } finally {
      setConnectingBrowser(false)
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
        currentBrowserId: null
      })
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

  // 刷新账号列表
  const handleRefreshAccounts = async () => {
    await loadAccounts()
    message.success('已刷新账号列表')
  }

  // 获取页面数据
  const handleGetPageData = async () => {
    setFetchingPageData(true)
    try {
      const result = await window.electron.douyin.getPageData()
      if (result.success) {
        setPageData(result.videos)
        message.success(`成功获取 ${result.count} 条视频数据`)
      } else {
        message.error(result.error || '获取数据失败')
      }
    } catch (error) {
      message.error('获取页面数据失败: ' + error.message)
    } finally {
      setFetchingPageData(false)
    }
  }

  // 格式化数字
  const formatNumber = (num) => {
    if (!num) return '0'
    if (num >= 10000) {
      return (num / 10000).toFixed(1) + 'w'
    }
    return num.toString()
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

      {/* 连接状态 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space split={<Divider type="vertical" />}>
          <span>
            浏览器状态：
            {browserStatus.browserRunning ? (
              <Badge status="success" text={<Text type="success">已连接</Text>} />
            ) : (
              <Badge status="default" text="未连接" />
            )}
          </span>
          {browserStatus.browserRunning && browserStatus.currentBrowserId && (
            <span>
              <Text type="secondary">浏览器ID: {browserStatus.currentBrowserId.slice(0, 8)}...</Text>
            </span>
          )}
          <Button size="small" icon={<ReloadOutlined />} onClick={fetchStatus}>
            刷新状态
          </Button>
        </Space>
      </Card>

      {/* 账号选择 */}
      <Card title="选择采集账号" style={{ marginBottom: 16 }}>
        <Space direction="vertical" style={{ width: '100%' }}>
          <Space>
            <Select
              style={{ width: 300 }}
              placeholder="选择采集账号"
              value={selectedAccount}
              onChange={setSelectedAccount}
              disabled={browserStatus.browserRunning}
              options={accounts.map(a => ({
                value: a.bit_browser_id,
                label: (
                  <Space>
                    <UserOutlined />
                    {a.name}
                    {a.remark && <Text type="secondary">({a.remark})</Text>}
                  </Space>
                )
              }))}
            />
            <Button
              icon={<ReloadOutlined />}
              onClick={handleRefreshAccounts}
              disabled={browserStatus.browserRunning}
            >
              刷新
            </Button>
          </Space>

          {accounts.length === 0 && (
            <Alert
              message="未找到采集账号"
              description="请先在「采集账号管理」页面添加比特浏览器账号。"
              type="warning"
              showIcon
            />
          )}
        </Space>
      </Card>

      {/* 控制面板 */}
      <Card title="控制面板" style={{ marginBottom: 16 }}>
        <Space wrap>
          {!browserStatus.browserRunning ? (
            <Button
              type="primary"
              icon={<ChromeOutlined />}
              onClick={handleLaunch}
              loading={connectingBrowser}
              disabled={!selectedAccount}
            >
              启动浏览器
            </Button>
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

              <Button
                icon={<CloudDownloadOutlined />}
                onClick={handleGetPageData}
                loading={fetchingPageData}
              >
                抓取页面数据
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

      {/* 页面数据展示 */}
      {pageData.length > 0 && (
        <Card
          title={`页面数据 (${pageData.length} 条)`}
          style={{ marginTop: 16 }}
          extra={
            <Button
              icon={<DeleteOutlined />}
              size="small"
              onClick={() => setPageData([])}
            >
              清空
            </Button>
          }
        >
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
            {pageData.map((item, index) => (
              <Card
                key={item.awemeId || index}
                size="small"
                style={{ width: 320 }}
                cover={
                  item.video?.cover ? (
                    <img
                      alt="cover"
                      src={item.video.cover}
                      style={{ height: 180, objectFit: 'cover' }}
                    />
                  ) : null
                }
              >
                <Card.Meta
                  avatar={
                    item.author?.avatarThumb ? (
                      <img
                        src={item.author.avatarThumb}
                        alt="avatar"
                        style={{ width: 40, height: 40, borderRadius: '50%' }}
                      />
                    ) : (
                      <UserOutlined style={{ fontSize: 24 }} />
                    )
                  }
                  title={
                    <Tooltip title={item.author?.nickname}>
                      <Text ellipsis style={{ maxWidth: 200 }}>
                        {item.author?.nickname || '未知作者'}
                      </Text>
                    </Tooltip>
                  }
                  description={
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      粉丝: {formatNumber(item.author?.followerCount)}
                    </Text>
                  }
                />

                <Tooltip title={item.desc}>
                  <Paragraph
                    ellipsis={{ rows: 2 }}
                    style={{ marginTop: 12, marginBottom: 8, minHeight: 44 }}
                  >
                    {item.desc || '无描述'}
                  </Paragraph>
                </Tooltip>

                <div style={{ display: 'flex', justifyContent: 'space-between', color: '#999', fontSize: 12 }}>
                  <span><HeartOutlined /> {formatNumber(item.statistics?.diggCount)}</span>
                  <span><MessageOutlined /> {formatNumber(item.statistics?.commentCount)}</span>
                  <span><StarOutlined /> {formatNumber(item.statistics?.collectCount)}</span>
                  <span><ShareAltOutlined /> {formatNumber(item.statistics?.shareCount)}</span>
                </div>

                {item.textExtra?.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    {item.textExtra.slice(0, 3).map((tag, i) => (
                      <Tag key={i} color="blue" style={{ fontSize: 10 }}>
                        #{tag.hashtagName}
                      </Tag>
                    ))}
                  </div>
                )}

                <div style={{ marginTop: 8, fontSize: 11, color: '#999' }}>
                  <Text copyable={{ text: item.awemeId }} style={{ fontSize: 11 }}>
                    ID: {item.awemeId?.slice(0, 12)}...
                  </Text>
                </div>
              </Card>
            ))}
          </div>
        </Card>
      )}
    </div>
  )
}

export default DouyinPage
