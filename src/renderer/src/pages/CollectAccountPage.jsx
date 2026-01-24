import React, { useState, useEffect } from 'react'
import {
  Card,
  Button,
  Table,
  Space,
  Modal,
  Form,
  Input,
  Select,
  Radio,
  message,
  Typography,
  Popconfirm,
  Tag
} from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ReloadOutlined
} from '@ant-design/icons'

const { Title } = Typography

const CollectAccountPage = ({ platform = 'douyin' }) => {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingAccount, setEditingAccount] = useState(null)
  const [form] = Form.useForm()
  const [hubstudioBrowsers, setHubstudioBrowsers] = useState([])
  const [bitBrowsers, setBitBrowsers] = useState([])
  const [loadingBrowsers, setLoadingBrowsers] = useState(false)
  const [browserType, setBrowserType] = useState('hubstudio') // 'hubstudio' or 'bitbrowser'

  const platformConfig = {
    douyin: {
      title: '抖音采集账号管理',
      placeholder: '抖音采集号1',
      browserLabel: '比特浏览器ID',
      browserPlaceholder: '例如：4473c9bd4b504eb98896ed394f398b37',
      browserHelp: '在比特浏览器中复制浏览器配置的ID',
      showBrowserTypeSelector: false
    },
    youtube: {
      title: 'YouTube采集账号管理',
      placeholder: 'YouTube采集号1',
      browserLabel: '浏览器',
      browserPlaceholder: '选择浏览器',
      browserHelp: '选择要使用的浏览器',
      showBrowserTypeSelector: true
    }
  }
  const config = platformConfig[platform] || platformConfig.douyin

  // 加载账号列表
  const loadAccounts = async () => {
    setLoading(true)
    try {
      const data = await window.electron.collectAccount.list(platform)
      setAccounts(data)
    } catch (error) {
      console.error('Failed to load accounts:', error)
      message.error('加载账号列表失败')
    } finally {
      setLoading(false)
    }
  }

  // 加载 HubStudio 浏览器列表
  const loadHubstudioBrowsers = async () => {
    try {
      const result = await window.electron.hubstudio.list()
      if (result.code === 0 && result.data?.list) {
        setHubstudioBrowsers(result.data.list || [])
      }
    } catch (error) {
      console.error('Failed to load HubStudio browsers:', error)
    }
  }

  // 加载比特浏览器列表
  const loadBitBrowsers = async () => {
    try {
      const result = await window.electron.bitbrowser.list()
      if (result.success && result.data?.list) {
        setBitBrowsers(result.data.list || [])
      }
    } catch (error) {
      console.error('Failed to load BitBrowser list:', error)
    }
  }

  // 加载所有浏览器列表
  const loadAllBrowsers = async () => {
    setLoadingBrowsers(true)
    try {
      await Promise.all([loadHubstudioBrowsers(), loadBitBrowsers()])
    } finally {
      setLoadingBrowsers(false)
    }
  }

  useEffect(() => {
    loadAccounts()
    if (platform === 'youtube') {
      loadAllBrowsers()
    }
  }, [platform])

  // 当弹窗打开且有编辑数据时，确保表单值正确设置
  useEffect(() => {
    if (modalVisible && editingAccount) {
      const type = editingAccount.browser_type || 'hubstudio'
      setBrowserType(type)
      // 延迟设置确保表单已挂载
      setTimeout(() => {
        form.setFieldsValue({
          name: editingAccount.name,
          browserType: type,
          bitBrowserId: editingAccount.bit_browser_id
        })
      }, 0)
    }
  }, [modalVisible, editingAccount])

  // 打开添加/编辑弹窗
  const openModal = (account = null) => {
    setEditingAccount(account)
    if (account) {
      // 根据 browser_type 字段判断浏览器类型，默认 hubstudio
      const type = account.browser_type || 'hubstudio'
      setBrowserType(type)
    } else {
      setBrowserType('hubstudio')
      form.resetFields()
      form.setFieldsValue({ browserType: 'hubstudio' })
    }
    setModalVisible(true)
  }

  // 保存账号
  const handleSave = async () => {
    try {
      const values = await form.validateFields()

      // 添加浏览器类型到保存数据
      // 使用表单中的 browserType 值（由 Form.Item 控制）
      const formBrowserType = values.browserType
      const actualBrowserType = platform === 'youtube' ? (formBrowserType || browserType || 'hubstudio') : 'bitbrowser'
      console.log('[CollectAccountPage] Saving with browserType:', actualBrowserType, 'form:', formBrowserType, 'state:', browserType)

      const saveData = {
        ...values,
        browserType: actualBrowserType,
        platform: platform // 确保 platform 被正确传递
      }

      if (editingAccount) {
        // 更新 - 保留原来的 platform
        const result = await window.electron.collectAccount.update(editingAccount.id, {
          ...saveData,
          platform: editingAccount.platform // 更新时使用原账号的 platform
        })
        if (result.success) {
          message.success('更新成功')
        } else {
          message.error(result.error || '更新失败')
          return
        }
      } else {
        // 创建
        const result = await window.electron.collectAccount.create(saveData)
        if (result.success) {
          message.success('添加成功')
        } else {
          message.error(result.error || '添加失败')
          return
        }
      }

      setModalVisible(false)
      loadAccounts()
    } catch (error) {
      console.error('Save error:', error)
    }
  }

  // 删除账号
  const handleDelete = async (id) => {
    try {
      const result = await window.electron.collectAccount.delete(id)
      if (result.success) {
        message.success('删除成功')
        loadAccounts()
      } else {
        message.error(result.error || '删除失败')
      }
    } catch (error) {
      message.error('删除失败: ' + error.message)
    }
  }

  // 根据 containerCode 获取 HubStudio 浏览器名称
  const getHubstudioBrowserName = (containerCode) => {
    const browser = hubstudioBrowsers.find(b => String(b.containerCode) === String(containerCode))
    return browser?.containerName || containerCode
  }

  // 根据 id 获取比特浏览器名称
  const getBitBrowserName = (browserId) => {
    const browser = bitBrowsers.find(b => b.id === browserId)
    return browser?.name || browserId
  }

  // 表格列定义
  const columns = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      width: 150
    },
    ...(platform === 'youtube' ? [{
      title: '浏览器类型',
      dataIndex: 'browser_type',
      key: 'browser_type',
      width: 120,
      render: (type) => (
        <Tag color={type === 'hubstudio' ? 'blue' : 'green'}>
          {type === 'hubstudio' ? 'HubStudio' : '比特浏览器'}
        </Tag>
      )
    }] : []),
    {
      title: platform === 'youtube' ? '浏览器' : config.browserLabel,
      dataIndex: 'bit_browser_id',
      key: 'bit_browser_id',
      width: 280,
      render: (id, record) => {
        if (platform === 'youtube') {
          const type = record.browser_type || 'hubstudio'
          const name = type === 'hubstudio' ? getHubstudioBrowserName(id) : getBitBrowserName(id)
          return (
            <Typography.Text>
              {name}
              <Typography.Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>
                ({id?.length > 20 ? id.slice(0, 20) + '...' : id})
              </Typography.Text>
            </Typography.Text>
          )
        }
        return (
          <Typography.Text copyable={{ text: id }} style={{ fontFamily: 'monospace' }}>
            {id}
          </Typography.Text>
        )
      }
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 160,
      render: (time) => time ? new Date(time).toLocaleString() : '-'
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => openModal(record)}
          >
            编辑
          </Button>
          <Popconfirm
            title="确定要删除这个账号吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button
              type="link"
              size="small"
              danger
              icon={<DeleteOutlined />}
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      )
    }
  ]

  // 获取当前浏览器选项
  const getBrowserOptions = () => {
    if (browserType === 'hubstudio') {
      return hubstudioBrowsers.map(b => ({
        label: b.containerName,
        value: String(b.containerCode)
      }))
    } else {
      return bitBrowsers.map(b => ({
        label: b.name || b.id,
        value: b.id
      }))
    }
  }

  return (
    <div>
      <Title level={4}>{config.title}</Title>

      <Card>
        <div style={{ marginBottom: 16 }}>
          <Space>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() => openModal()}
            >
              添加账号
            </Button>
            <Button
              icon={<ReloadOutlined />}
              onClick={() => { loadAccounts(); if (platform === 'youtube') loadAllBrowsers(); }}
              loading={loading}
            >
              刷新
            </Button>
          </Space>
        </div>

        <Table
          columns={columns}
          dataSource={accounts}
          rowKey="id"
          loading={loading}
          pagination={{
            pageSize: 20,
            showSizeChanger: true,
            showTotal: (total) => `共 ${total} 个账号`
          }}
        />
      </Card>

      {/* 添加/编辑弹窗 */}
      <Modal
        title={editingAccount ? '编辑账号' : '添加账号'}
        open={modalVisible}
        onOk={handleSave}
        onCancel={() => setModalVisible(false)}
        okText="保存"
        cancelText="取消"
        width={500}
      >
        <Form
          form={form}
          layout="vertical"
        >
          <Form.Item
            name="name"
            label="名称"
            rules={[{ required: true, message: '请输入名称' }]}
          >
            <Input placeholder={`例如：${config.placeholder}`} />
          </Form.Item>

          {config.showBrowserTypeSelector && (
            <Form.Item
              name="browserType"
              label="浏览器类型"
              rules={[{ required: true, message: '请选择浏览器类型' }]}
            >
              <Radio.Group
                onChange={(e) => {
                  const newType = e.target.value
                  console.log('[CollectAccountPage] Radio changed to:', newType)
                  setBrowserType(newType)
                  // 编辑模式下不清空ID，新建模式下清空
                  if (!editingAccount) {
                    form.setFieldsValue({ bitBrowserId: undefined })
                  }
                }}
              >
                <Radio.Button value="hubstudio">HubStudio</Radio.Button>
                <Radio.Button value="bitbrowser">比特浏览器</Radio.Button>
              </Radio.Group>
            </Form.Item>
          )}

          <Form.Item
            name="bitBrowserId"
            label={platform === 'youtube' ? (browserType === 'hubstudio' ? 'HubStudio 环境ID' : '比特浏览器ID') : config.browserLabel}
            rules={[{ required: true, message: '请输入浏览器ID' }]}
            extra={platform === 'youtube' ? (browserType === 'hubstudio' ? '在HubStudio中复制环境的containerCode' : '在比特浏览器中复制浏览器配置的ID') : config.browserHelp}
          >
            {platform === 'youtube' ? (
              <Input placeholder={browserType === 'hubstudio' ? '例如：1234567890' : '例如：4473c9bd4b504eb98896ed394f398b37'} />
            ) : (
              <Input placeholder={config.browserPlaceholder} />
            )}
          </Form.Item>

        </Form>
      </Modal>
    </div>
  )
}

export default CollectAccountPage
