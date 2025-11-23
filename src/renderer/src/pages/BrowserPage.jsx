import React, { useState, useEffect } from 'react'
import { Typography, Button, message, Table } from 'antd'
import { SyncOutlined } from '@ant-design/icons'

const { Title } = Typography

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

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 100
    },
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name'
    },
    {
      title: '备注',
      dataIndex: 'remark',
      key: 'remark'
    },
    {
      title: '代理类型',
      dataIndex: 'proxyType',
      key: 'proxyType'
    }
  ]

  return (
    <div>
      <Title level={2}>比特浏览器配置</Title>

      <div style={{ marginBottom: 24 }}>
        <Button
          icon={<SyncOutlined />}
          onClick={testConnection}
          loading={testing}
          type={connectionStatus?.success ? 'primary' : 'default'}
        >
          测试连接
        </Button>
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
          <Title level={4}>浏览器配置列表</Title>
          <Table
            columns={columns}
            dataSource={profiles}
            rowKey="id"
            loading={loading}
            pagination={{ pageSize: 10 }}
          />
        </>
      )}
    </div>
  )
}

export default BrowserPage
