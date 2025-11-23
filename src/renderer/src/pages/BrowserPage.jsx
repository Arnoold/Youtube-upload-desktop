import React, { useState, useEffect } from 'react'
import { Typography, Button, message, Table, Space } from 'antd'
import { SyncOutlined, MenuOutlined } from '@ant-design/icons'
import { arrayMoveImmutable } from 'array-move'
import {
  SortableContainer,
  SortableElement,
  SortableHandle
} from 'react-sortable-hoc'

const { Title } = Typography

// 拖拽手柄
const DragHandle = SortableHandle(() => (
  <MenuOutlined style={{ cursor: 'grab', color: '#999' }} />
))

// 可排序的行
const SortableItem = SortableElement((props) => <tr {...props} />)
const SortableBody = SortableContainer((props) => <tbody {...props} />)

const BrowserPage = () => {
  const [connectionStatus, setConnectionStatus] = useState(null)
  const [profiles, setProfiles] = useState([])
  const [testing, setTesting] = useState(false)
  const [loading, setLoading] = useState(false)

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
      const result = await window.electron.db.getBrowserProfiles()
      setProfiles(result || [])
    } catch (error) {
      console.error('Failed to load profiles:', error)
      message.error('加载配置失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    testConnection()
  }, [])

  // 拖拽排序处理
  const onSortEnd = async ({ oldIndex, newIndex }) => {
    if (oldIndex !== newIndex) {
      const newProfiles = arrayMoveImmutable(profiles, oldIndex, newIndex)
      setProfiles(newProfiles)

      // 更新排序到数据库
      try {
        const updates = newProfiles.map((profile, index) => ({
          id: profile.id,
          sortOrder: index
        }))
        await window.electron.db.updateProfilesOrder(updates)
        message.success('排序已保存')
      } catch (error) {
        message.error('保存排序失败')
        console.error(error)
        // 恢复原来的顺序
        loadProfiles()
      }
    }
  }

  const DraggableContainer = (props) => (
    <SortableBody
      useDragHandle
      disableAutoscroll
      helperClass="row-dragging"
      onSortEnd={onSortEnd}
      {...props}
    />
  )

  const DraggableBodyRow = ({ className, style, ...restProps }) => {
    const index = profiles.findIndex((x) => x.id === restProps['data-row-key'])
    return <SortableItem index={index} {...restProps} />
  }

  const columns = [
    {
      title: '排序',
      dataIndex: 'sort',
      width: 60,
      className: 'drag-visible',
      render: () => <DragHandle />
    },
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 80
    },
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name'
    },
    {
      title: '比特浏览器ID',
      dataIndex: 'bit_browser_id',
      key: 'bit_browser_id',
      width: 150
    },
    {
      title: '频道ID',
      dataIndex: 'channel_id',
      key: 'channel_id',
      width: 200,
      ellipsis: true
    },
    {
      title: '频道名称',
      dataIndex: 'channel_name',
      key: 'channel_name',
      width: 150
    },
    {
      title: 'YouTube邮箱',
      dataIndex: 'youtube_email',
      key: 'youtube_email',
      width: 200,
      ellipsis: true
    }
  ]

  return (
    <div>
      <Title level={2}>账号管理</Title>

      <div style={{ marginBottom: 24 }}>
        <Space>
          <Button
            icon={<SyncOutlined />}
            onClick={testConnection}
            loading={testing}
            type={connectionStatus?.success ? 'primary' : 'default'}
          >
            测试连接
          </Button>
          {connectionStatus?.success && (
            <Button onClick={loadProfiles} loading={loading}>
              刷新列表
            </Button>
          )}
        </Space>

        {connectionStatus && (
          <div style={{ marginTop: 12 }}>
            <Typography.Text
              type={connectionStatus.success ? 'success' : 'danger'}
            >
              {connectionStatus.success
                ? '✅ 比特浏览器连接正常'
                : `❌ ${connectionStatus.message || '连接失败'}`}
            </Typography.Text>
          </div>
        )}
      </div>

      {connectionStatus?.success && (
        <>
          <div style={{ marginBottom: 16 }}>
            <Typography.Text type="secondary">
              提示：拖动左侧图标可以调整账号顺序
            </Typography.Text>
          </div>

          <Table
            columns={columns}
            dataSource={profiles}
            rowKey="id"
            loading={loading}
            pagination={false}
            components={{
              body: {
                wrapper: DraggableContainer,
                row: DraggableBodyRow
              }
            }}
          />

          <style jsx>{`
            .row-dragging {
              background: #fafafa;
              border: 1px solid #ccc;
            }
            .row-dragging td {
              padding: 16px;
            }
            .row-dragging .drag-visible {
              visibility: visible;
            }
          `}</style>
        </>
      )}
    </div>
  )
}

export default BrowserPage
