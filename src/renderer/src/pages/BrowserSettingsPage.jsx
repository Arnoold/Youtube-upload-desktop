import React, { useState, useEffect } from 'react'
import { Typography, Button, message, Form, Input, Space, Tag, Card, Alert } from 'antd'
import { SettingOutlined, CheckCircleOutlined, CloseCircleOutlined, EyeOutlined, EyeInvisibleOutlined } from '@ant-design/icons'

const { Title, Text } = Typography

const BrowserSettingsPage = () => {
  // HubStudio 配置
  const [hubstudioForm] = Form.useForm()
  const [hubstudioConnected, setHubstudioConnected] = useState(false)
  const [testingHubstudio, setTestingHubstudio] = useState(false)
  const [savingHubstudio, setSavingHubstudio] = useState(false)
  const [hasStoredSecret, setHasStoredSecret] = useState(false)
  const [showStoredSecret, setShowStoredSecret] = useState(false)

  // 加载 HubStudio 配置
  const loadHubstudioConfig = async () => {
    try {
      const credentials = await window.electron.hubstudio.getCredentials()
      if (credentials.appId) {
        // 检查是否有已保存的密钥（返回的是 '******'）
        const hasSecret = credentials.appSecret && credentials.appSecret.length > 0
        setHasStoredSecret(hasSecret)

        hubstudioForm.setFieldsValue({
          appId: credentials.appId,
          appSecret: '', // 不显示实际密钥，留空让用户选择是否修改
          groupCode: credentials.groupCode || ''
        })
        // 测试连接状态
        const result = await window.electron.hubstudio.test()
        setHubstudioConnected(result.success)
      }
    } catch (error) {
      console.error('加载 HubStudio 配置失败:', error)
    }
  }

  useEffect(() => {
    loadHubstudioConfig()
  }, [])

  // 保存 HubStudio 配置
  const handleSaveHubstudioConfig = async () => {
    try {
      const values = await hubstudioForm.validateFields()
      setSavingHubstudio(true)

      // 如果已有保存的密钥且用户没有输入新密钥，则传空字符串（后端不会修改）
      const secretToSave = values.appSecret || ''

      const result = await window.electron.hubstudio.setCredentials(
        values.appId,
        secretToSave,
        values.groupCode || ''
      )

      if (result.success) {
        message.success('HubStudio 配置已保存')
        // 如果输入了新密钥，更新状态
        if (secretToSave) {
          setHasStoredSecret(true)
        }
        // 清空密钥输入框
        hubstudioForm.setFieldsValue({ appSecret: '' })
        // 测试连接
        const testResult = await window.electron.hubstudio.test()
        setHubstudioConnected(testResult.success)
        if (!testResult.success) {
          message.warning('配置已保存，但连接测试失败: ' + testResult.message)
        }
      } else {
        message.error('保存失败: ' + result.error)
      }
    } catch (error) {
      if (!error.errorFields) {
        message.error('保存失败: ' + error.message)
      }
    } finally {
      setSavingHubstudio(false)
    }
  }

  // 测试 HubStudio 连接
  const handleTestHubstudio = async () => {
    setTestingHubstudio(true)
    try {
      const result = await window.electron.hubstudio.test()
      if (result.success) {
        message.success('HubStudio 连接成功')
        setHubstudioConnected(true)
      } else {
        message.error('连接失败: ' + result.message)
        setHubstudioConnected(false)
      }
    } catch (error) {
      message.error('测试失败: ' + error.message)
      setHubstudioConnected(false)
    } finally {
      setTestingHubstudio(false)
    }
  }

  return (
    <div>
      <Title level={4}>浏览器设置</Title>

      {/* HubStudio 配置 */}
      <Card
        title={
          <Space>
            <SettingOutlined />
            <span>HubStudio 配置</span>
            {hubstudioConnected ? (
              <Tag color="success" icon={<CheckCircleOutlined />}>已连接</Tag>
            ) : (
              <Tag color="default" icon={<CloseCircleOutlined />}>未连接</Tag>
            )}
          </Space>
        }
        style={{ marginBottom: 16 }}
      >
        <Alert
          message="获取凭证方法"
          description="打开 HubStudio 客户端 → 点击「API」→「用户凭证」获取 App ID 和 App Secret。团队代码在「用户中心」→「团队信息」中获取。"
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />

        <Form form={hubstudioForm} layout="vertical" style={{ maxWidth: 500 }}>
          <Form.Item
            label="App ID"
            name="appId"
            rules={[{ required: true, message: '请输入 App ID' }]}
          >
            <Input placeholder="从 HubStudio 客户端获取" />
          </Form.Item>

          <Form.Item
            label="App Secret"
            name="appSecret"
            rules={[{ required: !hasStoredSecret, message: '请输入 App Secret' }]}
            extra={hasStoredSecret ? "已保存密钥，留空表示不修改" : ""}
          >
            {hasStoredSecret ? (
              <Input
                placeholder="留空表示不修改"
                type={showStoredSecret ? 'text' : 'password'}
                suffix={
                  <span
                    style={{ cursor: 'pointer', color: '#999' }}
                    onClick={() => setShowStoredSecret(!showStoredSecret)}
                  >
                    {showStoredSecret ? <EyeOutlined /> : <EyeInvisibleOutlined />}
                  </span>
                }
                addonBefore={
                  <span style={{ color: '#52c41a', fontSize: 12 }}>
                    {showStoredSecret ? '******' : '••••••'}（已保存）
                  </span>
                }
              />
            ) : (
              <Input.Password placeholder="从 HubStudio 客户端获取" />
            )}
          </Form.Item>

          <Form.Item
            label="团队代码 (Group Code)"
            name="groupCode"
            tooltip="可选，用于指定操作的团队"
          >
            <Input placeholder="从用户中心 → 团队信息获取（可选）" />
          </Form.Item>

          <Form.Item>
            <Space>
              <Button
                type="primary"
                onClick={handleSaveHubstudioConfig}
                loading={savingHubstudio}
              >
                保存配置
              </Button>
              <Button
                onClick={handleTestHubstudio}
                loading={testingHubstudio}
              >
                测试连接
              </Button>
            </Space>
          </Form.Item>
        </Form>
      </Card>

      {/* 以后可以在这里添加其他浏览器的配置，如比特浏览器 */}
    </div>
  )
}

export default BrowserSettingsPage
