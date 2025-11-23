import React, { useState, useEffect } from 'react'
import { Typography, Button, message, Table, Modal, Form, Input, Select, Space } from 'antd'
import { SyncOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons'

const { Title } = Typography

const BrowserPage = () => {
  const [connectionStatus, setConnectionStatus] = useState(null)
  const [profiles, setProfiles] = useState([])
  const [testing, setTesting] = useState(false)
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form] = Form.useForm()
  const [profileVideos, setProfileVideos] = useState({}) // 存储每个配置的视频列表
  const [loadingVideos, setLoadingVideos] = useState({}) // 存储加载状态

  const testConnection = async () => {
    setTesting(true)
    try {
      const result = await window.electron.browser.test()
      setConnectionStatus(result)
      if (result.success) {
        message.success('连接成功！')
        loadProfiles()
      } else {
        message.error(result.message || '连接失败')
      }
    } catch (error) {
      message.error(`测试失败: ${error.message}`)
      setConnectionStatus({ success: false, error: error.message })
    } finally {
      setTesting(false)
    }
  }

  const loadProfiles = async () => {
    setLoading(true)
    try {
      const result = await window.electron.browser.list()
      if (result.success && result.data && result.data.list) {
        setProfiles(result.data.list)
      }
    } catch (error) {
      console.error('Failed to load profiles:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    testConnection()
  }, [])

  // 打开新增配置 Modal
  const handleOpenModal = () => {
    setModalVisible(true)
    form.resetFields()
    // 设置默认值
    form.setFieldsValue({
      proxyType: 'noproxy'
    })
  }

  // 取消新增配置
  const handleCancel = () => {
    setModalVisible(false)
    form.resetFields()
  }

  // 获取视频文件列表
  const handleGetVideos = async (profileId, folderPath) => {
    if (!folderPath) {
      message.warning('该配置未设置文件夹路径')
      return
    }

    setLoadingVideos(prev => ({ ...prev, [profileId]: true }))
    try {
      const videos = await window.electron.file.scanShallow(folderPath)
      setProfileVideos(prev => ({ ...prev, [profileId]: videos }))
      message.success(`找到 ${videos.length} 个视频文件`)
    } catch (error) {
      message.error(`获取视频文件失败: ${error.message}`)
      console.error(error)
    } finally {
      setLoadingVideos(prev => ({ ...prev, [profileId]: false }))
    }
  }

  // 移动视频到已发布文件夹
  const handleMoveToPublished = async (profileId, folderPath) => {
    if (!folderPath) {
      message.warning('该配置未设置文件夹路径')
      return
    }

    try {
      const result = await window.electron.file.moveToPublished(folderPath)
      if (result.success) {
        message.success(result.message)
        // 重新获取视频列表
        await handleGetVideos(profileId, folderPath)
      } else {
        message.warning(`${result.message}，部分文件移动失败`)
      }
    } catch (error) {
      message.error(`移动失败: ${error.message}`)
      console.error(error)
    }
  }

  // 提交新增配置
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setCreating(true)

      const config = {
        name: values.name,
        remark: values.remark || '',
        folderPath: values.folderPath || '',
        proxyType: values.proxyType || 'noproxy',
        proxyHost: values.proxyHost || '',
        proxyPort: values.proxyPort || '',
        proxyUser: values.proxyUser || '',
        proxyPassword: values.proxyPassword || ''
      }

      const result = await window.electron.browser.create(config)

      if (result.success) {
        message.success('浏览器配置创建成功！')
        setModalVisible(false)
        form.resetFields()
        // 重新加载配置列表
        loadProfiles()
      } else {
        message.error(result.msg || '创建失败')
      }
    } catch (error) {
      if (error.errorFields) {
        message.error('请填写必填项')
      } else {
        message.error(`创建配置失败: ${error.message}`)
        console.error(error)
      }
    } finally {
      setCreating(false)
    }
  }

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 80
    },
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      width: 150
    },
    {
      title: '备注',
      dataIndex: 'remark',
      key: 'remark',
      width: 120
    },
    {
      title: '文件夹路径',
      dataIndex: 'folder_path',
      key: 'folder_path',
      ellipsis: true
    },
    {
      title: '代理类型',
      dataIndex: 'proxyType',
      key: 'proxyType',
      width: 100
    }
  ]

  // 展开行渲染
  const expandedRowRender = (record) => {
    const videos = profileVideos[record.id] || []
    const isLoading = loadingVideos[record.id] || false

    const videoColumns = [
      {
        title: '文件名',
        dataIndex: 'name',
        key: 'name',
        ellipsis: true
      },
      {
        title: '大小',
        dataIndex: 'sizeFormatted',
        key: 'size',
        width: 100
      },
      {
        title: '修改时间',
        dataIndex: 'modifiedTime',
        key: 'modifiedTime',
        width: 160,
        render: (time) => new Date(time).toLocaleString('zh-CN')
      }
    ]

    return (
      <div style={{ padding: '12px 0' }}>
        <Space style={{ marginBottom: 12 }}>
          <Button
            type="primary"
            onClick={() => handleGetVideos(record.id, record.folder_path)}
            loading={isLoading}
          >
            获取视频文件
          </Button>
          <Button
            onClick={() => handleMoveToPublished(record.id, record.folder_path)}
            disabled={videos.length === 0}
          >
            移动视频到已发布
          </Button>
          <Typography.Text type="secondary">
            {record.folder_path ? `文件夹：${record.folder_path}` : '未设置文件夹路径'}
          </Typography.Text>
        </Space>

        {videos.length > 0 ? (
          <Table
            columns={videoColumns}
            dataSource={videos}
            rowKey="id"
            pagination={{ pageSize: 5 }}
            size="small"
          />
        ) : (
          <Typography.Text type="secondary">
            {isLoading ? '正在加载...' : '点击"获取视频文件"按钮查看视频列表'}
          </Typography.Text>
        )}
      </div>
    )
  }

  return (
    <div>
      <Title level={2}>比特浏览器配置</Title>

      <Space style={{ marginBottom: 24 }} size="middle">
        <Button
          icon={<SyncOutlined />}
          onClick={testConnection}
          loading={testing}
          type={connectionStatus?.success ? 'primary' : 'default'}
        >
          测试连接
        </Button>

        {connectionStatus?.success && (
          <>
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={handleOpenModal}
            >
              新增配置
            </Button>
            <Button
              icon={<ReloadOutlined />}
              onClick={loadProfiles}
              loading={loading}
            >
              刷新列表
            </Button>
          </>
        )}
      </Space>

      {connectionStatus && (
        <div style={{ marginBottom: 16 }}>
          <Typography.Text
            type={connectionStatus.success ? 'success' : 'danger'}
          >
            {connectionStatus.success
              ? '✅ 比特浏览器连接正常'
              : `❌ ${connectionStatus.message || '连接失败'}`}
          </Typography.Text>
        </div>
      )}

      {connectionStatus?.success && (
        <>
          <Title level={4}>浏览器配置列表</Title>
          <Table
            columns={columns}
            dataSource={profiles}
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 10 }}
            expandable={{
              expandedRowRender,
              rowExpandable: (record) => record.folder_path !== null && record.folder_path !== ''
            }}
          />
        </>
      )}

      <Modal
        title="新增浏览器配置"
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={handleCancel}
        okText="创建配置"
        cancelText="取消"
        confirmLoading={creating}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          style={{ marginTop: 20 }}
        >
          <Form.Item
            label="配置名称"
            name="name"
            rules={[{ required: true, message: '请输入配置名称' }]}
          >
            <Input placeholder="例如：YouTube账号1" />
          </Form.Item>

          <Form.Item
            label="备注"
            name="remark"
          >
            <Input placeholder="备注信息（可选）" />
          </Form.Item>

          <Form.Item
            label="视频文件夹路径"
            name="folderPath"
            rules={[{ required: true, message: '请输入视频文件夹路径' }]}
          >
            <Input placeholder="例如：D:/Videos/Account1" />
          </Form.Item>

          <Form.Item
            label="代理类型"
            name="proxyType"
            rules={[{ required: true, message: '请选择代理类型' }]}
          >
            <Select>
              <Select.Option value="noproxy">不使用代理</Select.Option>
              <Select.Option value="http">HTTP</Select.Option>
              <Select.Option value="https">HTTPS</Select.Option>
              <Select.Option value="socks5">SOCKS5</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            noStyle
            shouldUpdate={(prevValues, currentValues) => prevValues.proxyType !== currentValues.proxyType}
          >
            {({ getFieldValue }) =>
              getFieldValue('proxyType') && getFieldValue('proxyType') !== 'noproxy' ? (
                <>
                  <Form.Item
                    label="代理地址"
                    name="proxyHost"
                    rules={[{ required: true, message: '请输入代理地址' }]}
                  >
                    <Input placeholder="例如：127.0.0.1" />
                  </Form.Item>

                  <Form.Item
                    label="代理端口"
                    name="proxyPort"
                    rules={[{ required: true, message: '请输入代理端口' }]}
                  >
                    <Input placeholder="例如：7890" type="number" />
                  </Form.Item>

                  <Form.Item
                    label="代理用户名"
                    name="proxyUser"
                  >
                    <Input placeholder="如需认证请填写（可选）" />
                  </Form.Item>

                  <Form.Item
                    label="代理密码"
                    name="proxyPassword"
                  >
                    <Input.Password placeholder="如需认证请填写（可选）" />
                  </Form.Item>
                </>
              ) : null
            }
          </Form.Item>

          <Typography.Text type="secondary">
            提示：创建配置后，请在比特浏览器中打开该配置并登录 YouTube 账号
          </Typography.Text>
        </Form>
      </Modal>
    </div>
  )
}

export default BrowserPage
