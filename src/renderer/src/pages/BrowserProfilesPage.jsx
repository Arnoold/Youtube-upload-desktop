import React, { useState, useEffect, useCallback } from 'react'
import { Typography, Button, message, Table, Space, Tag, Tooltip } from 'antd'
import { SyncOutlined, ReloadOutlined, ThunderboltOutlined } from '@ant-design/icons'

const { Title, Text } = Typography

const BrowserProfilesPage = () => {
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(false)
  const [syncing, setSyncing] = useState(null) // 'hubstudio' | 'bitbrowser' | null
  const [fetchingId, setFetchingId] = useState(null) // 正在采集用量的 profile id
  const [pagination, setPagination] = useState({ current: 1, pageSize: 50, total: 0 })

  const loadProfiles = useCallback(async (page = 1, pageSize = 50) => {
    setLoading(true)
    try {
      const result = await window.electron.browserProfiles.list({ page, pageSize })
      if (result.error) {
        message.error(result.error)
        return
      }
      setProfiles(result.data || [])
      setPagination(prev => ({
        ...prev,
        current: page,
        pageSize,
        total: result.hasMore ? page * pageSize + 1 : (page - 1) * pageSize + (result.data || []).length
      }))
    } catch (err) {
      message.error('加载失败: ' + err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadProfiles()
  }, [loadProfiles])

  const handleSyncHubStudio = async () => {
    setSyncing('hubstudio')
    try {
      const result = await window.electron.browserProfiles.syncHubStudio()
      if (result.success) {
        message.success(result.message || `HubStudio 同步完成：${result.synced} 条`)
        loadProfiles(1, pagination.pageSize)
      } else {
        message.error(result.error || 'HubStudio 同步失败')
      }
    } catch (err) {
      message.error('HubStudio 同步失败: ' + err.message)
    } finally {
      setSyncing(null)
    }
  }

  const handleSyncBitBrowser = async () => {
    setSyncing('bitbrowser')
    try {
      const result = await window.electron.browserProfiles.syncBitBrowser()
      if (result.success) {
        message.success(result.message || `比特浏览器同步完成：${result.synced} 条`)
        loadProfiles(1, pagination.pageSize)
      } else {
        message.error(result.error || '比特浏览器同步失败')
      }
    } catch (err) {
      message.error('比特浏览器同步失败: ' + err.message)
    } finally {
      setSyncing(null)
    }
  }

  const handleAccountStatusChange = async (id, newStatus) => {
    try {
      await window.electron.browserProfiles.updateAccountStatus(id, newStatus)
      setProfiles(prev => prev.map(p => p.id === id ? { ...p, account_status: newStatus } : p))
      message.success('状态已更新')
    } catch (err) {
      message.error('更新失败: ' + err.message)
    }
  }

  const handleFetchUsage = async (profileId, name) => {
    setFetchingId(profileId)
    try {
      message.loading({ content: `${name} 采集中...`, key: 'fetch-usage', duration: 0 })
      const result = await window.electron.claudeUsage.fetchOne(profileId)
      if (result.success) {
        message.success({ content: `${name} 采集完成`, key: 'fetch-usage' })
      } else {
        message.error({ content: `${name} 采集失败: ${result.error}`, key: 'fetch-usage' })
      }
    } catch (err) {
      message.error({ content: `${name} 采集异常: ${err.message}`, key: 'fetch-usage' })
    } finally {
      setFetchingId(null)
      // 采集会顺带更新 Google 状态，刷新当前页显示
      loadProfiles(pagination.current, pagination.pageSize)
    }
  }

  const GOOGLE_STATUS_MAP = {
    normal: { label: '正常', color: 'success' },
    logged_out: { label: '掉登录', color: 'warning' },
    need_verify: { label: '需验证', color: 'gold' },
    disabled: { label: '被封', color: 'error' },
    unknown: { label: '未知', color: 'default' }
  }

  const ACCOUNT_STATUS_OPTIONS = [
    { value: 'active', label: '使用中', color: 'success' },
    { value: 'banned', label: '封禁', color: 'error' },
    { value: 'idle', label: '闲置', color: 'default' }
  ]

  const formatTime = (timeStr) => {
    if (!timeStr) return '-'
    try {
      const d = new Date(timeStr)
      return d.toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
    } catch {
      return timeStr
    }
  }

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      width: 60,
      fixed: 'left'
    },
    {
      title: '来源',
      dataIndex: 'source',
      width: 100,
      render: (source) => {
        const color = source === 'hubstudio' ? 'green' : 'blue'
        const label = source === 'hubstudio' ? 'HubStudio' : 'BitBrowser'
        return <Tag color={color}>{label}</Tag>
      }
    },
    {
      title: '账号状态',
      dataIndex: 'account_status',
      width: 80,
      render: (v) => {
        const current = v || 'idle'
        const opt = ACCOUNT_STATUS_OPTIONS.find(o => o.value === current)
        return <Tag color={opt?.color || 'default'}>{opt?.label || current}</Tag>
      }
    },
    {
      title: 'Google状态',
      dataIndex: 'google_status',
      width: 95,
      render: (v, record) => {
        if (!v) return '-'
        const opt = GOOGLE_STATUS_MAP[v] || { label: v, color: 'default' }
        return (
          <Tooltip title={
            <div>
              <div>邮箱：{record.google_email || '-'}</div>
              <div>检测时间：{formatTime(record.google_checked_at)}</div>
              {v !== 'normal' && record.google_detail && (
                <div style={{ wordBreak: 'break-all' }}>详情：{record.google_detail}</div>
              )}
            </div>
          }>
            <Tag color={opt.color}>{opt.label}</Tag>
          </Tooltip>
        )
      }
    },
    {
      title: '序号',
      dataIndex: 'seq',
      width: 60,
      render: (v) => v || '-'
    },
    {
      title: '名称',
      dataIndex: 'profile_name',
      width: 150,
      ellipsis: true,
      render: (v) => v || '-'
    },
    {
      title: '备注',
      dataIndex: 'remark',
      width: 120,
      ellipsis: true,
      render: (v) => v || '-'
    },
    {
      title: '分组',
      dataIndex: 'group_name',
      width: 100,
      ellipsis: true,
      render: (v) => v || '-'
    },
    {
      title: '代理',
      key: 'proxy',
      width: 160,
      ellipsis: true,
      render: (_, record) => {
        if (!record.proxy_host) return <Text type="secondary">无代理</Text>
        const addr = `${record.proxy_host}:${record.proxy_port || ''}`
        const type = record.proxy_type ? `[${record.proxy_type}] ` : ''
        return (
          <Tooltip title={`${type}${addr}`}>
            <Text style={{ fontSize: 12 }}>{type}{addr}</Text>
          </Tooltip>
        )
      }
    },
    {
      title: '模式',
      dataIndex: 'proxy_mode',
      width: 70,
      render: (v) => {
        if (!v) return '-'
        return <Tag color={v === 'static' ? 'default' : 'orange'}>{v}</Tag>
      }
    },
    {
      title: '最后IP',
      dataIndex: 'last_ip',
      width: 120,
      ellipsis: true,
      render: (v) => v || '-'
    },
    {
      title: '国家',
      dataIndex: 'last_country',
      width: 80,
      ellipsis: true,
      render: (v) => v || '-'
    },
    {
      title: '平台',
      dataIndex: 'platform_url',
      width: 120,
      ellipsis: true,
      render: (v) => v || '-'
    },
    {
      title: '用户名',
      dataIndex: 'platform_username',
      width: 100,
      ellipsis: true,
      render: (v) => v || '-'
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 80,
      render: (v) => {
        const colorMap = { opened: 'success', closed: 'default', opening: 'processing', closing: 'warning' }
        return <Tag color={colorMap[v] || 'default'}>{v || 'closed'}</Tag>
      }
    },
    {
      title: '同步时间',
      dataIndex: 'synced_at',
      width: 150,
      render: formatTime
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      fixed: 'right',
      render: (_, record) => (
        <Button
          type="link"
          size="small"
          icon={<ThunderboltOutlined />}
          loading={fetchingId === record.id}
          disabled={fetchingId !== null}
          onClick={() => handleFetchUsage(record.id, record.profile_name || record.profile_id)}
        >
          采集
        </Button>
      )
    }
  ]

  return (
    <div style={{ padding: '0 4px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>浏览器列表</Title>
        <Space>
          <Button
            icon={<ReloadOutlined />}
            onClick={() => loadProfiles(pagination.current, pagination.pageSize)}
            loading={loading}
          >
            刷新
          </Button>
          <Button
            type="primary"
            icon={<SyncOutlined />}
            onClick={handleSyncHubStudio}
            loading={syncing === 'hubstudio'}
            disabled={syncing !== null}
          >
            获取HubStudio
          </Button>
          <Button
            type="primary"
            icon={<SyncOutlined />}
            onClick={handleSyncBitBrowser}
            loading={syncing === 'bitbrowser'}
            disabled={syncing !== null}
          >
            获取比特浏览器
          </Button>
        </Space>
      </div>

      <Table
        columns={columns}
        dataSource={profiles}
        rowKey="id"
        loading={loading}
        pagination={{
          current: pagination.current,
          pageSize: pagination.pageSize,
          total: pagination.total,
          showSizeChanger: true,
          pageSizeOptions: ['20', '50', '100'],
          showTotal: (total) => `共 ${total} 条`,
          onChange: (page, pageSize) => loadProfiles(page, pageSize)
        }}
        scroll={{ x: 1700 }}
        size="small"
        locale={{ emptyText: '暂无数据，请点击上方按钮获取浏览器配置' }}
      />
    </div>
  )
}

export default BrowserProfilesPage
