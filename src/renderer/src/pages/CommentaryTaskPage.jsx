import React, { useState, useEffect } from 'react'
import { Typography, Button, message, Table, Form, Input, Select, DatePicker, Space, Card, InputNumber, Tag, Modal, Progress, Popconfirm, Divider, Tabs, Empty, ConfigProvider, Row, Col, Checkbox } from 'antd'
import { SearchOutlined, PlayCircleOutlined, ReloadOutlined, StopOutlined, PlusOutlined, DeleteOutlined, EyeOutlined, ArrowLeftOutlined, HistoryOutlined, AppstoreOutlined, CheckSquareOutlined } from '@ant-design/icons'
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

// 状态映射
const STATUS_MAP = {
    'pending': '等待中',
    'processing': '执行中',
    'completed': '已完成',
    'failed': '失败',
    'cancelled': '已取消',
    'error': '错误'
}

const STATUS_COLOR_MAP = {
    'pending': 'default',
    'processing': 'processing',
    'completed': 'success',
    'failed': 'error',
    'cancelled': 'warning',
    'error': 'error'
}

const CommentaryTaskPage = () => {
    const [activeTab, setActiveTab] = useState('workspace')
    const [currentTaskId, setCurrentTaskId] = useState(null)

    // Helper to switch to workspace and load a task
    const loadTaskToWorkspace = (taskId) => {
        setCurrentTaskId(taskId)
        setActiveTab('workspace')
    }

    return (
        <ConfigProvider locale={zhCN}>
            <div style={{ paddingBottom: 20 }}>
                <Title level={2}>解说词生成任务</Title>

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
                limit: 500, // 每页最大500条
                // 播放量输入的是"万"，需要乘以10000
                minViews: values.minViews ? values.minViews * 10000 : undefined,
                groupName: values.group,
                channelIds: values.channels, // 支持多频道筛选
                // Gemini生成状态筛选
                status: values.generationStatus || undefined,
                sortBy: 'published_at',
                sortOrder: 'desc'
            }
            if (values.dateRange && values.dateRange.length === 2) {
                baseOptions.dateRange = [
                    values.dateRange[0].startOf('day').toISOString(),
                    values.dateRange[1].endOf('day').toISOString()
                ]
            }

            // 自动分页获取所有视频
            let allVideos = []
            let page = 1
            let total = 0

            while (true) {
                const result = await window.electron.supabase.getVideos({ ...baseOptions, page })
                allVideos = allVideos.concat(result.data)
                total = result.total

                // 如果获取的数据少于 limit，说明已经是最后一页
                if (result.data.length < baseOptions.limit || allVideos.length >= total) {
                    break
                }
                page++
                // 安全限制：最多获取5000条
                if (allVideos.length >= 5000) {
                    message.warning('数据量过大，仅显示前5000条')
                    break
                }
            }

            setVideos(allVideos)
            message.success(`找到 ${total} 个视频，已加载 ${allVideos.length} 条`)
        } catch (error) {
            message.error(`加载失败: ${error.message} `)
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
                    video_id: v.id,
                    id: v.id,
                    url: v.url,
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
        dateRange: [
            dayjs().subtract(4, 'day'), // 开始时间：往前推4天
            dayjs().add(1, 'day')       // 结束时间：往后推1天
        ],
        minViews: 10, // 默认：10万（输入框单位是"万"）
        generationStatus: 'pending_all' // 默认：待生成
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
                    <Col span={7}>
                        <Form.Item name="dateRange" label="发布时间">
                            <RangePicker style={{ width: '100%' }} />
                        </Form.Item>
                    </Col>
                    <Col span={5}>
                        <Form.Item label="最小播放量">
                            <Space.Compact style={{ width: '100%', minWidth: 120 }}>
                                <Form.Item name="minViews" noStyle>
                                    <InputNumber
                                        placeholder="如：200"
                                        style={{ width: '100%', minWidth: 80 }}
                                        min={0}
                                    />
                                </Form.Item>
                                <Button disabled style={{ cursor: 'default' }}>万</Button>
                            </Space.Compact>
                        </Form.Item>
                    </Col>
                    <Col span={5} style={{ paddingLeft: 16 }}>
                        <Form.Item name="generationStatus" label="生成状态">
                            <Select placeholder="全部" allowClear style={{ width: '100%' }}>
                                <Option value="pending_all">待生成</Option>
                                <Option value="generating">生成中</Option>
                                <Option value="completed">已完成</Option>
                                <Option value="failed">失败</Option>
                            </Select>
                        </Form.Item>
                    </Col>
                    <Col span={7} style={{ textAlign: 'right' }}>
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
                    onClick={() => setCreateModalVisible(true)}
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
                    <Form.Item name="taskName" label="任务名称" rules={[{ required: true, message: '请输入任务名称' }]} initialValue={`任务 ${dayjs().format('MM-DD HH:mm')} `}>
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

    // 显示结果弹窗
    const showResultModal = (content, isError = false) => {
        setResultModalContent({ content, isError })
        setResultModalVisible(true)
    }

    // 打开浏览器选择弹窗
    const openBrowserSelectModal = () => {
        setTempSelectedProfiles([...selectedProfiles])
        setBrowserSelectModalVisible(true)
    }

    // 确认浏览器选择
    const confirmBrowserSelect = () => {
        setSelectedProfiles(tempSelectedProfiles)
        setBrowserSelectModalVisible(false)
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
            const taskInfo = await window.electron.db.getCommentaryTaskById(taskId) // Need to ensure this API exists or use getTasks and find
            // Fallback if getCommentaryTaskById doesn't exist yet, use getCommentaryTasks
            if (!taskInfo) {
                const tasks = await window.electron.db.getCommentaryTasks()
                const found = tasks.find(t => t.id === taskId)
                setTask(found)
            } else {
                setTask(taskInfo)
            }

            const list = await window.electron.db.getCommentaryTaskItems(taskId)
            setItems(list)
        } catch (error) {
            message.error('加载任务详情失败')
        } finally {
            setLoading(false)
        }
    }

    const loadProfiles = async () => {
        try {
            const profiles = await window.electron.db.getAIStudioAccounts()
            setBrowserProfiles(profiles.filter(p => p.status === 'active'))
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
                if (data.type === 'task' && (data.status === 'completed' || data.status === 'error' || data.status === 'cancelled')) {
                    setProcessing(false)
                    setWorkerProgress({})
                    loadTaskAndItems()

                    if (data.status === 'completed') {
                        message.success('任务完成')
                    } else if (data.status === 'error') {
                        message.error('任务出错: ' + (data.error || data.message || '未知错误'))
                    } else if (data.status === 'cancelled') {
                        message.warning('任务已取消')
                    }
                }

                // 兼容旧的单浏览器模式
                if (!data.type && (data.status === 'completed' || data.status === 'error' || data.status === 'cancelled')) {
                    if (data.current >= data.total) {
                        setProcessing(false)
                        loadTaskAndItems()
                        message.success('任务完成')
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

    const handleStart = async () => {
        if (!selectedProfiles || selectedProfiles.length === 0) {
            message.warning('请选择至少一个执行账号')
            return
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
            message.error('启动失败: ' + error.message)
            setProcessing(false)
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

    const itemColumns = [
        { title: 'ID', dataIndex: 'video_id', width: 80, render: (id) => id ? Math.floor(id) : '-' },
        { title: '标题', dataIndex: 'video_info', render: info => info?.title || '-' },
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
                        disabled={selectedProfiles.length === 0}
                    >
                        {selectedProfiles.length > 1 ? `并行执行 (${selectedProfiles.length}个浏览器)` : '开始执行'}
                    </Button>
                    {processing && <Button danger icon={<StopOutlined />} onClick={handleStop}>停止</Button>}
                    <Button icon={<ReloadOutlined />} onClick={loadTaskAndItems}>刷新列表</Button>
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
                                                whiteSpace: 'nowrap'
                                            }}>
                                                {profile.name}
                                            </div>
                                            {profile.bit_browser_id && (
                                                <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>
                                                    ID: {profile.bit_browser_id.substring(0, 8)}...
                                                </div>
                                            )}
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
            const list = await window.electron.db.getCommentaryTasks()
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
        { title: '任务名称', dataIndex: 'name' },
        {
            title: '状态',
            dataIndex: 'status',
            width: 100,
            render: s => {
                const color = STATUS_COLOR_MAP[s] || 'default'
                return <Tag color={color}>{STATUS_MAP[s] || s}</Tag>
            }
        },
        { title: '创建时间', dataIndex: 'created_at', width: 180, render: d => dayjs(d).format('YYYY-MM-DD HH:mm:ss') },
        {
            title: '操作',
            key: 'action',
            width: 200,
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
        <Card title="历史任务记录 (仅显示概要)">
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
