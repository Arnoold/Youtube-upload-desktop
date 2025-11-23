# YouTube Upload Desktop

YouTube 视频自动上传桌面应用 - 基于 Electron + Playwright + 比特浏览器

## 功能特性

- 📁 **视频文件管理** - 扫描本地文件夹，查看所有视频文件
- 🚀 **自动化上传** - 使用 Playwright 自动化上传视频到 YouTube
- 🌐 **比特浏览器集成** - 支持多账号管理，避免账号关联
- 📊 **任务管理** - 查看上传任务状态和进度
- 💾 **本地数据库** - SQLite 存储所有数据

## 技术栈

- **Electron** - 跨平台桌面应用框架
- **React** - 前端 UI 框架
- **Ant Design** - UI 组件库
- **Playwright** - 浏览器自动化工具
- **Better-SQLite3** - 本地数据库
- **Vite** - 前端构建工具

## 安装

### 前置要求

1. **Node.js** 18.0+ 或 20.0+
2. **比特浏览器** - 需要安装并运行
3. **Git** - 版本控制工具

### 安装步骤

```bash
# 克隆项目
git clone https://github.com/Arnoold/Youtube-upload-desktop.git
cd Youtube-upload-desktop

# 安装依赖
npm install

# 开发模式运行
npm run dev

# 构建生产版本
npm run build

# 打包成 Windows 安装包
npm run dist:win
```

## 使用说明

### 1. 启动比特浏览器

确保比特浏览器已启动，默认 API 地址为：`http://127.0.0.1:54345`

### 2. 创建浏览器配置

在比特浏览器中：
- 创建新的浏览器配置
- 登录 YouTube 账号
- 记下配置的 ID

### 3. 扫描视频文件

在应用的"视频文件"页面：
- 输入视频文件夹路径（如：`D:\Videos`）
- 点击"扫描文件夹"
- 查看所有视频文件列表

### 4. 创建上传任务

（此功能正在开发中）

### 5. 查看上传进度

在"上传任务"页面查看所有任务的状态和进度

## 项目结构

```
youtube-upload-desktop/
├── src/
│   ├── main/              # Electron 主进程
│   │   ├── services/      # 后端服务
│   │   │   ├── database.service.js
│   │   │   ├── file.service.js
│   │   │   ├── bitbrowser.service.js
│   │   │   ├── playwright.service.js
│   │   │   └── upload.service.js
│   │   ├── ipc-handlers.js
│   │   └── index.js
│   ├── preload/           # 预加载脚本
│   │   └── index.js
│   └── renderer/          # 渲染进程（前端）
│       └── src/
│           ├── pages/     # 页面组件
│           ├── components/# 公共组件
│           └── App.jsx
├── package.json
├── electron.vite.config.js
└── electron-builder.yml
```

## ⚠️ 重要提示

1. **Playwright 选择器需要调整**
   - YouTube Studio 页面结构可能会变化
   - `src/main/services/playwright.service.js` 中的选择器需要根据实际页面调整
   - 使用浏览器开发者工具（F12）检查元素

2. **比特浏览器配置**
   - 确保比特浏览器已启动
   - 默认 API 地址：`http://127.0.0.1:54345`
   - 需要提前在比特浏览器中登录 YouTube 账号

3. **文件路径格式**
   - Windows: `D:/Videos` 或 `D:\\Videos`
   - 支持的视频格式：mp4, avi, mov, mkv, flv, wmv, webm, m4v

## 开发者说明

### 调试 Playwright 脚本

在 `src/main/services/playwright.service.js` 中：
- 使用 `await page.pause()` 暂停执行
- 使用 `console.log()` 输出调试信息
- 打开 Playwright Inspector 查看页面状态

### 数据库位置

- Windows: `%APPDATA%\youtube-upload-desktop\uploads.db`
- 使用 DB Browser for SQLite 查看数据

## 待开发功能

- [ ] 创建上传任务界面
- [ ] 实时进度条显示
- [ ] 批量上传
- [ ] 定时上传
- [ ] 上传缩略图
- [ ] 添加标签
- [ ] 错误重试

## 许可证

MIT

## 作者

Arnoold
