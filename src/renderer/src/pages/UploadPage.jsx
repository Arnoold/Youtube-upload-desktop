import React, { useState, useEffect } from 'react'
import { Table, Tag, Button, Typography } from 'antd'

const { Title } = Typography

const UploadPage = () => {
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(false)

  const loadTasks = async () => {
    setLoading(true)
    try {
      const result = await window.electron.upload.list()
      setTasks(result || [])
    } catch (error) {
      console.error('Failed to load tasks:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTasks()

    // 监听任务更新
    window.electron.upload.onStatus(() => {
      loadTasks()
    })

    return () => {
      window.electron.upload.removeListener('upload:status')
    }
  }, [])

  const getStatusTag = (status) => {
    const statusMap = {
      pending: { color: 'default', text: '等待中' },
      uploading: { color: 'processing', text: '上传中' },
      completed: { color: 'success', text: '已完成' },
      failed: { color: 'error', text: '失败' },
      cancelled: { color: 'default', text: '已取消' }
    }
    const config = statusMap[status] || statusMap.pending
    return <Tag color={config.color}>{config.text}</Tag>
  }

  const columns = [
    {
      title: '视频名称',
      dataIndex: 'video_name',
      key: 'video_name',
      ellipsis: true
    },
    {
      title: '标题',
      dataIndex: 'title',
      key: 'title',
      ellipsis: true
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status) => getStatusTag(status)
    },
    {
      title: '进度',
      dataIndex: 'progress',
      key: 'progress',
      render: (progress) => `${progress}%`
    },
    {
      title: '创建时间',
      dataIndex: 'created_at',
      key: 'created_at',
      render: (time) => new Date(time).toLocaleString('zh-CN')
    }
  ]

  return (
    <div>
      <Title level={2}>上传任务</Title>
      <Button
        type="primary"
        onClick={loadTasks}
        loading={loading}
        style={{ marginBottom: 16 }}
      >
        刷新
      </Button>
      <Table
        columns={columns}
        dataSource={tasks}
        rowKey="id"
        loading={loading}
        pagination={{ pageSize: 10 }}
      />
    </div>
  )
}

export default UploadPage
