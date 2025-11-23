import React, { useState } from 'react'
import { ConfigProvider, Layout, Menu, theme } from 'antd'
import {
  HomeOutlined,
  UploadOutlined,
  ChromeOutlined,
  SettingOutlined
} from '@ant-design/icons'
import HomePage from './pages/HomePage'
import UploadPage from './pages/UploadPage'
import BrowserPage from './pages/BrowserPage'
import SettingsPage from './pages/SettingsPage'

const { Header, Content, Sider } = Layout

const App = () => {
  const [currentPage, setCurrentPage] = useState('home')

  const menuItems = [
    {
      key: 'home',
      icon: <HomeOutlined />,
      label: '视频文件'
    },
    {
      key: 'upload',
      icon: <UploadOutlined />,
      label: '上传任务'
    },
    {
      key: 'browser',
      icon: <ChromeOutlined />,
      label: '账号管理'
    },
    {
      key: 'settings',
      icon: <SettingOutlined />,
      label: '设置'
    }
  ]

  const renderPage = () => {
    switch (currentPage) {
      case 'home':
        return <HomePage />
      case 'upload':
        return <UploadPage />
      case 'browser':
        return <BrowserPage />
      case 'settings':
        return <SettingsPage />
      default:
        return <HomePage />
    }
  }

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.defaultAlgorithm
      }}
    >
      <Layout style={{ height: '100vh', overflow: 'hidden' }}>
        <Header style={{ display: 'flex', alignItems: 'center', background: '#001529', flexShrink: 0 }}>
          <div style={{ color: 'white', fontSize: '18px', fontWeight: 'bold' }}>
            YouTube 视频自动上传工具
          </div>
        </Header>
        <Layout style={{ flex: 1, overflow: 'hidden' }}>
          <Sider width={200} style={{ background: '#fff', overflow: 'auto' }}>
            <Menu
              mode="inline"
              selectedKeys={[currentPage]}
              style={{ height: '100%', borderRight: 0 }}
              items={menuItems}
              onClick={({ key }) => setCurrentPage(key)}
            />
          </Sider>
          <Layout style={{ padding: '24px', overflow: 'auto' }}>
            <Content
              style={{
                padding: 24,
                margin: 0,
                background: '#fff',
                borderRadius: 8
              }}
            >
              {renderPage()}
            </Content>
          </Layout>
        </Layout>
      </Layout>
    </ConfigProvider>
  )
}

export default App
