/**
 * 剪贴板锁服务
 * 用于解决多浏览器并行时剪贴板操作冲突的问题
 */
const { Mutex } = require('async-mutex')

class ClipboardLockService {
  constructor() {
    // 创建互斥锁
    this.mutex = new Mutex()
  }

  /**
   * 执行带锁的剪贴板写入和粘贴操作
   * @param {Object} page - Playwright page 对象
   * @param {string} text - 要写入的文本
   * @param {string} operationName - 操作名称（用于日志）
   * @returns {Promise<void>}
   */
  async writeAndPaste(page, text, operationName = 'paste') {
    const startWait = Date.now()

    // 获取锁
    const release = await this.mutex.acquire()
    const waitTime = Date.now() - startWait

    if (waitTime > 100) {
      console.log(`[ClipboardLock] ${operationName}: 获取锁等待了 ${waitTime}ms`)
    }

    try {
      // 延迟加载 electron clipboard，避免模块加载顺序问题
      const { clipboard } = require('electron')

      // 写入剪贴板
      clipboard.writeText(text)

      // 短暂等待确保剪贴板写入完成
      await page.waitForTimeout(200)

      // 执行粘贴
      await page.keyboard.press('Control+V')

      // 等待粘贴完成后再释放锁
      await page.waitForTimeout(300)

    } finally {
      // 确保释放锁
      release()
    }
  }

  /**
   * 检查锁是否被占用
   */
  isLocked() {
    return this.mutex.isLocked()
  }
}

// 导出单例
module.exports = new ClipboardLockService()
