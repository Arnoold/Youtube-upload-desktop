import React, { useState, useEffect } from 'react'
import { Typography, Button, message, Table, Modal, Form, Input, Space, Select, Tag } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined } from '@ant-design/icons'

const { Title } = Typography
const { Option } = Select

// 浏览器类型配置
const BROWSER_TYPES = {
    bitbrowser: { name: '比特浏览器', color: 'blue' },
    hubstudio: { name: 'HubStudio', color: 'purple' }
}

const AIStudioAccountsPage = () => {
    const [profiles, setProfiles] = useState([])
    const [loading, setLoading] = useState(false)
    const [modalVisible, setModalVisible] = useState(false)
    const [editingProfile, setEditingProfile] = useState(null)
    const [form] = Form.useForm()
    const [checkingStatus, setCheckingStatus] = useState(false)
    const [usageStats, setUsageStats] = useState({}) // 使用统计

    // 加载使用统计
    const loadUsageStats = async () => {
        try {
            const stats = await window.electron.aiStudio.getUsageStats()
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

    // 加载配置
    const loadProfiles = async () => {
        setLoading(true)
        try {
            console.log('AIStudioAccountsPage: Loading profiles...')
            const dbProfiles = await window.electron.db.getAIStudioAccounts()
            console.log('AIStudioAccountsPage: Got profiles from db:', dbProfiles)

            if (!dbProfiles || !Array.isArray(dbProfiles)) {
                console.error('AIStudioAccountsPage: Invalid response from getAIStudioAccounts:', dbProfiles)
                setProfiles([])
                return
            }

            // 并行检查浏览器运行状态
            const profilesWithStatus = await Promise.all(dbProfiles.map(async (p) => {
                let isRunning = false
                try {
                    // 只有当有浏览器 ID 时才检查运行状态
                    if (p.bit_browser_id) {
                        const browserType = p.browser_type || 'bitbrowser'
                        const statusResult = await window.electron.browser.checkStatus(p.bit_browser_id, browserType)
                        isRunning = statusResult?.data?.status === 'Active' ||
                            statusResult?.status === 'Active' ||
                            statusResult?.data?.status === 'active'
                    }
                } catch (e) {
                    console.log('AIStudioAccountsPage: Status check failed for', p.bit_browser_id, e.message)
                }
                return { ...p, isRunning }
            }))

            console.log('AIStudioAccountsPage: Profiles with status:', profilesWithStatus)
            setProfiles(profilesWithStatus)

            // 同时加载使用统计
            await loadUsageStats()
        } catch (error) {
            console.error('AIStudioAccountsPage: Load failed:', error)
            message.error(`加载失败: ${error.message}`)
        } finally {
            setLoading(false)
        }
    }

    useEffect(() => {
        loadProfiles()
    }, [])

    // 刷新状态
    const handleRefreshStatus = async () => {
        setCheckingStatus(true)
        await loadProfiles()
        setCheckingStatus(false)
        message.success('状态已刷新')
    }

    // 添加/编辑
    const handleEdit = (profile) => {
        setEditingProfile(profile)
        if (profile) {
            form.setFieldsValue({
                name: profile.name,
                browserType: profile.browser_type || 'bitbrowser',
                bitBrowserId: profile.bit_browser_id,
                status: profile.status || 'active'
            })
        } else {
            form.resetFields()
            form.setFieldsValue({
                browserType: 'bitbrowser',
                status: 'active'
            })
        }
        setModalVisible(true)
    }

    // 删除
    const handleDelete = (id) => {
        Modal.confirm({
            title: '确认删除',
            content: '确定要删除这个账号吗？',
            onOk: async () => {
                try {
                    await window.electron.db.deleteAIStudioAccount(id)
                    message.success('删除成功')
                    loadProfiles()
                } catch (error) {
                    message.error(`删除失败: ${error.message}`)
                }
            }
        })
    }

    // 保存
    const handleSave = async () => {
        try {
            const values = await form.validateFields()
            const profileData = {
                name: values.name,
                browserType: values.browserType,
                bitBrowserId: values.bitBrowserId,
                status: values.status
            }

            if (editingProfile) {
                await window.electron.db.updateAIStudioAccount(editingProfile.id, profileData)
                message.success('更新成功')
            } else {
                await window.electron.db.saveAIStudioAccount(profileData)
                message.success('添加成功')
            }

            setModalVisible(false)
            loadProfiles()
        } catch (error) {
            if (!error.errorFields) {
                message.error(`保存失败: ${error.message}`)
            }
        }
    }

    const columns = [
        {
            title: 'ID',
            dataIndex: 'id',
            width: 60,
        },
        {
            title: '名称',
            dataIndex: 'name',
            width: 150,
        },
        {
            title: '浏览器类型',
            dataIndex: 'browser_type',
            width: 120,
            render: (type) => {
                const browserType = type || 'bitbrowser'
                const config = BROWSER_TYPES[browserType] || BROWSER_TYPES.bitbrowser
                return <Tag color={config.color}>{config.name}</Tag>
            }
        },
        {
            title: '浏览器 ID',
            dataIndex: 'bit_browser_id',
            width: 150,
        },
        {
            title: '账号状态',
            dataIndex: 'status',
            width: 100,
            render: (status) => (
                <Tag color={status === 'active' ? 'success' : 'default'}>
                    {status === 'active' ? '启用' : '禁用'}
                </Tag>
            )
        },
        {
            title: '运行状态',
            dataIndex: 'isRunning',
            width: 100,
            render: (isRunning) => (
                <Tag color={isRunning ? 'processing' : 'default'}>
                    {isRunning ? '运行中' : '未运行'}
                </Tag>
            )
        },
        {
            title: '今日统计',
            key: 'daily_stats',
            width: 150,
            render: (_, record) => {
                const stats = usageStats[record.bit_browser_id]
                if (!stats) return <span style={{ color: '#999' }}>-</span>
                return (
                    <Space size={4}>
                        <Tag color="blue">发送 {stats.daily_count || 0}</Tag>
                        <Tag color="green">成功 {stats.daily_success_count || 0}</Tag>
                    </Space>
                )
            }
        },
        {
            title: '累计统计',
            key: 'total_stats',
            width: 150,
            render: (_, record) => {
                const stats = usageStats[record.bit_browser_id]
                if (!stats) return <span style={{ color: '#999' }}>-</span>
                return (
                    <Space size={4}>
                        <Tag>发送 {stats.total_count || 0}</Tag>
                        <Tag>成功 {stats.total_success_count || 0}</Tag>
                    </Space>
                )
            }
        },
        {
            title: '操作',
            key: 'action',
            width: 150,
            render: (_, record) => (
                <Space>
                    <Button
                        type="link"
                        icon={<EditOutlined />}
                        onClick={() => handleEdit(record)}
                    >
                        编辑
                    </Button>
                    <Button
                        type="link"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => handleDelete(record.id)}
                    >
                        删除
                    </Button>
                </Space>
            )
        }
    ]

    return (
        <div>
            <Title level={4}>AI Studio 账号管理</Title>

            <div style={{ marginBottom: 16 }}>
                <Space>
                    <Button
                        type="primary"
                        icon={<PlusOutlined />}
                        onClick={() => handleEdit(null)}
                    >
                        添加账号
                    </Button>
                    <Button
                        icon={<ReloadOutlined />}
                        onClick={handleRefreshStatus}
                        loading={checkingStatus}
                    >
                        刷新状态
                    </Button>
                </Space>
            </div>

            <Table
                columns={columns}
                dataSource={profiles}
                rowKey="id"
                loading={loading}
            />

            <Modal
                title={editingProfile ? '编辑账号' : '添加账号'}
                open={modalVisible}
                onOk={handleSave}
                onCancel={() => setModalVisible(false)}
            >
                <Form form={form} layout="vertical">
                    <Form.Item
                        label="账号名称"
                        name="name"
                        rules={[{ required: true, message: '请输入名称' }]}
                    >
                        <Input placeholder="给这个账号起个名字" />
                    </Form.Item>

                    <Form.Item
                        label="浏览器类型"
                        name="browserType"
                        initialValue="bitbrowser"
                        rules={[{ required: true, message: '请选择浏览器类型' }]}
                    >
                        <Select>
                            <Option value="bitbrowser">比特浏览器</Option>
                            <Option value="hubstudio">HubStudio</Option>
                        </Select>
                    </Form.Item>

                    <Form.Item
                        label="浏览器 ID"
                        name="bitBrowserId"
                        rules={[{ required: true, message: '请输入浏览器 ID' }]}
                    >
                        <Input placeholder="从浏览器管理软件中复制 ID" />
                    </Form.Item>

                    <Form.Item
                        label="状态"
                        name="status"
                        initialValue="active"
                    >
                        <Select>
                            <Option value="active">启用</Option>
                            <Option value="inactive">禁用</Option>
                        </Select>
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    )
}

export default AIStudioAccountsPage
