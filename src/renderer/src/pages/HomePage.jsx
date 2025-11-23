import React, { useState } from 'react'
import { Button, Table, Space, message, Input, Typography, Modal, Form, Select, Radio } from 'antd'
import { FolderOpenOutlined, UploadOutlined, ReloadOutlined } from '@ant-design/icons'

const { Title } = Typography
const { TextArea } = Input

const HomePage = () => {
  const [videos, setVideos] = useState([])
  const [folderPath, setFolderPath] = useState('')
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [selectedVideo, setSelectedVideo] = useState(null)
  const [browserProfiles, setBrowserProfiles] = useState([])
  const [creating, setCreating] = useState(false)
  const [form] = Form.useForm()

  // 扫描文件夹
  const handleScanFolder = async () => {
    if (!folderPath) {
      message.warning('请输入文件夹路径')
      return
    }

    setLoading(true)
    try {
      const result = await window.electron.file.scan(folderPath)
      setVideos(result)
      message.success(`找到 ${result.length} 个视频文件`)

      // 保存路径到设置
      await window.electron.db.setSetting('last_folder_path', folderPath)
    } catch (error) {
      message.error(`扫描失败: ${error.message}`)
      console.error(error)
    } finally {
      setLoading(false)
    }
  }

  // 加载上次的文件夹路径
  React.useEffect(() => {
    const loadLastPath = async () => {
      try {
        const lastPath = await window.electron.db.getSetting('last_folder_path')
        if (lastPath) {
          setFolderPath(lastPath)
        }
      } catch (error) {
        console.error('Failed to load last path:', error)
      }
    }
    loadLastPath()
  }, [])

  // 打开创建任务 Modal
  const handleCreateTask = async (video) => {
    setSelectedVideo(video)
    setModalVisible(true)

    // 加载比特浏览器配置列表
    try {
      const result = await window.electron.browser.list()
      if (result.success && result.data && result.data.list) {
        setBrowserProfiles(result.data.list)
      }
    } catch (error) {
      console.error('Failed to load browser profiles:', error)
      message.error('加载浏览器配置失败')
    }

    // 设置默认表单值
    form.setFieldsValue({
      title: video.name.replace(/\.[^/.]+$/, ''), // 移除文件扩展名
      description: '',
      privacy: 'public',
      madeForKids: false
    })
  }

  // 提交创建任务
  const handleSubmit = async () => {
    try {
      const values = await form.validateFields()
      setCreating(true)

      // 处理标签：将逗号分隔的字符串转换为数组
      const tagsArray = values.tags
        ? values.tags.split(',').map(tag => tag.trim()).filter(tag => tag)
        : []

      const taskData = {
        videoPath: selectedVideo.path,
        videoName: selectedVideo.name,
        title: values.title,
        description: values.description || '',
        privacy: values.privacy,
        madeForKids: values.madeForKids,
        browserProfileId: values.browserProfileId,
        tags: tagsArray
      }

      await window.electron.upload.create(taskData)
      message.success('上传任务创建成功！')
      setModalVisible(false)
      form.resetFields()
    } catch (error) {
      if (error.errorFields) {
        message.error('请填写必填项')
      } else {
        message.error(`创建任务失败: ${error.message}`)
        console.error(error)
      }
    } finally {
      setCreating(false)
    }
  }

  // 取消创建任务
  const handleCancel = () => {
    setModalVisible(false)
    form.resetFields()
  }

  const columns = [
    {
      title: '文件名',
      dataIndex: 'name',
      key: 'name',
      width: 250,
      ellipsis: true
    },
    {
      title: '大小',
      dataIndex: 'sizeFormatted',
      key: 'size',
      width: 100
    },
    {
      title: '路径',
      dataIndex: 'path',
      key: 'path',
      ellipsis: true
    },
    {
      title: '修改时间',
      dataIndex: 'modifiedTime',
      key: 'modifiedTime',
      width: 160,
      render: (time) => new Date(time).toLocaleString('zh-CN')
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_, record) => (
        <Button
          type="primary"
          size="small"
          icon={<UploadOutlined />}
          onClick={() => handleCreateTask(record)}
        >
          创建上传任务
        </Button>
      )
    }
  ]

  return (
    <div>
      <Title level={2}>视频文件管理</Title>

      <Space style={{ marginBottom: 16 }} size="large">
        <Input
          placeholder="输入文件夹路径，如: D:\Videos"
          style={{ width: 400 }}
          value={folderPath}
          onChange={(e) => setFolderPath(e.target.value)}
          onPressEnter={handleScanFolder}
        />
        <Button
          type="primary"
          icon={<FolderOpenOutlined />}
          onClick={handleScanFolder}
          loading={loading}
        >
          扫描文件夹
        </Button>
        {videos.length > 0 && (
          <Button
            icon={<ReloadOutlined />}
            onClick={handleScanFolder}
            loading={loading}
          >
            刷新
          </Button>
        )}
      </Space>

      {videos.length > 0 && (
        <div style={{ marginBottom: 16 }}>
          <Typography.Text type="secondary">
            共找到 {videos.length} 个视频文件
          </Typography.Text>
        </div>
      )}

      <Table
        columns={columns}
        dataSource={videos}
        rowKey="id"
        loading={loading}
        pagination={{
          pageSize: 10,
          showSizeChanger: true,
          showTotal: (total) => `共 ${total} 个文件`
        }}
      />

      <Modal
        title="创建上传任务"
        open={modalVisible}
        onOk={handleSubmit}
        onCancel={handleCancel}
        okText="创建任务"
        cancelText="取消"
        confirmLoading={creating}
        width={600}
      >
        <Form
          form={form}
          layout="vertical"
          style={{ marginTop: 20 }}
        >
          <Form.Item label="视频文件">
            <Input value={selectedVideo?.name} disabled />
          </Form.Item>

          <Form.Item
            label="视频标题"
            name="title"
            rules={[{ required: true, message: '请输入视频标题' }]}
          >
            <Input placeholder="请输入视频标题" maxLength={100} showCount />
          </Form.Item>

          <Form.Item
            label="视频描述"
            name="description"
          >
            <TextArea
              placeholder="请输入视频描述（可选）"
              rows={4}
              maxLength={5000}
              showCount
            />
          </Form.Item>

          <Form.Item
            label="比特浏览器配置"
            name="browserProfileId"
            rules={[{ required: true, message: '请选择浏览器配置' }]}
          >
            <Select placeholder="请选择已登录 YouTube 的浏览器配置">
              {browserProfiles.map((profile) => (
                <Select.Option key={profile.id} value={profile.id}>
                  {profile.name} {profile.remark ? `(${profile.remark})` : ''}
                </Select.Option>
              ))}
            </Select>
          </Form.Item>

          <Form.Item
            label="隐私设置"
            name="privacy"
            rules={[{ required: true, message: '请选择隐私设置' }]}
          >
            <Radio.Group>
              <Radio value="public">公开</Radio>
              <Radio value="unlisted">不公开（仅限知道链接的人）</Radio>
              <Radio value="private">私密</Radio>
            </Radio.Group>
          </Form.Item>

          <Form.Item
            label="是否为儿童内容"
            name="madeForKids"
            rules={[{ required: true, message: '请选择是否为儿童内容' }]}
          >
            <Radio.Group>
              <Radio value={false}>否，不是为儿童制作的内容</Radio>
              <Radio value={true}>是，专为儿童制作的内容</Radio>
            </Radio.Group>
          </Form.Item>

          <Form.Item
            label="标签"
            name="tags"
          >
            <Input placeholder="用逗号分隔多个标签（可选）" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default HomePage
