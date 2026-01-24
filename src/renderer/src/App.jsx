import React, { useState } from 'react'
import { ConfigProvider, Layout, Menu, theme } from 'antd'
import {
  HomeOutlined,
  ChromeOutlined,
  SettingOutlined,
  DatabaseOutlined,
  FileTextOutlined,
  VideoCameraOutlined,
  ClockCircleOutlined,
  UserOutlined,
  GlobalOutlined,
  HistoryOutlined,
  YoutubeOutlined
} from '@ant-design/icons'
import HomePage from './pages/HomePage'
import BrowserPage from './pages/BrowserPage'
import SettingsPage from './pages/SettingsPage'
import AIStudioAccountsPage from './pages/AIStudioAccountsPage'
import SupabaseSettingsPage from './pages/SupabaseSettingsPage'
import CommentaryTaskPage from './pages/CommentaryTaskPage'
import DouyinPage from './pages/DouyinPage'
import YouTubeCollectPage from './pages/YouTubeCollectPage'
import SchedulerPage from './pages/SchedulerPage'
import OwnChannelSchedulerPage from './pages/OwnChannelSchedulerPage'
import CollectAccountPage from './pages/CollectAccountPage'
import BrowserSettingsPage from './pages/BrowserSettingsPage'
import UploadLogsPage from './pages/UploadLogsPage'
import OwnChannelCommentaryPage from './pages/OwnChannelCommentaryPage'

const { Content, Sider } = Layout

const App = () => {
  const [currentPage, setCurrentPage] = useState('youtube-collect')

  const menuItems = [
    {
      type: 'group',
      label: 'Youtube刷对标',
      children: [
        {
          key: 'youtube-collect',
          icon: <YoutubeOutlined />,
          label: 'YouTube视频采集'
        },
        {
          key: 'youtube-collect-accounts',
          icon: <UserOutlined />,
          label: '采集账号管理'
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
          label: '对标解说词任务'
        },
        {
          key: 'scheduler',
          icon: <ClockCircleOutlined />,
          label: '对标定时任务'
        },
        {
          key: 'own-channel-commentary-tasks',
          icon: <FileTextOutlined />,
          label: '自有频道解说词'
        },
        {
          key: 'own-channel-scheduler',
          icon: <ClockCircleOutlined />,
          label: '自有频道定时'
        },
        {
          key: 'aistudio-accounts',
          icon: <ChromeOutlined />,
          label: 'AIstudio账号'
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
        },
        {
          key: 'collect-accounts',
          icon: <UserOutlined />,
          label: '采集账号管理'
        }
      ]
    },
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
        },
        {
          key: 'upload-logs',
          icon: <HistoryOutlined />,
          label: '上传日志'
        }
      ]
    },
    {
      type: 'group',
      label: '系统设置',
      children: [
        {
          key: 'browser-settings',
          icon: <GlobalOutlined />,
          label: '浏览器设置'
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
      case 'upload-logs':
        return <UploadLogsPage />
      case 'collect-accounts':
        return <CollectAccountPage platform="douyin" />
      case 'douyin':
        return <DouyinPage />
      case 'youtube-collect':
        return <YouTubeCollectPage />
      case 'youtube-collect-accounts':
        return <CollectAccountPage platform="youtube" />
      case 'commentary-tasks':
        return <CommentaryTaskPage />
      case 'own-channel-commentary-tasks':
        return <OwnChannelCommentaryPage />
      case 'scheduler':
        return <SchedulerPage />
      case 'own-channel-scheduler':
        return <OwnChannelSchedulerPage />
      case 'aistudio-accounts':
        return <AIStudioAccountsPage />
      case 'browser':
        return <BrowserPage />
      case 'browser-settings':
        return <BrowserSettingsPage />
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
        <Layout
          style={{
            padding: '12px',
            background: '#f0f2f5',
            overflow: currentPage === 'upload-logs' ? 'hidden' : 'auto',
            display: currentPage === 'upload-logs' ? 'flex' : 'block',
            flexDirection: 'column'
          }}
        >
          <Content
            style={{
              padding: 16,
              margin: 0,
              background: '#fff',
              borderRadius: 8,
              flex: currentPage === 'upload-logs' ? 1 : 'none',
              minHeight: currentPage === 'upload-logs' ? 0 : 'fit-content',
              overflow: currentPage === 'upload-logs' ? 'hidden' : 'visible',
              display: currentPage === 'upload-logs' ? 'flex' : 'block',
              flexDirection: 'column'
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
