import React, { useState, useEffect, useRef } from 'react'
import { Typography, Card, Button, Space, Table, Tag, message, Select, Spin, Statistic, Row, Col } from 'antd'
import {
  PlayCircleOutlined,
  PauseCircleOutlined,
  YoutubeOutlined,
  LinkOutlined,
  DisconnectOutlined,
  RocketOutlined,
  DeleteOutlined,
  ClockCircleOutlined,
  SyncOutlined,
  CloudDownloadOutlined,
  CloudUploadOutlined
} from '@ant-design/icons'

const { Title, Text } = Typography

// 时间选项（分钟，0表示无限）
const DURATION_OPTIONS = [
  { label: '无限', value: 0 },
  { label: '30分钟', value: 30 },
  { label: '1小时', value: 60 },
  { label: '2小时', value: 120 },
  { label: '5小时', value: 300 },
  { label: '10小时', value: 600 }
]

const YouTubeCollectPage = () => {
  const [browsers, setBrowsers] = useState([])
  const [selectedBrowser, setSelectedBrowser] = useState(null)
  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isCollecting, setIsCollecting] = useState(false)
  const [collectedVideos, setCollectedVideos] = useState([])
  const [currentOperation, setCurrentOperation] = useState('')
  const [loadingBrowsers, setLoadingBrowsers] = useState(false)
  const [duration, setDuration] = useState(0) // 默认无限

  // 采集统计
  const [stats, setStats] = useState({
    collectedCount: 0,
    skippedCount: 0,
    adCount: 0,
    followedCount: 0,
    duplicateCount: 0,
    oldVideoCount: 0,
    watchedCount: 0, // 观看了分组内频道的视频
    skippedNotInGroupCount: 0 // 跳过了数据库中但不在分组内的频道
  })

  // 计时相关
  const [elapsedTime, setElapsedTime] = useState(0) // 已运行时间（秒）
  const [startTime, setStartTime] = useState(null)
  const timerRef = useRef(null)

  // 同步相关
  const [isSyncing, setIsSyncing] = useState(false)
  const [syncStatus, setSyncStatus] = useState({ groupCount: 0, channelCount: 0, lastSynced: null })

  // 上传到Supabase相关
  const [isSyncingToSupabase, setIsSyncingToSupabase] = useState(false)

  // 频道分组相关
  const [channelGroups, setChannelGroups] = useState([])
  const [selectedGroup, setSelectedGroup] = useState(null) // null 表示不使用分组过滤

  // 加载采集账号列表（从账号管理中添加的账号）
  const loadBrowsers = async () => {
    setLoadingBrowsers(true)
    try {
      const data = await window.electron.collectAccount.list('youtube')
      setBrowsers(data || [])
      // 默认选中第一个账号
      if (data && data.length > 0 && !selectedBrowser) {
        setSelectedBrowser(data[0].bit_browser_id)
      }
      if (!data || data.length === 0) {
        message.info('请先在"采集账号管理"中添加YouTube采集账号')
      }
    } catch (error) {
      console.error('加载采集账号失败:', error)
      message.error('加载采集账号失败')
    } finally {
      setLoadingBrowsers(false)
    }
  }

  // 加载已保存的视频
  const loadSavedVideos = async () => {
    try {
      const result = await window.electron.youtubeCollect.getSavedVideos({ limit: 10000 })
      if (result.success) {
        setCollectedVideos(result.videos || [])
      }
    } catch (error) {
      console.error('加载已保存视频失败:', error)
    }
  }

  // 获取状态
  const getStatus = async () => {
    try {
      const status = await window.electron.youtubeCollect.getStatus()
      setIsConnected(status.browserRunning)
      setIsCollecting(status.isCollecting)
    } catch (error) {
      console.error('获取状态失败:', error)
    }
  }

  // 加载同步状态
  const loadSyncStatus = async () => {
    try {
      const result = await window.electron.youtubeCollect.getBenchmarkSyncStatus()
      if (result.success) {
        setSyncStatus({
          groupCount: result.groupCount || 0,
          channelCount: result.channelCount || 0,
          lastSynced: result.lastSynced
        })
      }
    } catch (error) {
      console.error('加载同步状态失败:', error)
    }
  }

  // 加载频道分组
  const loadChannelGroups = async () => {
    try {
      const result = await window.electron.youtubeCollect.getLocalBenchmarkGroups()
      if (result.success && result.groups) {
        setChannelGroups(result.groups)
      }
    } catch (error) {
      console.error('加载频道分组失败:', error)
    }
  }

  // 同步对标频道数据
  const handleSyncFromSupabase = async () => {
    setIsSyncing(true)
    try {
      const result = await window.electron.youtubeCollect.syncBenchmarkFromSupabase()
      if (result.success) {
        message.success(result.message || '同步成功')
        loadSyncStatus()
        loadChannelGroups() // 同步后重新加载分组
      } else {
        message.error(result.error || '同步失败')
      }
    } catch (error) {
      console.error('同步失败:', error)
      message.error('同步失败: ' + error.message)
    } finally {
      setIsSyncing(false)
    }
  }

  // 同步本地采集视频到Supabase
  const handleSyncToSupabase = async () => {
    if (collectedVideos.length === 0) {
      message.warning('本地没有采集的视频')
      return
    }

    setIsSyncingToSupabase(true)
    try {
      const result = await window.electron.youtubeCollect.syncToSupabase()
      if (result.success) {
        message.success(result.message || `同步完成：${result.synced} 个新视频，${result.skipped} 个已存在`)
      } else {
        message.error(result.error || '同步失败')
      }
    } catch (error) {
      console.error('同步到Supabase失败:', error)
      message.error('同步失败: ' + error.message)
    } finally {
      setIsSyncingToSupabase(false)
    }
  }

  useEffect(() => {
    loadBrowsers()
    getStatus()
    loadSavedVideos()
    loadSyncStatus()
    loadChannelGroups()

    // 监听自动采集进度
    window.electron.youtubeCollect.onAutoProgress((data) => {
      if (data.stats) {
        setStats(data.stats)
      }
      if (data.type === 'collected' && data.video) {
        setCollectedVideos(prev => {
          const exists = prev.some(v => v.video_id === data.video.videoId)
          if (!exists) {
            // 转换为数据库格式
            return [{
              id: Date.now(),
              video_id: data.video.videoId,
              video_url: data.video.videoUrl,
              title: data.video.title,
              channel_handle: data.video.channelHandle,
              channel_name: data.video.channelName,
              view_count: data.video.viewCount,
              publish_date: data.video.publishDate,
              video_duration: data.video.videoDuration,
              collected_at: data.video.collectedAt
            }, ...prev]
          }
          return prev
        })
      }
      // 更新操作状态
      if (data.type === 'skipped') {
        const reasons = {
          ad: '⏭️ 广告 → 立即划走',
          followed: '⏭️ 已关注频道 → 划走',
          duplicate: '⏭️ 已采集过 → 划走',
          old: '⏭️ 旧视频(>4月) → 划走',
          not_in_group: `⏭️ 已在数据库(非分组) @${data.video?.channelHandle} → 立即划走`
        }
        setCurrentOperation(reasons[data.reason] || '处理中...')
      } else if (data.type === 'watching') {
        setCurrentOperation(`👀 已在分组 @${data.video?.channelHandle} → 观看 ${data.watchTime}秒`)
      } else if (data.type === 'waiting') {
        const waitSec = Math.round((data.waitTime || 0) / 1000)
        setCurrentOperation(`⏳ 未在数据库 @${data.video?.channelHandle} → 等待 ${waitSec}秒`)
      } else if (data.type === 'collected') {
        setCurrentOperation(`✅ 已采集: ${data.video?.title?.slice(0, 30)}...`)
      }
    })

    // 定时轮询状态，保持同步（每3秒）
    const statusInterval = setInterval(() => {
      getStatus()
    }, 3000)

    return () => {
      window.electron.youtubeCollect.removeListener('youtube-collect:auto-progress')
      clearInterval(statusInterval)
    }
  }, [])

  // 连接浏览器
  const handleConnect = async () => {
    if (!selectedBrowser) {
      message.warning('请先选择浏览器')
      return
    }

    setIsConnecting(true)
    setCurrentOperation('正在连接浏览器...')

    try {
      const result = await window.electron.youtubeCollect.launchBrowser(selectedBrowser)
      if (result.success) {
        message.success(result.message || '浏览器连接成功')
        setIsConnected(true)
      } else {
        message.error(result.error || '连接失败')
      }
    } catch (error) {
      message.error('连接失败: ' + error.message)
    } finally {
      setIsConnecting(false)
      setCurrentOperation('')
    }
  }

  // 断开连接
  const handleDisconnect = async () => {
    try {
      const result = await window.electron.youtubeCollect.closeBrowser()
      if (result.success) {
        message.success('已断开连接')
        setIsConnected(false)
      }
    } catch (error) {
      message.error('断开失败: ' + error.message)
    }
  }

  // 格式化时间显示
  const formatTime = (seconds) => {
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const secs = seconds % 60
    if (hours > 0) {
      return `${hours}小时${minutes}分${secs}秒`
    } else if (minutes > 0) {
      return `${minutes}分${secs}秒`
    }
    return `${secs}秒`
  }

  // 开始计时器
  const startTimer = () => {
    setStartTime(Date.now())
    setElapsedTime(0)
    timerRef.current = setInterval(() => {
      setElapsedTime(prev => prev + 1)
    }, 1000)
  }

  // 停止计时器
  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  // 开始自动采集
  const handleStartAutoCollect = async () => {
    if (!isConnected) {
      message.warning('请先连接浏览器')
      return
    }

    setIsCollecting(true)
    setStats({ collectedCount: 0, skippedCount: 0, adCount: 0, followedCount: 0, duplicateCount: 0, oldVideoCount: 0, watchedCount: 0, skippedNotInGroupCount: 0 })
    setCurrentOperation('正在自动采集...')
    startTimer()

    try {
      const result = await window.electron.youtubeCollect.startAutoCollect({
        duration,
        groupName: selectedGroup // 传递选中的分组名称
      })
      if (result.success) {
        message.success(`采集完成！已采集 ${result.collected} 个视频，运行时间 ${formatTime(result.elapsedSeconds || 0)}`)
        // 重新加载已保存的视频
        loadSavedVideos()
      } else {
        message.error(result.error || '采集失败')
      }
    } catch (error) {
      message.error('采集失败: ' + error.message)
    } finally {
      setIsCollecting(false)
      setCurrentOperation('')
      stopTimer()
    }
  }

  // 停止采集
  const handleStopCollect = async () => {
    try {
      await window.electron.youtubeCollect.stopAutoCollect()
      setIsCollecting(false)
      setCurrentOperation('')
      stopTimer()
      message.info('采集已停止')
      // 重新加载已保存的视频
      loadSavedVideos()
    } catch (error) {
      message.error('停止失败: ' + error.message)
    }
  }

  // 清理计时器
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
      }
    }
  }, [])

  // 清空数据库中的视频
  const handleClearSaved = async () => {
    try {
      await window.electron.youtubeCollect.clearSavedVideos()
      setCollectedVideos([])
      message.success('已清空所有采集记录')
    } catch (error) {
      message.error('清空失败: ' + error.message)
    }
  }

  // 删除单个视频
  const handleDeleteVideo = async (id) => {
    try {
      await window.electron.youtubeCollect.deleteSavedVideo(id)
      setCollectedVideos(prev => prev.filter(v => v.id !== id))
      message.success('已删除')
    } catch (error) {
      message.error('删除失败: ' + error.message)
    }
  }

  // 表格列定义
  // 数据已按 collected_at DESC 排序（最新的在前面）
  // 序号显示：最新的序号最大（如第一行显示总数，最后一行显示1）
  const columns = [
    {
      title: '序号',
      key: 'index',
      width: 50,
      render: (_, __, index) => collectedVideos.length - index
    },
    {
      title: '视频标题',
      dataIndex: 'title',
      key: 'title',
      width: 250,
      ellipsis: true,
      render: (title) => <Text style={{ fontSize: 12 }}>{title || '-'}</Text>
    },
    {
      title: '频道',
      dataIndex: 'channel_handle',
      key: 'channel_handle',
      width: 130,
      ellipsis: true,
      render: (handle) => <Text style={{ fontSize: 12 }}>{handle ? `@${handle}` : '-'}</Text>
    },
    {
      title: '观看次数',
      dataIndex: 'view_count',
      key: 'view_count',
      width: 100,
      render: (count) => {
        if (!count) return <Tag color="blue">-</Tag>
        // 解析数字（去掉逗号等）
        const numStr = String(count).replace(/,/g, '')
        const num = parseInt(numStr, 10)
        if (isNaN(num)) return <Tag color="blue">{count}</Tag>
        // 超过1万显示为 xx万
        if (num >= 10000) {
          const wan = (num / 10000).toFixed(1).replace(/\.0$/, '')
          return <Tag color="blue">{wan}万</Tag>
        }
        return <Tag color="blue">{num.toLocaleString()}</Tag>
      }
    },
    {
      title: '时长',
      dataIndex: 'video_duration',
      key: 'video_duration',
      width: 70,
      align: 'center',
      render: (duration) => <Tag color="purple">{duration || '-'}</Tag>
    },
    {
      title: '发布时间',
      dataIndex: 'publish_date',
      key: 'publish_date',
      width: 100,
      render: (time) => <Tag color="green">{time || '-'}</Tag>
    },
    {
      title: '链接',
      dataIndex: 'video_url',
      key: 'video_url',
      width: 60,
      align: 'center',
      render: (link) => (
        link ? (
          <Button
            type="primary"
            size="small"
            icon={<LinkOutlined />}
            onClick={() => window.electron.shell.openExternal(link)}
          />
        ) : <Text type="secondary">-</Text>
      )
    },
    {
      title: '采集时间',
      dataIndex: 'collected_at',
      key: 'collected_at',
      width: 140,
      render: (time) => time ? new Date(time).toLocaleString() : '-'
    },
    {
      title: '操作',
      key: 'action',
      width: 60,
      render: (_, record) => (
        <Button
          type="link"
          size="small"
          danger
          icon={<DeleteOutlined />}
          onClick={() => handleDeleteVideo(record.id)}
        />
      )
    }
  ]

  return (
    <div style={{ padding: 24 }}>
      <Title level={3}>
        <YoutubeOutlined style={{ marginRight: 8, color: '#ff0000' }} />
        YouTube视频采集
      </Title>

      <Card size="small" style={{ marginBottom: 16 }}>
        <Space size="middle" wrap align="center">
          {isConnected ?
            <Tag color="green">已连接</Tag> :
            <Tag color="default">未连接</Tag>
          }
          <Select
            style={{ width: 200 }}
            placeholder="选择采集账号"
            value={selectedBrowser}
            onChange={setSelectedBrowser}
            loading={loadingBrowsers}
            options={browsers.map(b => ({
              label: b.name,
              value: b.bit_browser_id
            }))}
          />
          {!isConnected ? (
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={handleConnect}
              loading={isConnecting}
              disabled={!selectedBrowser}
            >
              连接
            </Button>
          ) : (
            <Button
              danger
              icon={<DisconnectOutlined />}
              onClick={handleDisconnect}
            >
              断开
            </Button>
          )}
          {currentOperation && (
            <Text type="secondary">
              <Spin size="small" style={{ marginRight: 4 }} />
              {currentOperation}
            </Text>
          )}
          <Button
            icon={<CloudDownloadOutlined />}
            onClick={handleSyncFromSupabase}
            loading={isSyncing}
            title={syncStatus.lastSynced ? `上次同步: ${new Date(syncStatus.lastSynced).toLocaleString()}\n分组: ${syncStatus.groupCount}, 频道: ${syncStatus.channelCount}` : '从Supabase同步对标频道数据'}
          >
            同步Supabase {syncStatus.channelCount > 0 && `(${syncStatus.channelCount})`}
          </Button>
          <Button
            icon={<CloudUploadOutlined />}
            onClick={handleSyncToSupabase}
            loading={isSyncingToSupabase}
            disabled={collectedVideos.length === 0}
            title="将本地采集的视频上传到Supabase（已存在的视频会自动跳过）"
          >
            上传到Supabase {collectedVideos.length > 0 && `(${collectedVideos.length})`}
          </Button>
        </Space>
      </Card>

      {/* 采集统计 */}
      {isCollecting && (
        <Card size="small" style={{ marginBottom: 16 }}>
          <Row gutter={16}>
            <Col span={3}>
              <Statistic title="已采集" value={stats.collectedCount} valueStyle={{ color: '#52c41a' }} />
            </Col>
            <Col span={3}>
              <Statistic title="观看分组" value={stats.watchedCount} valueStyle={{ color: '#13c2c2' }} />
            </Col>
            <Col span={3}>
              <Statistic title="跳过非分组" value={stats.skippedNotInGroupCount} valueStyle={{ color: '#8c8c8c' }} />
            </Col>
            <Col span={2}>
              <Statistic title="广告" value={stats.adCount} valueStyle={{ color: '#fa8c16' }} />
            </Col>
            <Col span={2}>
              <Statistic title="已关注" value={stats.followedCount} valueStyle={{ color: '#1890ff' }} />
            </Col>
            <Col span={2}>
              <Statistic title="重复" value={stats.duplicateCount} valueStyle={{ color: '#722ed1' }} />
            </Col>
            <Col span={2}>
              <Statistic title="旧视频" value={stats.oldVideoCount} valueStyle={{ color: '#eb2f96' }} />
            </Col>
            <Col span={3}>
              <Statistic
                title="已运行"
                value={formatTime(elapsedTime)}
                valueStyle={{ color: '#1890ff', fontSize: 16 }}
              />
            </Col>
            <Col span={4}>
              <Statistic
                title="剩余时间"
                value={duration === 0 ? '无限' : formatTime(Math.max(0, duration * 60 - elapsedTime))}
                valueStyle={{ color: duration === 0 ? '#52c41a' : (elapsedTime >= duration * 60 ? '#ff4d4f' : '#52c41a'), fontSize: 16 }}
              />
            </Col>
          </Row>
        </Card>
      )}

      <Card
        title={`采集结果 (${collectedVideos.length})`}
        extra={
          <Space>
            <ClockCircleOutlined />
            <Text>采集时长:</Text>
            <Select
              value={duration}
              onChange={setDuration}
              style={{ width: 100 }}
              disabled={isCollecting}
              options={DURATION_OPTIONS}
            />
            <Text>频道分组:</Text>
            <Select
              value={selectedGroup}
              onChange={setSelectedGroup}
              style={{ width: 150 }}
              disabled={isCollecting}
              allowClear
              placeholder="选择分组"
              options={[
                ...channelGroups.map(g => ({
                  label: g.name,
                  value: g.name
                }))
              ]}
            />
            {!isCollecting ? (
              <Button
                type="primary"
                icon={<RocketOutlined />}
                onClick={handleStartAutoCollect}
                disabled={!isConnected}
              >
                开始自动采集
              </Button>
            ) : (
              <Button
                danger
                icon={<PauseCircleOutlined />}
                onClick={handleStopCollect}
              >
                停止采集
              </Button>
            )}
            <Button onClick={handleClearSaved} disabled={collectedVideos.length === 0}>
              清空记录
            </Button>
          </Space>
        }
      >
        <Table
          columns={columns}
          dataSource={collectedVideos}
          rowKey={(record) => record.id || record.video_id}
          pagination={{ pageSize: 10 }}
          size="small"
          locale={{ emptyText: '暂无采集记录' }}
          scroll={{ x: 1000 }}
        />
      </Card>
    </div>
  )
}

export default YouTubeCollectPage
