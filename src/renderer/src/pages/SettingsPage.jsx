import React from 'react'
import { Typography, Card, Space } from 'antd'

const { Title, Paragraph, Text } = Typography

const SettingsPage = () => {
  return (
    <div>
      <Title level={2}>设置</Title>

      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Card title="关于">
          <Paragraph>
            <Text strong>YouTube 视频自动上传工具</Text>
          </Paragraph>
          <Paragraph>
            版本: 1.0.0
          </Paragraph>
          <Paragraph>
            这是一个基于 Electron + Playwright + 比特浏览器的 YouTube 视频自动上传桌面应用。
          </Paragraph>
        </Card>

        <Card title="使用说明">
          <Paragraph>
            <ol>
              <li>确保比特浏览器已启动（默认地址：http://127.0.0.1:54345）</li>
              <li>在比特浏览器中创建配置并登录 YouTube 账号</li>
              <li>在"视频文件"页面扫描本地视频文件夹</li>
              <li>选择视频文件创建上传任务</li>
              <li>在"上传任务"页面查看上传进度</li>
            </ol>
          </Paragraph>
        </Card>

        <Card title="技术栈">
          <ul>
            <li>Electron - 桌面应用框架</li>
            <li>React + Ant Design - 前端界面</li>
            <li>Playwright - 浏览器自动化</li>
            <li>比特浏览器 - 多账号管理</li>
            <li>SQLite - 本地数据库</li>
          </ul>
        </Card>
      </Space>
    </div>
  )
}

export default SettingsPage
