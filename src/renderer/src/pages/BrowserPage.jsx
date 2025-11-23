import React, { useState, useEffect } from 'react'
import { Typography, Button, message, Table, Modal, Form, Input, Space, Popconfirm } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, FolderOpenOutlined } from '@ant-design/icons'

const { Title } = Typography

const BrowserPage = () => {
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingProfile, setEditingProfile] = useState(null)
  const [form] = Form.useForm()

  // 加载账号列表
  const loadProfiles = async () => {
    setLoading(true)
    try {
      const result = await window.electron.db.getBrowserProfiles()
      setProfiles(result || [])
    } catch (error) {
      message.error(`加载失败: ${error.message}`)
      console.error('Failed to load profiles:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadProfiles()
  }, [])

  // 打开新增/编辑对话框
  const handleOpenModal = (profile = null) => {
    setEditingProfile(profile)
    if (profile) {
      form.setFieldsValue({
        name: profile.name,
        bitBrowserId: profile.bit_browser_id,
        folderPath: profile.folder_path
      })
    } else {
      form.resetFields()
    }
    setModalVisible(true)
  }

  // 选择文件夹
  const handleSelectFolder = async () => {
    try {
      const folderPath = await window.electron.dialog.selectFolder()
      if (folderPath) {
        form.setFieldsValue({ folderPath })
      }
    } catch (error) {
      message.error(`选择文件夹失败: ${error.message}`)
    }
  }

  // 保存账号
  const handleSave = async () => {
    try {
      const values = await form.validateFields()

      const profileData = {
        name: values.name,
        bitBrowserId: values.bitBrowserId,
        folderPath: values.folderPath || null
      }

      if (editingProfile) {
        // 更新
        await window.electron.db.updateBrowserProfile(editingProfile.id, profileData)
        message.success('账号更新成功')
      } else {
        // 新增
        await window.electron.db.saveBrowserProfile(profileData)
        message.success('账号添加成功')
      }

      setModalVisible(false)
      form.resetFields()
      loadProfiles()
    } catch (error) {
      if (error.errorFields) {
        // 表单验证错误
        return
      }
      message.error(`保存失败: ${error.message}`)
      console.error('Failed to save profile:', error)
    }
  }

  // 删除账号
  const handleDelete = async (id) => {
    try {
      await window.electron.db.deleteBrowserProfile(id)
      message.success('账号删除成功')
      loadProfiles()
    } catch (error) {
      message.error(`删除失败: ${error.message}`)
      console.error('Failed to delete profile:', error)
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
      title: '账号名称',
      dataIndex: 'name',
      key: 'name',
      width: 200
    },
    {
      title: '指纹浏览器ID',
      dataIndex: 'bit_browser_id',
      key: 'bit_browser_id',
      width: 200
    },
    {
      title: '文件夹路径',
      dataIndex: 'folder_path',
      key: 'folder_path',
      ellipsis: true,
      render: (path) => path || <span style={{ color: '#999' }}>未设置</span>
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (time) => new Date(time).toLocaleString('zh-CN')
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      fixed: 'right',
      render: (_, record) => (
        <Space>
          <Button
            type="link"
            icon={<EditOutlined />}
            onClick={() => handleOpenModal(record)}
            size="small"
          >
            编辑
          </Button>
          <Popconfirm
            title="确定删除这个账号吗？"
            onConfirm={() => handleDelete(record.id)}
            okText="确定"
            cancelText="取消"
          >
            <Button
              type="link"
              danger
              icon={<DeleteOutlined />}
              size="small"
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={2} style={{ margin: 0 }}>账号管理</Title>
        <Button
          type="primary"
          icon={<PlusOutlined />}
          onClick={() => handleOpenModal()}
        >
          新增账号
        </Button>
      </div>

      <Table
        columns={columns}
        dataSource={profiles}
        rowKey="id"
        loading={loading}
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 个账号`
        }}
        scroll={{ x: 1000 }}
      />

      <Modal
        title={editingProfile ? '编辑账号' : '新增账号'}
        open={modalVisible}
        onOk={handleSave}
        onCancel={() => {
          setModalVisible(false)
          form.resetFields()
        }}
        okText="保存"
        cancelText="取消"
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          style={{ marginTop: 24 }}
        >
          <Form.Item
            label="账号名称"
            name="name"
            rules={[{ required: true, message: '请输入账号名称' }]}
          >
            <Input placeholder="例如: 我的YouTube账号1" />
          </Form.Item>

          <Form.Item
            label="指纹浏览器ID"
            name="bitBrowserId"
            rules={[{ required: true, message: '请输入指纹浏览器ID' }]}
          >
            <Input placeholder="在比特浏览器中查看配置ID" />
          </Form.Item>

          <Form.Item
            label="视频文件夹路径"
            name="folderPath"
          >
            <Input
              placeholder="选择存放视频的文件夹"
              addonAfter={
                <Button
                  type="text"
                  icon={<FolderOpenOutlined />}
                  onClick={handleSelectFolder}
                  style={{ margin: -5 }}
                >
                  选择
                </Button>
              }
            />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default BrowserPage
