import React, { useState } from 'react'
import { Typography, Card, Space, Button, message, Spin, Input } from 'antd'
import { RobotOutlined } from '@ant-design/icons'

const { Title, Paragraph, Text } = Typography

const SettingsPage = () => {
  const [loading, setLoading] = useState(false)
  const [aiResponse, setAiResponse] = useState('')

  // 默认值
  const DEFAULT_VIDEO_LINK = 'https://www.youtube.com/watch?v=ougJV1ULixk'
  const DEFAULT_BROWSER_ID = '0e7f85a348654b618508dc873b78389d'

  const [videoLink, setVideoLink] = useState(localStorage.getItem('aistudio_test_video_link') || DEFAULT_VIDEO_LINK)
  const [browserId, setBrowserId] = useState(localStorage.getItem('aistudio_test_browser_id') || DEFAULT_BROWSER_ID)
  const [prompt, setPrompt] = useState(localStorage.getItem('aistudio_test_prompt') || `请分析提供上方我提供的的 YouTube 视频链接的内容，并严格按照以下 JSON 格式输出分析结果。不要输出 JSON 以外的任何开场白或结束语。

\`\`\`json
{
  "videoDescription": "视频速记标签/外号",
  "originalScript": "合并后的原文内容（解说词+对话）",
  "chineseScript": "原文内容的中文逐字翻译",
  "videoLanguage": "解说词的原始语言",
  "searchKeywords": "用于TikTok搜索的关键词字符串",
  "videoHighlights": "视频爆点分析列表",
  "videoType": "大类 - 子类"
}
\`\`\`

**字段详细要求说明：**

1.  **videoDescription**:
      * **目标**：提供一个口语化的、用于个人快速识别的“外号”或“速记标签”。
      * **风格**：非正式、直白，抓住视频最核心的视觉或行为特征（例如：“厨房跳舞男”或“猫咪推杯子”）。
      * **长度**：必须非常简洁，控制在 **10个汉字以内**。
      * **格式**：纯文本字符串。

2.  **originalScript**:
      * **内容**：提取并整合视频中所有的解说词（旁白）和人物对话原文。
      * **结构**：
          * 如果视频中同时包含“旁白解说”和“人物对话”，请严格按照以下顺序排列：
            1.  解说词内容
            2.  **换行** (插入换行符)
            3.  分隔符 \`======\`
            4.  **换行** (插入换行符)
            5.  对话内容
          * 如果只有其中一种，则直接输出该内容。
      * **语言**：保持视频原始语言。

3.  **chineseScript**:
      * **内容**：将上述 \`originalScript\` 中的完整内容翻译成中文，帮助理解视频讲了什么。
      * **要求**：对应原文的结构（包括换行和分隔符位置），保持语义通顺。

4.  **searchKeywords**:
      * **目标**：提供 5-10 个**专门用于在 TikTok 上搜索类似视觉素材**的关键词。
      * **选词策略**：优先选择**视觉描述词**（如具体的动作、物体）、**场景词**或**TikTok 热门标签**，以便我能搜到相似的画面。
      * **分隔规则**：每一对“\`英文关键词 - 中文意思\`”之间，**必须使用换行符 (\`\\n\`) 进行分隔**。
      * **正确示例**：
        \`Oddly Satisfying - 极度舒适解压\`
        \`Street Food POV - 街头美食第一视角\`

5.  **videoLanguage**: 识别视频中解说词或旁白使用的原始语言（如：英语、法语、德语、西班牙语、印尼语、孟加拉语、日语、韩语等）。

6.  **videoHighlights**:
      * **目标**：分析视频的爆点（为什么播放量高、完播率高）。
      * **内容**：列出 **5-10 个**具体吸引力因素。
      * **关键要求**：
          * **拒绝空泛的形容词**（如不要只写“题材新奇”），**必须写出具体的内容细节**。
          * **每条内容必须以数字序号开头（1. 2. 3. ...）。**
      * *正确示例*：
        \`1. 使用液压机压碎钻石的视觉冲击力极强。\`
        \`2. 压碎瞬间的碎片飞溅特写非常解压。\`
        \`3. 实验失败的反转结局引发观众讨论。\`
      * **格式要求**：每条控制在 **25个字** 以内，**一行一条**，使用换行符 (\`\\n\`) 分隔。

7.  **videoType**:
      * **目标**：判断视频所属的细分垂直领域。
      * **格式**：**必须包含【大类】和【子类】，中间用 \`-\` 连接。**
      * **参考分类体系（请从中选择最准确的组合）：**
          * **科普/解说类**：科普冷知识、历史悬疑、机械原理、自然地理、奇闻轶事、商业思维
          * **情感/剧情类**：感人故事、反转剧情、情侣日常、家庭伦理、正能量、POV视角
          * **娱乐/搞笑类**：搞笑段子、街头恶作剧、意外翻车(Fails)、迷因梗图、脱口秀
          * **生活/兴趣类**：萌宠动物、儿童玩具、文具手帐、建筑设计、美食制作、沉浸式解压(ASMR)、DIY手工、收纳整理、好物推荐`)

  const handleOpenAIStudio = async () => {
    setLoading(true)
    setAiResponse('') // 清空旧结果
    try {
      const result = await window.electron.aiStudio.openBrowser(videoLink, browserId, prompt)
      if (result.success) {
        message.success('AI Studio 操作完成')
        if (result.aiResponse) {
          setAiResponse(result.aiResponse)
        }
      } else {
        message.error('操作失败: ' + (result.error || result.message || '未知错误'))
      }
    } catch (error) {
      message.error('打开失败: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <Title level={2}>设置</Title>

      <Space direction="vertical" size="large" style={{ width: '100%' }}>
        <Card title="AI Studio">
          <Paragraph>
            点击下方按钮打开 AI Studio 浏览器，自动使用预设的比特浏览器配置。
          </Paragraph>

          <Space direction="vertical" style={{ width: '100%', marginBottom: 20 }}>
            <div>
              <Text>测试视频链接：</Text>
              <Input
                placeholder="请输入 YouTube 视频链接"
                value={videoLink}
                onChange={(e) => {
                  setVideoLink(e.target.value)
                  localStorage.setItem('aistudio_test_video_link', e.target.value)
                }}
              />
            </div>
            <div>
              <Text>比特浏览器 ID：</Text>
              <Input
                placeholder="请输入比特浏览器 ID"
                value={browserId}
                onChange={(e) => {
                  setBrowserId(e.target.value)
                  localStorage.setItem('aistudio_test_browser_id', e.target.value)
                }}
              />
            </div>
            <div>
              <Text>AI 提示词：</Text>
              <Input.TextArea
                placeholder="请输入提示词"
                value={prompt}
                autoSize={{ minRows: 4, maxRows: 12 }}
                onChange={(e) => {
                  setPrompt(e.target.value)
                  localStorage.setItem('aistudio_test_prompt', e.target.value)
                }}
              />
            </div>
          </Space>

          <Button
            type="primary"
            icon={<RobotOutlined />}
            onClick={handleOpenAIStudio}
            loading={loading}
            size="large"
          >
            打开 AI Studio
          </Button>

          {aiResponse && (
            <div style={{ marginTop: 20 }}>
              <Title level={4}>AI 回复内容：</Title>
              <div style={{
                background: '#f5f5f5',
                padding: '15px',
                borderRadius: '8px',
                whiteSpace: 'pre-wrap',
                maxHeight: '400px',
                overflowY: 'auto',
                border: '1px solid #d9d9d9'
              }}>
                {aiResponse}
              </div>
            </div>
          )}
        </Card>

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
