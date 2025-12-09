/**
 * 文件名解析工具
 * 用于从文件名中提取视频文案、制作人和制作日期
 *
 * 文件名格式示例：
 * - 1202-唐思-蜈蚣-成品-Can centipedes survive in water.mp4
 * - 1202-唐思-蜈蚣-成品Can centipedes survive in water.mp4 (没有"-")
 * - 1201-李艺菲-西瓜-成片sweet watermelon.mp4 (成片前有空格)
 *
 * 解析规则：
 * - "Can centipedes survive in water" = 视频文案（"成品/成片"后面的内容，可选"-"分隔）
 * - "1202" = 制作日期（MMDD格式，自动添加当前年份）
 * - "唐思" = 制作人姓名（需要与 Supabase 用户表匹配）
 */

/**
 * 预处理文件名：清理多余的空格
 * @param {string} name - 文件名
 * @returns {string} 处理后的文件名
 */
function preprocessFilename(name) {
  return name
    // 去掉 "-" 前后的空格，例如 "1201 -李艺菲" -> "1201-李艺菲"
    .replace(/\s*-\s*/g, '-')
    // 处理 "成品" 或 "成片" 前面的空格（如果没有被上面的规则处理）
    // 例如: "西瓜 成片xxx" -> "西瓜-成片xxx"
    .replace(/\s+(成品)/g, '-$1')
    .replace(/\s+(成片)/g, '-$1')
}

/**
 * 解析文件名
 * @param {string} filename - 文件名（含扩展名）
 * @returns {Object} 解析结果
 */
export function parseFilename(filename) {
  // 移除扩展名
  let nameWithoutExt = filename.replace(/\.[^.]+$/, '')

  // 预处理：清理"成品"或"成片"前面的空格
  nameWithoutExt = preprocessFilename(nameWithoutExt)

  const result = {
    originalFilename: filename,
    videoDescription: '',
    producerName: '',
    productionDate: '',
    productionDateFormatted: '',
    rawParts: []
  }

  // 尝试提取视频文案（"成品" 或 "成片" 后面的内容）
  // 支持多种格式：
  // 1. "成品-xxx" (有"-"分隔)
  // 2. "成品xxx" (无"-"分隔，直接跟内容)
  // 3. "-成品-xxx" (成品前后都有"-")
  // 4. "-成品xxx" (成品前有"-"，后面直接跟内容)
  const descMatch = nameWithoutExt.match(/(?:成品|成片)[-]?(.+)$/)
  if (descMatch) {
    let desc = descMatch[1].trim()
    // 如果提取的内容以"-"开头，去掉它
    if (desc.startsWith('-')) {
      desc = desc.substring(1).trim()
    }
    result.videoDescription = desc
  }

  // 按 "-" 分割文件名
  const parts = nameWithoutExt.split('-').map(p => p.trim()).filter(p => p)
  result.rawParts = parts

  // 查找日期部分（4位数字，MMDD格式）
  for (const part of parts) {
    if (/^\d{4}$/.test(part)) {
      result.productionDate = part
      // 转换为完整日期格式
      const month = part.substring(0, 2)
      const day = part.substring(2, 4)
      const year = new Date().getFullYear()
      result.productionDateFormatted = `${year}-${month}-${day}`
      break
    }
  }

  // 提取制作人姓名
  // 通常是日期后面的第一个非数字、非"成品/成片"的部分
  // 示例：1202-唐思-蜈蚣-成品-xxx  -> 唐思
  if (parts.length >= 2) {
    // 跳过第一个数字部分（日期）
    let startIndex = 0
    if (/^\d+$/.test(parts[0])) {
      startIndex = 1
    }

    // 查找制作人（第一个中文名字，通常是2-4个汉字）
    for (let i = startIndex; i < parts.length; i++) {
      const part = parts[i]
      // 排除 "成品"、"成片" 和纯数字
      if (part === '成品' || part === '成片' || /^\d+$/.test(part)) {
        continue
      }
      // 中文名字通常是2-4个汉字
      if (/^[\u4e00-\u9fa5]{2,4}$/.test(part)) {
        result.producerName = part
        break
      }
    }
  }

  return result
}

/**
 * 匹配制作人与用户列表
 * @param {string} producerName - 从文件名提取的制作人姓名
 * @param {Array} users - 用户列表
 * @returns {Object|null} 匹配的用户对象，未找到返回 null
 */
export function matchProducer(producerName, users) {
  if (!producerName || !users || users.length === 0) {
    return null
  }

  // 精确匹配
  const exactMatch = users.find(u => u.name === producerName)
  if (exactMatch) {
    return exactMatch
  }

  // 模糊匹配（包含关系）
  const partialMatch = users.find(u =>
    u.name && (u.name.includes(producerName) || producerName.includes(u.name))
  )

  return partialMatch || null
}

/**
 * 批量解析文件名
 * @param {Array} files - 文件对象数组，每个对象需要有 name 属性
 * @param {Array} users - 用户列表（可选）
 * @returns {Array} 解析结果数组
 */
export function parseFilenames(files, users = []) {
  return files.map(file => {
    const parsed = parseFilename(file.name || file.filename || file)

    // 如果提供了用户列表，尝试匹配制作人
    if (users.length > 0 && parsed.producerName) {
      const matchedUser = matchProducer(parsed.producerName, users)
      if (matchedUser) {
        parsed.producerId = matchedUser.id
        parsed.producerMatched = true
      } else {
        parsed.producerMatched = false
      }
    }

    return {
      ...file,
      parsed
    }
  })
}

/**
 * 格式化日期显示
 * @param {string} dateStr - MMDD 格式的日期字符串
 * @returns {string} 格式化后的日期字符串
 */
export function formatProductionDate(dateStr) {
  if (!dateStr || dateStr.length !== 4) {
    return ''
  }

  const month = dateStr.substring(0, 2)
  const day = dateStr.substring(2, 4)
  const year = new Date().getFullYear()

  return `${year}年${parseInt(month)}月${parseInt(day)}日`
}
