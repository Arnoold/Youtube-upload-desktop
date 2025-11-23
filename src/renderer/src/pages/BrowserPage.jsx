import React, { useState, useEffect } from 'react'
import { Typography, Button, message, Table, Modal, Form, Input, Select, Space } from 'antd'
import { SyncOutlined, PlusOutlined, EditOutlined, DeleteOutlined, FolderOutlined } from '@ant-design/icons'

const { Title } = Typography
const { TextArea } = Input

// YouTube Studio 完整时区列表
const TIMEZONES = [
  { value: 'Pacific/Honolulu', label: '(GMT-10:00) 檀香山' },
  { value: 'America/Anchorage', label: '(GMT-09:00) 安克雷奇' },
  { value: 'America/Juneau', label: '(GMT-09:00) 朱诺' },
  { value: 'America/Los_Angeles', label: '(GMT-08:00) 洛杉矶' },
  { value: 'America/Vancouver', label: '(GMT-08:00) 温哥华' },
  { value: 'America/Tijuana', label: '(GMT-08:00) 蒂华纳' },
  { value: 'America/Denver', label: '(GMT-07:00) 丹佛' },
  { value: 'America/Phoenix', label: '(GMT-07:00) 凤凰城' },
  { value: 'America/Edmonton', label: '(GMT-07:00) 埃德蒙顿' },
  { value: 'America/Hermosillo', label: '(GMT-07:00) 埃莫西约' },
  { value: 'America/Mexico_City', label: '(GMT-06:00) 墨西哥城' },
  { value: 'America/Winnipeg', label: '(GMT-06:00) 温尼伯' },
  { value: 'America/Chicago', label: '(GMT-06:00) 芝加哥' },
  { value: 'Pacific/Easter', label: '(GMT-05:00) 复活节岛' },
  { value: 'America/Toronto', label: '(GMT-05:00) 多伦多' },
  { value: 'America/Detroit', label: '(GMT-05:00) 底特律' },
  { value: 'America/Bogota', label: '(GMT-05:00) 波哥大' },
  { value: 'America/New_York', label: '(GMT-05:00) 纽约' },
  { value: 'America/Rio_Branco', label: '(GMT-05:00) 里奥布郎库' },
  { value: 'America/Halifax', label: '(GMT-04:00) 哈利法克斯' },
  { value: 'America/Manaus', label: '(GMT-04:00) 马瑙斯' },
  { value: 'America/St_Johns', label: '(GMT-03:30) 圣约翰斯' },
  { value: 'America/Sao_Paulo', label: '(GMT-03:00) 圣保罗' },
  { value: 'America/Santiago', label: '(GMT-03:00) 圣地亚哥' },
  { value: 'America/Bahia', label: '(GMT-03:00) 巴伊亚' },
  { value: 'America/Buenos_Aires', label: '(GMT-03:00) 布宜诺斯艾利斯' },
  { value: 'America/Recife', label: '(GMT-03:00) 累西腓' },
  { value: 'America/Belem', label: '(GMT-03:00) 贝伦' },
  { value: 'America/Noronha', label: '(GMT-02:00) 洛罗尼亚' },
  { value: 'Europe/London', label: '(GMT+00:00) 伦敦' },
  { value: 'Atlantic/Canary', label: '(GMT+00:00) 加那利' },
  { value: 'Europe/Dublin', label: '(GMT+00:00) 都柏林' },
  { value: 'Europe/Warsaw', label: '(GMT+01:00) 华沙' },
  { value: 'Africa/Casablanca', label: '(GMT+01:00) 卡萨布兰卡' },
  { value: 'Europe/Paris', label: '(GMT+01:00) 巴黎' },
  { value: 'Europe/Prague', label: '(GMT+01:00) 布拉格' },
  { value: 'Europe/Budapest', label: '(GMT+01:00) 布达佩斯' },
  { value: 'Europe/Brussels', label: '(GMT+01:00) 布鲁塞尔' },
  { value: 'Africa/Lagos', label: '(GMT+01:00) 拉各斯' },
  { value: 'Europe/Stockholm', label: '(GMT+01:00) 斯德哥尔摩' },
  { value: 'Europe/Berlin', label: '(GMT+01:00) 柏林' },
  { value: 'Africa/Tunis', label: '(GMT+01:00) 突尼斯' },
  { value: 'Europe/Rome', label: '(GMT+01:00) 罗马' },
  { value: 'Europe/Amsterdam', label: '(GMT+01:00) 阿姆斯特丹' },
  { value: 'Africa/Algiers', label: '(GMT+01:00) 阿尔及尔' },
  { value: 'Europe/Madrid', label: '(GMT+01:00) 马德里' },
  { value: 'Europe/Kaliningrad', label: '(GMT+02:00) 加里宁格勒' },
  { value: 'Africa/Cairo', label: '(GMT+02:00) 开罗' },
  { value: 'Africa/Johannesburg', label: '(GMT+02:00) 约翰内斯堡' },
  { value: 'Asia/Jerusalem', label: '(GMT+02:00) 耶路撒冷' },
  { value: 'Asia/Aden', label: '(GMT+03:00) 亚丁' },
  { value: 'Asia/Irkutsk', label: '(GMT+03:00) 伊尔库茨克' },
  { value: 'Africa/Nairobi', label: '(GMT+03:00) 内罗毕' },
  { value: 'Asia/Riyadh', label: '(GMT+03:00) 利雅得' },
  { value: 'Africa/Kampala', label: '(GMT+03:00) 坎帕拉' },
  { value: 'Asia/Amman', label: '(GMT+03:00) 安曼' },
  { value: 'Europe/Moscow', label: '(GMT+03:00) 莫斯科' },
  { value: 'Asia/Yekaterinburg', label: '(GMT+05:00) 叶卡捷琳堡' },
  { value: 'Asia/Kolkata', label: '(GMT+05:30) 加尔各答' },
  { value: 'Asia/Omsk', label: '(GMT+06:00) 鄂木斯克' },
  { value: 'Asia/Krasnoyarsk', label: '(GMT+07:00) 克拉斯诺亚尔斯克' },
  { value: 'Asia/Novosibirsk', label: '(GMT+07:00) 新西伯利亚' },
  { value: 'Asia/Irkutsk', label: '(GMT+08:00) 伊尔库次克' },
  { value: 'Asia/Taipei', label: '(GMT+08:00) 台北' },
  { value: 'Asia/Singapore', label: '(GMT+08:00) 新加坡' },
  { value: 'Australia/Perth', label: '(GMT+08:00) 珀斯' },
  { value: 'Asia/Hong_Kong', label: '(GMT+08:00) 香港' },
  { value: 'Asia/Manila', label: '(GMT+08:00) 马尼拉' },
  { value: 'Australia/Eucla', label: '(GMT+08:45) 尤克拉' },
  { value: 'Asia/Tokyo', label: '(GMT+09:00) 东京' },
  { value: 'Asia/Yakutsk', label: '(GMT+09:00) 雅库茨克' },
  { value: 'Asia/Seoul', label: '(GMT+09:00) 首尔' },
  { value: 'Australia/Darwin', label: '(GMT+09:30) 达尔文' },
  { value: 'Australia/Brisbane', label: '(GMT+10:00) 布里斯班' },
  { value: 'Asia/Vladivostok', label: '(GMT+10:00) 海参崴' },
  { value: 'Australia/Adelaide', label: '(GMT+10:30) 阿德莱德' },
  { value: 'Australia/Melbourne', label: '(GMT+11:00) 墨尔本' },
  { value: 'Australia/Sydney', label: '(GMT+11:00) 悉尼' },
  { value: 'Asia/Sakhalin', label: '(GMT+11:00) 萨哈林' },
  { value: 'Australia/Hobart', label: '(GMT+11:00) 霍巴特' },
  { value: 'Pacific/Efate', label: '(GMT+12:00) 埃察加' },
  { value: 'Pacific/Auckland', label: '(GMT+13:00) 奥克兰' },
  { value: 'Pacific/Chatham', label: '(GMT+13:45) 查塔姆' }
]

const BrowserPage = () => {
  const [connectionStatus, setConnectionStatus] = useState(null)
  const [profiles, setProfiles] = useState([])
  const [testing, setTesting] = useState(false)
  const [loading, setLoading] = useState(false)
  const [modalVisible, setModalVisible] = useState(false)
  const [editingProfile, setEditingProfile] = useState(null)
  const [form] = Form.useForm()

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

  const handleAddProfile = () => {
    setEditingProfile(null)
    form.resetFields()
    form.setFieldsValue({
      defaultTimezone: 'Asia/Shanghai'
    })
    setModalVisible(true)
  }

  const handleEditProfile = (profile) => {
    setEditingProfile(profile)
    // 解析 default_tags
    let defaultTags = ''
    if (profile.default_tags) {
      try {
        const tagsArray = JSON.parse(profile.default_tags)
        defaultTags = tagsArray.join(', ')
      } catch (e) {
        defaultTags = profile.default_tags
      }
    }

    form.setFieldsValue({
      name: profile.name,
      bitBrowserId: profile.id,
      folderPath: profile.folder_path,
      defaultTimezone: profile.default_timezone || 'Asia/Shanghai',
      defaultDescription: profile.default_description,
      defaultTags: defaultTags
    })
    setModalVisible(true)
  }

  const handleDeleteProfile = async (profileId) => {
    Modal.confirm({
      title: '确认删除',
      content: '确定要删除这个账号配置吗？',
      onOk: async () => {
        try {
          await window.electron.db.deleteBrowserProfile(profileId)
          message.success('删除成功')
          loadProfiles()
        } catch (error) {
          message.error(`删除失败: ${error.message}`)
        }
      }
    })
  }

  const handleSelectFolder = async () => {
    try {
      // 使用 Electron 的文件选择对话框
      const result = await window.electron.dialog.selectFolder()
      if (result && !result.canceled && result.filePaths.length > 0) {
        form.setFieldsValue({ folderPath: result.filePaths[0] })
      }
    } catch (error) {
      message.error(`选择文件夹失败: ${error.message}`)
    }
  }

  const handleSaveProfile = async () => {
    try {
      const values = await form.validateFields()

      // 处理标签：将逗号分隔的字符串转换为 JSON 数组
      let tagsJson = null
      if (values.defaultTags && values.defaultTags.trim()) {
        const tagsArray = values.defaultTags.split(',').map(tag => tag.trim()).filter(tag => tag)
        tagsJson = JSON.stringify(tagsArray)
      }

      const profileData = {
        name: values.name,
        bitBrowserId: values.bitBrowserId,
        folderPath: values.folderPath,
        defaultTimezone: values.defaultTimezone,
        defaultDescription: values.defaultDescription,
        defaultTags: tagsJson
      }

      if (editingProfile) {
        // 更新现有配置
        await window.electron.db.updateBrowserProfile(editingProfile.id, profileData)
        message.success('更新成功')
      } else {
        // 创建新配置
        await window.electron.db.saveBrowserProfile(profileData)
        message.success('添加成功')
      }

      setModalVisible(false)
      loadProfiles()
    } catch (error) {
      if (error.errorFields) {
        // 表单验证错误
        return
      }
      message.error(`保存失败: ${error.message}`)
    }
  }

  const columns = [
    {
      title: 'ID',
      dataIndex: 'id',
      key: 'id',
      width: 80
    },
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      width: 150
    },
    {
      title: '备注',
      dataIndex: 'remark',
      key: 'remark',
      width: 150
    },
    {
      title: '文件夹路径',
      dataIndex: 'folder_path',
      key: 'folder_path',
      ellipsis: true
    },
    {
      title: '默认时区',
      dataIndex: 'default_timezone',
      key: 'default_timezone',
      width: 200,
      render: (timezone) => {
        const tz = TIMEZONES.find(t => t.value === timezone)
        return tz ? tz.label : timezone || '-'
      }
    },
    {
      title: '操作',
      key: 'action',
      width: 150,
      render: (_, record) => (
        <Space size="small">
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => handleEditProfile(record)}
          >
            编辑
          </Button>
          <Button
            type="link"
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => handleDeleteProfile(record.id)}
          >
            删除
          </Button>
        </Space>
      )
    }
  ]

  return (
    <div>
      <Title level={2}>比特浏览器配置</Title>

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
          <Button
            type="primary"
            icon={<PlusOutlined />}
            onClick={handleAddProfile}
          >
            添加账号
          </Button>
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

      <Modal
        title={editingProfile ? '编辑账号配置' : '添加账号配置'}
        open={modalVisible}
        onOk={handleSaveProfile}
        onCancel={() => setModalVisible(false)}
        width={600}
        okText="保存"
        cancelText="取消"
      >
        <Form
          form={form}
          layout="vertical"
          style={{ marginTop: 20 }}
        >
          <Form.Item
            label="账号名称"
            name="name"
            rules={[{ required: true, message: '请输入账号名称' }]}
          >
            <Input placeholder="请输入账号名称" />
          </Form.Item>

          <Form.Item
            label="比特浏览器ID"
            name="bitBrowserId"
            rules={[{ required: true, message: '请输入比特浏览器ID' }]}
          >
            <Input placeholder="请输入比特浏览器ID" />
          </Form.Item>

          <Form.Item
            label="视频文件夹路径"
            name="folderPath"
          >
            <Input
              placeholder="请选择视频文件夹路径"
              addonAfter={
                <FolderOutlined
                  style={{ cursor: 'pointer' }}
                  onClick={handleSelectFolder}
                />
              }
            />
          </Form.Item>

          <Form.Item
            label="默认时区"
            name="defaultTimezone"
            rules={[{ required: true, message: '请选择默认时区' }]}
          >
            <Select
              showSearch
              placeholder="请选择默认时区"
              options={TIMEZONES}
              filterOption={(input, option) =>
                option.label.toLowerCase().includes(input.toLowerCase())
              }
            />
          </Form.Item>

          <Form.Item
            label="默认视频说明"
            name="defaultDescription"
            tooltip="发布视频时的默认说明文案"
          >
            <TextArea
              rows={4}
              placeholder="请输入默认视频说明"
            />
          </Form.Item>

          <Form.Item
            label="默认视频标签"
            name="defaultTags"
            tooltip="多个标签用英文逗号分隔，例如：旅游, 美食, Vlog"
          >
            <Input placeholder="请输入默认标签，用逗号分隔" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  )
}

export default BrowserPage
