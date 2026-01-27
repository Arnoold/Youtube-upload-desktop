import React, { useState, useEffect } from 'react'
import { Typography, Button, message, Table, Form, Input, Select, DatePicker, Space, Card, InputNumber, Tag, Modal, Progress, Popconfirm, Divider, Tabs, Empty, ConfigProvider, Row, Col, Checkbox } from 'antd'
import { SearchOutlined, PlayCircleOutlined, ReloadOutlined, StopOutlined, PlusOutlined, DeleteOutlined, EyeOutlined, ArrowLeftOutlined, HistoryOutlined, AppstoreOutlined, CheckSquareOutlined, PoweroffOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import utc from 'dayjs/plugin/utc'
import timezone from 'dayjs/plugin/timezone'
import zhCN from 'antd/locale/zh_CN'
import 'dayjs/locale/zh-cn'

// 配置 dayjs
dayjs.extend(utc)
dayjs.extend(timezone)
dayjs.locale('zh-cn')

const { Title, Text } = Typography
const { Option } = Select
const { RangePicker } = DatePicker

// 格式化播放量：大于1万显示 xx万，小于1万显示实际数字
const formatViewCount = (count) => {
    if (!count && count !== 0) return '-'
    if (count >= 10000) {
        return (count / 10000).toFixed(1).replace(/\.0$/, '') + '万'
    }
    return count.toLocaleString()
}

// 格式化发布时间为北京时间
const formatPublishTime = (date) => {
    if (!date) return '-'
    return dayjs(date).tz('Asia/Shanghai').format('YYYY-MM-DD HH:mm:ss')
}

// 将UTC时间转换为本地时间显示
const formatLocalTime = (date, format = 'MM-DD HH:mm') => {
    if (!date) return '-'
    // SQLite CURRENT_TIMESTAMP 存储的是UTC时间，需要转换为本地时间
    return dayjs.utc(date).local().format(format)
}

// 状态映射
const STATUS_MAP = {
    'pending': '等待中',
    'processing': '执行中',
    'completed': '已完成',
    'failed': '失败',
    'cancelled': '已取消',
    'error': '错误',
    'video_deleted': '视频已删除',
    'video_error': '视频异常',
    'timeout': '已超时'
}

const STATUS_COLOR_MAP = {
    'pending': 'default',
    'processing': 'processing',
    'completed': 'success',
    'failed': 'error',
    'cancelled': 'warning',
    'error': 'error',
    'video_deleted': 'warning',
    'video_error': 'orange',
    'timeout': 'volcano'
}

const CommentaryTaskPage = () => {
    const [activeTab, setActiveTab] = useState('workspace')
    const [currentTaskId, setCurrentTaskId] = useState(null)

    // Helper to switch to workspace and load a task
    const loadTaskToWorkspace = (taskId) => {
        setCurrentTaskId(taskId)
        setActiveTab('workspace')
    }

    // 关闭所有比特浏览器
    const handleCloseAllBitBrowser = async () => {
        try {
            const result = await window.electron.browser.closeAllBitBrowser()
            if (result.closed > 0) {
                message.success(`已关闭 ${result.closed} 个比特浏览器`)
            } else if (result.message) {
                message.info(result.message)
            } else {
                message.info('没有需要关闭的比特浏览器')
            }
        } catch (error) {
            message.error('关闭比特浏览器失败: ' + error.message)
        }
    }

    // 关闭所有 HubStudio 浏览器
    const handleCloseAllHubStudio = async () => {
        try {
            const result = await window.electron.browser.closeAllHubStudio()
            if (result.closed > 0) {
                message.success(`已关闭 ${result.closed} 个 HubStudio 浏览器`)
            } else if (result.message) {
                message.info(result.message)
            } else {
                message.info('没有需要关闭的 HubStudio 浏览器')
            }
        } catch (error) {
            message.error('关闭 HubStudio 浏览器失败: ' + error.message)
        }
    }

    return (
        <ConfigProvider locale={zhCN}>
            <div style={{ paddingBottom: 20 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <Title level={2} style={{ margin: 0 }}>解说词生成任务</Title>
                    <Space>
                        <Popconfirm
                            title="确认关闭"
                            description="确定要关闭所有比特浏览器吗？"
                            onConfirm={handleCloseAllBitBrowser}
                            okText="确定"
                            cancelText="取消"
                        >
                            <Button
                                icon={<PoweroffOutlined />}
                                danger
                            >
                                关闭所有比特浏览器
                            </Button>
                        </Popconfirm>
                        <Popconfirm
                            title="确认关闭"
                            description="确定要关闭所有HubStudio浏览器吗？"
                            onConfirm={handleCloseAllHubStudio}
                            okText="确定"
                            cancelText="取消"
                        >
                            <Button
                                icon={<PoweroffOutlined />}
                                danger
                            >
                                关闭所有HubStudio浏览器
                            </Button>
                        </Popconfirm>
                    </Space>
                </div>

                <Tabs
                    activeKey={activeTab}
                    onChange={setActiveTab}
                    type="card"
                    items={[
                        {
                            key: 'workspace',
                            label: '当前任务 / 创建新任务',
                            children: <WorkspaceTab taskId={currentTaskId} onTaskCreated={loadTaskToWorkspace} onClearTask={() => setCurrentTaskId(null)} />
                        },
                        {
                            key: 'history',
                            label: '历史任务记录',
                            children: <HistoryTab onLoadTask={loadTaskToWorkspace} isActive={activeTab === 'history'} />
                        }
                    ]}
                />
            </div>
        </ConfigProvider>
    )
}

// === Tab 1: Workspace (Create or Execute) ===
const WorkspaceTab = ({ taskId, onTaskCreated, onClearTask }) => {
    // If taskId is present, show Execution View. Otherwise show Filter/Create View.
    if (taskId) {
        return (
            <TaskExecutionView
                taskId={taskId}
                onBack={onClearTask}
            />
        )
    }

    return <CreateTaskView onTaskCreated={onTaskCreated} />
}

// Sub-view: Filter & Create
const CreateTaskView = ({ onTaskCreated }) => {
    const [loading, setLoading] = useState(false)
    const [videos, setVideos] = useState([])
    const [channelOptions, setChannelOptions] = useState([])
    const [channelSearching, setChannelSearching] = useState(false)
    const [groups, setGroups] = useState([])
    const [form] = Form.useForm()
    const [createModalVisible, setCreateModalVisible] = useState(false)
    const [createForm] = Form.useForm()

    useEffect(() => {
        loadFilterOptions()
    }, [])

    const loadFilterOptions = async () => {
        try {
            const groupList = await window.electron.supabase.getGroups()
            setGroups(groupList || [])
            // 初始加载一些频道
            const initialChannels = await window.electron.supabase.searchChannels('', 50)
            setChannelOptions(initialChannels || [])
        } catch (error) {
            console.error('加载筛选选项失败:', error)
        }
    }

    // 频道远程搜索
    const handleChannelSearch = async (keyword) => {
        if (channelSearching) return
        setChannelSearching(true)
        try {
            const results = await window.electron.supabase.searchChannels(keyword, 50)
            setChannelOptions(results || [])
        } catch (error) {
            console.error('搜索频道失败:', error)
        } finally {
            setChannelSearching(false)
        }
    }

    const loadVideos = async () => {
        setLoading(true)
        try {
            const values = await form.validateFields()
            const baseOptions = {
                limit: 50, // 每页50条，减少单次查询量避免超时
                // 播放量输入的是"万"，需要乘以10000
                minViews: values.minViews ? values.minViews * 10000 : undefined,
                groupName: values.group,
                channelIds: values.channels, // 支持多频道筛选
                // Gemini生成状态筛选（支持多选）
                statusList: values.generationStatus && values.generationStatus.length > 0 ? values.generationStatus : undefined,
                sortBy: 'published_at',
                sortOrder: 'desc'
            }
            // 时间筛选（根据选择的时间类型）
            if (values.timeRange && values.timeRange.length === 2) {
                const timeRangeValue = [
                    values.timeRange[0].startOf('day').toISOString(),
                    values.timeRange[1].endOf('day').toISOString()
                ]
                if (values.timeType === 'created_at') {
                    baseOptions.createdAtRange = timeRangeValue
                } else {
                    baseOptions.dateRange = timeRangeValue
                }
            }

            // 自动分页获取所有视频
            let allVideos = []
            let page = 1
            let total = 0

            while (true) {
                const result = await window.electron.supabase.getVideos({ ...baseOptions, page })
                allVideos = allVideos.concat(result.data)

                // 显示加载进度
                if (allVideos.length > 0 && result.data.length === baseOptions.limit) {
                    message.loading({ content: `正在加载... 已获取 ${allVideos.length} 条`, key: 'loadingVideos', duration: 0 })
                }

                // 如果获取的数据少于 limit，说明已经是最后一页
                if (result.data.length < baseOptions.limit) {
                    break
                }
                page++
                // 安全限制：最多获取5000条
                if (allVideos.length >= 5000) {
                    message.warning('数据量过大，仅显示前5000条')
                    break
                }
            }

            message.destroy('loadingVideos')
            setVideos(allVideos)
            message.success(`已加载 ${allVideos.length} 条视频`)
        } catch (error) {
            message.destroy('loadingVideos')
            message.error(`加载失败: ${error.message}`)
        } finally {
            setLoading(false)
        }
    }

    const handleCreateTask = async () => {
        try {
            const values = await createForm.validateFields()
            const filterValues = await form.getFieldsValue()

            if (videos.length === 0) {
                message.warning('没有可添加的视频')
                return
            }

            const taskData = {
                name: values.taskName,
                filters: filterValues,
                items: videos.map(v => ({
                    video_id: v.video_id, // 使用 YouTube 视频 ID，不是数据库主键
                    id: v.id, // 数据库主键 ID，用于在 Supabase 中更新状态
                    url: v.url || `https://www.youtube.com/watch?v=${v.video_id}`, // 如果没有 url 字段，手动构建
                    title: v.title
                }))
            }

            const newTaskId = await window.electron.db.createCommentaryTask(taskData)
            message.success('任务创建成功')
            setCreateModalVisible(false)
            createForm.resetFields()

            // Switch to execution view
            onTaskCreated(newTaskId)
        } catch (error) {
            message.error('创建任务失败: ' + error.message)
        }
    }

    const columns = [
        { title: 'ID', dataIndex: 'id', width: 60, render: (id) => id ? Math.floor(id) : '-' },
        { title: '标题', dataIndex: 'title', ellipsis: true },
        { title: '频道', dataIndex: 'channel_name', width: 120 },
        { title: '播放量', dataIndex: 'view_count', width: 100, render: formatViewCount },
        { title: '发布时间', dataIndex: 'published_at', width: 180, render: formatPublishTime },
    ]

    // 默认筛选值
    const defaultFilterValues = {
        timeType: 'published_at', // 默认按发布时间筛选
        timeRange: [
            dayjs().subtract(4, 'day'), // 开始时间：往前推4天
            dayjs().add(1, 'day')       // 结束时间：往后推1天
        ],
        minViews: 10, // 默认：10万（输入框单位是"万"）
        generationStatus: ['pending_all'] // 默认：待生成（多选模式需要数组）
    }

    return (
        <Card title="第一步：筛选视频并创建任务">
            <Form form={form} onFinish={loadVideos} initialValues={defaultFilterValues}>
                <Row gutter={16}>
                    <Col span={14}>
                        <Form.Item name="channels" label="频道">
                            <Select
                                placeholder="输入频道名搜索（可多选）"
                                allowClear
                                showSearch
                                mode="multiple"
                                maxTagCount={3}
                                filterOption={false}
                                onSearch={handleChannelSearch}
                                loading={channelSearching}
                                options={channelOptions}
                                style={{ width: '100%' }}
                                notFoundContent={channelSearching ? '搜索中...' : '无匹配频道'}
                            />
                        </Form.Item>
                    </Col>
                    <Col span={10}>
                        <Form.Item name="group" label="分组">
                            <Select
                                placeholder="选择分组"
                                allowClear
                                showSearch
                                optionFilterProp="label"
                                options={groups}
                                style={{ width: '100%' }}
                            />
                        </Form.Item>
                    </Col>
                </Row>
                <Row gutter={16} align="middle">
                    <Col span={8}>
                        <Form.Item>
                            <Space.Compact style={{ width: '100%' }}>
                                <Form.Item name="timeType" noStyle>
                                    <Select style={{ width: 100 }}>
                                        <Option value="published_at">发布时间</Option>
                                        <Option value="created_at">添加时间</Option>
                                    </Select>
                                </Form.Item>
                                <Form.Item name="timeRange" noStyle>
                                    <RangePicker style={{ flex: 1 }} />
                                </Form.Item>
                            </Space.Compact>
                        </Form.Item>
                    </Col>
                    <Col span={5}>
                        <Form.Item label="最小播放量">
                            <Space.Compact style={{ width: '100%', minWidth: 100 }}>
                                <Form.Item name="minViews" noStyle>
                                    <InputNumber
                                        placeholder="如：200"
                                        style={{ width: '100%', minWidth: 60 }}
                                        min={0}
                                    />
                                </Form.Item>
                                <Button disabled style={{ cursor: 'default' }}>万</Button>
                            </Space.Compact>
                        </Form.Item>
                    </Col>
                    <Col span={5}>
                        <Form.Item name="generationStatus" label="生成状态">
                            <Select placeholder="全部" allowClear mode="multiple" maxTagCount={2} style={{ width: '100%' }}>
                                <Option value="pending_all">待生成</Option>
                                <Option value="generating">生成中</Option>
                                <Option value="completed">已完成</Option>
                                <Option value="failed">失败</Option>
                                <Option value="video_error">视频异常</Option>
                                <Option value="video_deleted">视频删除</Option>
                            </Select>
                        </Form.Item>
                    </Col>
                    <Col span={6} style={{ textAlign: 'right' }}>
                        <Form.Item>
                            <Button type="primary" htmlType="submit" icon={<SearchOutlined />} loading={loading} size="large">
                                预览筛选结果
                            </Button>
                        </Form.Item>
                    </Col>
                </Row>
            </Form>

            <Divider style={{ margin: '8px 0 16px' }} />

            <div style={{ marginBottom: 16 }}>
                <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    onClick={() => {
                        // 生成默认任务名称，包含日期范围
                        const timeRange = form.getFieldValue('timeRange')
                        let taskName = `任务 ${dayjs().format('MM-DD HH:mm')}`
                        if (timeRange && timeRange.length === 2) {
                            const startDate = timeRange[0].format('MM-DD')
                            const endDate = timeRange[1].format('MM-DD')
                            taskName = `任务 ${startDate} ~ ${endDate}`
                        }
                        createForm.setFieldsValue({ taskName })
                        setCreateModalVisible(true)
                    }}
                    disabled={videos.length === 0}
                    size="large"
                >
                    将当前 {videos.length} 个视频生成为新任务
                </Button>
            </div>

            <Table
                columns={columns}
                dataSource={videos}
                rowKey="id"
                loading={loading}
                size="small"
                pagination={{ pageSize: 10 }}
            />

            <Modal
                title="保存为新任务"
                open={createModalVisible}
                onOk={handleCreateTask}
                onCancel={() => setCreateModalVisible(false)}
            >
                <Form form={createForm} layout="vertical">
                    <Form.Item name="taskName" label="任务名称" rules={[{ required: true, message: '请输入任务名称' }]}>
                        <Input placeholder="例如：2023-10-27 热门视频处理" />
                    </Form.Item>
                    <p>确认将 {videos.length} 个视频添加到此任务吗？</p>
                </Form>
            </Modal>
        </Card>
    )
}

// Sub-view: Execution
const TaskExecutionView = ({ taskId, onBack }) => {
    const [task, setTask] = useState(null)
    const [items, setItems] = useState([])
    const [stats, setStats] = useState({ total: 0, completed: 0, failed: 0, pending: 0, processing: 0, video_deleted: 0, video_error: 0 })
    const [loading, setLoading] = useState(false)
    const [browserProfiles, setBrowserProfiles] = useState([])
    const [selectedProfiles, setSelectedProfiles] = useState([]) // 改为数组，支持多选
    const [processing, setProcessing] = useState(false)
    const [progress, setProgress] = useState(null)
    const [workerProgress, setWorkerProgress] = useState({}) // 每个worker的进度
    const [resultModalVisible, setResultModalVisible] = useState(false)
    const [resultModalContent, setResultModalContent] = useState(null)
    const [browserSelectModalVisible, setBrowserSelectModalVisible] = useState(false) // 浏览器选择弹窗
    const [tempSelectedProfiles, setTempSelectedProfiles] = useState([]) // 弹窗中的临时选择
    const [usageStats, setUsageStats] = useState({}) // 账号使用统计 { bit_browser_id: { daily_count, total_count } }
    const [closeAfterFinish, setCloseAfterFinish] = useState(true) // 执行结束后关闭所有浏览器
    const closeAfterFinishRef = React.useRef(closeAfterFinish) // 用于在回调中获取最新值

    // 同步 ref 和 state
    React.useEffect(() => {
        closeAfterFinishRef.current = closeAfterFinish
    }, [closeAfterFinish])

    // 显示结果弹窗
    const showResultModal = (content, isError = false) => {
        setResultModalContent({ content, isError })
        setResultModalVisible(true)
    }

    // 加载使用统计
    const loadUsageStats = async () => {
        try {
            const stats = await window.electron.aiStudio.getUsageStats()
            // 转换为以 bit_browser_id 为 key 的对象
            const statsMap = {}
            stats.forEach(s => {
                if (s.bit_browser_id) {
                    statsMap[s.bit_browser_id] = s
                }
            })
            setUsageStats(statsMap)
        } catch (e) {
            console.error('Failed to load usage stats:', e)
        }
    }

    // 打开浏览器选择弹窗
    const openBrowserSelectModal = () => {
        setTempSelectedProfiles([...selectedProfiles])
        loadUsageStats() // 加载统计
        setBrowserSelectModalVisible(true)
    }

    // 确认浏览器选择
    const confirmBrowserSelect = () => {
        setSelectedProfiles(tempSelectedProfiles)
        setBrowserSelectModalVisible(false)
        // 保存选择到 localStorage
        try {
            localStorage.setItem('commentary_selected_browsers', JSON.stringify(tempSelectedProfiles))
        } catch (e) {
            console.error('Failed to save browser selection:', e)
        }
    }

    // 全选/取消全选
    const handleSelectAll = () => {
        if (tempSelectedProfiles.length === browserProfiles.length) {
            setTempSelectedProfiles([])
        } else {
            setTempSelectedProfiles(browserProfiles.map(p => p.bit_browser_id))
        }
    }

    // 单个浏览器选择切换
    const handleBrowserToggle = (browserId) => {
        if (tempSelectedProfiles.includes(browserId)) {
            setTempSelectedProfiles(tempSelectedProfiles.filter(id => id !== browserId))
        } else {
            setTempSelectedProfiles([...tempSelectedProfiles, browserId])
        }
    }

    useEffect(() => {
        loadTaskAndItems()
        loadProfiles()
        checkStatus()
    }, [taskId])

    const loadTaskAndItems = async () => {
        setLoading(true)
        try {
            const taskInfo = await window.electron.db.getCommentaryTaskById(taskId)
            if (!taskInfo) {
                const tasks = await window.electron.db.getCommentaryTasks()
                const found = tasks.find(t => t.id === taskId)
                setTask(found)
            } else {
                setTask(taskInfo)
            }

            const list = await window.electron.db.getCommentaryTaskItems(taskId)
            setItems(list)

            // 加载统计信息
            const taskStats = await window.electron.db.getCommentaryTaskStats(taskId)
            setStats(taskStats)
        } catch (error) {
            message.error('加载任务详情失败')
        } finally {
            setLoading(false)
        }
    }

    const loadProfiles = async () => {
        try {
            const profiles = await window.electron.db.getAIStudioAccounts()
            const activeProfiles = profiles.filter(p => p.status === 'active')
            setBrowserProfiles(activeProfiles)

            // 从 localStorage 恢复上次选中的浏览器
            try {
                const savedSelection = localStorage.getItem('commentary_selected_browsers')
                if (savedSelection) {
                    const savedIds = JSON.parse(savedSelection)
                    // 只恢复仍然存在且活跃的浏览器
                    const validIds = savedIds.filter(id =>
                        activeProfiles.some(p => p.bit_browser_id === id)
                    )
                    if (validIds.length > 0) {
                        setSelectedProfiles(validIds)
                    }
                }
            } catch (e) {
                console.error('Failed to restore browser selection:', e)
            }
        } catch (error) { console.error(error) }
    }

    const checkStatus = async () => {
        try {
            const status = await window.electron.aiStudio.getStatus()
            if (status.isProcessing && status.currentTask && status.currentTask.id === taskId) {
                setProcessing(true)
            }
        } catch (e) { }
    }

    // 关闭所有浏览器
    const closeAllBrowsers = async () => {
        try {
            console.log('任务结束，正在关闭所有浏览器...')
            const [bitResult, hubResult] = await Promise.all([
                window.electron.browser.closeAllBitBrowser(),
                window.electron.browser.closeAllHubStudio()
            ])
            const totalClosed = (bitResult.closed || 0) + (hubResult.closed || 0)
            if (totalClosed > 0) {
                message.info(`已关闭 ${totalClosed} 个浏览器`)
            }
        } catch (e) {
            console.error('关闭浏览器失败:', e)
        }
    }

    // Progress Listener
    useEffect(() => {
        const handleProgress = (data) => {
            if (data.taskId === taskId) {
                setProgress(data)

                // 更新 worker 进度
                if (data.workerId && (data.type === 'worker' || data.type === 'single')) {
                    setWorkerProgress(prev => ({
                        ...prev,
                        [data.workerId]: {
                            status: data.status,
                            message: data.message,
                            videoId: data.videoId
                        }
                    }))
                }

                // Handle terminal states (整个任务完成)
                if (data.type === 'task' && (data.status === 'completed' || data.status === 'error' || data.status === 'cancelled' || data.status === 'rate_limited')) {
                    setProcessing(false)
                    setWorkerProgress({})
                    loadTaskAndItems()

                    if (data.status === 'completed') {
                        message.success('任务完成')
                    } else if (data.status === 'error') {
                        message.error('任务出错: ' + (data.error || data.message || '未知错误'))
                    } else if (data.status === 'cancelled') {
                        message.warning('任务已取消')
                    } else if (data.status === 'rate_limited') {
                        message.warning('所有浏览器账号已达今日使用上限')
                    }

                    // 任务结束后关闭所有浏览器
                    if (closeAfterFinishRef.current) {
                        closeAllBrowsers()
                    }
                }

                // 兼容旧的单浏览器模式
                if (!data.type && (data.status === 'completed' || data.status === 'error' || data.status === 'cancelled')) {
                    if (data.current >= data.total) {
                        setProcessing(false)
                        loadTaskAndItems()
                        message.success('任务完成')

                        // 任务结束后关闭所有浏览器
                        if (closeAfterFinishRef.current) {
                            closeAllBrowsers()
                        }
                    }
                }

                // Update item status locally
                if (data.type === 'single' && (data.status === 'completed' || data.status === 'error')) {
                    setItems(prev => prev.map(item => {
                        const video = item.video_info
                        if (video.id === data.videoId) {
                            return {
                                ...item,
                                status: data.status === 'completed' ? 'completed' : 'failed',
                                result: data.response,
                                error: data.error
                            }
                        }
                        return item
                    }))
                }
            }
        }
        window.electron.aiStudio.onProgress(handleProgress)
        return () => window.electron.aiStudio.removeListener('aistudio:progress')
    }, [taskId])

    const handleStart = async (forceStart = false) => {
        if (!selectedProfiles || selectedProfiles.length === 0) {
            message.warning('请选择至少一个执行账号')
            return
        }

        // 如果是强制启动，先重置状态
        if (forceStart) {
            try {
                await window.electron.aiStudio.forceReset()
            } catch (e) {
                console.error('Force reset failed:', e)
            }
        }

        setProcessing(true)
        setWorkerProgress({}) // 清空工作进度
        try {
            const result = await window.electron.aiStudio.startTask(taskId, selectedProfiles)
            if (result.parallel) {
                message.success(`已启动 ${result.workerCount} 个浏览器并行执行`)
            } else {
                message.success('任务已启动')
            }
        } catch (error) {
            // 检查是否是任务冲突错误
            if (error.message && error.message.includes('已有任务正在处理中')) {
                Modal.confirm({
                    title: '任务冲突',
                    content: '当前已有任务正在执行中，是否强制结束之前的任务并启动新任务？',
                    okText: '强制执行',
                    okType: 'danger',
                    cancelText: '取消',
                    onOk: () => {
                        handleStart(true) // 强制启动
                    },
                    onCancel: () => {
                        setProcessing(false)
                    }
                })
            } else {
                message.error('启动失败: ' + error.message)
                setProcessing(false)
            }
        }
    }

    const handleStop = async () => {
        try {
            await window.electron.aiStudio.stopTask()
            setProcessing(false)
            message.info('已停止')
        } catch (error) {
            message.error('停止失败')
        }
    }

    const handleForceReset = async () => {
        try {
            await window.electron.aiStudio.forceReset()
            setProcessing(false)
            setWorkerProgress({})
            message.success('状态已重置')
            loadTaskAndItems()
        } catch (error) {
            message.error('重置失败: ' + error.message)
        }
    }

    const itemColumns = [
        { title: 'ID', dataIndex: 'video_id', width: 80, render: (id) => id ? Math.floor(id) : '-' },
        {
            title: '标题',
            dataIndex: 'video_info',
            ellipsis: true,
            render: info => {
                const title = info?.title || '-'
                const url = info?.url || (info?.video_id ? `https://www.youtube.com/watch?v=${info.video_id}` : null)
                if (url) {
                    return (
                        <a
                            onClick={(e) => {
                                e.preventDefault()
                                window.electron.shell.openExternal(url)
                            }}
                            style={{ cursor: 'pointer', color: '#1890ff' }}
                        >
                            {title}
                        </a>
                    )
                }
                return title
            }
        },
        {
            title: '状态',
            dataIndex: 'status',
            width: 100,
            render: s => {
                const color = STATUS_COLOR_MAP[s] || 'default'
                return <Tag color={color}>{STATUS_MAP[s] || s}</Tag>
            }
        },
        {
            title: '结果/错误',
            dataIndex: 'result',
            ellipsis: true,
            render: (text, record) => {
                // 如果有错误信息，显示错误
                if (record.error) {
                    return (
                        <Text
                            type="danger"
                            style={{ maxWidth: 300, cursor: 'pointer' }}
                            ellipsis
                            onClick={() => showResultModal(record.error, true)}
                        >
                            {record.error}
                        </Text>
                    )
                }
                // 显示结果预览
                if (text) {
                    // 尝试解析 JSON 并显示简要信息
                    let displayText = text
                    let fullContent = text
                    try {
                        const parsed = typeof text === 'string' ? JSON.parse(text) : text
                        if (parsed.videoDescription) {
                            displayText = parsed.videoDescription
                        }
                        // 格式化 JSON 用于弹窗显示
                        fullContent = JSON.stringify(parsed, null, 2)
                    } catch (e) {
                        // 不是 JSON，直接显示
                        displayText = text.substring(0, 100)
                    }
                    return (
                        <Text
                            type="success"
                            style={{ maxWidth: 300, cursor: 'pointer' }}
                            ellipsis
                            onClick={() => showResultModal(fullContent, false)}
                        >
                            {displayText}
                        </Text>
                    )
                }
                return '-'
            }
        }
    ]

    return (
        <Card
            title={
                <Space>
                    <Button icon={<ArrowLeftOutlined />} onClick={onBack}>返回创建新任务</Button>
                    <span>当前任务：{task?.name}</span>
                    <Tag color={STATUS_COLOR_MAP[task?.status] || 'default'}>{STATUS_MAP[task?.status] || task?.status}</Tag>
                </Space>
            }
        >
            {/* 执行进度统计卡片 */}
            <Card size="small" style={{ marginBottom: 16 }}>
                <Row gutter={16} align="middle">
                    <Col flex="auto">
                        <Space size="large" wrap>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: 24, fontWeight: 'bold', color: '#1890ff' }}>{stats.total}</div>
                                <div style={{ fontSize: 12, color: '#666' }}>总计</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: 24, fontWeight: 'bold', color: '#52c41a' }}>{stats.completed}</div>
                                <div style={{ fontSize: 12, color: '#666' }}>成功</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: 24, fontWeight: 'bold', color: '#ff4d4f' }}>{stats.failed}</div>
                                <div style={{ fontSize: 12, color: '#666' }}>失败</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: 24, fontWeight: 'bold', color: '#faad14' }}>{stats.video_deleted || 0}</div>
                                <div style={{ fontSize: 12, color: '#666' }}>已删除</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: 24, fontWeight: 'bold', color: '#fa8c16' }}>{stats.video_error || 0}</div>
                                <div style={{ fontSize: 12, color: '#666' }}>视频异常</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: 24, fontWeight: 'bold', color: '#722ed1' }}>{stats.processing}</div>
                                <div style={{ fontSize: 12, color: '#666' }}>执行中</div>
                            </div>
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: 24, fontWeight: 'bold', color: '#8c8c8c' }}>{stats.pending}</div>
                                <div style={{ fontSize: 12, color: '#666' }}>待执行</div>
                            </div>
                            {/* 时间信息 */}
                            <Divider type="vertical" style={{ height: 40 }} />
                            <div style={{ textAlign: 'left', fontSize: 12 }}>
                                {task?.started_at ? (
                                    <>
                                        <div><Text type="secondary">开始:</Text> {formatLocalTime(task.started_at, 'MM-DD HH:mm:ss')}</div>
                                        {task?.finished_at ? (
                                            <>
                                                <div><Text type="secondary">结束:</Text> {formatLocalTime(task.finished_at, 'MM-DD HH:mm:ss')}</div>
                                                <div>
                                                    <Text type="success">
                                                        耗时: {(() => {
                                                            const diff = dayjs.utc(task.finished_at).diff(dayjs.utc(task.started_at), 'second')
                                                            if (diff < 60) return `${diff}秒`
                                                            if (diff < 3600) return `${Math.floor(diff / 60)}分${diff % 60}秒`
                                                            return `${Math.floor(diff / 3600)}时${Math.floor((diff % 3600) / 60)}分`
                                                        })()}
                                                    </Text>
                                                </div>
                                            </>
                                        ) : (
                                            <div><Text type="warning">执行中...</Text></div>
                                        )}
                                    </>
                                ) : (
                                    <Text type="secondary">未开始执行</Text>
                                )}
                            </div>
                        </Space>
                    </Col>
                    <Col flex="300px">
                        <Progress
                            percent={stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0}
                            status={stats.failed > 0 ? 'exception' : (stats.completed === stats.total && stats.total > 0 ? 'success' : 'active')}
                            format={() => `${stats.completed}/${stats.total} (${stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0}%)`}
                        />
                    </Col>
                </Row>
            </Card>

            <div style={{ marginBottom: 16, background: '#f5f5f5', padding: 16, borderRadius: 8 }}>
                <Space wrap>
                    <Button
                        icon={<AppstoreOutlined />}
                        onClick={openBrowserSelectModal}
                    >
                        选择浏览器 {selectedProfiles.length > 0 && `(已选 ${selectedProfiles.length}/${browserProfiles.length})`}
                    </Button>
                    {selectedProfiles.length > 0 && (
                        <span style={{ color: '#666', fontSize: 12 }}>
                            已选择: {browserProfiles.filter(p => selectedProfiles.includes(p.bit_browser_id)).map(p => p.name).join(', ')}
                        </span>
                    )}
                    <Button
                        type="primary"
                        icon={<PlayCircleOutlined />}
                        onClick={handleStart}
                        loading={processing}
                        disabled={selectedProfiles.length === 0 || (stats.pending === 0 && stats.failed === 0)}
                    >
                        {selectedProfiles.length > 1 ? `并行执行 (${selectedProfiles.length}个浏览器)` : '开始执行'}
                        {(stats.pending > 0 || stats.failed > 0) && ` - 剩余${stats.pending + stats.failed}条`}
                    </Button>
                    {processing && <Button danger icon={<StopOutlined />} onClick={handleStop}>停止</Button>}
                    <Button icon={<ReloadOutlined />} onClick={loadTaskAndItems}>刷新列表</Button>
                    <Popconfirm title="确定要强制重置状态吗？这会清除当前的执行状态。" onConfirm={handleForceReset}>
                        <Button type="text" danger size="small">状态卡住？点击重置</Button>
                    </Popconfirm>
                    <Checkbox
                        checked={closeAfterFinish}
                        onChange={(e) => setCloseAfterFinish(e.target.checked)}
                    >
                        执行结束关闭所有浏览器
                    </Checkbox>
                </Space>
            </div>

            {processing && progress && (
                <Card style={{ marginBottom: 16 }} size="small">
                    <Text strong>{progress.message}</Text>
                    <Progress percent={Math.round((progress.current / progress.total) * 100)} status="active" />
                    {/* 显示各个 worker 的状态 */}
                    {Object.keys(workerProgress).length > 0 && (
                        <div style={{ marginTop: 8 }}>
                            {Object.entries(workerProgress).map(([workerId, wp]) => (
                                <div key={workerId} style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                                    <Tag color={wp.status === 'processing' ? 'processing' : wp.status === 'completed' ? 'success' : 'default'}>
                                        {workerId}
                                    </Tag>
                                    {wp.message}
                                </div>
                            ))}
                        </div>
                    )}
                </Card>
            )}

            <Table
                columns={itemColumns}
                dataSource={items}
                rowKey="id"
                loading={loading}
                size="small"
                pagination={{ pageSize: 20 }}
                bordered
            />

            {/* 结果详情弹窗 */}
            <Modal
                title={resultModalContent?.isError ? '错误详情' : 'AI 回复详情'}
                open={resultModalVisible}
                onCancel={() => setResultModalVisible(false)}
                footer={null}
                width={800}
            >
                <pre style={{
                    maxHeight: 500,
                    overflow: 'auto',
                    background: resultModalContent?.isError ? '#fff2f0' : '#f6ffed',
                    padding: 16,
                    borderRadius: 8,
                    whiteSpace: 'pre-wrap',
                    wordBreak: 'break-word',
                    fontSize: 13
                }}>
                    {resultModalContent?.content}
                </pre>
            </Modal>

            {/* 浏览器选择弹窗 */}
            <Modal
                title={
                    <Space>
                        <span>选择执行浏览器</span>
                        <Tag color="blue">{browserProfiles.length} 个可用</Tag>
                    </Space>
                }
                open={browserSelectModalVisible}
                onCancel={() => setBrowserSelectModalVisible(false)}
                onOk={confirmBrowserSelect}
                okText={`确定 (${tempSelectedProfiles.length}个)`}
                cancelText="取消"
                width={600}
            >
                <div style={{ marginBottom: 16 }}>
                    <Space>
                        <Button
                            type={tempSelectedProfiles.length === browserProfiles.length ? 'primary' : 'default'}
                            icon={<CheckSquareOutlined />}
                            onClick={handleSelectAll}
                        >
                            {tempSelectedProfiles.length === browserProfiles.length ? '取消全选' : '全选'}
                        </Button>
                        <Text type="secondary">
                            已选择 {tempSelectedProfiles.length} / {browserProfiles.length} 个浏览器
                        </Text>
                    </Space>
                </div>
                <div style={{
                    maxHeight: 400,
                    overflow: 'auto',
                    border: '1px solid #d9d9d9',
                    borderRadius: 8,
                    padding: 8
                }}>
                    {browserProfiles.length === 0 ? (
                        <Empty description="暂无可用浏览器账号" />
                    ) : (
                        <Row gutter={[8, 8]}>
                            {browserProfiles.map(profile => (
                                <Col span={12} key={profile.id}>
                                    <div
                                        onClick={() => handleBrowserToggle(profile.bit_browser_id)}
                                        style={{
                                            padding: '12px 16px',
                                            border: `2px solid ${tempSelectedProfiles.includes(profile.bit_browser_id) ? '#1890ff' : '#d9d9d9'}`,
                                            borderRadius: 8,
                                            cursor: 'pointer',
                                            background: tempSelectedProfiles.includes(profile.bit_browser_id) ? '#e6f7ff' : '#fff',
                                            transition: 'all 0.2s',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 12
                                        }}
                                    >
                                        <Checkbox
                                            checked={tempSelectedProfiles.includes(profile.bit_browser_id)}
                                            onChange={() => handleBrowserToggle(profile.bit_browser_id)}
                                        />
                                        <div style={{ flex: 1, overflow: 'hidden' }}>
                                            <div style={{
                                                fontWeight: 500,
                                                overflow: 'hidden',
                                                textOverflow: 'ellipsis',
                                                whiteSpace: 'nowrap',
                                                display: 'flex',
                                                alignItems: 'center',
                                                gap: 6
                                            }}>
                                                {profile.name}
                                                {usageStats[profile.bit_browser_id] && (
                                                    <>
                                                        <Tag color="blue" style={{ fontSize: 10, padding: '0 4px', margin: 0 }}>
                                                            发送 {usageStats[profile.bit_browser_id].daily_count}
                                                        </Tag>
                                                        <Tag color="green" style={{ fontSize: 10, padding: '0 4px', margin: 0 }}>
                                                            成功 {usageStats[profile.bit_browser_id].daily_success_count || 0}
                                                        </Tag>
                                                    </>
                                                )}
                                            </div>
                                            <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                                                {usageStats[profile.bit_browser_id] ? (
                                                    <span>累计: 发送 {usageStats[profile.bit_browser_id].total_count} / 成功 {usageStats[profile.bit_browser_id].total_success_count || 0}</span>
                                                ) : (
                                                    <span>累计: 发送 0 / 成功 0</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </Col>
                            ))}
                        </Row>
                    )}
                </div>
            </Modal>
        </Card>
    )
}

// === Tab 2: History ===
const HistoryTab = ({ onLoadTask, isActive }) => {
    const [tasks, setTasks] = useState([])
    const [loading, setLoading] = useState(false)

    useEffect(() => {
        if (isActive) loadTasks()
    }, [isActive])

    const loadTasks = async () => {
        setLoading(true)
        try {
            const list = await window.electron.db.getCommentaryTasksWithStats()
            setTasks(list)
        } catch (error) {
            message.error('加载任务列表失败')
        } finally {
            setLoading(false)
        }
    }

    const handleDelete = async (id) => {
        try {
            await window.electron.db.deleteCommentaryTask(id)
            message.success('删除成功')
            loadTasks()
        } catch (error) {
            message.error('删除失败')
        }
    }

    const columns = [
        { title: 'ID', dataIndex: 'id', width: 60, render: (id) => id ? Math.floor(id) : '-' },
        { title: '任务名称', dataIndex: 'name', ellipsis: true },
        {
            title: '执行进度',
            key: 'progress',
            width: 280,
            render: (_, record) => {
                const stats = record.stats || { total: 0, completed: 0, failed: 0, pending: 0, processing: 0, video_deleted: 0, video_error: 0 }
                const progressPercent = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0
                return (
                    <div>
                        <div style={{ display: 'flex', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                            <Tag>总计: {stats.total}</Tag>
                            <Tag color="success">成功: {stats.completed}</Tag>
                            <Tag color="error">失败: {stats.failed}</Tag>
                            {stats.video_deleted > 0 && <Tag color="warning">已删除: {stats.video_deleted}</Tag>}
                            {stats.video_error > 0 && <Tag color="orange">视频异常: {stats.video_error}</Tag>}
                            <Tag color="default">待执行: {stats.pending}</Tag>
                            {stats.processing > 0 && <Tag color="processing">执行中: {stats.processing}</Tag>}
                        </div>
                        <Progress
                            percent={progressPercent}
                            size="small"
                            status={stats.failed > 0 ? 'exception' : (progressPercent === 100 ? 'success' : 'active')}
                            format={() => `${stats.completed}/${stats.total}`}
                        />
                    </div>
                )
            }
        },
        {
            title: '状态',
            dataIndex: 'status',
            width: 80,
            render: s => {
                const color = STATUS_COLOR_MAP[s] || 'default'
                return <Tag color={color}>{STATUS_MAP[s] || s}</Tag>
            }
        },
        {
            title: '执行时间',
            key: 'time',
            width: 200,
            render: (_, record) => {
                const started = record.started_at ? dayjs.utc(record.started_at) : null
                const finished = record.finished_at ? dayjs.utc(record.finished_at) : null

                // 计算耗时
                let duration = null
                if (started && finished) {
                    const diff = finished.diff(started, 'second')
                    if (diff < 60) {
                        duration = `${diff}秒`
                    } else if (diff < 3600) {
                        duration = `${Math.floor(diff / 60)}分${diff % 60}秒`
                    } else {
                        const hours = Math.floor(diff / 3600)
                        const mins = Math.floor((diff % 3600) / 60)
                        duration = `${hours}时${mins}分`
                    }
                }

                return (
                    <div style={{ fontSize: 12 }}>
                        {started ? (
                            <>
                                <div><Text type="secondary">开始:</Text> {started.local().format('MM-DD HH:mm')}</div>
                                {finished ? (
                                    <>
                                        <div><Text type="secondary">结束:</Text> {finished.local().format('MM-DD HH:mm')}</div>
                                        <div><Text type="success">耗时: {duration}</Text></div>
                                    </>
                                ) : (
                                    <div><Text type="warning">执行中...</Text></div>
                                )}
                            </>
                        ) : (
                            <Text type="secondary">未开始</Text>
                        )}
                    </div>
                )
            }
        },
        { title: '创建时间', dataIndex: 'created_at', width: 130, render: d => formatLocalTime(d) },
        {
            title: '操作',
            key: 'action',
            width: 160,
            render: (_, record) => (
                <Space>
                    <Button type="primary" size="small" icon={<EyeOutlined />} onClick={() => onLoadTask(record.id)}>
                        查看/执行
                    </Button>
                    <Popconfirm title="确定删除?" onConfirm={() => handleDelete(record.id)}>
                        <Button type="link" danger size="small" icon={<DeleteOutlined />}>删除</Button>
                    </Popconfirm>
                </Space>
            )
        }
    ]

    return (
        <Card title="历史任务记录">
            <div style={{ marginBottom: 16, textAlign: 'right' }}>
                <Button icon={<ReloadOutlined />} onClick={loadTasks}>刷新</Button>
            </div>
            <Table
                columns={columns}
                dataSource={tasks}
                rowKey="id"
                loading={loading}
                pagination={{ pageSize: 10 }}
            />
        </Card>
    )
}

export default CommentaryTaskPage
