/**
 * 修复文件编码脚本
 * 用于在 electron-vite 构建后重新复制包含中文字符的文件
 * 确保使用 UTF-8 编码
 */

const fs = require('fs')
const path = require('path')

const base = process.cwd()

const files = [
  'ipc-handlers.js',
  'services/database.service.js',
  'services/file.service.js',
  'services/bitbrowser.service.js',
  'services/hubstudio.service.js',
  'services/playwright.service.js',
  'services/upload.service.js',
  'services/supabase.service.js',
  'services/aistudio.service.js',
  'services/clipboard-lock.service.js',
  'services/douyin.service.js',
  'services/scheduler.service.js',
  'services/youtube-upload.service.js',
  'services/own-channel-scheduler.service.js',
  'services/youtube.service.js'
]

console.log('Fixing file encoding...')

files.forEach(file => {
  const from = path.join(base, 'src/main', file)
  const to = path.join(base, 'dist-electron/main', file)

  const dir = path.dirname(to)
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }

  if (fs.existsSync(from)) {
    const content = fs.readFileSync(from, 'utf8')
    fs.writeFileSync(to, content, 'utf8')
    console.log('Fixed:', file)
  }
})

console.log('Encoding fix completed!')
