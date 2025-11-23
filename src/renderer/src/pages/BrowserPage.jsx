import React, { useState, useEffect } from 'react'
import { Typography, Button, message, Table, Modal, Form, Input, Space, Popconfirm, Tag, Tooltip } from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, FolderOpenOutlined, ReloadOutlined, CheckCircleOutlined, CloseCircleOutlined, SyncOutlined } from '@ant-design/icons'

const { Title } = Typography

const BrowserPage = () => {
  const [profiles, setProfiles] = useState([])
  const [profilesWithStatus, setProfilesWithStatus] = useState([])
  const [loading, setLoading] = useState(false)
  const [statusLoading, setStatusLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingProfile, setEditingProfile] = useState(null)
  const [form] = Form.useForm()
  const [profileVideos, setProfileVideos] = useState({}) // 存储每个配置的视频列表
  const [loadingVideos, setLoadingVideos] = useState({}) // 存储加载状态

  // 加载账号列表
  const loadProfiles = async () => {
    setLoading(true)
    try {
      const result = await window.electron.db.getBrowserProfiles()
      setProfiles(result || [])
      // 加载完账号后,自动加载状态
      await loadProfilesStatus(result || [])
    } catch (error) {
      message.error(`加载失败: ${error.message}`)
      console.error('Failed to load profiles:', error)
    } finally {
      setLoading(false)
    }
  }

  // 加载所有账号的状态
  const loadProfilesStatus = async (profilesList = profiles) => {
    if (profilesList.length === 0) return

    setStatusLoading(true)
    try {
      // 先检查比特浏览器是否运行
      const browserListResult = await window.electron.browser.list()
      const isBitBrowserRunning = browserListResult.success

      // 获取比特浏览器中所有配置的状态
      const bitBrowserProfiles = browserListResult.data?.list || []

      // 调试：打印比特浏览器返回的数据
      console.log('=== 比特浏览器配置列表 ===')
      console.log('总数:', bitBrowserProfiles.length)
      if (bitBrowserProfiles.length > 0) {
        console.log('第一个配置示例:', bitBrowserProfiles[0])
      }

      // 创建一个 Map 来快速查找配置状态
      const bitBrowserProfileMap = new Map()
      bitBrowserProfiles.forEach(bp => {
        bitBrowserProfileMap.set(bp.id, bp)
        console.log(`配置 ${bp.id}: 名称=${bp.name}, status=${bp.status}, isOpen=${bp.isOpen}`)
      })

      const profilesWithStatusData = await Promise.all(
        profilesList.map(async (profile) => {
          let browserStatus = 'unknown'
          let uploadStatus = { isUploading: false, pendingCount: 0 }

          // 只有比特浏览器运行时才检查浏览器状态
          if (isBitBrowserRunning && profile.bit_browser_id) {
            const bitProfile = bitBrowserProfileMap.get(profile.bit_browser_id)
            if (bitProfile) {
              // 检查 status 字段判断浏览器是否打开
              // 比特浏览器返回的状态字段可能是 status 或 isOpen
              const isOpen = bitProfile.status === 'Open' ||
                            bitProfile.isOpen === true ||
                            bitProfile.status === 1
              browserStatus = isOpen ? 'running' : 'stopped'
            } else {
              // 找不到对应的配置，可能配置ID不正确
              browserStatus = 'unknown'
            }
          } else {
            browserStatus = isBitBrowserRunning ? 'stopped' : 'offline'
          }

          // 检查上传状态
          try {
            uploadStatus = await window.electron.db.getProfileUploadStatus(profile.id)
          } catch (error) {
            console.error(`Failed to get upload status for profile ${profile.id}:`, error)
          }

          return {
            ...profile,
            browserStatus,
            uploadStatus,
            isBitBrowserRunning
          }
        })
      )

      setProfilesWithStatus(profilesWithStatusData)
    } catch (error) {
      console.error('Failed to load profiles status:', error)
      // 即使失败也要显示基本信息
      setProfilesWithStatus(profilesList.map(p => ({
        ...p,
        browserStatus: 'unknown',
        uploadStatus: { isUploading: false, pendingCount: 0 }
      })))
    } finally {
      setStatusLoading(false)
    }
  }

  // 刷新状态
  const handleRefreshStatus = async () => {
    await loadProfilesStatus(profiles)
  }

  useEffect(() => {
    loadProfiles()

    // 每30秒自动刷新状态
    const interval = setInterval(() => {
      if (profiles.length > 0) {
        loadProfilesStatus(profiles)
      }
    }, 30000)

    return () => clearInterval(interval)
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
        message.warning(`${result.message},部分文件移动失败`)
      }
    } catch (error) {
      message.error(`移动失败: ${error.message}`)
      console.error(error)
    }
  }

  // 渲染浏览器状态
  const renderBrowserStatus = (status, record) => {
    if (!record.isBitBrowserRunning) {
      return (
        <Tooltip title="比特浏览器未运行">
          <Tag icon={<CloseCircleOutlined />} color="default">离线</Tag>
        </Tooltip>
      )
    }

    switch (status) {
      case 'running':
        return (
          <Tooltip title="浏览器已打开">
            <Tag icon={<CheckCircleOutlined />} color="success">已打开</Tag>
          </Tooltip>
        )
      case 'stopped':
        return (
          <Tooltip title="浏览器未打开">
            <Tag icon={<CloseCircleOutlined />} color="default">未打开</Tag>
          </Tooltip>
        )
      default:
        return (
          <Tooltip title="状态未知">
            <Tag color="default">未知</Tag>
          </Tooltip>
        )
    }
  }

  // 渲染运行状态
  const renderUploadStatus = (uploadStatus) => {
    if (uploadStatus.isUploading) {
      return (
        <Tooltip title="正在上传视频">
          <Tag icon={<SyncOutlined spin />} color="processing">上传中</Tag>
        </Tooltip>
      )
    }

    if (uploadStatus.pendingCount > 0) {
      return (
        <Tooltip title={`有 ${uploadStatus.pendingCount} 个待上传任务`}>
          <Tag color="warning">待上传 ({uploadStatus.pendingCount})</Tag>
        </Tooltip>
      )
    }

    return (
      <Tooltip title="空闲中">
        <Tag color="default">空闲</Tag>
      </Tooltip>
    )
  }

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 60
    },
    {
      title: '账号名称',
      dataIndex: 'name',
      key: 'name',
      width: 180
    },
    {
      title: '指纹浏览器ID',
      dataIndex: 'bit_browser_id',
      key: 'bit_browser_id',
      width: 150
    },
    {
      title: '浏览器状态',
      dataIndex: 'browserStatus',
      key: 'browserStatus',
      width: 120,
      render: (status, record) => renderBrowserStatus(status, record)
    },
    {
      title: '运行状态',
      dataIndex: 'uploadStatus',
      key: 'uploadStatus',
      width: 130,
      render: (uploadStatus) => renderUploadStatus(uploadStatus)
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
      width: 160,
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
            title="确定删除这个账号吗?"
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
            {record.folder_path ? `文件夹:${record.folder_path}` : '未设置文件夹路径'}
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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={2} style={{ margin: 0 }}>账号管理</Title>
        <Space>
          <Button
            icon={<ReloadOutlined />}
            onClick={handleRefreshStatus}
            loading={statusLoading}
          >
            刷新状态
          </Button>
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={() => handleOpenModal()}
          >
            新增账号
          </Button>
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={profilesWithStatus}
        rowKey="id"
        loading={loading || statusLoading}
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 个账号`
        }}
        scroll={{ x: 1200 }}
        expandable={{
          expandedRowRender,
          rowExpandable: (record) => record.folder_path !== null && record.folder_path !== ''
        }}
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
