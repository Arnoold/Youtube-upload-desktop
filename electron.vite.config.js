import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

// 复制文件插件 - 使用 UTF-8 编码读写确保中文字符正确
function copyFilesPlugin() {
  const filesToCopy = [
    { from: 'src/main/ipc-handlers.js', to: 'dist-electron/main/ipc-handlers.js' },
    { from: 'src/main/services/database.service.js', to: 'dist-electron/main/services/database.service.js' },
    { from: 'src/main/services/file.service.js', to: 'dist-electron/main/services/file.service.js' },
    { from: 'src/main/services/bitbrowser.service.js', to: 'dist-electron/main/services/bitbrowser.service.js' },
    { from: 'src/main/services/hubstudio.service.js', to: 'dist-electron/main/services/hubstudio.service.js' },
    { from: 'src/main/services/playwright.service.js', to: 'dist-electron/main/services/playwright.service.js' },
    { from: 'src/main/services/upload.service.js', to: 'dist-electron/main/services/upload.service.js' },
    { from: 'src/main/services/supabase.service.js', to: 'dist-electron/main/services/supabase.service.js' },
    { from: 'src/main/services/aistudio.service.js', to: 'dist-electron/main/services/aistudio.service.js' },
    { from: 'src/main/services/clipboard-lock.service.js', to: 'dist-electron/main/services/clipboard-lock.service.js' },
    { from: 'src/main/services/douyin.service.js', to: 'dist-electron/main/services/douyin.service.js' },
    { from: 'src/main/services/scheduler.service.js', to: 'dist-electron/main/services/scheduler.service.js' },
    { from: 'src/main/services/youtube-upload.service.js', to: 'dist-electron/main/services/youtube-upload.service.js' },
    { from: 'src/main/services/own-channel-scheduler.service.js', to: 'dist-electron/main/services/own-channel-scheduler.service.js' }
  ]

  function doCopy() {
    filesToCopy.forEach(({ from, to }) => {
      try {
        const fromPath = join(process.cwd(), from)
        const toPath = join(process.cwd(), to)
        const dir = join(process.cwd(), to.substring(0, to.lastIndexOf('/')))
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true })
        }
        if (existsSync(fromPath)) {
          // 使用 UTF-8 编码读取和写入，确保中文字符正确
          const content = readFileSync(fromPath, 'utf8')
          writeFileSync(toPath, content, 'utf8')
        }
      } catch (e) {
        console.error(`Failed to copy ${from}:`, e.message)
      }
    })
  }

  return {
    name: 'copy-files',
    // 在构建完成后复制文件
    writeBundle() {
      doCopy()
    },
    // 开发模式下也需要复制
    closeBundle() {
      doCopy()
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), copyFilesPlugin()],
    build: {
      outDir: 'dist-electron/main',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/main/index.js')
        }
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist-electron/preload',
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/preload/index.js')
        }
      }
    }
  },
  renderer: {
    root: 'src/renderer',
    plugins: [react()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, 'src/renderer/index.html')
        }
      }
    }
  }
})
