import React, { useState } from 'react'
import { ConfigProvider, Layout, Menu, theme } from 'antd'
import {
  HomeOutlined,
  ChromeOutlined,
  SettingOutlined,
  DatabaseOutlined,
  FileTextOutlined,
  VideoCameraOutlined,
  ClockCircleOutlined
} from '@ant-design/icons'
import HomePage from './pages/HomePage'
import BrowserPage from './pages/BrowserPage'
import SettingsPage from './pages/SettingsPage'
import AIStudioAccountsPage from './pages/AIStudioAccountsPage'
import SupabaseSettingsPage from './pages/SupabaseSettingsPage'
import CommentaryTaskPage from './pages/CommentaryTaskPage'
import DouyinPage from './pages/DouyinPage'
import SchedulerPage from './pages/SchedulerPage'

const { Content, Sider } = Layout

const App = () => {
  const [currentPage, setCurrentPage] = useState('home')

  const menuItems = [
    {
      type: 'group',
      label: '自动发布',
      children: [
        {
          key: 'home',
          icon: <HomeOutlined />,
          label: '视频文件'
        },
        {
          key: 'browser',
          icon: <ChromeOutlined />,
          label: '发布账号管理'
        }
      ]
    },
    {
      type: 'group',
      label: '抖音采集',
      children: [
        {
          key: 'douyin',
          icon: <VideoCameraOutlined />,
          label: '视频采集'
        }
      ]
    },
    {
      type: 'group',
      label: '获取解说词',
      children: [
        {
          key: 'commentary-tasks',
          icon: <FileTextOutlined />,
          label: '解说词任务'
        },
        {
          key: 'scheduler',
          icon: <ClockCircleOutlined />,
          label: '定时任务'
        },
        {
          key: 'aistudio-accounts',
          icon: <ChromeOutlined />,
          label: 'AIstudio账号'
        },
        {
          key: 'supabase',
          icon: <DatabaseOutlined />,
          label: 'Supabase 设置'
        },
        {
          key: 'settings',
          icon: <SettingOutlined />,
          label: '单任务测试'
        }
      ]
    }
  ]

  const renderPage = () => {
    switch (currentPage) {
      case 'home':
        return <HomePage />
      case 'douyin':
        return <DouyinPage />
      case 'commentary-tasks':
        return <CommentaryTaskPage />
      case 'scheduler':
        return <SchedulerPage />
      case 'aistudio-accounts':
        return <AIStudioAccountsPage />
      case 'browser':
        return <BrowserPage />
      case 'supabase':
        return <SupabaseSettingsPage />
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
      <Layout style={{ height: '100vh', overflow: 'hidden', flexDirection: 'row' }}>
          <Sider width={200} style={{ background: '#fff', overflow: 'auto' }}>
            <Menu
              mode="inline"
              selectedKeys={[currentPage]}
              style={{ height: '100%', borderRight: 0 }}
              items={menuItems}
              onClick={({ key }) => setCurrentPage(key)}
            />
          </Sider>
          <Layout style={{ padding: '24px', overflow: 'auto', background: '#f0f2f5' }}>
            <Content
              style={{
                padding: 24,
                margin: 0,
                background: '#fff',
                borderRadius: 8,
                minHeight: 'fit-content'
              }}
            >
              {renderPage()}
            </Content>
          </Layout>
      </Layout>
    </ConfigProvider>
  )
}

export default App
