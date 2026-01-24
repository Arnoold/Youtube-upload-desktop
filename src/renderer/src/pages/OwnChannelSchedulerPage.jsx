import React, { useState, useEffect, useRef } from 'react'
import { Typography, Card, Switch, TimePicker, InputNumber, Button, Space, Table, Tag, message, Popconfirm, Alert, Progress, Statistic, Row, Col, Divider, Modal, Checkbox, Select } from 'antd'
import { ClockCircleOutlined, PlayCircleOutlined, DeleteOutlined, ReloadOutlined, CheckCircleOutlined, CloseCircleOutlined, SyncOutlined, HistoryOutlined, SettingOutlined, ChromeOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'

const { Title, Text, Paragraph } = Typography

const OwnChannelSchedulerPage = () => {
    const [config, setConfig] = useState({
        enabled: false,
        executeTime: '09:00',
        daysBack: 3,
        daysForward: 1,
        minViews: 10,
        lastExecuteDate: null,
        isRunning: false,
        nextExecuteTime: null,
        selectedBrowserIds: [],
        generationStatus: 'pending_all'
    })

    // 生成状态选项
    const generationStatusOptions = [
        { value: 'pending_all', label: '待生成' },  // null 和 pending 合并
        { value: 'generating', label: '生成中' },
        { value: 'completed', label: '已完成' },
        { value: 'failed', label: '失败' },
        { value: 'video_error', label: '视频异常' },
        { value: 'video_deleted', label: '视频删除' },
        { value: 'all', label: '全部' }
    ]
    const [logs, setLogs] = useState([])
    const [loading, setLoading] = useState(false)
    const [executing, setExecuting] = useState(false)
    const [executionStatus, setExecutionStatus] = useState(null)
    const statusListenerRef = useRef(null)
    const logListenerRef = useRef(null)

    // 浏览器选择相关状态
    const [browserModalVisible, setBrowserModalVisible] = useState(false)
    const [allBrowsers, setAllBrowsers] = useState([])
    const [tempSelectedBrowserIds, setTempSelectedBrowserIds] = useState([])
    const [openingBrowsers, setOpeningBrowsers] = useState(false)

    // 加载浏览器列表
    const loadBrowsers = async () => {
        try {
            const accounts = await window.electron.db.getAIStudioAccounts()
            setAllBrowsers(accounts.filter(a => a.status === 'active'))
        } catch (error) {
            console.error('加载浏览器列表失败:', error)
        }
    }

    useEffect(() => {
        loadConfig()
        loadLogs()
        loadBrowsers()

        // 设置状态监听
        statusListenerRef.current = (data) => {
            setExecutionStatus(data)
            if (data.status === 'completed' || data.status === 'error') {
                setExecuting(false)
                loadConfig()
                loadLogs()
            }
        }
        window.electron.ownChannelScheduler.onStatus(statusListenerRef.current)

        // 设置日志监听
        logListenerRef.current = (log) => {
            setLogs(prev => [log, ...prev.slice(0, 99)])
        }
        window.electron.ownChannelScheduler.onLog(logListenerRef.current)

        return () => {
            window.electron.ownChannelScheduler.removeListener('own-channel-scheduler:status')
            window.electron.ownChannelScheduler.removeListener('own-channel-scheduler:log')
        }
    }, [])

    const loadConfig = async () => {
        try {
            const data = await window.electron.ownChannelScheduler.getConfig()
            setConfig(data)
            setExecuting(data.isRunning)
        } catch (error) {
            message.error('加载配置失败: ' + error.message)
        }
    }

    const loadLogs = async () => {
        try {
            const data = await window.electron.ownChannelScheduler.getLogs(50)
            setLogs(data)
        } catch (error) {
            console.error('加载日志失败:', error)
        }
    }

    const handleToggleEnabled = async (checked) => {
        setLoading(true)
        try {
            if (checked) {
                await window.electron.ownChannelScheduler.enable()
                message.success('定时任务已启用')
            } else {
                await window.electron.ownChannelScheduler.disable()
                message.success('定时任务已禁用')
            }
            await loadConfig()
        } catch (error) {
            message.error('操作失败: ' + error.message)
        } finally {
            setLoading(false)
        }
    }

    const handleUpdateConfig = async (key, value) => {
        try {
            await window.electron.ownChannelScheduler.updateConfig({ [key]: value })
            await loadConfig()
            message.success('配置已更新')
        } catch (error) {
            message.error('更新配置失败: ' + error.message)
        }
    }

    const handleExecuteNow = async () => {
        setExecuting(true)
        setExecutionStatus({ status: 'running', step: 'start', message: '正在启动...' })
        try {
            const result = await window.electron.ownChannelScheduler.executeNow()
            if (!result.success) {
                message.error(result.message)
            }
        } catch (error) {
            message.error('执行失败: ' + error.message)
            setExecuting(false)
        }
    }

    const handleClearLogs = async () => {
        try {
            await window.electron.ownChannelScheduler.clearLogs()
            setLogs([])
            message.success('日志已清空')
        } catch (error) {
            message.error('清空日志失败: ' + error.message)
        }
    }

    // 打开浏览器选择弹窗
    const openBrowserModal = () => {
        setTempSelectedBrowserIds(config.selectedBrowserIds || [])
        setBrowserModalVisible(true)
    }

    // 确认浏览器选择
    const confirmBrowserSelect = async () => {
        await handleUpdateConfig('selectedBrowserIds', tempSelectedBrowserIds)
        setBrowserModalVisible(false)
    }

    // 全选/取消全选
    const handleSelectAll = (checked) => {
        if (checked) {
            setTempSelectedBrowserIds(allBrowsers.map(b => b.bit_browser_id))
        } else {
            setTempSelectedBrowserIds([])
        }
    }

    // 切换单个浏览器选择
    const handleBrowserToggle = (browserId, checked) => {
        if (checked) {
            setTempSelectedBrowserIds([...tempSelectedBrowserIds, browserId])
        } else {
            setTempSelectedBrowserIds(tempSelectedBrowserIds.filter(id => id !== browserId))
        }
    }

    // 获取已选浏览器显示文本
    const getSelectedBrowsersText = () => {
        if (!config.selectedBrowserIds || config.selectedBrowserIds.length === 0) {
            return '全部浏览器'
        }
        const selectedCount = config.selectedBrowserIds.length
        const totalCount = allBrowsers.length
        if (selectedCount === totalCount) {
            return '全部浏览器'
        }
        return `已选 ${selectedCount} 个浏览器`
    }

    // 打开所有已选浏览器
    const handleOpenBrowsers = async () => {
        // 获取要打开的浏览器列表
        let browserIdsToOpen = config.selectedBrowserIds
        if (!browserIdsToOpen || browserIdsToOpen.length === 0) {
            browserIdsToOpen = allBrowsers.map(b => b.bit_browser_id)
        }

        if (browserIdsToOpen.length === 0) {
            message.warning('没有可用的浏览器')
            return
        }

        setOpeningBrowsers(true)
        try {
            const results = await window.electron.ownChannelScheduler.openBrowsers(browserIdsToOpen)

            // 统计结果
            const successCount = results.filter(r => r.success).length
            const failedResults = results.filter(r => !r.success)

            if (failedResults.length === 0) {
                message.success(`成功打开 ${successCount} 个浏览器`)
            } else if (successCount === 0) {
                // 全部失败，显示详细错误
                Modal.error({
                    title: '打开浏览器失败',
                    content: (
                        <div style={{ maxHeight: 300, overflow: 'auto' }}>
                            {failedResults.map((r, idx) => (
                                <div key={idx} style={{ marginBottom: 8 }}>
                                    <Text strong>{r.name || r.browserId}:</Text>
                                    <br />
                                    <Text type="danger">{r.error}</Text>
                                </div>
                            ))}
                        </div>
                    )
                })
            } else {
                // 部分成功
                Modal.warning({
                    title: `打开浏览器结果`,
                    content: (
                        <div style={{ maxHeight: 300, overflow: 'auto' }}>
                            <div style={{ marginBottom: 12 }}>
                                <Text type="success">成功: {successCount} 个</Text>
                                <Text type="danger" style={{ marginLeft: 16 }}>失败: {failedResults.length} 个</Text>
                            </div>
                            <Divider style={{ margin: '8px 0' }} />
                            <Text strong>失败详情:</Text>
                            {failedResults.map((r, idx) => (
                                <div key={idx} style={{ marginTop: 8 }}>
                                    <Text>{r.name || r.browserId}:</Text>
                                    <br />
                                    <Text type="danger" style={{ fontSize: 12 }}>{r.error}</Text>
                                </div>
                            ))}
                        </div>
                    )
                })
            }
        } catch (error) {
            message.error('打开浏览器失败: ' + error.message)
        } finally {
            setOpeningBrowsers(false)
        }
    }

    const logColumns = [
        {
            title: '时间',
            dataIndex: 'time',
            width: 180,
            render: (time) => dayjs(time).format('YYYY-MM-DD HH:mm:ss')
        },
        {
            title: '类型',
            dataIndex: 'type',
            width: 80,
            render: (type) => {
                const colors = {
                    info: 'blue',
                    success: 'green',
                    error: 'red',
                    warning: 'orange'
                }
                return <Tag color={colors[type] || 'default'}>{type}</Tag>
            }
        },
        {
            title: '消息',
            dataIndex: 'message'
        }
    ]

    return (
        <div style={{ paddingBottom: 20 }}>
            <Title level={2}>
                <ClockCircleOutlined style={{ marginRight: 8 }} />
                自有频道定时任务
            </Title>

            <Row gutter={16}>
                <Col span={16}>
                    {/* 配置卡片 */}
                    <Card title="任务配置" style={{ marginBottom: 16 }}>
                        <Space direction="vertical" size="large" style={{ width: '100%' }}>
                            {/* 启用开关 */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div>
                                    <Text strong style={{ fontSize: 16 }}>启用定时任务</Text>
                                    <br />
                                    <Text type="secondary">开启后，将在设定时间自动执行自有频道解说词获取任务</Text>
                                </div>
                                <Switch
                                    checked={config.enabled}
                                    onChange={handleToggleEnabled}
                                    loading={loading}
                                    checkedChildren="已启用"
                                    unCheckedChildren="已禁用"
                                />
                            </div>

                            <Divider style={{ margin: '8px 0' }} />

                            {/* 执行时间 */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div>
                                    <Text strong>执行时间</Text>
                                    <br />
                                    <Text type="secondary">每天在此时间自动执行</Text>
                                </div>
                                <TimePicker
                                    value={dayjs(config.executeTime, 'HH:mm')}
                                    format="HH:mm"
                                    onChange={(time) => handleUpdateConfig('executeTime', time?.format('HH:mm') || '09:00')}
                                    style={{ width: 120 }}
                                />
                            </div>

                            <Divider style={{ margin: '8px 0' }} />

                            {/* 视频日期范围 */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div>
                                    <Text strong>视频发布日期范围</Text>
                                    <br />
                                    <Text type="secondary">查询从今天往前 N 天到往后 M 天的视频</Text>
                                </div>
                                <Space>
                                    <Text>往前</Text>
                                    <InputNumber
                                        value={config.daysBack}
                                        min={1}
                                        max={30}
                                        onChange={(v) => handleUpdateConfig('daysBack', v)}
                                        style={{ width: 80 }}
                                    />
                                    <Text>天 ~ 往后</Text>
                                    <InputNumber
                                        value={config.daysForward}
                                        min={0}
                                        max={7}
                                        onChange={(v) => handleUpdateConfig('daysForward', v)}
                                        style={{ width: 80 }}
                                    />
                                    <Text>天</Text>
                                </Space>
                            </div>

                            <Divider style={{ margin: '8px 0' }} />

                            {/* 最小播放量 */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div>
                                    <Text strong>最小播放量</Text>
                                    <br />
                                    <Text type="secondary">只获取播放量大于此值的视频</Text>
                                </div>
                                <Space>
                                    <InputNumber
                                        value={config.minViews}
                                        min={0}
                                        max={1000}
                                        onChange={(v) => handleUpdateConfig('minViews', v)}
                                        style={{ width: 100 }}
                                    />
                                    <Text>万</Text>
                                </Space>
                            </div>

                            <Divider style={{ margin: '8px 0' }} />

                            {/* 生成状态 */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div>
                                    <Text strong>生成状态</Text>
                                    <br />
                                    <Text type="secondary">筛选指定生成状态的视频</Text>
                                </div>
                                <Select
                                    value={config.generationStatus || 'null'}
                                    options={generationStatusOptions}
                                    onChange={(v) => handleUpdateConfig('generationStatus', v)}
                                    style={{ width: 120 }}
                                />
                            </div>

                            <Divider style={{ margin: '8px 0' }} />

                            {/* 浏览器选择 */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div>
                                    <Text strong>执行浏览器</Text>
                                    <br />
                                    <Text type="secondary">选择用于执行任务的浏览器</Text>
                                </div>
                                <Space>
                                    <Tag color="blue">{getSelectedBrowsersText()}</Tag>
                                    <Button
                                        icon={<ChromeOutlined />}
                                        onClick={handleOpenBrowsers}
                                        loading={openingBrowsers}
                                    >
                                        打开浏览器
                                    </Button>
                                    <Button
                                        icon={<SettingOutlined />}
                                        onClick={openBrowserModal}
                                    >
                                        选择浏览器
                                    </Button>
                                </Space>
                            </div>

                            <Divider style={{ margin: '8px 0' }} />

                            {/* 手动执行按钮 */}
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <div>
                                    <Text strong>手动执行</Text>
                                    <br />
                                    <Text type="secondary">立即执行一次定时任务（用于测试）</Text>
                                </div>
                                <Button
                                    type="primary"
                                    icon={<PlayCircleOutlined />}
                                    onClick={handleExecuteNow}
                                    loading={executing}
                                    disabled={executing}
                                >
                                    {executing ? '执行中...' : '立即执行'}
                                </Button>
                            </div>
                        </Space>
                    </Card>

                    {/* 执行状态 */}
                    {executionStatus && (
                        <Card title="执行状态" style={{ marginBottom: 16 }}>
                            <Alert
                                message={executionStatus.message}
                                type={executionStatus.status === 'error' ? 'error' : executionStatus.status === 'completed' ? 'success' : 'info'}
                                icon={
                                    executionStatus.status === 'running' ? <SyncOutlined spin /> :
                                    executionStatus.status === 'completed' ? <CheckCircleOutlined /> :
                                    executionStatus.status === 'error' ? <CloseCircleOutlined /> : null
                                }
                                showIcon
                            />
                            {executionStatus.progress && (
                                <Progress
                                    percent={executionStatus.progress.percent}
                                    status={executionStatus.status === 'error' ? 'exception' : executionStatus.status === 'completed' ? 'success' : 'active'}
                                    style={{ marginTop: 12 }}
                                />
                            )}
                        </Card>
                    )}

                    {/* 执行日志 */}
                    <Card
                        title={
                            <Space>
                                <HistoryOutlined />
                                <span>执行日志</span>
                            </Space>
                        }
                        extra={
                            <Space>
                                <Button icon={<ReloadOutlined />} onClick={loadLogs} size="small">
                                    刷新
                                </Button>
                                <Popconfirm
                                    title="确定要清空所有日志吗？"
                                    onConfirm={handleClearLogs}
                                    okText="确定"
                                    cancelText="取消"
                                >
                                    <Button icon={<DeleteOutlined />} size="small" danger>
                                        清空
                                    </Button>
                                </Popconfirm>
                            </Space>
                        }
                    >
                        <Table
                            columns={logColumns}
                            dataSource={logs.map((log, idx) => ({ ...log, _key: `${log.time}-${idx}` }))}
                            rowKey="_key"
                            pagination={{ pageSize: 10 }}
                            size="small"
                            locale={{ emptyText: '暂无日志' }}
                        />
                    </Card>
                </Col>

                <Col span={8}>
                    {/* 状态卡片 */}
                    <Card title="任务状态" style={{ marginBottom: 16 }}>
                        <Row gutter={[16, 16]}>
                            <Col span={24}>
                                <Statistic
                                    title="当前状态"
                                    value={config.enabled ? (config.isRunning ? '执行中' : '已启用') : '已禁用'}
                                    valueStyle={{
                                        color: config.enabled ? (config.isRunning ? '#1890ff' : '#52c41a') : '#999'
                                    }}
                                    prefix={
                                        config.enabled ?
                                        (config.isRunning ? <SyncOutlined spin /> : <CheckCircleOutlined />) :
                                        <CloseCircleOutlined />
                                    }
                                />
                            </Col>
                            <Col span={24}>
                                <Statistic
                                    title="上次执行日期"
                                    value={config.lastExecuteDate || '从未执行'}
                                    valueStyle={{ fontSize: 18 }}
                                />
                            </Col>
                            <Col span={24}>
                                <Statistic
                                    title="下次执行时间"
                                    value={config.nextExecuteTime ? dayjs(config.nextExecuteTime).format('MM-DD HH:mm') : '-'}
                                    valueStyle={{ fontSize: 18 }}
                                />
                            </Col>
                        </Row>
                    </Card>

                    {/* 任务说明 */}
                    <Card title="任务说明">
                        <Paragraph>
                            <Text strong>定时任务会自动执行以下流程：</Text>
                        </Paragraph>
                        <ol style={{ paddingLeft: 20, margin: 0 }}>
                            <li>按配置条件从自有频道视频表查询视频</li>
                            <li>创建自有频道解说词获取任务</li>
                            <li>使用选定的浏览器并行执行</li>
                            <li>将获取的解说词保存到 Supabase</li>
                        </ol>
                        <Divider style={{ margin: '12px 0' }} />
                        <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                            <Text type="warning">注意：</Text>
                            <ul style={{ paddingLeft: 20, margin: '8px 0 0' }}>
                                <li>应用需要保持运行状态</li>
                                <li>同一天只会执行一次</li>
                                <li>确保浏览器账号已正确配置</li>
                                <li>此任务独立于对标频道定时任务</li>
                            </ul>
                        </Paragraph>
                    </Card>
                </Col>
            </Row>

            {/* 浏览器选择弹窗 */}
            <Modal
                title="选择执行浏览器"
                open={browserModalVisible}
                onOk={confirmBrowserSelect}
                onCancel={() => setBrowserModalVisible(false)}
                width={600}
                okText="确定"
                cancelText="取消"
            >
                <div style={{ marginBottom: 16 }}>
                    <Checkbox
                        checked={tempSelectedBrowserIds.length === allBrowsers.length && allBrowsers.length > 0}
                        indeterminate={tempSelectedBrowserIds.length > 0 && tempSelectedBrowserIds.length < allBrowsers.length}
                        onChange={(e) => handleSelectAll(e.target.checked)}
                    >
                        全选 ({tempSelectedBrowserIds.length}/{allBrowsers.length})
                    </Checkbox>
                    <Text type="secondary" style={{ marginLeft: 16 }}>
                        {tempSelectedBrowserIds.length === 0 ? '未选择时将使用所有启用的浏览器' : ''}
                    </Text>
                </div>
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, 1fr)',
                    gap: 12,
                    maxHeight: 400,
                    overflowY: 'auto'
                }}>
                    {allBrowsers.map(browser => (
                        <Card
                            key={browser.id}
                            size="small"
                            style={{
                                cursor: 'pointer',
                                border: tempSelectedBrowserIds.includes(browser.bit_browser_id)
                                    ? '2px solid #1890ff'
                                    : '1px solid #d9d9d9'
                            }}
                            onClick={() => handleBrowserToggle(
                                browser.bit_browser_id,
                                !tempSelectedBrowserIds.includes(browser.bit_browser_id)
                            )}
                        >
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                                <Checkbox
                                    checked={tempSelectedBrowserIds.includes(browser.bit_browser_id)}
                                    style={{ marginRight: 8 }}
                                />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                    <div style={{
                                        fontWeight: 500,
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap'
                                    }}>
                                        {browser.name}
                                    </div>
                                    <div style={{ fontSize: 12, color: '#999' }}>
                                        {browser.email || browser.bit_browser_id}
                                    </div>
                                </div>
                            </div>
                        </Card>
                    ))}
                </div>
                {allBrowsers.length === 0 && (
                    <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
                        暂无可用的浏览器账号，请先在 AIstudio账号 页面添加
                    </div>
                )}
            </Modal>
        </div>
    )
}

export default OwnChannelSchedulerPage
