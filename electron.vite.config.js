import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { copyFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

// 复制文件插件
function copyFilesPlugin() {
  return {
    name: 'copy-files',
    closeBundle() {
      const filesToCopy = [
        { from: 'src/main/ipc-handlers.js', to: 'dist-electron/main/ipc-handlers.js' },
        { from: 'src/main/services/database.service.js', to: 'dist-electron/main/services/database.service.js' },
        { from: 'src/main/services/file.service.js', to: 'dist-electron/main/services/file.service.js' },
        { from: 'src/main/services/bitbrowser.service.js', to: 'dist-electron/main/services/bitbrowser.service.js' },
        { from: 'src/main/services/playwright.service.js', to: 'dist-electron/main/services/playwright.service.js' },
        { from: 'src/main/services/upload.service.js', to: 'dist-electron/main/services/upload.service.js' }
      ]

      filesToCopy.forEach(({ from, to }) => {
        const dir = join(process.cwd(), to.substring(0, to.lastIndexOf('/')))
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true })
        }
        copyFileSync(join(process.cwd(), from), join(process.cwd(), to))
      })
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
