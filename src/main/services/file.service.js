const fs = require('fs-extra')
const path = require('path')
const { glob } = require('glob')
const chokidar = require('chokidar')

class FileService {
  constructor() {
    this.watchers = new Map()
  }

  /**
   * 扫描文件夹获取所有视频文件
   * @param {string} folderPath - 文件夹路径
   * @returns {Promise<Array>} 视频文件列表
   */
  async scanFolder(folderPath) {
    try {
      // 检查文件夹是否存在
      const exists = await fs.pathExists(folderPath)
      if (!exists) {
        throw new Error(`文件夹不存在: ${folderPath}`)
      }

      const videoExtensions = ['mp4', 'avi', 'mov', 'mkv', 'flv', 'wmv', 'webm', 'm4v']
      const pattern = `**/*.{${videoExtensions.join(',')}}`

      const files = await glob(pattern, {
        cwd: folderPath,
        absolute: true,
        nodir: true,
        windowsPathsNoEscape: true
      })

      console.log(`Found ${files.length} video files in ${folderPath}`)

      const videoFiles = await Promise.all(
        files.map(async (filePath) => {
          try {
            const stats = await fs.stat(filePath)
            return {
              id: this.generateFileId(filePath),
              path: filePath,
              name: path.basename(filePath),
              size: stats.size,
              sizeFormatted: this.formatFileSize(stats.size),
              extension: path.extname(filePath).toLowerCase(),
              modifiedTime: stats.mtime,
              folder: path.dirname(filePath)
            }
          } catch (error) {
            console.error(`Error processing file ${filePath}:`, error)
            return null
          }
        })
      )

      return videoFiles.filter(file => file !== null)
    } catch (error) {
      console.error('Error scanning folder:', error)
      throw error
    }
  }

  /**
   * 监听文件夹变化
   * @param {string} folderPath - 文件夹路径
   * @param {Function} callback - 回调函数
   */
  watchFolder(folderPath, callback) {
    if (this.watchers.has(folderPath)) {
      console.log(`Already watching folder: ${folderPath}`)
      return
    }

    const watcher = chokidar.watch(folderPath, {
      ignored: /(^|[\/\\])\../,
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 2000,
        pollInterval: 100
      }
    })

    watcher
      .on('add', filePath => {
        if (this.isVideoFile(filePath)) {
          callback({ type: 'add', path: filePath })
        }
      })
      .on('unlink', filePath => {
        if (this.isVideoFile(filePath)) {
          callback({ type: 'delete', path: filePath })
        }
      })
      .on('change', filePath => {
        if (this.isVideoFile(filePath)) {
          callback({ type: 'change', path: filePath })
        }
      })

    this.watchers.set(folderPath, watcher)
    console.log(`Started watching folder: ${folderPath}`)
  }

  /**
   * 停止监听文件夹
   * @param {string} folderPath - 文件夹路径
   */
  unwatchFolder(folderPath) {
    const watcher = this.watchers.get(folderPath)
    if (watcher) {
      watcher.close()
      this.watchers.delete(folderPath)
      console.log(`Stopped watching folder: ${folderPath}`)
    }
  }

  /**
   * 移动文件
   * @param {string} sourcePath - 源文件路径
   * @param {string} destFolder - 目标文件夹
   * @returns {Promise<string>} 新文件路径
   */
  async moveFile(sourcePath, destFolder) {
    try {
      await fs.ensureDir(destFolder)
      const fileName = path.basename(sourcePath)
      const destPath = path.join(destFolder, fileName)

      await fs.move(sourcePath, destPath, { overwrite: false })
      console.log(`Moved file from ${sourcePath} to ${destPath}`)

      return destPath
    } catch (error) {
      console.error('Error moving file:', error)
      throw error
    }
  }

  /**
   * 重命名文件
   * @param {string} filePath - 文件路径
   * @param {string} newName - 新文件名
   * @returns {Promise<string>} 新文件路径
   */
  async renameFile(filePath, newName) {
    try {
      const dir = path.dirname(filePath)
      const ext = path.extname(filePath)
      const newPath = path.join(dir, newName + ext)

      await fs.rename(filePath, newPath)
      console.log(`Renamed file from ${filePath} to ${newPath}`)

      return newPath
    } catch (error) {
      console.error('Error renaming file:', error)
      throw error
    }
  }

  /**
   * 检查是否为视频文件
   * @param {string} filePath - 文件路径
   * @returns {boolean}
   */
  isVideoFile(filePath) {
    const videoExtensions = ['.mp4', '.avi', '.mov', '.mkv', '.flv', '.wmv', '.webm', '.m4v']
    const ext = path.extname(filePath).toLowerCase()
    return videoExtensions.includes(ext)
  }

  /**
   * 格式化文件大小
   * @param {number} bytes - 字节数
   * @returns {string} 格式化后的大小
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]
  }

  /**
   * 生成文件ID
   * @param {string} filePath - 文件路径
   * @returns {string} Base64编码的文件路径
   */
  generateFileId(filePath) {
    return Buffer.from(filePath).toString('base64')
  }

  /**
   * 扫描文件夹获取视频文件（仅一级目录）
   * @param {string} folderPath - 文件夹路径
   * @returns {Promise<Array>} 视频文件列表
   */
  async scanFolderShallow(folderPath) {
    try {
      // 检查文件夹是否存在
      const exists = await fs.pathExists(folderPath)
      if (!exists) {
        throw new Error(`文件夹不存在: ${folderPath}`)
      }

      const videoExtensions = ['mp4', 'avi', 'mov', 'mkv', 'flv', 'wmv', 'webm', 'm4v']

      // 读取目录内容，仅一级
      const items = await fs.readdir(folderPath, { withFileTypes: true })

      const videoFiles = []

      for (const item of items) {
        // 只处理文件，不处理目录
        if (item.isFile()) {
          const ext = path.extname(item.name).toLowerCase().substring(1)

          // 检查是否为视频文件
          if (videoExtensions.includes(ext)) {
            const filePath = path.join(folderPath, item.name)
            try {
              const stats = await fs.stat(filePath)
              videoFiles.push({
                id: this.generateFileId(filePath),
                path: filePath,
                name: item.name,
                size: stats.size,
                sizeFormatted: this.formatFileSize(stats.size),
                extension: path.extname(item.name).toLowerCase(),
                modifiedTime: stats.mtime,
                folder: folderPath
              })
            } catch (error) {
              console.error(`Error processing file ${filePath}:`, error)
            }
          }
        }
      }

      console.log(`Found ${videoFiles.length} video files in ${folderPath} (shallow scan)`)
      return videoFiles
    } catch (error) {
      console.error('Error scanning folder (shallow):', error)
      throw error
    }
  }

  /**
   * 移动视频文件到"已发"文件夹
   * @param {string} folderPath - 账号文件夹路径
   * @returns {Promise<Object>} 移动结果
   */
  async moveToPublishedFolder(folderPath) {
    try {
      // 获取一级目录下的所有视频文件
      const videoFiles = await this.scanFolderShallow(folderPath)

      if (videoFiles.length === 0) {
        return {
          success: true,
          message: '没有找到需要移动的视频文件',
          movedCount: 0
        }
      }

      // 创建"已发"文件夹
      const publishedFolder = path.join(folderPath, '已发')
      await fs.ensureDir(publishedFolder)

      let movedCount = 0
      const errors = []

      // 移动所有视频文件
      for (const file of videoFiles) {
        try {
          const fileName = path.basename(file.path)
          const destPath = path.join(publishedFolder, fileName)

          // 如果目标文件已存在，添加时间戳避免覆盖
          let finalDestPath = destPath
          if (await fs.pathExists(destPath)) {
            const timestamp = Date.now()
            const ext = path.extname(fileName)
            const nameWithoutExt = path.basename(fileName, ext)
            finalDestPath = path.join(publishedFolder, `${nameWithoutExt}_${timestamp}${ext}`)
          }

          await fs.move(file.path, finalDestPath)
          movedCount++
          console.log(`Moved: ${file.path} -> ${finalDestPath}`)
        } catch (error) {
          console.error(`Failed to move ${file.path}:`, error)
          errors.push({ file: file.name, error: error.message })
        }
      }

      return {
        success: errors.length === 0,
        message: `成功移动 ${movedCount} 个视频文件到"已发"文件夹`,
        movedCount,
        totalCount: videoFiles.length,
        errors
      }
    } catch (error) {
      console.error('Error moving to published folder:', error)
      throw error
    }
  }

  /**
   * 关闭所有文件监听器
   */
  closeAll() {
    this.watchers.forEach(watcher => watcher.close())
    this.watchers.clear()
    console.log('Closed all file watchers')
  }
}

module.exports = FileService
