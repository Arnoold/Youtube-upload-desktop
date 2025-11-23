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

// YouTube Studio 完整时区列表
const TIMEZONES = [
  { value: 'Pacific/Honolulu', label: '(GMT-10:00) 檀香山' },
  { value: 'America/Anchorage', label: '(GMT-09:00) 安克雷奇' },
  { value: 'America/Juneau', label: '(GMT-09:00) 朱诺' },
  { value: 'America/Los_Angeles', label: '(GMT-08:00) 洛杉矶' },
  { value: 'America/Vancouver', label: '(GMT-08:00) 温哥华' },
  { value: 'America/Tijuana', label: '(GMT-08:00) 蒂华纳' },
  { value: 'America/Denver', label: '(GMT-07:00) 丹佛' },
  { value: 'America/Phoenix', label: '(GMT-07:00) 凤凰城' },
  { value: 'America/Edmonton', label: '(GMT-07:00) 埃德蒙顿' },
  { value: 'America/Hermosillo', label: '(GMT-07:00) 埃莫西约' },
  { value: 'America/Mexico_City', label: '(GMT-06:00) 墨西哥城' },
  { value: 'America/Winnipeg', label: '(GMT-06:00) 温尼伯' },
  { value: 'America/Chicago', label: '(GMT-06:00) 芝加哥' },
  { value: 'Pacific/Easter', label: '(GMT-05:00) 复活节岛' },
  { value: 'America/Toronto', label: '(GMT-05:00) 多伦多' },
  { value: 'America/Detroit', label: '(GMT-05:00) 底特律' },
  { value: 'America/Bogota', label: '(GMT-05:00) 波哥大' },
  { value: 'America/New_York', label: '(GMT-05:00) 纽约' },
  { value: 'America/Rio_Branco', label: '(GMT-05:00) 里奥布郎库' },
  { value: 'America/Halifax', label: '(GMT-04:00) 哈利法克斯' },
  { value: 'America/Manaus', label: '(GMT-04:00) 马瑙斯' },
  { value: 'America/St_Johns', label: '(GMT-03:30) 圣约翰斯' },
  { value: 'America/Sao_Paulo', label: '(GMT-03:00) 圣保罗' },
  { value: 'America/Santiago', label: '(GMT-03:00) 圣地亚哥' },
  { value: 'America/Bahia', label: '(GMT-03:00) 巴伊亚' },
  { value: 'America/Buenos_Aires', label: '(GMT-03:00) 布宜诺斯艾利斯' },
  { value: 'America/Recife', label: '(GMT-03:00) 累西腓' },
  { value: 'America/Belem', label: '(GMT-03:00) 贝伦' },
  { value: 'America/Noronha', label: '(GMT-02:00) 洛罗尼亚' },
  { value: 'Europe/London', label: '(GMT+00:00) 伦敦' },
  { value: 'Atlantic/Canary', label: '(GMT+00:00) 加那利' },
  { value: 'Europe/Dublin', label: '(GMT+00:00) 都柏林' },
  { value: 'Europe/Warsaw', label: '(GMT+01:00) 华沙' },
  { value: 'Africa/Casablanca', label: '(GMT+01:00) 卡萨布兰卡' },
  { value: 'Europe/Paris', label: '(GMT+01:00) 巴黎' },
  { value: 'Europe/Prague', label: '(GMT+01:00) 布拉格' },
  { value: 'Europe/Budapest', label: '(GMT+01:00) 布达佩斯' },
  { value: 'Europe/Brussels', label: '(GMT+01:00) 布鲁塞尔' },
  { value: 'Africa/Lagos', label: '(GMT+01:00) 拉各斯' },
  { value: 'Europe/Stockholm', label: '(GMT+01:00) 斯德哥尔摩' },
  { value: 'Europe/Berlin', label: '(GMT+01:00) 柏林' },
  { value: 'Africa/Tunis', label: '(GMT+01:00) 突尼斯' },
  { value: 'Europe/Rome', label: '(GMT+01:00) 罗马' },
  { value: 'Europe/Amsterdam', label: '(GMT+01:00) 阿姆斯特丹' },
  { value: 'Africa/Algiers', label: '(GMT+01:00) 阿尔及尔' },
  { value: 'Europe/Madrid', label: '(GMT+01:00) 马德里' },
  { value: 'Europe/Kaliningrad', label: '(GMT+02:00) 加里宁格勒' },
  { value: 'Africa/Cairo', label: '(GMT+02:00) 开罗' },
  { value: 'Africa/Johannesburg', label: '(GMT+02:00) 约翰内斯堡' },
  { value: 'Asia/Jerusalem', label: '(GMT+02:00) 耶路撒冷' },
  { value: 'Asia/Aden', label: '(GMT+03:00) 亚丁' },
  { value: 'Asia/Irkutsk', label: '(GMT+03:00) 伊尔库茨克' },
  { value: 'Africa/Nairobi', label: '(GMT+03:00) 内罗毕' },
  { value: 'Asia/Riyadh', label: '(GMT+03:00) 利雅得' },
  { value: 'Africa/Kampala', label: '(GMT+03:00) 坎帕拉' },
  { value: 'Asia/Amman', label: '(GMT+03:00) 安曼' },
  { value: 'Europe/Moscow', label: '(GMT+03:00) 莫斯科' },
  { value: 'Asia/Yekaterinburg', label: '(GMT+05:00) 叶卡捷琳堡' },
  { value: 'Asia/Kolkata', label: '(GMT+05:30) 加尔各答' },
  { value: 'Asia/Omsk', label: '(GMT+06:00) 鄂木斯克' },
  { value: 'Asia/Krasnoyarsk', label: '(GMT+07:00) 克拉斯诺亚尔斯克' },
  { value: 'Asia/Novosibirsk', label: '(GMT+07:00) 新西伯利亚' },
  { value: 'Asia/Irkutsk', label: '(GMT+08:00) 伊尔库次克' },
  { value: 'Asia/Taipei', label: '(GMT+08:00) 台北' },
  { value: 'Asia/Singapore', label: '(GMT+08:00) 新加坡' },
  { value: 'Australia/Perth', label: '(GMT+08:00) 珀斯' },
  { value: 'Asia/Hong_Kong', label: '(GMT+08:00) 香港' },
  { value: 'Asia/Manila', label: '(GMT+08:00) 马尼拉' },
  { value: 'Australia/Eucla', label: '(GMT+08:45) 尤克拉' },
  { value: 'Asia/Tokyo', label: '(GMT+09:00) 东京' },
  { value: 'Asia/Yakutsk', label: '(GMT+09:00) 雅库茨克' },
  { value: 'Asia/Seoul', label: '(GMT+09:00) 首尔' },
  { value: 'Australia/Darwin', label: '(GMT+09:30) 达尔文' },
  { value: 'Australia/Brisbane', label: '(GMT+10:00) 布里斯班' },
  { value: 'Asia/Vladivostok', label: '(GMT+10:00) 海参崴' },
  { value: 'Australia/Adelaide', label: '(GMT+10:30) 阿德莱德' },
  { value: 'Australia/Melbourne', label: '(GMT+11:00) 墨尔本' },
  { value: 'Australia/Sydney', label: '(GMT+11:00) 悉尼' },
  { value: 'Asia/Sakhalin', label: '(GMT+11:00) 萨哈林' },
  { value: 'Australia/Hobart', label: '(GMT+11:00) 霍巴特' },
  { value: 'Pacific/Efate', label: '(GMT+12:00) 埃察加' },
  { value: 'Pacific/Auckland', label: '(GMT+13:00) 奥克兰' },
  { value: 'Pacific/Chatham', label: '(GMT+13:45) 查塔姆' }
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

      // 为每个视频初始化默认设置（使用账号的默认时区）
      videos.forEach((video) => {
        const videoKey = `${profile.id}_${video.id}`
        if (!videoSettings[videoKey]) {
          setVideoSettings((prev) => ({
            ...prev,
            [videoKey]: {
              publishTime: dayjs().add(1, 'hour'),
              timezone: profile.default_timezone || 'Asia/Shanghai'
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
      // 使用账号的默认说明和标签
      let defaultTags = []
      if (profile.default_tags) {
        try {
          defaultTags = JSON.parse(profile.default_tags)
        } catch (e) {
          console.error('Failed to parse default_tags:', e)
        }
      }

      const taskData = {
        videoPath: video.path,
        videoName: video.name,
        title: video.name.replace(/\.[^/.]+$/, ''), // 移除扩展名
        description: profile.default_description || '',
        privacy: 'public',
        madeForKids: false,
        browserProfileId: profile.id,
        tags: defaultTags,
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
