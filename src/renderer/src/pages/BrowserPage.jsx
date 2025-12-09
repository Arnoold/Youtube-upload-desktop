import React, { useState, useEffect } from 'react'
import { Typography, Button, message, Table, Modal, Form, Input, Select, Space, Dropdown } from 'antd'
import { SyncOutlined, PlusOutlined, EditOutlined, DeleteOutlined, FolderOutlined, MoreOutlined, HolderOutlined } from '@ant-design/icons'
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core'
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'

const { Title } = Typography
const { TextArea } = Input

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

// 账号类型选项
const ACCOUNT_TYPES = [
  { value: 'normal', label: '普通号' },
  { value: 'monetized', label: '创收号' }
]

// 浏览器类型选项
const BROWSER_TYPES = [
  { value: 'bitbrowser', label: 'BitBrowser (比特浏览器)' },
  { value: 'hubstudio', label: 'HubStudio' }
]

// 可排序行组件
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
    transform: CSS.Transform.toString(transform && { ...transform, scaleY: 1 }),
    transition,
    ...(isDragging ? { position: 'relative', zIndex: 9999, background: '#fafafa' } : {})
  }

  return (
    <tr {...props} ref={setNodeRef} style={style} {...attributes}>
      {React.Children.map(children, (child) => {
        if (child.key === 'drag') {
          return React.cloneElement(child, {
            children: (
              <HolderOutlined
                style={{ cursor: 'grab', color: '#999' }}
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

const BrowserPage = () => {
  const [connectionStatus, setConnectionStatus] = useState(null)
  const [hubstudioStatus, setHubstudioStatus] = useState(null)
  const [profiles, setProfiles] = useState([])
  const [testing, setTesting] = useState(false)
  const [testingHubstudio, setTestingHubstudio] = useState(false)
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingProfile, setEditingProfile] = useState(null)
  const [selectedBrowserType, setSelectedBrowserType] = useState('bitbrowser')
  const [form] = Form.useForm()

  const testConnection = async () => {
    setTesting(true)
    setTestingHubstudio(true)
    try {
      // 测试 BitBrowser
      const bitResult = await window.electron.browser.test()
      setConnectionStatus(bitResult)

      // 测试 HubStudio
      const hubResult = await window.electron.hubstudio.test()
      setHubstudioStatus(hubResult)

      if (bitResult.success || hubResult.success) {
        loadProfiles()
      }

      if (bitResult.success) {
        message.success('BitBrowser 连接成功！')
      }
      if (hubResult.success) {
        message.success('HubStudio 连接成功！')
      }
      if (!bitResult.success && !hubResult.success) {
        message.warning('所有浏览器连接均失败')
      }
    } catch (error) {
      message.error(`测试失败: ${error.message}`)
      setConnectionStatus({ success: false, error: error.message })
    } finally {
      setTesting(false)
      setTestingHubstudio(false)
    }
  }

  const loadProfiles = async () => {
    setLoading(true)
    try {
      // Phase 1: 快速加载数据并显示（不等待状态检查）
      const dbProfiles = await window.electron.db.getBrowserProfiles()
      console.log('BrowserPage - 数据库账号列表:', dbProfiles)

      if (!dbProfiles || !Array.isArray(dbProfiles)) {
        setProfiles([])
        setLoading(false)
        return
      }

      // 并行获取浏览器列表元数据 (不包括状态)
      const [bitBrowserResult, hubstudioResult] = await Promise.all([
        window.electron.browser.list().catch(e => ({ data: { list: [] } })),
        window.electron.hubstudio.list().catch(e => ({ data: { list: [] } }))
      ])

      const bitBrowserProfiles = bitBrowserResult?.data?.list || []
      const hubstudioProfiles = hubstudioResult?.data?.list || []

      // 初始合并（状态设为未知或默认）
      const initialProfiles = dbProfiles.map((dbProfile) => {
        const browserType = dbProfile.browser_type || 'bitbrowser'
        let remark = ''
        let browserStatus = 'not_found'

        if (browserType === 'hubstudio') {
          const bitBrowserIdStr = String(dbProfile.bit_browser_id)
          const hubProfile = hubstudioProfiles.find(
            (hp) => {
              const containerCodeStr = String(hp.containerCode || '')
              const idStr = String(hp.id || '')
              const envIdStr = String(hp.envId || '')
              const profileIdStr = String(hp.profileId || '')
              return containerCodeStr === bitBrowserIdStr ||
                idStr === bitBrowserIdStr ||
                envIdStr === bitBrowserIdStr ||
                profileIdStr === bitBrowserIdStr
            }
          )
          if (hubProfile) {
            browserStatus = 'active'
            remark = hubProfile.containerName || hubProfile.name || ''
          }
        } else {
          // BitBrowser
          const bitProfile = bitBrowserProfiles.find(
            (bp) => bp.id === dbProfile.bit_browser_id
          )
          if (bitProfile) {
            browserStatus = 'active'
            remark = bitProfile?.remark || ''
          }
        }

        return {
          ...dbProfile,
          remark,
          browserStatus,
          isRunning: false // 初始暂设为 false，稍后更新
        }
      })

      // 立即更新 UI
      setProfiles(initialProfiles)
      setLoading(false)

      // Phase 2: 后台异步检查运行状态 (Running Status)
      checkRunningStatuses(initialProfiles)

    } catch (error) {
      console.error('Failed to load profiles:', error)
      setLoading(false)
    }
  }

  // 独立的状态检查函数
  const checkRunningStatuses = async (currentProfiles) => {
    // 1. 批量检查 HubStudio 状态
    const hubStudioProfiles = currentProfiles.filter(p => p.browser_type === 'hubstudio' && p.browserStatus === 'active')
    const hubStudioIds = hubStudioProfiles.map(p => p.bit_browser_id)

    let hubStudioStatusMap = {}
    if (hubStudioIds.length > 0) {
      try {
        console.log('Batch checking HubStudio status for:', hubStudioIds)
        const batchResult = await window.electron.hubstudio.batchStatus(hubStudioIds)
        if (batchResult.success) {
          hubStudioStatusMap = batchResult.data
        }
      } catch (e) {
        console.error('Failed to batch check HubStudio:', e)
      }
    }

    // 2. 逐个检查 BitBrowser 状态 (本地服务通常较快，暂保持逐个检查或后续优化)
    //为了不阻塞渲染，我们使用 Promise.all 但不 await 它的整体结果来阻塞上面的 HubStudio，
    //而是获取所有结果后一次性更新，或者分批更新。这里选择一次性更新。

    const bitBrowserProfiles = currentProfiles.filter(p => p.browser_type !== 'hubstudio' && p.browserStatus === 'active')
    const bitBrowserStatusMap = {}

    await Promise.all(bitBrowserProfiles.map(async (p) => {
      try {
        const statusResult = await window.electron.browser.checkStatus(p.bit_browser_id)
        const isRunning = statusResult?.data?.status === 'Active' ||
          statusResult?.status === 'Active' ||
          statusResult?.data?.status === 'active'
        if (isRunning) {
          bitBrowserStatusMap[p.bit_browser_id] = true
        }
      } catch (e) {
        // ignore
      }
    }))

    // 3. 更新所有状态
    setProfiles((prevProfiles) => {
      return prevProfiles.map(p => {
        let isRunning = false
        if (p.browser_type === 'hubstudio') {
          // HubStudio 使用批量结果
          const status = hubStudioStatusMap[p.bit_browser_id] // 'Active' or 'Inactive'
          isRunning = status === 'Active'
        } else {
          // BitBrowser 使用 Map 结果
          isRunning = !!bitBrowserStatusMap[p.bit_browser_id]
        }

        // 只有状态改变时才更新，避免不必要的重渲染 (React 会自动处理，但逻辑上明确点也好)
        return {
          ...p,
          isRunning
        }
      })
    })
  }

  useEffect(() => {
    testConnection()
  }, [])

  const handleAddProfile = () => {
    setEditingProfile(null)
    form.resetFields()
    form.setFieldsValue({
      defaultTimezone: 'Asia/Shanghai',
      accountType: 'normal',
      browserType: 'bitbrowser'
    })
    setSelectedBrowserType('bitbrowser')
    setModalVisible(true)
  }

  const handleEditProfile = (profile) => {
    setEditingProfile(profile)
    // 解析 default_tags
    let defaultTags = ''
    if (profile.default_tags) {
      try {
        const tagsArray = JSON.parse(profile.default_tags)
        defaultTags = tagsArray.join(', ')
      } catch (e) {
        defaultTags = profile.default_tags
      }
    }

    const browserType = profile.browser_type || 'bitbrowser'
    setSelectedBrowserType(browserType)

    form.setFieldsValue({
      name: profile.name,
      bitBrowserId: profile.bit_browser_id,
      folderPath: profile.folder_path,
      defaultTimezone: profile.default_timezone || 'Asia/Shanghai',
      defaultDescription: profile.default_description,
      defaultTags: defaultTags,
      accountType: profile.account_type || 'normal',
      browserType: browserType
    })
    setModalVisible(true)
  }

  const handleDeleteProfile = async (profileId) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除这个账号配置吗？',
      onOk: async () => {
        try {
          await window.electron.db.deleteBrowserProfile(profileId)
          message.success('删除成功')
          loadProfiles()
        } catch (error) {
          message.error(`删除失败: ${error.message}`)
        }
      }
    })
  }

  const handleSelectFolder = async () => {
    try {
      // 使用 Electron 的文件选择对话框
      const result = await window.electron.dialog.selectFolder()
      if (result && !result.canceled && result.filePaths.length > 0) {
        form.setFieldsValue({ folderPath: result.filePaths[0] })
      }
    } catch (error) {
      message.error(`选择文件夹失败: ${error.message}`)
    }
  }

  const handleSaveProfile = async () => {
    try {
      const values = await form.validateFields()

      // 处理标签：将逗号分隔的字符串转换为 JSON 数组
      let tagsJson = null
      if (values.defaultTags && values.defaultTags.trim()) {
        const tagsArray = values.defaultTags.split(',').map(tag => tag.trim()).filter(tag => tag)
        tagsJson = JSON.stringify(tagsArray)
      }

      const profileData = {
        name: values.name,
        bitBrowserId: values.bitBrowserId,
        folderPath: values.folderPath,
        defaultTimezone: values.defaultTimezone,
        defaultDescription: values.defaultDescription,
        defaultTags: tagsJson,
        accountType: values.accountType,
        browserType: values.browserType || 'bitbrowser'
      }

      if (editingProfile) {
        // 更新现有配置
        await window.electron.db.updateBrowserProfile(editingProfile.id, profileData)
        message.success('更新成功')
      } else {
        // 创建新配置
        await window.electron.db.saveBrowserProfile(profileData)
        message.success('添加成功')
      }

      setModalVisible(false)
      loadProfiles()
    } catch (error) {
      if (error.errorFields) {
        // 表单验证错误
        return
      }
      message.error(`保存失败: ${error.message}`)
    }
  }

  // 拖拽排序传感器配置
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

  // 处理拖拽结束
  const handleDragEnd = async (event) => {
    const { active, over } = event
    console.log('拖拽结束:', { activeId: active.id, overId: over?.id })

    if (active.id !== over?.id) {
      const oldIndex = profiles.findIndex((item) => item.id === active.id)
      const newIndex = profiles.findIndex((item) => item.id === over?.id)
      console.log('拖拽位置变化:', { oldIndex, newIndex })

      const newProfiles = arrayMove(profiles, oldIndex, newIndex)
      setProfiles(newProfiles)

      // 更新排序到数据库
      try {
        const orderedProfiles = newProfiles.map((p, index) => ({
          id: p.id,
          sort_order: index
        }))
        console.log('发送排序数据:', orderedProfiles)
        const result = await window.electron.db.updateProfilesOrder(orderedProfiles)
        console.log('保存排序结果:', result)
        if (result && result.success) {
          message.success('排序已保存')
        } else {
          message.warning('排序可能未保存成功')
          loadProfiles()
        }
      } catch (error) {
        console.error('保存排序失败:', error)
        message.error('保存排序失败')
        // 恢复原来的顺序
        loadProfiles()
      }
    }
  }

  const columns = [
    {
      key: 'drag',
      width: 40,
      render: () => <HolderOutlined style={{ cursor: 'grab', color: '#999' }} />
    },
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      width: 120
    },
    {
      title: '浏览器类型',
      dataIndex: 'browser_type',
      key: 'browser_type',
      width: 110,
      render: (type) => {
        if (type === 'hubstudio') {
          return <Typography.Text style={{ color: '#722ed1' }}>HubStudio</Typography.Text>
        }
        return <Typography.Text style={{ color: '#1890ff' }}>BitBrowser</Typography.Text>
      }
    },
    {
      title: '账号类型',
      dataIndex: 'account_type',
      key: 'account_type',
      width: 90,
      render: (type) => {
        if (type === 'monetized') {
          return <Typography.Text type="success">创收号</Typography.Text>
        }
        return <Typography.Text>普通号</Typography.Text>
      }
    },
    {
      title: '浏览器ID',
      dataIndex: 'bit_browser_id',
      key: 'bit_browser_id',
      width: 150,
      ellipsis: true
    },
    {
      title: '配置状态',
      dataIndex: 'browserStatus',
      key: 'browserStatus',
      width: 100,
      render: (status) => {
        if (status === 'active') {
          return <Typography.Text type="success">✓ 正常</Typography.Text>
        } else if (status === 'not_found') {
          return <Typography.Text type="danger">✗ 未找到</Typography.Text>
        }
        return <Typography.Text type="warning">? 未知</Typography.Text>
      }
    },
    {
      title: '运行状态',
      dataIndex: 'isRunning',
      key: 'isRunning',
      width: 100,
      render: (isRunning, record) => {
        if (record.browserStatus === 'not_found') {
          return <Typography.Text type="secondary">-</Typography.Text>
        }
        if (isRunning) {
          return <Typography.Text type="success">● 运行中</Typography.Text>
        } else {
          return <Typography.Text type="secondary">○ 已关闭</Typography.Text>
        }
      }
    },
    {
      title: '备注',
      dataIndex: 'remark',
      key: 'remark',
      width: 150,
      ellipsis: true
    },
    {
      title: '文件夹路径',
      dataIndex: 'folder_path',
      key: 'folder_path',
      width: 250,
      ellipsis: true
    },
    {
      title: '默认时区',
      dataIndex: 'default_timezone',
      key: 'default_timezone',
      width: 200,
      render: (timezone) => {
        const tz = TIMEZONES.find(t => t.value === timezone)
        return tz ? tz.label : timezone || '-'
      }
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      fixed: 'right',
      render: (_, record) => (
        <Dropdown
          menu={{
            items: [
              {
                key: 'edit',
                icon: <EditOutlined />,
                label: '编辑',
                onClick: () => handleEditProfile(record)
              },
              {
                key: 'delete',
                icon: <DeleteOutlined />,
                label: '删除',
                danger: true,
                onClick: () => handleDeleteProfile(record.id)
              }
            ]
          }}
          trigger={['click']}
        >
          <Button type="text" icon={<MoreOutlined />} />
        </Dropdown>
      )
    }
  ]

  return (
    <div>
      <Title level={2}>发布账号管理</Title>

      <div style={{ marginBottom: 24 }}>
        <Space>
          <Button
            icon={<SyncOutlined />}
            onClick={testConnection}
            loading={testing || testingHubstudio}
            type={(connectionStatus?.success || hubstudioStatus?.success) ? 'primary' : 'default'}
          >
            测试连接
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleAddProfile}
          >
            添加账号
          </Button>
        </Space>
        <div style={{ marginTop: 12 }}>
          <Space size={16}>
            {connectionStatus && (
              <Typography.Text type={connectionStatus.success ? 'success' : 'secondary'}>
                {connectionStatus.success ? '✅ BitBrowser 已连接' : '○ BitBrowser 未连接'}
              </Typography.Text>
            )}
            {hubstudioStatus && (
              <Typography.Text type={hubstudioStatus.success ? 'success' : 'secondary'}>
                {hubstudioStatus.success ? '✅ HubStudio 已连接' : '○ HubStudio 未连接'}
              </Typography.Text>
            )}
          </Space>
        </div>
      </div>

      {(connectionStatus?.success || hubstudioStatus?.success) && (
        <>
          <Title level={4}>浏览器配置列表</Title>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
            modifiers={[restrictToVerticalAxis]}
          >
            <SortableContext
              items={profiles.map((p) => p.id)}
              strategy={verticalListSortingStrategy}
            >
              <Table
                columns={columns}
                dataSource={profiles}
                rowKey="id"
                loading={loading}
                pagination={false}
                scroll={{ x: 1200 }}
                components={{
                  body: {
                    row: SortableRow
                  }
                }}
              />
            </SortableContext>
          </DndContext>
        </>
      )}

      <Modal
        title={editingProfile ? '编辑账号配置' : '添加账号配置'}
        open={modalVisible}
        onOk={handleSaveProfile}
        onCancel={() => setModalVisible(false)}
        width={600}
        okText="保存"
        cancelText="取消"
      >
        <Form
          form={form}
          layout="vertical"
          style={{ marginTop: 20 }}
        >
          <Form.Item
            label="账号名称"
            name="name"
            rules={[{ required: true, message: '请输入账号名称' }]}
          >
            <Input placeholder="请输入账号名称" />
          </Form.Item>

          <Form.Item
            label="浏览器类型"
            name="browserType"
            rules={[{ required: true, message: '请选择浏览器类型' }]}
          >
            <Select
              placeholder="请选择浏览器类型"
              options={BROWSER_TYPES}
              onChange={(value) => setSelectedBrowserType(value)}
            />
          </Form.Item>

          <Form.Item
            label={selectedBrowserType === 'hubstudio' ? 'HubStudio Profile ID' : 'BitBrowser ID'}
            name="bitBrowserId"
            rules={[{ required: true, message: `请输入${selectedBrowserType === 'hubstudio' ? 'HubStudio Profile ID' : 'BitBrowser ID'}` }]}
            tooltip={selectedBrowserType === 'hubstudio' ? '从 HubStudio 浏览器列表中复制 Profile ID' : '从比特浏览器列表中复制浏览器 ID'}
          >
            <Input placeholder={`请输入${selectedBrowserType === 'hubstudio' ? 'HubStudio Profile ID' : 'BitBrowser ID'}`} />
          </Form.Item>

          <Form.Item
            label="账号类型"
            name="accountType"
            rules={[{ required: true, message: '请选择账号类型' }]}
            tooltip="普通号和创收号的发布流程不同"
          >
            <Select
              placeholder="请选择账号类型"
              options={ACCOUNT_TYPES}
            />
          </Form.Item>

          <Form.Item
            label="视频文件夹路径"
            name="folderPath"
          >
            <Input
              placeholder="请选择视频文件夹路径"
              addonAfter={
                <FolderOutlined
                  style={{ cursor: 'pointer' }}
                  onClick={handleSelectFolder}
                />
              }
            />
          </Form.Item>

          <Form.Item
            label="默认时区"
            name="defaultTimezone"
            rules={[{ required: true, message: '请选择默认时区' }]}
          >
            <Select
              showSearch
              placeholder="请选择默认时区"
              options={TIMEZONES}
              filterOption={(input, option) =>
                option.label.toLowerCase().includes(input.toLowerCase())
              }
            />
          </Form.Item>

          <Form.Item
            label="默认视频说明"
            name="defaultDescription"
            tooltip="发布视频时的默认说明文案"
          >
            <TextArea
              rows={4}
              placeholder="请输入默认视频说明"
            />
          </Form.Item>

          <Form.Item
            label="默认视频标签"
            name="defaultTags"
            tooltip="多个标签用英文逗号分隔，例如：旅游, 美食, Vlog"
          >
            <Input placeholder="请输入默认标签，用逗号分隔" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default BrowserPage
