// 查询视频异常且原因包含"视频无效"的视频
const { createClient } = require('@supabase/supabase-js')
const Database = require('better-sqlite3')
const path = require('path')
const os = require('os')

// 从本地数据库读取 Supabase 配置
function getSupabaseConfig() {
  // Windows: %APPDATA%/youtube-upload-desktop/uploads.db
  const appDataPath = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming')
  const dbPath = path.join(appDataPath, 'youtube-upload-desktop', 'uploads.db')

  console.log('读取本地数据库:', dbPath)
  const db = new Database(dbPath)

  const getSettingStmt = db.prepare('SELECT value FROM settings WHERE key = ?')
  const url = getSettingStmt.get('supabase_url')?.value
  const key = getSettingStmt.get('supabase_api_key')?.value

  db.close()

  if (!url || !key) {
    throw new Error('未找到 Supabase 配置')
  }

  return { url, key }
}

async function queryVideoErrors() {
  const config = getSupabaseConfig()
  console.log('Supabase URL:', config.url)

  const supabase = createClient(config.url, config.key)

  // 查询 benchmark_videos 表
  console.log('\n=== benchmark_videos 表 ===')
  const { data: benchmarkData, error: benchmarkError } = await supabase
    .from('benchmark_videos')
    .select('id, video_id, url, title, script_generation_error')
    .eq('generation_status', 'video_error')
    .ilike('script_generation_error', '%视频无效%')

  if (benchmarkError) {
    console.error('查询 benchmark_videos 失败:', benchmarkError)
  } else {
    console.log(`找到 ${benchmarkData.length} 条记录:`)
    benchmarkData.forEach((v, i) => {
      console.log(`\n${i + 1}. ${v.title}`)
      console.log(`   URL: ${v.url}`)
      console.log(`   错误: ${v.script_generation_error}`)
    })
  }

  // 查询 own_videos 表
  console.log('\n\n=== own_videos 表 ===')
  const { data: ownData, error: ownError } = await supabase
    .from('own_videos')
    .select('id, video_id, url, title, script_generation_error')
    .eq('generation_status', 'video_error')
    .ilike('script_generation_error', '%视频无效%')

  if (ownError) {
    console.error('查询 own_videos 失败:', ownError)
  } else {
    console.log(`找到 ${ownData.length} 条记录:`)
    ownData.forEach((v, i) => {
      console.log(`\n${i + 1}. ${v.title}`)
      console.log(`   URL: ${v.url}`)
      console.log(`   错误: ${v.script_generation_error}`)
    })
  }
}

queryVideoErrors().catch(console.error)