import React, { useState, useEffect } from 'react'
import {
  Typography,
  Button,
  message,
  Card,
  Form,
  Input,
  Space,
  Alert,
  Divider,
  Table,
  Tag
} from 'antd'
import {
  ApiOutlined,
  DisconnectOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  SaveOutlined
} from '@ant-design/icons'

const { Title, Text, Paragraph } = Typography
const { TextArea } = Input

const SupabaseSettingsPage = () => {
  const [form] = Form.useForm()
  const [promptForm] = Form.useForm()
  const [config, setConfig] = useState(null)
  const [testing, setTesting] = useState(false)
  const [saving, setSaving] = useState(false)
  const [columns, setColumns] = useState([])
  const [testData, setTestData] = useState([])

  // 加载配置
  const loadConfig = async () => {
    try {
      const supabaseConfig = await window.electron.supabase.getConfig()
      setConfig(supabaseConfig)

      // 加载保存的配置
      const savedUrl = await window.electron.db.getSetting('supabase_url')
      const savedApiKey = await window.electron.db.getSetting('supabase_api_key')
      const savedTable = await window.electron.db.getSetting('supabase_table')
      const savedPrompt = await window.electron.db.getSetting('aistudio_prompt')

      if (savedUrl) {
        form.setFieldsValue({
          url: savedUrl,
          apiKey: savedApiKey,
          tableName: savedTable || 'benchmark_videos'
        })
      }

      if (savedPrompt) {
        promptForm.setFieldsValue({ prompt: savedPrompt })
      } else {
        // 获取默认提示词
        const defaultPrompt = await window.electron.aiStudio.getPrompt()
        promptForm.setFieldsValue({ prompt: defaultPrompt })
      }
    } catch (error) {
      console.error('Failed to load config:', error)
    }
  }

  useEffect(() => {
    loadConfig()
  }, [])

  // 保存并连接
  const handleConnect = async () => {
    try {
      const values = await form.validateFields()
      setSaving(true)

      // 保存配置到本地数据库
      await window.electron.db.setSetting('supabase_url', values.url)
      await window.electron.db.setSetting('supabase_api_key', values.apiKey)
      await window.electron.db.setSetting('supabase_table', values.tableName)

      // 连接 Supabase
      const result = await window.electron.supabase.connect(
        values.url,
        values.apiKey,
        values.tableName
      )

      if (result.success) {
        message.success('连接成功！')
        loadConfig()
        handleTest()
      } else {
        message.error(`连接失败: ${result.error}`)
      }
    } catch (error) {
      if (!error.errorFields) {
        message.error(`保存失败: ${error.message}`)
      }
    } finally {
      setSaving(false)
    }
  }

  // 测试连接
  const handleTest = async () => {
    setTesting(true)
    try {
      const result = await window.electron.supabase.test()
      if (result.success) {
        message.success('连接测试成功！')

        // 获取表结构
        const cols = await window.electron.supabase.getColumns()
        setColumns(cols)

        // 获取示例数据 (尝试获取，如果超时不影响连接测试结果)
        try {
          const result = await window.electron.supabase.getVideos({
            limit: 5,
            sortBy: 'id',
            sortOrder: 'desc',
            select: 'id, video_id, channel_id, title' // 只获取最基础字段
          })
          console.log('Test connection getVideos result:', result)
          setTestData(result.data || [])
        } catch (fetchErr) {
          console.warn('Failed to fetch sample data:', fetchErr)
          message.warning('连接成功，但获取示例数据超时（可能是数据量过大）')
          setTestData([])
        }
      }
      else {
        message.error(`测试失败: ${result.error}`)
      }
    } catch (error) {
      message.error(`测试失败: ${error.message}`)
    } finally {
      setTesting(false)
    }
  }

  // 断开连接
  const handleDisconnect = async () => {
    try {
      await window.electron.supabase.disconnect()
      setConfig(null)
      setColumns([])
      setTestData([])
      message.info('已断开连接')
      loadConfig()
    } catch (error) {
      message.error(`断开失败: ${error.message}`)
    }
  }

  // 保存提示词
  const handleSavePrompt = async () => {
    try {
      const values = await promptForm.validateFields()

      // 保存到本地数据库
      await window.electron.db.setSetting('aistudio_prompt', values.prompt)

      // 设置到 AI Studio 服务
      await window.electron.aiStudio.setPrompt(values.prompt)

      message.success('提示词已保存')
    } catch (error) {
      if (!error.errorFields) {
        message.error(`保存失败: ${error.message}`)
      }
    }
  }

  // 生成表格列
  const tableColumns = columns.slice(0, 6).map(col => ({
    title: col,
    dataIndex: col,
    key: col,
    ellipsis: true,
    width: 150,
    render: (value) => {
      if (value === null || value === undefined) return '-'
      if (typeof value === 'object') return JSON.stringify(value)
      if (typeof value === 'string' && value.length > 50) {
        return value.substring(0, 50) + '...'
      }
      return String(value)
    }
  }))

  return (
    <div>
      <Title level={2}>Supabase 设置</Title>

      {/* 连接状态 */}
      <Card style={{ marginBottom: 24 }}>
        <Space>
          <Text strong>连接状态：</Text>
          {config?.isConnected ? (
            <Tag color="success" icon={<CheckCircleOutlined />}>已连接</Tag>
          ) : (
            <Tag color="default" icon={<CloseCircleOutlined />}>未连接</Tag>
          )}
          {config?.isConnected && (
            <>
              <Text type="secondary">表名: {config.tableName}</Text>
              <Button
                danger
                size="small"
                icon={<DisconnectOutlined />}
                onClick={handleDisconnect}
              >
                断开
              </Button>
            </>
          )}
        </Space>
      </Card>

      {/* 连接配置 */}
      <Card title="数据库连接配置" style={{ marginBottom: 24 }}>
        <Form
          form={form}
          layout="vertical"
          initialValues={{ tableName: 'benchmark_videos' }}
        >
          <Form.Item
            label="Supabase URL"
            name="url"
            rules={[{ required: true, message: '请输入 Supabase URL' }]}
            tooltip="在 Supabase 项目设置 > API 中找到"
          >
            <Input placeholder="https://xxx.supabase.co" />
          </Form.Item>

          <Form.Item
            label="API Key (anon/public)"
            name="apiKey"
            rules={[{ required: true, message: '请输入 API Key' }]}
            tooltip="使用 anon/public key，不要使用 service_role key"
          >
            <Input.Password placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." />
          </Form.Item>

          <Form.Item
            label="表名"
            name="tableName"
            rules={[{ required: true, message: '请输入表名' }]}
            tooltip="存储视频链接的表名"
          >
            <Input placeholder="benchmark_videos" />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button
                type="primary"
                icon={<ApiOutlined />}
                onClick={handleConnect}
                loading={saving}
              >
                保存并连接
              </Button>
              {config?.isConnected && (
                <Button
                  icon={<CheckCircleOutlined />}
                  onClick={handleTest}
                  loading={testing}
                >
                  测试连接
                </Button>
              )}
            </Space>
          </Form.Item>
        </Form>

        {/* 表结构和示例数据 */}
        {columns.length > 0 && (
          <>
            <Divider />
            <Title level={5}>表结构</Title>
            <Space wrap style={{ marginBottom: 16 }}>
              {columns.map(col => (
                <Tag key={col}>{col}</Tag>
              ))}
            </Space>

            {testData.length > 0 && (
              <>
                <Title level={5}>示例数据 (前5条)</Title>
                <Table
                  columns={tableColumns}
                  dataSource={testData}
                  rowKey="id"
                  size="small"
                  pagination={false}
                  scroll={{ x: 'max-content' }}
                />
              </>
            )}
          </>
        )}
      </Card>

      {/* 提示词设置 */}
      <Card title="AI Studio 提示词设置">
        <Alert
          type="info"
          showIcon
          message="提示词说明"
          description="这是发送给 AI Studio 的固定提示词。视频链接会自动追加在提示词后面。"
          style={{ marginBottom: 16 }}
        />

        <Form form={promptForm} layout="vertical">
          <Form.Item
            label="默认提示词"
            name="prompt"
            rules={[{ required: true, message: '请输入提示词' }]}
          >
            <TextArea
              rows={6}
              placeholder="请分析这个视频内容，提供详细的描述和关键信息。"
            />
          </Form.Item>

          <Form.Item>
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={handleSavePrompt}
            >
              保存提示词
            </Button>
          </Form.Item>
        </Form>
      </Card>

      {/* 使用说明 */}
      <Card title="使用说明" style={{ marginTop: 24 }}>
        <Paragraph>
          <Text strong>1. 创建 Supabase 表</Text>
          <br />
          在 Supabase 中创建一个表来存储视频链接，建议包含以下字段：
        </Paragraph>
        <pre style={{ background: '#f5f5f5', padding: 12, borderRadius: 4 }}>
          {`CREATE TABLE videos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  video_url TEXT NOT NULL,        -- 视频链接
  prompt TEXT,                     -- 可选的自定义提示词
  ai_response TEXT,               -- AI 回复内容
  status TEXT DEFAULT 'pending',  -- pending/processing/completed/failed
  error_message TEXT,             -- 错误信息
  processed_at TIMESTAMP,         -- 处理时间
  created_at TIMESTAMP DEFAULT NOW()
);`}
        </pre>

        <Paragraph style={{ marginTop: 16 }}>
          <Text strong>2. 配置 RLS (行级安全)</Text>
          <br />
          如果启用了 RLS，请添加允许读写的策略：
        </Paragraph>
        <pre style={{ background: '#f5f5f5', padding: 12, borderRadius: 4 }}>
          {`-- 允许匿名用户读取
CREATE POLICY "Allow read" ON videos FOR SELECT USING (true);

-- 允许匿名用户插入
CREATE POLICY "Allow insert" ON videos FOR INSERT WITH CHECK (true);

-- 允许匿名用户更新
CREATE POLICY "Allow update" ON videos FOR UPDATE USING (true);`}
        </pre>

        <Paragraph style={{ marginTop: 16 }}>
          <Text strong>3. 获取连接信息</Text>
          <br />
          在 Supabase Dashboard &gt; Settings &gt; API 中获取 Project URL 和 anon/public key。
        </Paragraph>
      </Card>
    </div>
  )
}

export default SupabaseSettingsPage
