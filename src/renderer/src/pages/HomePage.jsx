import React, { useState } from 'react'
import { Button, Table, Space, message, Input, Typography } from 'antd'
import { FolderOpenOutlined, UploadOutlined, ReloadOutlined } from '@ant-design/icons'

const { Title } = Typography

const HomePage = () => {
  const [videos, setVideos] = useState([])
  const [folderPath, setFolderPath] = useState('')
  const [loading, setLoading] = useState(false)

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

  const columns = [
    {
      title: '文件名',
      dataIndex: 'name',
      key: 'name',
      width: 300,
      ellipsis: true
    },
    {
      title: '大小',
      dataIndex: 'sizeFormatted',
      key: 'size',
      width: 120
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
      width: 180,
      render: (time) => new Date(time).toLocaleString('zh-CN')
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
    </div>
  )
}

export default HomePage
