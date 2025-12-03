import React, { useState, useEffect } from 'react'
import { Typography, Button, message, Table, Modal, Form, Input, Space, Select, Tag, Card, Divider, Alert } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined, SettingOutlined, CheckCircleOutlined } from '@ant-design/icons'

const { Title, Text } = Typography
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

    // HubStudio 配置
    const [hubstudioForm] = Form.useForm()
    const [hubstudioConfigVisible, setHubstudioConfigVisible] = useState(false)
    const [hubstudioConnected, setHubstudioConnected] = useState(false)
    const [testingHubstudio, setTestingHubstudio] = useState(false)

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
        } catch (error) {
            console.error('AIStudioAccountsPage: Load failed:', error)
            message.error(`加载失败: ${error.message}`)
        } finally {
            setLoading(false)
        }
    }

    // 保存 HubStudio 凭证到状态，用于在 Modal 打开时填充表单
    const [hubstudioCredentials, setHubstudioCredentials] = useState(null)

    // 加载 HubStudio 配置
    const loadHubstudioConfig = async () => {
        try {
            const credentials = await window.electron.hubstudio.getCredentials()
            if (credentials.appId) {
                // 保存凭证到状态，稍后在 Modal 打开时使用
                setHubstudioCredentials({
                    appId: credentials.appId,
                    appSecret: '', // 不显示密钥
                    groupCode: credentials.groupCode
                })
                // 测试连接状态
                const result = await window.electron.hubstudio.test()
                setHubstudioConnected(result.success)
            }
        } catch (error) {
            console.error('加载 HubStudio 配置失败:', error)
        }
    }

    // 当 HubStudio 配置 Modal 打开时，填充表单
    useEffect(() => {
        if (hubstudioConfigVisible && hubstudioCredentials) {
            hubstudioForm.setFieldsValue(hubstudioCredentials)
        }
    }, [hubstudioConfigVisible, hubstudioCredentials, hubstudioForm])

    useEffect(() => {
        loadProfiles()
        loadHubstudioConfig()
    }, [])

    // 刷新状态
    const handleRefreshStatus = async () => {
        setCheckingStatus(true)
        await loadProfiles()
        setCheckingStatus(false)
        message.success('状态已刷新')
    }

    // 保存 HubStudio 配置
    const handleSaveHubstudioConfig = async () => {
        try {
            const values = await hubstudioForm.validateFields()
            const result = await window.electron.hubstudio.setCredentials(
                values.appId,
                values.appSecret,
                values.groupCode || ''
            )
            if (result.success) {
                message.success('HubStudio 配置已保存')
                setHubstudioConfigVisible(false)
                // 测试连接
                const testResult = await window.electron.hubstudio.test()
                setHubstudioConnected(testResult.success)
                if (!testResult.success) {
                    message.warning('配置已保存，但连接测试失败: ' + testResult.message)
                }
            } else {
                message.error('保存失败: ' + result.error)
            }
        } catch (error) {
            if (!error.errorFields) {
                message.error('保存失败: ' + error.message)
            }
        }
    }

    // 测试 HubStudio 连接
    const handleTestHubstudio = async () => {
        setTestingHubstudio(true)
        try {
            const result = await window.electron.hubstudio.test()
            if (result.success) {
                message.success('HubStudio 连接成功')
                setHubstudioConnected(true)
            } else {
                message.error('连接失败: ' + result.message)
                setHubstudioConnected(false)
            }
        } catch (error) {
            message.error('测试失败: ' + error.message)
            setHubstudioConnected(false)
        } finally {
            setTestingHubstudio(false)
        }
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
            <Title level={2}>AI Studio 账号管理</Title>

            {/* HubStudio 配置卡片 */}
            <Card
                size="small"
                title={
                    <Space>
                        <SettingOutlined />
                        <span>HubStudio 配置</span>
                        {hubstudioConnected && (
                            <Tag color="success" icon={<CheckCircleOutlined />}>已连接</Tag>
                        )}
                    </Space>
                }
                style={{ marginBottom: 16 }}
                extra={
                    <Space>
                        <Button
                            size="small"
                            onClick={handleTestHubstudio}
                            loading={testingHubstudio}
                        >
                            测试连接
                        </Button>
                        <Button
                            size="small"
                            type="primary"
                            onClick={() => setHubstudioConfigVisible(true)}
                        >
                            配置凭证
                        </Button>
                    </Space>
                }
            >
                <Text type="secondary">
                    如需使用 HubStudio 浏览器，请先在 HubStudio 客户端获取 API 凭证（API → 用户凭证），然后点击"配置凭证"填入。
                </Text>
            </Card>

            <Divider />

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

            {/* HubStudio 配置 Modal */}
            <Modal
                title="配置 HubStudio API 凭证"
                open={hubstudioConfigVisible}
                onOk={handleSaveHubstudioConfig}
                onCancel={() => setHubstudioConfigVisible(false)}
                okText="保存"
                cancelText="取消"
            >
                <Alert
                    message="获取凭证方法"
                    description="打开 HubStudio 客户端 → 点击「API」→「用户凭证」获取 App ID 和 App Secret。团队代码在「用户中心」→「团队信息」中获取。"
                    type="info"
                    showIcon
                    style={{ marginBottom: 16 }}
                />
                <Form form={hubstudioForm} layout="vertical">
                    <Form.Item
                        label="App ID"
                        name="appId"
                        rules={[{ required: true, message: '请输入 App ID' }]}
                    >
                        <Input placeholder="从 HubStudio 客户端获取" />
                    </Form.Item>

                    <Form.Item
                        label="App Secret"
                        name="appSecret"
                        rules={[{ required: true, message: '请输入 App Secret' }]}
                    >
                        <Input.Password placeholder="从 HubStudio 客户端获取" />
                    </Form.Item>

                    <Form.Item
                        label="团队代码 (Group Code)"
                        name="groupCode"
                        tooltip="可选，用于指定操作的团队"
                    >
                        <Input placeholder="从用户中心 → 团队信息获取（可选）" />
                    </Form.Item>
                </Form>
            </Modal>
        </div>
    )
}

export default AIStudioAccountsPage
