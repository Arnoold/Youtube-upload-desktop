import React, { useState, useEffect } from 'react'
import {
  Button,
  Table,
  Space,
  message,
  Typography,
  DatePicker,
  Select,
  Collapse,
  Tag,
  Modal
} from 'antd'
import {
  ReloadOutlined,
  FolderOutlined,
  CloudUploadOutlined,
  DeleteOutlined
} from '@ant-design/icons'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'

dayjs.extend(utc)
dayjs.extend(timezone)

const { Title, Text } = Typography
const { Panel } = Collapse

// YouTube Studio 的时区列表
const TIMEZONES = [
  { value: 'Pacific/Midway', label: '(GMT-11:00) 中途岛' },
  { value: 'Pacific/Honolulu', label: '(GMT-10:00) 夏威夷' },
  { value: 'America/Anchorage', label: '(GMT-09:00) 阿拉斯加' },
  { value: 'America/Los_Angeles', label: '(GMT-08:00) 太平洋时间（美国和加拿大）' },
  { value: 'America/Denver', label: '(GMT-07:00) 山地时间（美国和加拿大）' },
  { value: 'America/Chicago', label: '(GMT-06:00) 中部时间（美国和加拿大）' },
  { value: 'America/New_York', label: '(GMT-05:00) 东部时间（美国和加拿大）' },
  { value: 'America/Caracas', label: '(GMT-04:00) 加拉加斯' },
  { value: 'America/Santiago', label: '(GMT-04:00) 圣地亚哥' },
  { value: 'America/Sao_Paulo', label: '(GMT-03:00) 巴西利亚' },
  { value: 'Atlantic/South_Georgia', label: '(GMT-02:00) 大西洋中部' },
  { value: 'Atlantic/Azores', label: '(GMT-01:00) 亚速尔群岛' },
  { value: 'Europe/London', label: '(GMT+00:00) 伦敦' },
  { value: 'Europe/Paris', label: '(GMT+01:00) 巴黎' },
  { value: 'Europe/Berlin', label: '(GMT+01:00) 柏林' },
  { value: 'Europe/Athens', label: '(GMT+02:00) 雅典' },
  { value: 'Africa/Cairo', label: '(GMT+02:00) 开罗' },
  { value: 'Europe/Moscow', label: '(GMT+03:00) 莫斯科' },
  { value: 'Asia/Dubai', label: '(GMT+04:00) 迪拜' },
  { value: 'Asia/Karachi', label: '(GMT+05:00) 卡拉奇' },
  { value: 'Asia/Dhaka', label: '(GMT+06:00) 达卡' },
  { value: 'Asia/Bangkok', label: '(GMT+07:00) 曼谷' },
  { value: 'Asia/Shanghai', label: '(GMT+08:00) 北京，上海' },
  { value: 'Asia/Tokyo', label: '(GMT+09:00) 东京' },
  { value: 'Australia/Sydney', label: '(GMT+10:00) 悉尼' },
  { value: 'Pacific/Noumea', label: '(GMT+11:00) 新喀里多尼亚' },
  { value: 'Pacific/Auckland', label: '(GMT+12:00) 奥克兰' }
]

const HomePage = () => {
  const [profiles, setProfiles] = useState([])
  const [accountVideos, setAccountVideos] = useState({})
  const [loading, setLoading] = useState(false)
  const [loadingAccounts, setLoadingAccounts] = useState({})
  const [videoSettings, setVideoSettings] = useState({})

  // 加载所有浏览器配置
  const loadProfiles = async () => {
    try {
      const result = await window.electron.browser.list()
      if (result.success && result.data && result.data.list) {
        // 只显示有文件夹路径的配置
        const profilesWithFolder = result.data.list.filter(
          (p) => p.folder_path && p.folder_path.trim() !== ''
        )
        setProfiles(profilesWithFolder)
      }
    } catch (error) {
      message.error(`加载账号失败: ${error.message}`)
    }
  }

  useEffect(() => {
    loadProfiles()
  }, [])

  // 获取单个账号的视频
  const handleGetAccountVideos = async (profile) => {
    setLoadingAccounts((prev) => ({ ...prev, [profile.id]: true }))
    try {
      const videos = await window.electron.file.scanShallow(profile.folder_path)
      setAccountVideos((prev) => ({ ...prev, [profile.id]: videos }))

      // 为每个视频初始化默认设置
      videos.forEach((video) => {
        const videoKey = `${profile.id}_${video.id}`
        if (!videoSettings[videoKey]) {
          setVideoSettings((prev) => ({
            ...prev,
            [videoKey]: {
              publishTime: dayjs().add(1, 'hour'),
              timezone: 'Asia/Shanghai'
            }
          }))
        }
      })

      message.success(`找到 ${videos.length} 个视频文件`)
    } catch (error) {
      message.error(`获取视频失败: ${error.message}`)
    } finally {
      setLoadingAccounts((prev) => ({ ...prev, [profile.id]: false }))
    }
  }

  // 获取所有账号的视频
  const handleGetAllVideos = async () => {
    setLoading(true)
    try {
      for (const profile of profiles) {
        await handleGetAccountVideos(profile)
      }
      message.success('所有账号视频获取完成')
    } catch (error) {
      message.error(`获取失败: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  // 移动视频到已发布
  const handleMoveToPublished = async () => {
    Modal.confirm({
      title: '确认移动',
      content: '确定要将所有账号的视频移动到"已发"文件夹吗？',
      onOk: async () => {
        setLoading(true)
        let totalMoved = 0
        try {
          for (const profile of profiles) {
            const result = await window.electron.file.moveToPublished(profile.folder_path)
            if (result.success) {
              totalMoved += result.movedCount
              // 清空该账号的视频列表
              setAccountVideos((prev) => ({ ...prev, [profile.id]: [] }))
            }
          }
          message.success(`成功移动 ${totalMoved} 个视频文件`)
        } catch (error) {
          message.error(`移动失败: ${error.message}`)
        } finally {
          setLoading(false)
        }
      }
    })
  }

  // 更新视频设置
  const updateVideoSetting = (profileId, videoId, field, value) => {
    const videoKey = `${profileId}_${videoId}`
    setVideoSettings((prev) => ({
      ...prev,
      [videoKey]: {
        ...prev[videoKey],
        [field]: value
      }
    }))
  }

  // 开始发布单个视频
  const handlePublish = async (profile, video) => {
    const videoKey = `${profile.id}_${video.id}`
    const settings = videoSettings[videoKey]

    if (!settings || !settings.publishTime) {
      message.warning('请先设置发布时间')
      return
    }

    try {
      const taskData = {
        videoPath: video.path,
        videoName: video.name,
        title: video.name.replace(/\.[^/.]+$/, ''), // 移除扩展名
        description: '',
        privacy: 'public',
        madeForKids: false,
        browserProfileId: profile.id,
        tags: [],
        scheduledTime: settings.publishTime.toISOString(),
        timezone: settings.timezone
      }

      await window.electron.upload.create(taskData)
      message.success(`视频 "${video.name}" 已加入发布队列`)
    } catch (error) {
      message.error(`创建任务失败: ${error.message}`)
    }
  }

  // 渲染账号的视频表格
  const renderAccountVideos = (profile) => {
    const videos = accountVideos[profile.id] || []
    const isLoading = loadingAccounts[profile.id] || false

    const columns = [
      {
        title: '文件名',
        dataIndex: 'name',
        key: 'name',
        width: 250,
        ellipsis: true
      },
      {
        title: '大小',
        dataIndex: 'sizeFormatted',
        key: 'size',
        width: 100
      },
      {
        title: '发布时间',
        key: 'publishTime',
        width: 220,
        render: (_, record) => {
          const videoKey = `${profile.id}_${record.id}`
          const setting = videoSettings[videoKey] || {}
          return (
            <DatePicker
              showTime={{ format: 'HH:mm' }}
              format="YYYY-MM-DD HH:mm"
              value={setting.publishTime}
              onChange={(value) =>
                updateVideoSetting(profile.id, record.id, 'publishTime', value)
              }
              style={{ width: '100%' }}
            />
          )
        }
      },
      {
        title: '时区',
        key: 'timezone',
        width: 280,
        render: (_, record) => {
          const videoKey = `${profile.id}_${record.id}`
          const setting = videoSettings[videoKey] || {}
          return (
            <Select
              value={setting.timezone}
              onChange={(value) =>
                updateVideoSetting(profile.id, record.id, 'timezone', value)
              }
              style={{ width: '100%' }}
              showSearch
              optionFilterProp="label"
              options={TIMEZONES}
            />
          )
        }
      },
      {
        title: '操作',
        key: 'action',
        width: 120,
        render: (_, record) => (
          <Button
            type="primary"
            size="small"
            icon={<CloudUploadOutlined />}
            onClick={() => handlePublish(profile, record)}
          >
            开始发布
          </Button>
        )
      }
    ]

    if (videos.length === 0 && !isLoading) {
      return (
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <Text type="secondary">暂无视频，点击上方"获取视频"按钮加载</Text>
        </div>
      )
    }

    return (
      <Table
        columns={columns}
        dataSource={videos}
        rowKey="id"
        loading={isLoading}
        pagination={{ pageSize: 5 }}
        size="small"
      />
    )
  }

  return (
    <div>
      <Title level={2}>视频发布管理</Title>

      <Space style={{ marginBottom: 24 }} size="middle">
        <Button
          type="primary"
          icon={<FolderOutlined />}
          onClick={handleGetAllVideos}
          loading={loading}
        >
          获取所有账号视频
        </Button>
        <Button icon={<DeleteOutlined />} onClick={handleMoveToPublished} loading={loading}>
          移动视频到已发布
        </Button>
        <Button icon={<ReloadOutlined />} onClick={loadProfiles}>
          刷新账号列表
        </Button>
      </Space>

      {profiles.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center' }}>
          <Text type="secondary">
            暂无账号配置，请先在"浏览器配置"页面添加账号并设置文件夹路径
          </Text>
        </div>
      ) : (
        <Collapse defaultActiveKey={profiles.map((p) => p.id.toString())}>
          {profiles.map((profile) => {
            const videos = accountVideos[profile.id] || []
            return (
              <Panel
                header={
                  <Space>
                    <Text strong>{profile.name}</Text>
                    {profile.remark && <Text type="secondary">({profile.remark})</Text>}
                    <Tag color="blue">{videos.length} 个视频</Tag>
                    <Text type="secondary" style={{ fontSize: '12px' }}>
                      {profile.folder_path}
                    </Text>
                  </Space>
                }
                key={profile.id}
                extra={
                  <Button
                    size="small"
                    onClick={(e) => {
                      e.stopPropagation()
                      handleGetAccountVideos(profile)
                    }}
                    loading={loadingAccounts[profile.id]}
                  >
                    获取视频
                  </Button>
                }
              >
                {renderAccountVideos(profile)}
              </Panel>
            )
          })}
        </Collapse>
      )}
    </div>
  )
}

export default HomePage
