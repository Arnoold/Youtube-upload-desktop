import React, { useState, useEffect } from 'react'
import {
  Card,
  Button,
  Table,
  Space,
  Modal,
  Form,
  Input,
  message,
  Typography,
  Popconfirm,
  Tag,
  Select
} from 'antd'
import {
  PlusOutlined,
  EditOutlined,
  DeleteOutlined,
  ReloadOutlined
} from '@ant-design/icons'

const { Title } = Typography

const CollectAccountPage = () => {
  const [accounts, setAccounts] = useState([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingAccount, setEditingAccount] = useState(null)
  const [form] = Form.useForm()

  // 加载账号列表
  const loadAccounts = async () => {
    setLoading(true)
    try {
      const data = await window.electron.collectAccount.list()
      setAccounts(data)
    } catch (error) {
      console.error('Failed to load accounts:', error)
      message.error('加载账号列表失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAccounts()
  }, [])

  // 打开添加/编辑弹窗
  const openModal = (account = null) => {
    setEditingAccount(account)
    if (account) {
      form.setFieldsValue({
        name: account.name,
        bitBrowserId: account.bit_browser_id,
        platform: account.platform || 'douyin',
        remark: account.remark
      })
    } else {
      form.resetFields()
      form.setFieldsValue({ platform: 'douyin' })
    }
    setModalVisible(true)
  }

  // 保存账号
  const handleSave = async () => {
    try {
      const values = await form.validateFields()

      if (editingAccount) {
        // 更新
        const result = await window.electron.collectAccount.update(editingAccount.id, values)
        if (result.success) {
          message.success('更新成功')
        } else {
          message.error(result.error || '更新失败')
          return
        }
      } else {
        // 创建
        const result = await window.electron.collectAccount.create(values)
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

  // 表格列定义
  const columns = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      width: 150
    },
    {
      title: '比特浏览器ID',
      dataIndex: 'bit_browser_id',
      key: 'bit_browser_id',
      width: 300,
      render: (id) => (
        <Typography.Text copyable={{ text: id }} style={{ fontFamily: 'monospace' }}>
          {id}
        </Typography.Text>
      )
    },
    {
      title: '平台',
      dataIndex: 'platform',
      key: 'platform',
      width: 100,
      render: (platform) => {
        const platformMap = {
          douyin: { text: '抖音', color: 'magenta' },
          kuaishou: { text: '快手', color: 'orange' },
          xiaohongshu: { text: '小红书', color: 'red' },
          bilibili: { text: 'B站', color: 'blue' }
        }
        const info = platformMap[platform] || { text: platform, color: 'default' }
        return <Tag color={info.color}>{info.text}</Tag>
      }
    },
    {
      title: '备注',
      dataIndex: 'remark',
      key: 'remark',
      ellipsis: true
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (time) => time ? new Date(time).toLocaleString() : '-'
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
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

  return (
    <div>
      <Title level={4}>采集账号管理</Title>

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
              onClick={loadAccounts}
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
            <Input placeholder="例如：抖音采集号1" />
          </Form.Item>

          <Form.Item
            name="bitBrowserId"
            label="比特浏览器ID"
            rules={[{ required: true, message: '请输入比特浏览器ID' }]}
            extra="在比特浏览器中复制浏览器配置的ID"
          >
            <Input placeholder="例如：4473c9bd4b504eb98896ed394f398b37" />
          </Form.Item>

          <Form.Item
            name="platform"
            label="平台"
            rules={[{ required: true, message: '请选择平台' }]}
          >
            <Select>
              <Select.Option value="douyin">抖音</Select.Option>
              <Select.Option value="kuaishou">快手</Select.Option>
              <Select.Option value="xiaohongshu">小红书</Select.Option>
              <Select.Option value="bilibili">B站</Select.Option>
            </Select>
          </Form.Item>

          <Form.Item
            name="remark"
            label="备注"
          >
            <Input.TextArea rows={3} placeholder="可选，添加备注说明" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default CollectAccountPage