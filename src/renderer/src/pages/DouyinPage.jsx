import React, { useState, useEffect, useRef } from 'react'
import {
  Card,
  Button,
  Table,
  Space,
  message,
  Typography,
  Tag,
  Tooltip,
  Popconfirm,
  Select,
  Badge,
  Divider
} from 'antd'
import {
  PauseCircleOutlined,
  ReloadOutlined,
  DeleteOutlined,
  ChromeOutlined,
  CloseOutlined,
  LinkOutlined,
  StarOutlined,
  ClockCircleOutlined
} from '@ant-design/icons'

const { Title, Text } = Typography

const DouyinPage = () => {
  const [browserStatus, setBrowserStatus] = useState({
    browserRunning: false,
    isCollecting: false,
    collectedCount: 0,
    currentBrowserId: null
  })
  const [accounts, setAccounts] = useState([])
  const [selectedAccount, setSelectedAccount] = useState(null)
  const [connectingBrowser, setConnectingBrowser] = useState(false)
  const [recommendedVideos, setRecommendedVideos] = useState([])
  const [isCollectingRecommended, setIsCollectingRecommended] = useState(false)
  const [recommendProgress, setRecommendProgress] = useState({ collected: 0, processed: 0, skipped: 0 })
  const [currentOperation, setCurrentOperation] = useState('') // 当前操作步骤
  const [historyVideos, setHistoryVideos] = useState([])
  const [historyTotal, setHistoryTotal] = useState(0)
  const [historyPage, setHistoryPage] = useState(1)
  const [historyPageSize, setHistoryPageSize] = useState(20)
  const [collectDuration, setCollectDuration] = useState(60) // 采集时长（分钟），默认60分钟
  const [remainingTime, setRemainingTime] = useState(0) // 剩余时间（秒）
  const [collectionError, setCollectionError] = useState('') // 采集错误信息
  const collectTimerRef = useRef(null) // 采集定时器
  const countdownRef = useRef(null) // 倒计时定时器

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
    } catch (error) {
      console.error('Failed to fetch status:', error)
    }
  }

  // 加载历史采集视频
  const loadHistoryVideos = async (page = 1, pageSize = 20) => {
    try {
      const result = await window.electron.douyin.getHistoryVideos({
        limit: pageSize,
        offset: (page - 1) * pageSize
      })
      if (result.success) {
        // 转换数据库字段名为前端字段名
        const videos = result.videos.map(v => ({
          id: v.id,
          authorName: v.author_name,
          publishTime: v.publish_time,
          likeCount: v.like_count,
          duration: v.duration,
          videoLink: v.video_link,
          shortLink: v.short_link,
          finalLink: v.final_link,
          favorited: v.favorited === 1,
          accountName: v.account_name,
          collectedAt: v.collected_at
        }))
        setHistoryVideos(videos)
        setHistoryTotal(result.total)
      }
    } catch (error) {
      console.error('Failed to load history videos:', error)
    }
  }

  // 监听推荐视频采集进度
  useEffect(() => {
    window.electron.douyin.onRecommendProgress((data) => {
      setRecommendProgress({
        collected: data.current || 0,
        processed: data.processed || 0,
        skipped: data.skipped || 0
      })
      // 更新当前操作步骤
      if (data.operation) {
        setCurrentOperation(data.operation)
      }
      if (data.type === 'collected' && data.video) {
        setRecommendedVideos(prev => [...prev, data.video])
        // 同时添加到历史记录表格中实时显示
        const newVideo = {
          id: `new_${Date.now()}`,
          authorName: data.video.authorName,
          publishTime: data.video.publishTime,
          likeCount: data.video.likeCount,
          duration: data.video.duration,
          videoLink: data.video.videoLink,
          shortLink: data.video.shortLink,
          finalLink: data.video.finalLink,
          favorited: data.video.favorited,
          collectedAt: data.video.collectedAt
        }
        setHistoryVideos(prev => [newVideo, ...prev])
        setHistoryTotal(prev => prev + 1)
        setCurrentOperation('✅ 采集完成，滑动到下一个视频...')
      } else if (data.type === 'skipped') {
        setCurrentOperation(`⏭️ 跳过: ${data.reason || '不符合条件'}`)
      }
    })

    // 初始化
    loadAccounts()
    fetchStatus()
    loadHistoryVideos()

    return () => {
      window.electron.douyin.removeListener('douyin:recommend-progress')
      // 清理定时器
      if (collectTimerRef.current) clearTimeout(collectTimerRef.current)
      if (countdownRef.current) clearInterval(countdownRef.current)
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

  // 清理定时器
  const clearTimers = () => {
    if (collectTimerRef.current) {
      clearTimeout(collectTimerRef.current)
      collectTimerRef.current = null
    }
    if (countdownRef.current) {
      clearInterval(countdownRef.current)
      countdownRef.current = null
    }
    setRemainingTime(0)
  }

  // 开始连续采集推荐视频
  const handleCollectRecommended = async () => {
    setIsCollectingRecommended(true)
    setRecommendProgress({ collected: 0, processed: 0, skipped: 0 })
    setRecommendedVideos([])
    setCurrentOperation('🚀 开始采集...')
    setCollectionError('') // 清空之前的错误

    // 设置定时停止
    const durationMs = collectDuration * 60 * 1000
    setRemainingTime(collectDuration * 60)

    // 倒计时显示
    countdownRef.current = setInterval(() => {
      setRemainingTime(prev => {
        if (prev <= 1) {
          return 0
        }
        return prev - 1
      })
    }, 1000)

    // 定时停止采集
    collectTimerRef.current = setTimeout(async () => {
      console.log('[DouyinPage] Auto stopping collection after', collectDuration, 'minutes')
      message.info(`采集时间已到 ${collectDuration} 分钟，自动停止`)
      await window.electron.douyin.stop()
    }, durationMs)

    try {
      const result = await window.electron.douyin.collectRecommended({ maxCount: 0 }) // 0表示无限制
      if (result.success) {
        message.success(`采集完成！收集: ${result.collected}, 处理: ${result.processed}, 跳过: ${result.skipped}`)
        setRecommendedVideos(result.videos)
        setCollectionError('') // 成功时清空错误
      } else {
        message.warning(result.error || '采集中断')
        if (result.videos) {
          setRecommendedVideos(result.videos)
        }
        // 设置错误信息显示在按钮下方
        if (result.error) {
          setCollectionError(result.error)
        }
      }
    } catch (error) {
      message.error('采集失败: ' + error.message)
      setCollectionError(error.message)
    } finally {
      clearTimers()
      setIsCollectingRecommended(false)
      setCurrentOperation('')
      await fetchStatus()
      // 刷新历史记录
      loadHistoryVideos(1, historyPageSize)
      setHistoryPage(1)
    }
  }

  // 停止推荐视频采集
  const handleStopRecommended = async () => {
    try {
      clearTimers()
      await window.electron.douyin.stop()
      message.info('采集已停止')
      setIsCollectingRecommended(false)
      setCurrentOperation('')
      await fetchStatus()
      // 刷新历史记录
      loadHistoryVideos(1, historyPageSize)
      setHistoryPage(1)
    } catch (error) {
      message.error('停止失败: ' + error.message)
    }
  }

  // 清空推荐视频列表（清空数据库历史）
  const handleClearRecommended = async () => {
    try {
      await window.electron.douyin.clearAllVideos()
      setRecommendedVideos([])
      setHistoryVideos([])
      setHistoryTotal(0)
      setRecommendProgress({ collected: 0, processed: 0, skipped: 0 })
      message.success('已清空所有历史数据')
    } catch (error) {
      message.error('清空失败: ' + error.message)
    }
  }

  // 处理分页变化
  const handlePageChange = (page, pageSize) => {
    setHistoryPage(page)
    setHistoryPageSize(pageSize)
    loadHistoryVideos(page, pageSize)
  }

  // 推荐视频表格列定义
  const recommendedColumns = [
    {
      title: '序号',
      key: 'index',
      width: 60,
      // 倒序显示：最新的在最上面，序号最大
      render: (_, __, index) => historyTotal - ((historyPage - 1) * historyPageSize) - index
    },
    {
      title: '博主名称',
      dataIndex: 'authorName',
      key: 'authorName',
      width: 150,
      ellipsis: true,
      render: (name) => (
        <Tooltip title={name}>
          <Text>{name || '-'}</Text>
        </Tooltip>
      )
    },
    {
      title: '发布时间',
      dataIndex: 'publishTime',
      key: 'publishTime',
      width: 100,
      render: (time) => <Tag color="blue">{time || '-'}</Tag>
    },
    {
      title: '点赞数',
      dataIndex: 'likeCount',
      key: 'likeCount',
      width: 100,
      render: (count) => <Tag color="red">{count || '-'}</Tag>
    },
    {
      title: '时长',
      dataIndex: 'duration',
      key: 'duration',
      width: 80,
      render: (duration) => <Tag color="green">{duration || '-'}</Tag>
    },
    {
      title: '已收藏',
      dataIndex: 'favorited',
      key: 'favorited',
      width: 80,
      render: (favorited) => (
        favorited ? <Tag color="gold"><StarOutlined /> 是</Tag> : <Tag>否</Tag>
      )
    },
    {
      title: '最终链接',
      dataIndex: 'finalLink',
      key: 'finalLink',
      width: 200,
      ellipsis: true,
      render: (link) => (
        link ? (
          <Space size="small">
            <Text copyable={{ text: link }} style={{ fontSize: 11 }}>
              {link.includes('/video/') ? link.split('/video/')[1]?.slice(0, 15) + '...' : link.slice(0, 20)}
            </Text>
            <Button
              type="link"
              size="small"
              icon={<LinkOutlined />}
              onClick={() => window.electron.shell.openExternal(link)}
              style={{ padding: 0 }}
            />
          </Space>
        ) : <Text type="secondary">-</Text>
      )
    },
    {
      title: '采集时间',
      dataIndex: 'collectedAt',
      key: 'collectedAt',
      width: 140,
      render: (time) => {
        if (!time) return <Text type="secondary">-</Text>
        const d = new Date(time)
        const month = String(d.getMonth() + 1).padStart(2, '0')
        const day = String(d.getDate()).padStart(2, '0')
        const hours = String(d.getHours()).padStart(2, '0')
        const minutes = String(d.getMinutes()).padStart(2, '0')
        const seconds = String(d.getSeconds()).padStart(2, '0')
        return (
          <Text type="secondary" style={{ fontSize: 11 }}>
            {`${month}-${day} ${hours}:${minutes}:${seconds}`}
          </Text>
        )
      }
    }
  ]

  return (
    <div>
      <Title level={4}>抖音视频采集</Title>

      {/* 操作栏 - 合并为一行 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Space wrap style={{ width: '100%', justifyContent: 'space-between' }}>
          <Space wrap>
            {/* 浏览器状态 */}
            {browserStatus.browserRunning ? (
              <Badge status="success" text={<Text type="success">已连接</Text>} />
            ) : (
              <Badge status="default" text="未连接" />
            )}

            <Divider type="vertical" />

            {/* 账号选择 */}
            <Select
              style={{ width: 180 }}
              placeholder="选择采集账号"
              value={selectedAccount}
              onChange={setSelectedAccount}
              disabled={browserStatus.browserRunning}
              options={accounts.map(a => ({
                value: a.bit_browser_id,
                label: a.name
              }))}
            />

            {/* 启动/断开按钮 */}
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
              <Button
                danger
                icon={<CloseOutlined />}
                onClick={handleClose}
              >
                断开连接
              </Button>
            )}

            {/* 采集按钮 - 连接后显示 */}
            {browserStatus.browserRunning && (
              <>
                <Divider type="vertical" />
                {!isCollectingRecommended ? (
                  <>
                    <Select
                      style={{ width: 110 }}
                      value={collectDuration}
                      onChange={setCollectDuration}
                      options={[
                        { value: 10, label: '10分钟' },
                        { value: 30, label: '30分钟' },
                        { value: 60, label: '60分钟' },
                        { value: 120, label: '120分钟' },
                        { value: 300, label: '300分钟' }
                      ]}
                    />
                    <Button
                      type="primary"
                      icon={<StarOutlined />}
                      onClick={handleCollectRecommended}
                    >
                      开始采集
                    </Button>
                  </>
                ) : (
                  <>
                    {remainingTime > 0 && (
                      <Tag color="blue" icon={<ClockCircleOutlined />}>
                        剩余 {Math.floor(remainingTime / 60)}:{String(remainingTime % 60).padStart(2, '0')}
                      </Tag>
                    )}
                    <Button
                      danger
                      icon={<PauseCircleOutlined />}
                      onClick={handleStopRecommended}
                    >
                      停止采集
                    </Button>
                  </>
                )}
              </>
            )}
          </Space>

          {/* 右侧刷新按钮 */}
          <Button size="small" icon={<ReloadOutlined />} onClick={() => { fetchStatus(); loadAccounts(); }}>
            刷新
          </Button>
        </Space>

        {/* 进度和操作步骤 - 采集时显示 */}
        {browserStatus.browserRunning && (
          <div style={{ marginTop: 12, display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
            <Space size="middle">
              <span>已刷: <Text strong>{recommendProgress.processed}</Text></span>
              <span>已采集: <Text strong type="success">{recommendProgress.collected}</Text></span>
              <span>已跳过: <Text strong type="warning">{recommendProgress.skipped}</Text></span>
            </Space>
            {isCollectingRecommended && currentOperation && (
              <Text type="secondary" style={{ fontSize: 12 }}>| {currentOperation}</Text>
            )}
          </div>
        )}

        {/* 错误信息显示 */}
        {collectionError && (
          <div style={{
            marginTop: 12,
            padding: '8px 12px',
            backgroundColor: '#fff2f0',
            border: '1px solid #ffccc7',
            borderRadius: 4
          }}>
            <Text type="danger" style={{ fontSize: 13 }}>
              ❌ 采集错误: {collectionError}
            </Text>
          </div>
        )}
      </Card>

      {/* 采集结果表格 */}
      <Card
          title={
            <Space>
              <StarOutlined style={{ color: '#ff4d4f' }} />
              {`采集历史记录 (共 ${historyTotal} 个视频${recommendedVideos.length > 0 ? `，本次新增 ${recommendedVideos.length} 个` : ''})`}
            </Space>
          }
          extra={
            <Space>
              <Button
                size="small"
                icon={<ReloadOutlined />}
                onClick={() => loadHistoryVideos(historyPage, historyPageSize)}
              >
                刷新
              </Button>
              <Popconfirm
                title="确定要清空所有历史数据吗？"
                onConfirm={handleClearRecommended}
                okText="确定"
                cancelText="取消"
              >
                <Button
                  danger
                  icon={<DeleteOutlined />}
                  disabled={historyTotal === 0}
                >
                  清空历史
                </Button>
              </Popconfirm>
            </Space>
          }
        >
          <Table
            columns={recommendedColumns}
            dataSource={historyVideos}
            rowKey={(record) => record.id || `${record.authorName}_${record.collectedAt}`}
            size="small"
            pagination={{
              current: historyPage,
              pageSize: historyPageSize,
              total: historyTotal,
              showSizeChanger: true,
              showQuickJumper: true,
              showTotal: (total) => `共 ${total} 个视频`,
              onChange: handlePageChange
            }}
          />
        </Card>
    </div>
  )
}

export default DouyinPage
