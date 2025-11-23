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
            const filename = path.basename(filePath)
            const extractedTitle = this.extractTitleFromFilename(filename)

            return {
              id: this.generateFileId(filePath),
              path: filePath,
              name: filename,
              size: stats.size,
              sizeFormatted: this.formatFileSize(stats.size),
              extension: path.extname(filePath).toLowerCase(),
              modifiedTime: stats.mtime,
              folder: path.dirname(filePath),
              extractedTitle: extractedTitle // 提取的标题
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
   * 从文件名中提取视频标题
   * @param {string} filename - 文件名（包含扩展名）
   * @returns {string} 提取的标题，如果没有找到"成片"关键词则返回空字符串
   */
  extractTitleFromFilename(filename) {
    try {
      // 去掉文件扩展名
      const nameWithoutExt = filename.replace(/\.[^/.]+$/, '')

      // 查找"成片"关键词的位置
      const keyword = '成片'
      const keywordIndex = nameWithoutExt.indexOf(keyword)

      if (keywordIndex === -1) {
        // 如果没有找到"成片"，返回空字符串
        console.log(`No "${keyword}" keyword found in filename: ${filename}`)
        return ''
      }

      // 提取"成片"后面的所有内容作为标题
      const title = nameWithoutExt.substring(keywordIndex + keyword.length).trim()

      console.log(`Extracted title from "${filename}": "${title}"`)
      return title
    } catch (error) {
      console.error('Error extracting title from filename:', error)
      return ''
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
