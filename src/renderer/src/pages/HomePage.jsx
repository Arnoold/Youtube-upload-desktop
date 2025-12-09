import React, { useState, useEffect, useCallback } from 'react'
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
  Modal,
  Alert,
  InputNumber,
  Form,
  Tooltip,
  Checkbox,
  Progress,
  Divider
} from 'antd'
import {
  ReloadOutlined,
  FolderOutlined,
  CloudUploadOutlined,
  DeleteOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  StopOutlined,
  CheckCircleOutlined,
  LoadingOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  FieldTimeOutlined,
  MenuOutlined,
  SendOutlined
} from '@ant-design/icons'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import { parseFilename, matchProducer } from '../utils/filename-parser'

dayjs.extend(utc)
dayjs.extend(timezone)

const { Title, Text } = Typography

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

// 可拖拽的表格行组件
const SortableRow = ({ children, ...props }) => {
  const id = props['data-row-key']
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id })

  const style = {
    ...props.style,
    transform: CSS.Transform.toString(transform),
    transition,
    ...(isDragging ? { background: '#fafafa', zIndex: 9999 } : {})
  }

  return (
    <tr {...props} ref={setNodeRef} style={style} {...attributes}>
      {React.Children.map(children, (child) => {
        if (child.key === 'drag') {
          return React.cloneElement(child, {
            children: (
              <MenuOutlined
                style={{ cursor: 'move', color: '#999' }}
                {...listeners}
              />
            )
          })
        }
        return child
      })}
    </tr>
  )
}

const HomePage = () => {
  const [profiles, setProfiles] = useState([])
  const [accountVideos, setAccountVideos] = useState({})
  const [loading, setLoading] = useState(false)
  const [loadingAccounts, setLoadingAccounts] = useState({})
  const [videoSettings, setVideoSettings] = useState({})

  // 上传状态管理
  const [isUploading, setIsUploading] = useState(false)
  const [isPaused, setIsPaused] = useState(false)
  const [uploadProgress, setUploadProgress] = useState({}) // { browserId: { step, stepName, status, error } }
  const [currentUploadingVideo, setCurrentUploadingVideo] = useState(null) // { profileId, videoId }
  const [currentUploadLogId, setCurrentUploadLogId] = useState(null) // 当前上传日志ID
  const [cachedUsers, setCachedUsers] = useState([]) // 缓存的用户列表
  const [publishedVideos, setPublishedVideos] = useState({}) // 已发布的视频 { `${profileId}_${videoId}`: true }

  // 时间分配弹窗状态
  const [timeAllocationModalVisible, setTimeAllocationModalVisible] = useState(false)
  const [timeAllocationForm] = Form.useForm()

  // 批量发布弹窗状态
  const [batchPublishModalVisible, setBatchPublishModalVisible] = useState(false)
  const [selectedProfiles, setSelectedProfiles] = useState([]) // 选中的浏览器ID列表
  const [batchPublishing, setBatchPublishing] = useState(false) // 是否正在批量发布
  const [batchProgress, setBatchProgress] = useState({}) // 批量发布进度 { profileId: { current, total, status, currentVideo } }
  const [expandedAccounts, setExpandedAccounts] = useState([]) // 展开的账号列表
  const [batchProgressModalVisible, setBatchProgressModalVisible] = useState(false) // 批量发布进度弹窗
  const [batchCompleted, setBatchCompleted] = useState(false) // 批量发布是否全部完成

  // 拖拽传感器
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 1
      }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  )

  // 监听上传进度
  useEffect(() => {
    const handleProgress = async (data) => {
      console.log('Upload progress:', data)
      setUploadProgress((prev) => ({
        ...prev,
        [data.browserId]: data
      }))

      // 更新批量发布进度（如果正在批量发布）
      // 通过 browserId 找到对应的 profile
      const matchedProfile = profiles.find((p) => p.bit_browser_id === data.browserId)
      if (matchedProfile) {
        setBatchProgress((prev) => {
          const profileProgress = prev[matchedProfile.id]
          if (profileProgress) {
            return {
              ...prev,
              [matchedProfile.id]: {
                ...profileProgress,
                // 更新当前视频的步骤进度
                stepProgress: {
                  step: data.step,
                  totalSteps: data.totalSteps,
                  stepName: data.stepName,
                  description: data.description,
                  status: data.status,
                  error: data.error
                }
              }
            }
          }
          return prev
        })
      }

      // 如果完成或出错，更新上传状态和日志
      // 使用 totalSteps 判断是否完成（创收号33步，普通号29步）
      const isCompleted = data.status === 'success' && data.step === data.totalSteps
      if (isCompleted) {
        // 完成 - 更新日志
        if (currentUploadLogId) {
          try {
            await window.electron.uploadLog.update(currentUploadLogId, {
              status: 'completed',
              end_time: new Date().toISOString()
              // TODO: 获取视频URL
            })
          } catch (error) {
            console.error('更新上传日志失败:', error)
          }
        }
        setTimeout(() => {
          setIsUploading(false)
          setCurrentUploadingVideo(null)
          setCurrentUploadLogId(null)
        }, 2000)
      } else if (data.status === 'error') {
        // 出错 - 更新日志
        if (currentUploadLogId) {
          try {
            await window.electron.uploadLog.update(currentUploadLogId, {
              status: 'failed',
              error_message: data.error,
              end_time: new Date().toISOString()
            })
          } catch (error) {
            console.error('更新上传日志失败:', error)
          }
        }
        setIsUploading(false)
      }
    }

    window.electron.youtube.onProgress(handleProgress)

    return () => {
      window.electron.youtube.removeListener('youtube:progress')
    }
  }, [currentUploadLogId, profiles])

  // 加载所有浏览器配置
  const loadProfiles = async () => {
    try {
      const result = await window.electron.db.getBrowserProfiles()
      console.log('HomePage - 数据库账号列表:', result)

      if (result && Array.isArray(result)) {
        const profilesWithFolder = result.filter(
          (p) => p.folder_path && p.folder_path.trim() !== ''
        )
        console.log('HomePage - 有文件夹路径的账号:', profilesWithFolder)
        setProfiles(profilesWithFolder)
      }
    } catch (error) {
      message.error(`加载账号失败: ${error.message}`)
      console.error('HomePage - 加载账号失败:', error)
    }
  }

  // 加载缓存的用户列表
  const loadCachedUsers = async () => {
    try {
      const users = await window.electron.users.getCached()
      setCachedUsers(users || [])
    } catch (error) {
      console.error('加载用户缓存失败:', error)
    }
  }

  // 恢复上传进度（页面切换后）
  const restoreUploadProgress = async () => {
    try {
      const result = await window.electron.youtube.getAllProgress()
      if (result.success && result.data) {
        const progressData = result.data
        const progressEntries = Object.entries(progressData)

        if (progressEntries.length > 0) {
          console.log('恢复上传进度:', progressData)

          // 设置进度状态
          setUploadProgress(progressData)

          // 检查是否有正在进行的任务
          const hasActiveTask = progressEntries.some(([, progress]) =>
            progress.status !== 'success' && progress.status !== 'error'
          )

          if (hasActiveTask) {
            setIsUploading(true)
          }
        }
      }
    } catch (error) {
      console.error('恢复上传进度失败:', error)
    }
  }

  useEffect(() => {
    loadProfiles()
    loadCachedUsers()
    restoreUploadProgress()
  }, [])

  // 获取单个账号的视频
  const handleGetAccountVideos = async (profile) => {
    setLoadingAccounts((prev) => ({ ...prev, [profile.id]: true }))
    try {
      const videos = await window.electron.file.scanShallow(profile.folder_path)
      setAccountVideos((prev) => ({ ...prev, [profile.id]: videos }))

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

      // 根据视频数量控制展开状态
      if (videos.length > 0) {
        setExpandedAccounts((prev) =>
          prev.includes(profile.id.toString()) ? prev : [...prev, profile.id.toString()]
        )
      } else {
        setExpandedAccounts((prev) => prev.filter((id) => id !== profile.id.toString()))
      }

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

  // 拖拽排序处理
  const handleDragEnd = (event, profileId) => {
    const { active, over } = event
    if (active.id !== over?.id) {
      setAccountVideos((prev) => {
        const videos = [...(prev[profileId] || [])]
        const oldIndex = videos.findIndex((v) => v.id === active.id)
        const newIndex = videos.findIndex((v) => v.id === over.id)
        return {
          ...prev,
          [profileId]: arrayMove(videos, oldIndex, newIndex)
        }
      })
    }
  }

  // 打开时间分配弹窗
  const openTimeAllocationModal = () => {
    // 检查是否有视频
    const hasVideos = profiles.some((p) => (accountVideos[p.id] || []).length > 0)
    if (!hasVideos) {
      message.warning('请先获取视频')
      return
    }
    // 从 localStorage 读取上次保存的值，默认间隔5分钟，误差2分钟
    const savedInterval = localStorage.getItem('timeAllocation_interval')
    const savedVariance = localStorage.getItem('timeAllocation_variance')
    timeAllocationForm.setFieldsValue({
      startTime: dayjs().tz('Asia/Shanghai'),
      interval: savedInterval ? parseInt(savedInterval, 10) : 5,
      variance: savedVariance ? parseInt(savedVariance, 10) : 2
    })
    setTimeAllocationModalVisible(true)
  }

  // 执行时间分配
  const handleTimeAllocation = async () => {
    try {
      const values = await timeAllocationForm.validateFields()
      const { startTime, interval, variance } = values

      // 使用用户选择的起始时间（北京时间）
      const startTimeBeijing = dayjs(startTime).tz('Asia/Shanghai')
      // 第一个视频从起始时间往后加一个间隔
      let currentTime = startTimeBeijing.add(interval, 'minute')

      // 构建每个浏览器的视频队列 { profileId: [videos] }
      const videoQueues = {}
      profiles.forEach((profile) => {
        const videos = accountVideos[profile.id] || []
        if (videos.length > 0) {
          videoQueues[profile.id] = [...videos]
        }
      })

      // 获取有视频的浏览器ID列表（按profiles顺序）
      const activeProfileIds = profiles
        .filter((p) => videoQueues[p.id] && videoQueues[p.id].length > 0)
        .map((p) => p.id)

      // 记录每个浏览器上一个视频的实际分配时间（北京时间），确保同一浏览器内时间递增
      const lastScheduledTime = {}

      if (activeProfileIds.length === 0) {
        message.warning('没有可分配的视频')
        return
      }

      // 轮询分配时间
      const newVideoSettings = { ...videoSettings }
      let profileIndex = 0
      let hasMoreVideos = true

      while (hasMoreVideos) {
        hasMoreVideos = false
        const currentProfileId = activeProfileIds[profileIndex]
        const queue = videoQueues[currentProfileId]

        if (queue && queue.length > 0) {
          const video = queue.shift() // 取出第一个视频
          const profile = profiles.find((p) => p.id === currentProfileId)
          const targetTimezone = profile?.default_timezone || 'Asia/Shanghai'

          // 计算实际间隔：基础间隔 + 随机误差 (-variance ~ +variance)
          // 例如：间隔5分钟，误差3分钟 -> 实际间隔为 2~8 分钟
          const randomVariance = Math.floor(Math.random() * (variance * 2 + 1)) - variance
          const actualInterval = Math.max(1, interval + randomVariance) // 至少1分钟间隔

          // 计算当前视频的发布时间
          let scheduledTimeBeijing = currentTime

          // 确保同一浏览器内的视频时间递增（至少比上一个视频晚1分钟）
          const lastTime = lastScheduledTime[currentProfileId]
          if (lastTime && scheduledTimeBeijing.isBefore(lastTime.add(1, 'minute'))) {
            scheduledTimeBeijing = lastTime.add(1, 'minute')
          }
          // 记录这个浏览器的最新分配时间
          lastScheduledTime[currentProfileId] = scheduledTimeBeijing

          // 将北京时间转换为目标时区的本地时间
          // 例如：北京时间 16:24 -> 洛杉矶时间 0:24（同一时刻的不同时区表示）
          // scheduledTimeBeijing 是北京时区的时间，转换为目标时区显示
          const targetLocalTime = scheduledTimeBeijing.tz(targetTimezone)

          const videoKey = `${currentProfileId}_${video.id}`
          newVideoSettings[videoKey] = {
            ...newVideoSettings[videoKey],
            publishTime: targetLocalTime,
            timezone: targetTimezone
          }

          // 更新下一个视频的基准时间（北京时间），使用带随机误差的实际间隔
          currentTime = currentTime.add(actualInterval, 'minute')

          // 检查是否还有视频
          if (queue.length > 0) {
            hasMoreVideos = true
          }
        }

        // 移动到下一个浏览器
        profileIndex = (profileIndex + 1) % activeProfileIds.length

        // 检查所有浏览器是否都还有视频
        if (!hasMoreVideos) {
          hasMoreVideos = activeProfileIds.some(
            (pid) => videoQueues[pid] && videoQueues[pid].length > 0
          )
        }
      }

      setVideoSettings(newVideoSettings)
      setTimeAllocationModalVisible(false)

      // 保存设置到 localStorage，下次打开弹窗时使用
      localStorage.setItem('timeAllocation_interval', interval.toString())
      localStorage.setItem('timeAllocation_variance', variance.toString())

      message.success('时间分配完成')
    } catch (error) {
      console.error('时间分配失败:', error)
      message.error('时间分配失败')
    }
  }

  // 打开批量发布弹窗
  const openBatchPublishModal = () => {
    // 检查是否有视频
    const profilesWithVideos = profiles.filter((p) => (accountVideos[p.id] || []).length > 0)
    if (profilesWithVideos.length === 0) {
      message.warning('请先获取视频')
      return
    }
    // 默认全选有视频的浏览器
    setSelectedProfiles(profilesWithVideos.map((p) => p.id))
    setBatchPublishModalVisible(true)
  }

  // 单个浏览器的发布任务（按时间顺序依次发布）
  const publishProfileVideos = async (profile) => {
    const videos = accountVideos[profile.id] || []
    if (videos.length === 0) return

    // 按发布时间排序（从早到晚）
    const sortedVideos = [...videos].sort((a, b) => {
      const settingA = videoSettings[`${profile.id}_${a.id}`]
      const settingB = videoSettings[`${profile.id}_${b.id}`]
      const timeA = settingA?.publishTime ? dayjs(settingA.publishTime) : dayjs().add(999, 'year')
      const timeB = settingB?.publishTime ? dayjs(settingB.publishTime) : dayjs().add(999, 'year')
      return timeA.valueOf() - timeB.valueOf()
    })

    console.log('视频发布顺序:', sortedVideos.map(v => {
      const setting = videoSettings[`${profile.id}_${v.id}`]
      return {
        name: v.name,
        publishTime: setting?.publishTime ? dayjs(setting.publishTime).format('YYYY-MM-DD HH:mm') : '未设置'
      }
    }))

    setBatchProgress((prev) => ({
      ...prev,
      [profile.id]: {
        ...prev[profile.id],
        current: 0,
        total: sortedVideos.length,
        status: 'publishing',
        currentVideo: null,
        stepProgress: null
      }
    }))

    for (let i = 0; i < sortedVideos.length; i++) {
      const video = sortedVideos[i]
      const videoKey = `${profile.id}_${video.id}`

      // 如果已发布，跳过
      if (publishedVideos[videoKey]) {
        setBatchProgress((prev) => ({
          ...prev,
          [profile.id]: { ...prev[profile.id], current: i + 1 }
        }))
        continue
      }

      setBatchProgress((prev) => ({
        ...prev,
        [profile.id]: {
          ...prev[profile.id],
          current: i,
          currentVideo: video.name,
          status: 'publishing',
          stepProgress: null // 重置步骤进度
        }
      }))

      try {
        const settings = videoSettings[videoKey]
        if (!settings || !settings.publishTime) {
          console.warn(`视频 ${video.name} 没有设置发布时间，跳过`)
          continue
        }

        let defaultTags = []
        if (profile.default_tags) {
          try {
            defaultTags = JSON.parse(profile.default_tags)
          } catch (e) {
            console.error('Failed to parse default_tags:', e)
          }
        }

        // 解析文件名
        const parsed = parseFilename(video.name)

        // 匹配制作人
        let producerId = null
        let producerName = parsed.producerName
        if (producerName && cachedUsers.length > 0) {
          const matchedUser = matchProducer(producerName, cachedUsers)
          if (matchedUser) {
            producerId = matchedUser.id
          }
        }

        const videoTitle = parsed.videoDescription || video.name.replace(/\.[^/.]+$/, '')
        const isMonetized = profile.account_type === 'monetized'

        // 创建上传日志
        let logId = null
        try {
          const logResult = await window.electron.uploadLog.create({
            browser_id: profile.bit_browser_id,
            browser_name: profile.name,
            browser_type: profile.browser_type || 'bitbrowser',
            file_path: video.path,
            file_name: video.name,
            video_title: videoTitle,
            video_description: profile.default_description || '',
            visibility: 'public',
            scheduled_time: settings.publishTime.toISOString(),
            producer_name: producerName,
            producer_id: producerId,
            production_date: parsed.productionDateFormatted,
            status: 'uploading',
            start_time: new Date().toISOString()
          })
          if (logResult.success) {
            logId = logResult.id
          }
        } catch (logError) {
          console.error('创建上传日志失败:', logError)
        }

        // 执行上传
        const uploadMethod = isMonetized
          ? window.electron.youtube.uploadMonetized
          : window.electron.youtube.uploadNormal

        const result = await uploadMethod(
          profile.bit_browser_id,
          video.path,
          {
            title: videoTitle,
            description: profile.default_description || '',
            visibility: 'schedule',
            scheduledTime: settings.publishTime.format('YYYY-MM-DD HH:mm'),
            timezone: settings.timezone
          },
          profile.browser_type || 'bitbrowser'
        )

        if (result.success) {
          // 标记为已发布
          setPublishedVideos((prev) => ({ ...prev, [videoKey]: true }))

          // 更新日志
          if (logId) {
            try {
              await window.electron.uploadLog.update(logId, {
                status: 'completed',
                video_url: result.videoUrl || null,
                video_id: result.videoId || null,
                end_time: new Date().toISOString()
              })
            } catch (e) {
              console.error('更新日志失败:', e)
            }
          }

          // 移动视频文件
          try {
            const videoDir = video.path.substring(0, video.path.lastIndexOf('\\'))
            const publishedFolder = `${videoDir}\\已发`
            await window.electron.file.move(video.path, publishedFolder)
          } catch (moveError) {
            console.error('移动视频文件失败:', moveError)
          }
        } else {
          // 更新日志为失败
          if (logId) {
            try {
              await window.electron.uploadLog.update(logId, {
                status: 'failed',
                error_message: result.error,
                end_time: new Date().toISOString()
              })
            } catch (e) {
              console.error('更新日志失败:', e)
            }
          }
          console.error(`视频 ${video.name} 发布失败:`, result.error)
        }
      } catch (error) {
        console.error(`视频 ${video.name} 发布出错:`, error)
      }

      setBatchProgress((prev) => ({
        ...prev,
        [profile.id]: { ...prev[profile.id], current: i + 1, stepProgress: null }
      }))
    }

    setBatchProgress((prev) => ({
      ...prev,
      [profile.id]: { ...prev[profile.id], status: 'completed', currentVideo: null, stepProgress: null }
    }))
  }

  // 执行批量发布
  const handleBatchPublish = async () => {
    if (selectedProfiles.length === 0) {
      message.warning('请选择要发布的浏览器')
      return
    }

    // 验证发布时间
    const nowBeijing = dayjs().tz('Asia/Shanghai')
    const errors = []
    const allPublishTimes = [] // 用于检测重复时间

    selectedProfiles.forEach((profileId) => {
      const profile = profiles.find((p) => p.id === profileId)
      const videos = accountVideos[profileId] || []

      videos.forEach((video) => {
        const videoKey = `${profileId}_${video.id}`
        const settings = videoSettings[videoKey]

        if (settings && settings.publishTime) {
          // 将发布时间转换为北京时间进行比较
          const publishTimeBeijing = dayjs(settings.publishTime).tz('Asia/Shanghai')

          // 检查是否早于当前时间
          if (publishTimeBeijing.isBefore(nowBeijing)) {
            errors.push({
              type: 'past_time',
              browser: profile?.name,
              video: video.name,
              time: publishTimeBeijing.format('YYYY-MM-DD HH:mm')
            })
          }

          // 记录发布时间（精确到分钟）用于检测重复
          const timeKey = publishTimeBeijing.format('YYYY-MM-DD HH:mm')
          allPublishTimes.push({
            timeKey,
            browser: profile?.name,
            video: video.name
          })
        }
      })
    })

    // 检测重复时间
    const timeMap = {}
    allPublishTimes.forEach((item) => {
      if (!timeMap[item.timeKey]) {
        timeMap[item.timeKey] = []
      }
      timeMap[item.timeKey].push(item)
    })

    Object.entries(timeMap).forEach(([timeKey, items]) => {
      if (items.length > 1) {
        errors.push({
          type: 'duplicate_time',
          time: timeKey,
          videos: items.map((i) => `${i.browser} - ${i.video}`)
        })
      }
    })

    // 如果有错误，显示错误弹窗
    if (errors.length > 0) {
      const pastTimeErrors = errors.filter((e) => e.type === 'past_time')
      const duplicateErrors = errors.filter((e) => e.type === 'duplicate_time')

      Modal.error({
        title: '发布时间验证失败',
        width: 600,
        content: (
          <div>
            {pastTimeErrors.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <Text strong style={{ color: '#ff4d4f' }}>以下视频的发布时间早于当前时间：</Text>
                <ul style={{ marginTop: 8 }}>
                  {pastTimeErrors.map((err, idx) => (
                    <li key={idx}>
                      <Text>{err.browser}</Text> - <Text code>{err.video}</Text>
                      <Text type="secondary"> ({err.time})</Text>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {duplicateErrors.length > 0 && (
              <div>
                <Text strong style={{ color: '#ff4d4f' }}>以下视频的发布时间重复：</Text>
                <ul style={{ marginTop: 8 }}>
                  {duplicateErrors.map((err, idx) => (
                    <li key={idx}>
                      <Text>时间 {err.time}：</Text>
                      <ul>
                        {err.videos.map((v, vIdx) => (
                          <li key={vIdx}><Text code>{v}</Text></li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <Text type="secondary" style={{ marginTop: 16, display: 'block' }}>
              请修改发布时间后重试
            </Text>
          </div>
        )
      })
      return
    }

    setBatchPublishModalVisible(false)
    setBatchPublishing(true)
    setBatchProgressModalVisible(true)
    setBatchCompleted(false)
    setIsUploading(true)

    // 初始化每个选中账号的进度
    const initialProgress = {}
    selectedProfiles.forEach((profileId) => {
      const videos = accountVideos[profileId] || []
      initialProgress[profileId] = {
        current: 0,
        total: videos.length,
        status: 'pending',
        currentVideo: null,
        videoProgress: {} // 每个视频的上传进度 { videoId: { step, totalSteps, stepName, status } }
      }
    })
    setBatchProgress(initialProgress)

    // 并行发布所有选中的浏览器（每个浏览器错位启动，避免 HubStudio API 并发问题）
    const publishPromises = selectedProfiles.map((profileId, index) => {
      const profile = profiles.find((p) => p.id === profileId)
      if (profile) {
        // 每个浏览器延迟 index * 3秒 启动，避免同时调用 HubStudio API
        const delay = index * 3000
        return new Promise((resolve) => {
          setTimeout(async () => {
            try {
              await publishProfileVideos(profile)
              resolve()
            } catch (error) {
              console.error(`浏览器 ${profile.name} 发布失败:`, error)
              resolve() // 即使失败也 resolve，不阻塞其他浏览器
            }
          }, delay)
        })
      }
      return Promise.resolve()
    })

    try {
      await Promise.all(publishPromises)
      setBatchCompleted(true)
      message.success('批量发布完成')
    } catch (error) {
      console.error('批量发布出错:', error)
      message.error('批量发布过程中出现错误')
    } finally {
      setBatchPublishing(false)
      setIsUploading(false)
    }
  }

  // 关闭批量发布进度弹窗
  const handleCloseBatchProgressModal = () => {
    setBatchProgressModalVisible(false)
    setBatchCompleted(false)
    setBatchProgress({})
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

  // 暂停上传
  const handlePause = async () => {
    try {
      await window.electron.youtube.pause()
      setIsPaused(true)
      message.info('上传已暂停')
    } catch (error) {
      message.error(`暂停失败: ${error.message}`)
    }
  }

  // 继续上传
  const handleResume = async () => {
    try {
      await window.electron.youtube.resume()
      setIsPaused(false)
      message.info('上传已继续')
    } catch (error) {
      message.error(`继续失败: ${error.message}`)
    }
  }

  // 取消上传 - 直接结束所有任务，不需要二次确认
  const handleCancel = async () => {
    try {
      // 调用后端取消所有上传任务
      await window.electron.youtube.cancel()

      // 更新批量发布进度，将未完成的任务标记为失败
      setBatchProgress((prev) => {
        const updated = { ...prev }
        Object.keys(updated).forEach((profileId) => {
          if (updated[profileId].status !== 'completed') {
            updated[profileId] = {
              ...updated[profileId],
              status: 'failed',
              stepProgress: null
            }
          }
        })
        return updated
      })

      // 重置状态
      setIsUploading(false)
      setIsPaused(false)
      setBatchPublishing(false)
      setCurrentUploadingVideo(null)

      // 关闭弹窗
      setBatchProgressModalVisible(false)
      setBatchCompleted(false)

      message.info('已取消所有上传任务')
    } catch (error) {
      message.error(`取消失败: ${error.message}`)
    }
  }

  // 开始发布单个视频
  const handlePublish = async (profile, video) => {
    const videoKey = `${profile.id}_${video.id}`
    const settings = videoSettings[videoKey]

    if (!settings || !settings.publishTime) {
      message.warning('请先设置发布时间')
      return
    }

    if (isUploading) {
      message.warning('有任务正在上传中，请等待完成或取消后再试')
      return
    }

    try {
      let defaultTags = []
      if (profile.default_tags) {
        try {
          defaultTags = JSON.parse(profile.default_tags)
        } catch (e) {
          console.error('Failed to parse default_tags:', e)
        }
      }

      // 解析文件名
      const parsed = parseFilename(video.name)
      console.log('文件名解析结果:', parsed)

      // 匹配制作人
      let producerId = null
      let producerName = parsed.producerName
      if (producerName && cachedUsers.length > 0) {
        const matchedUser = matchProducer(producerName, cachedUsers)
        if (matchedUser) {
          producerId = matchedUser.id
          console.log('匹配到制作人:', matchedUser)
        }
      }

      // 使用解析出的视频文案作为标题（如果有的话）
      const videoTitle = parsed.videoDescription || video.name.replace(/\.[^/.]+$/, '')

      const taskData = {
        videoPath: video.path,
        videoName: video.name,
        title: videoTitle,
        description: profile.default_description || '',
        privacy: 'public',
        madeForKids: false,
        browserProfileId: profile.id,
        bitBrowserId: profile.bit_browser_id,
        accountType: profile.account_type || 'normal',
        tags: defaultTags,
        scheduledTime: settings.publishTime.format('YYYY-MM-DD HH:mm'),
        timezone: settings.timezone
      }

      // 根据账号类型选择上传流程
      const isMonetized = profile.account_type === 'monetized'

      // 创建上传日志
      let logId = null
      try {
        const logResult = await window.electron.uploadLog.create({
          browser_id: profile.bit_browser_id,
          browser_name: profile.name,
          browser_type: profile.browser_type || 'bitbrowser',
          file_path: video.path,
          file_name: video.name,
          video_title: videoTitle,
          video_description: taskData.description,
          visibility: 'public',
          scheduled_time: settings.publishTime.toISOString(),
          producer_name: producerName,
          producer_id: producerId,
          production_date: parsed.productionDateFormatted,
          status: 'uploading',
          start_time: new Date().toISOString()
        })
        if (logResult.success) {
          logId = logResult.id
          setCurrentUploadLogId(logId)
          console.log('创建上传日志成功, ID:', logId)
        }
      } catch (logError) {
        console.error('创建上传日志失败:', logError)
      }

      // 开始上传
      console.log(`开始${isMonetized ? '创收号' : '普通号'}上传流程...`)
      setIsUploading(true)
      setIsPaused(false)
      setCurrentUploadingVideo({ profileId: profile.id, videoId: video.id })
      setUploadProgress((prev) => ({
        ...prev,
        [profile.bit_browser_id]: { step: 0, status: 'pending' }
      }))

      // 根据账号类型选择上传方法
      const uploadMethod = isMonetized
        ? window.electron.youtube.uploadMonetized
        : window.electron.youtube.uploadNormal

      const result = await uploadMethod(
        profile.bit_browser_id,
        video.path,
        {
          title: videoTitle,
          description: taskData.description,
          visibility: 'schedule',
          scheduledTime: settings.publishTime.format('YYYY-MM-DD HH:mm'),
          timezone: settings.timezone
        },
        profile.browser_type || 'bitbrowser'
      )

      if (result.success) {
        message.success(`视频 "${video.name}" 发布成功！`)

        // 标记视频为已发布
        const videoKey = `${profile.id}_${video.id}`
        setPublishedVideos((prev) => ({ ...prev, [videoKey]: true }))

        // 更新日志状态为成功，并保存视频链接
        if (logId) {
          try {
            await window.electron.uploadLog.update(logId, {
              status: 'completed',
              video_url: result.videoUrl || null,
              video_id: result.videoId || null,
              end_time: new Date().toISOString()
            })
            console.log('上传日志已更新，视频链接:', result.videoUrl)
          } catch (e) {
            console.error('更新日志失败:', e)
          }
        }

        // 移动视频文件到【已发】文件夹
        try {
          const videoDir = video.path.substring(0, video.path.lastIndexOf('\\'))
          const publishedFolder = `${videoDir}\\已发`
          const moveResult = await window.electron.file.move(video.path, publishedFolder)
          if (moveResult) {
            console.log('视频已移动到已发文件夹:', moveResult)
            message.success('视频已移动到【已发】文件夹')
            // 不再立即刷新视频列表，保留当前显示的已发布状态
            // handleGetAccountVideos(profile)
          }
        } catch (moveError) {
          console.error('移动视频文件失败:', moveError)
          message.warning('视频发布成功，但移动文件失败')
        }
      } else {
        message.error(`发布失败: ${result.error}`)
        // 更新日志状态为失败
        if (logId) {
          try {
            await window.electron.uploadLog.update(logId, {
              status: 'failed',
              error_message: result.error,
              end_time: new Date().toISOString()
            })
          } catch (e) {
            console.error('更新日志失败:', e)
          }
        }
      }
    } catch (error) {
      message.error(`创建任务失败: ${error.message}`)
    } finally {
      setIsUploading(false)
      setCurrentUploadingVideo(null)
    }
  }

  // 渲染上传进度（纯文字版）
  const renderUploadProgress = (profile, video) => {
    const progress = uploadProgress[profile.bit_browser_id]
    const isCurrentVideo =
      currentUploadingVideo &&
      currentUploadingVideo.profileId === profile.id &&
      currentUploadingVideo.videoId === video.id

    // 如果没有当前视频信息，但有进度（页面切换后恢复），也显示进度
    if (!progress) {
      return null
    }

    // 如果有当前视频信息，则只显示当前视频的进度
    if (currentUploadingVideo && !isCurrentVideo) {
      return null
    }

    const currentStep = progress.step || 0
    // 使用从进度数据中获取的 totalSteps（创收号33步，普通号29步）
    const totalSteps = progress.totalSteps || 33

    // 获取状态图标和颜色
    const getStatusIcon = () => {
      if (isPaused) return { icon: <ClockCircleOutlined />, color: '#fa8c16' }
      if (progress.status === 'error') return { icon: <CloseCircleOutlined />, color: '#ff4d4f' }
      if (progress.status === 'success' && currentStep === totalSteps) return { icon: <CheckCircleOutlined />, color: '#52c41a' }
      return { icon: <LoadingOutlined />, color: '#1890ff' }
    }

    const { icon, color } = getStatusIcon()

    return (
      <div style={{ marginTop: 6, marginLeft: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
        <span style={{ color, fontSize: 13 }}>{icon}</span>
        <Text style={{ fontSize: 12, color }}>
          {currentStep}/{totalSteps} {progress.stepName || '准备中'}
        </Text>
        {progress.error && (
          <Text type="danger" style={{ fontSize: 11, marginLeft: 8 }}>
            {progress.error.length > 40 ? progress.error.substring(0, 40) + '...' : progress.error}
          </Text>
        )}
      </div>
    )
  }

  // 渲染账号的视频表格
  const renderAccountVideos = (profile) => {
    const videos = accountVideos[profile.id] || []
    const isLoading = loadingAccounts[profile.id] || false

    const columns = [
      {
        title: '',
        key: 'drag',
        width: 30,
        render: () => <MenuOutlined style={{ cursor: 'move', color: '#999' }} />
      },
      {
        title: '文件名',
        dataIndex: 'name',
        key: 'name',
        width: 280,
        ellipsis: true,
        render: (text, record) => (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Tooltip title={text}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{text}</span>
            </Tooltip>
            <Tooltip title="播放视频">
              <PlayCircleOutlined
                style={{ color: '#1890ff', cursor: 'pointer', fontSize: 16, marginLeft: 8, flexShrink: 0 }}
                onClick={() => window.electron.file.openFile(record.path)}
              />
            </Tooltip>
          </div>
        )
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
        width: 165,
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
              needConfirm={false}
              style={{ width: 155 }}
            />
          )
        }
      },
      {
        title: '时区',
        key: 'timezone',
        width: 165,
        render: (_, record) => {
          const videoKey = `${profile.id}_${record.id}`
          const setting = videoSettings[videoKey] || {}
          return (
            <Select
              value={setting.timezone}
              onChange={(value) =>
                updateVideoSetting(profile.id, record.id, 'timezone', value)
              }
              style={{ width: 155 }}
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
        render: (_, record) => {
          const videoKey = `${profile.id}_${record.id}`
          const isPublished = publishedVideos[videoKey]
          const isCurrentVideo =
            currentUploadingVideo &&
            currentUploadingVideo.profileId === profile.id &&
            currentUploadingVideo.videoId === record.id

          // 已发布状态：显示绿色不可点击的按钮
          if (isPublished) {
            return (
              <Button
                size="small"
                icon={<CheckCircleOutlined />}
                disabled
                style={{
                  backgroundColor: '#52c41a',
                  borderColor: '#52c41a',
                  color: '#fff',
                  cursor: 'not-allowed'
                }}
              >
                已发布
              </Button>
            )
          }

          return (
            <Button
              type="primary"
              size="small"
              icon={<CloudUploadOutlined />}
              onClick={() => handlePublish(profile, record)}
              loading={isCurrentVideo && isUploading}
              disabled={isUploading && !isCurrentVideo}
            >
              {isCurrentVideo && isUploading ? '上传中' : '开始发布'}
            </Button>
          )
        }
      }
    ]

    if (videos.length === 0 && !isLoading) {
      return (
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <Text type="secondary">暂无视频，点击上方"获取视频"按钮加载</Text>
        </div>
      )
    }

    // 获取当前正在上传的视频ID列表（用于自动展开）
    const expandedKeys = currentUploadingVideo &&
      currentUploadingVideo.profileId === profile.id
      ? [currentUploadingVideo.videoId]
      : []

    return (
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={(event) => handleDragEnd(event, profile.id)}
      >
        <SortableContext
          items={videos.map((v) => v.id)}
          strategy={verticalListSortingStrategy}
        >
          <Table
            columns={columns}
            dataSource={videos}
            rowKey="id"
            loading={isLoading}
            pagination={false}
            size="small"
            components={{
              body: {
                row: SortableRow
              }
            }}
            expandable={{
              expandedRowRender: (record) => renderUploadProgress(profile, record),
              expandedRowKeys: expandedKeys,
              expandIcon: () => null,
              columnWidth: 0,
              rowExpandable: (record) =>
                currentUploadingVideo &&
                currentUploadingVideo.profileId === profile.id &&
                currentUploadingVideo.videoId === record.id
            }}
          />
        </SortableContext>
      </DndContext>
    )
  }

  return (
    <div>
      <Title level={2}>视频发布管理</Title>

      {/* 全局控制按钮 */}
      <Space style={{ marginBottom: 24 }} size="middle">
        <Button
          type="primary"
          icon={<FolderOutlined />}
          onClick={handleGetAllVideos}
          loading={loading}
          disabled={isUploading}
        >
          获取所有账号视频
        </Button>
        <Tooltip title="自动为所有视频分配发布时间，按浏览器轮询顺序">
          <Button
            icon={<FieldTimeOutlined />}
            onClick={openTimeAllocationModal}
            disabled={isUploading}
          >
            自动分配时间
          </Button>
        </Tooltip>
        <Button
          type="primary"
          icon={<SendOutlined />}
          onClick={openBatchPublishModal}
          disabled={isUploading}
          style={{ backgroundColor: '#52c41a', borderColor: '#52c41a' }}
        >
          批量发布
        </Button>

        {/* 上传控制按钮 */}
        {isUploading && (
          <>
            {isPaused ? (
              <Button
                type="primary"
                icon={<PlayCircleOutlined />}
                onClick={handleResume}
                style={{ backgroundColor: '#52c41a', borderColor: '#52c41a' }}
              >
                继续上传
              </Button>
            ) : (
              <Button
                icon={<PauseCircleOutlined />}
                onClick={handlePause}
                style={{ backgroundColor: '#faad14', borderColor: '#faad14', color: '#fff' }}
              >
                暂停上传
              </Button>
            )}
            <Button danger icon={<StopOutlined />} onClick={handleCancel}>
              取消上传
            </Button>
          </>
        )}
      </Space>

      {/* 上传状态提示 */}
      {isUploading && (
        <Alert
          message={isPaused ? '上传已暂停' : '正在上传视频...'}
          description={
            isPaused
              ? '点击"继续上传"按钮恢复上传任务'
              : '请勿关闭应用程序，上传完成后会自动提示'
          }
          type={isPaused ? 'warning' : 'info'}
          showIcon
          style={{ marginBottom: 16 }}
        />
      )}

      {profiles.length === 0 ? (
        <div style={{ padding: '40px', textAlign: 'center' }}>
          <Text type="secondary">
            暂无账号配置，请先在"浏览器配置"页面添加账号并设置文件夹路径
          </Text>
        </div>
      ) : (
        <Collapse
          activeKey={expandedAccounts}
          onChange={(keys) => setExpandedAccounts(keys)}
          items={profiles.map((profile) => {
            const videos = accountVideos[profile.id] || []
            return {
              key: profile.id,
              label: (
                <Space>
                  <Text strong>{profile.name}</Text>
                  {profile.account_type === 'monetized' && (
                    <Tag color="gold">创收号</Tag>
                  )}
                  {profile.remark && <Text type="secondary">({profile.remark})</Text>}
                  <Tag color="blue">{videos.length} 个视频</Tag>
                  <Text type="secondary" style={{ fontSize: '12px' }}>
                    {profile.folder_path}
                  </Text>
                </Space>
              ),
              extra: (
                <Button
                  size="small"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleGetAccountVideos(profile)
                  }}
                  loading={loadingAccounts[profile.id]}
                  disabled={isUploading}
                >
                  获取视频
                </Button>
              ),
              children: renderAccountVideos(profile)
            }
          })}
        />
      )}

      {/* 时间分配弹窗 */}
      <Modal
        title="自动分配发布时间"
        open={timeAllocationModalVisible}
        onOk={handleTimeAllocation}
        onCancel={() => setTimeAllocationModalVisible(false)}
        okText="开始分配"
        cancelText="取消"
      >
        <Alert
          message="时间分配说明"
          description={
            <div>
              <p>• 从起始时间开始，按间隔时间依次分配</p>
              <p>• 视频发布顺序：浏览器1的第1个 → 浏览器2的第1个 → ... → 浏览器1的第2个 → ...</p>
              <p>• 每个视频的实际发布时间 = 基准时间 ± 随机误差</p>
              <p>• 时间会自动转换为各浏览器对应的时区</p>
              <p>• 可拖动视频行调整每个浏览器内的视频顺序</p>
            </div>
          }
          type="info"
          style={{ marginBottom: 16 }}
        />
        <Form form={timeAllocationForm} layout="vertical">
          <Form.Item
            name="startTime"
            label="起始时间（北京时间）"
            rules={[{ required: true, message: '请选择起始时间' }]}
          >
            <DatePicker
              showTime={{ format: 'HH:mm' }}
              format="YYYY-MM-DD HH:mm"
              style={{ width: '100%' }}
              placeholder="选择起始时间"
              needConfirm={false}
            />
          </Form.Item>
          <Form.Item
            name="interval"
            label="时间间隔（分钟）"
            rules={[{ required: true, message: '请输入时间间隔' }]}
          >
            <InputNumber min={1} max={120} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="variance"
            label="随机误差（分钟）"
            rules={[{ required: true, message: '请输入随机误差' }]}
            extra="实际发布时间会在基准时间的 ±误差范围内随机"
          >
            <InputNumber min={0} max={30} style={{ width: '100%' }} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 批量发布弹窗 */}
      <Modal
        title="批量发布"
        open={batchPublishModalVisible}
        onOk={handleBatchPublish}
        onCancel={() => setBatchPublishModalVisible(false)}
        okText="开始发布"
        cancelText="取消"
      >
        <Alert
          message="批量发布说明"
          description={
            <div>
              <p>• 选中的浏览器将并行发布视频</p>
              <p>• 每个浏览器内的视频按发布时间从早到晚依次发布</p>
              <p>• 发布成功后视频会自动移动到【已发】文件夹</p>
            </div>
          }
          type="info"
          style={{ marginBottom: 16 }}
        />
        <div style={{ marginBottom: 8 }}>
          <Checkbox
            indeterminate={
              selectedProfiles.length > 0 &&
              selectedProfiles.length < profiles.filter((p) => (accountVideos[p.id] || []).length > 0).length
            }
            checked={
              selectedProfiles.length === profiles.filter((p) => (accountVideos[p.id] || []).length > 0).length &&
              selectedProfiles.length > 0
            }
            onChange={(e) => {
              if (e.target.checked) {
                setSelectedProfiles(
                  profiles.filter((p) => (accountVideos[p.id] || []).length > 0).map((p) => p.id)
                )
              } else {
                setSelectedProfiles([])
              }
            }}
          >
            全选
          </Checkbox>
        </div>
        <Checkbox.Group
          value={selectedProfiles}
          onChange={(values) => setSelectedProfiles(values)}
          style={{ display: 'flex', flexDirection: 'column', gap: 8 }}
        >
          {profiles
            .filter((p) => (accountVideos[p.id] || []).length > 0)
            .map((profile) => {
              const videos = accountVideos[profile.id] || []
              const progress = batchProgress[profile.id]
              return (
                <Checkbox key={profile.id} value={profile.id}>
                  <Space>
                    <span>{profile.name}</span>
                    {profile.account_type === 'monetized' && <Tag color="gold">创收号</Tag>}
                    <Tag color="blue">{videos.length} 个视频</Tag>
                    {progress && (
                      <Tag color={progress.status === 'completed' ? 'green' : 'processing'}>
                        {progress.current}/{progress.total}
                      </Tag>
                    )}
                  </Space>
                </Checkbox>
              )
            })}
        </Checkbox.Group>
      </Modal>

      {/* 批量发布进度弹窗 */}
      <Modal
        title={
          <Space>
            {batchCompleted ? (
              <>
                <CheckCircleOutlined style={{ color: '#52c41a' }} />
                <span>批量发布完成</span>
              </>
            ) : (
              <>
                <LoadingOutlined style={{ color: '#1890ff' }} />
                <span>批量发布进行中</span>
              </>
            )}
          </Space>
        }
        open={batchProgressModalVisible}
        width={700}
        footer={
          batchCompleted ? (
            <Button type="primary" onClick={handleCloseBatchProgressModal}>
              关闭
            </Button>
          ) : (
            <Space>
              {isPaused ? (
                <Button
                  type="primary"
                  icon={<PlayCircleOutlined />}
                  onClick={handleResume}
                  style={{ backgroundColor: '#52c41a', borderColor: '#52c41a' }}
                >
                  继续上传
                </Button>
              ) : (
                <Button
                  icon={<PauseCircleOutlined />}
                  onClick={handlePause}
                  style={{ backgroundColor: '#faad14', borderColor: '#faad14', color: '#fff' }}
                >
                  暂停上传
                </Button>
              )}
              <Button danger icon={<StopOutlined />} onClick={handleCancel}>
                取消上传
              </Button>
            </Space>
          )
        }
        closable={batchCompleted}
        onCancel={batchCompleted ? handleCloseBatchProgressModal : undefined}
        maskClosable={false}
      >
        {/* 总体进度 */}
        <div style={{ marginBottom: 16 }}>
          {batchCompleted ? (
            <Alert
              message="所有视频发布任务已完成"
              type="success"
              showIcon
              icon={<CheckCircleOutlined />}
            />
          ) : isPaused ? (
            <Alert message="上传已暂停，点击【继续上传】按钮恢复" type="warning" showIcon />
          ) : (
            <Alert message="正在发布视频，请勿关闭应用程序..." type="info" showIcon />
          )}
        </div>

        {/* 每个账号的进度 - 按照profiles的排序顺序显示 */}
        <div style={{ maxHeight: 500, overflowY: 'auto' }}>
          {profiles
            .filter((p) => batchProgress[p.id]) // 只显示在批量发布中的账号
            .map((profile) => {
            const profileId = profile.id
            const progress = batchProgress[profileId]

            const isCompleted = progress.status === 'completed'
            const stepProgress = progress.stepProgress
            const videoPercent = progress.total > 0 ? Math.round((progress.current / progress.total) * 100) : 0
            const stepPercent = stepProgress
              ? Math.round((stepProgress.step / stepProgress.totalSteps) * 100)
              : 0

            return (
              <div
                key={profileId}
                style={{
                  marginBottom: 16,
                  padding: 12,
                  border: '1px solid #f0f0f0',
                  borderRadius: 8,
                  backgroundColor: isCompleted ? '#f6ffed' : '#fff'
                }}
              >
                {/* 账号标题和视频进度 */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Space>
                    <Text strong>{profile.name}</Text>
                    {profile.account_type === 'monetized' && <Tag color="gold">创收号</Tag>}
                    {isCompleted ? (
                      <Tag color="success" icon={<CheckCircleOutlined />}>已完成</Tag>
                    ) : progress.status === 'pending' ? (
                      <Tag color="default">等待中</Tag>
                    ) : stepProgress?.status === 'error' ? (
                      <Tag color="error" icon={<CloseCircleOutlined />}>出错</Tag>
                    ) : (
                      <Tag color="processing" icon={<LoadingOutlined />}>发布中</Tag>
                    )}
                  </Space>
                  <Text type="secondary">
                    视频 {progress.current}/{progress.total}
                  </Text>
                </div>

                {/* 当前视频名称 */}
                {progress.currentVideo && !isCompleted && (
                  <div style={{ marginTop: 8 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      当前视频: <Text code style={{ fontSize: 12 }}>{progress.currentVideo}</Text>
                    </Text>
                  </div>
                )}

                {/* 步骤进度（只在发布中且有步骤进度时显示） */}
                {stepProgress && !isCompleted && (
                  <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px dashed #f0f0f0' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <Space size={4}>
                        {stepProgress.status === 'running' && <LoadingOutlined style={{ color: '#1890ff', fontSize: 12 }} />}
                        {stepProgress.status === 'success' && <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 12 }} />}
                        {stepProgress.status === 'error' && <CloseCircleOutlined style={{ color: '#ff4d4f', fontSize: 12 }} />}
                        <Text style={{ fontSize: 13 }}>
                          步骤 {stepProgress.step}/{stepProgress.totalSteps}: {stepProgress.stepName}
                        </Text>
                      </Space>
                    </div>
                    <Progress
                      percent={stepPercent}
                      size="small"
                      strokeColor={stepProgress.status === 'error' ? '#ff4d4f' : '#1890ff'}
                      status={stepProgress.status === 'error' ? 'exception' : 'active'}
                      showInfo={false}
                    />
                    {stepProgress.error && (
                      <div style={{ marginTop: 4 }}>
                        <Text type="danger" style={{ fontSize: 12 }}>
                          错误: {stepProgress.error}
                        </Text>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </Modal>
    </div>
  )
}

export default HomePage
