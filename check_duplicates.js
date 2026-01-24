const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');

// Electron userData 路径
const userDataPath = path.join(os.homedir(), 'AppData', 'Roaming', 'youtube-upload-desktop');
const dbPath = path.join(userDataPath, 'uploads.db');
console.log('Database path:', dbPath);

try {
    const db = new Database(dbPath);

    // 查询2026年1月8日0点北京时间(UTC+8)起的记录
    // 北京时间 2026-01-08 00:00:00 = UTC 2026-01-07 16:00:00
    const startTime = '2026-01-07 16:00:00';

    // 查询status为completed且有result的记录
    const items = db.prepare(`
    SELECT id, video_id, result, updated_at 
    FROM commentary_task_items 
    WHERE status = 'completed' 
      AND result IS NOT NULL 
      AND updated_at >= ?
    ORDER BY updated_at DESC
  `).all(startTime);

    console.log('Total completed items since 2026-01-08 00:00 Beijing time:', items.length);

    // 统计完全相同的result
    const resultCount = {};
    items.forEach(item => {
        const key = item.result;
        if (!resultCount[key]) {
            resultCount[key] = [];
        }
        resultCount[key].push({ id: item.id, video_id: item.video_id, updated_at: item.updated_at });
    });

    // 找出重复的
    let duplicateCount = 0;
    let duplicateVideoCount = 0;
    const duplicates = [];

    Object.entries(resultCount).forEach(([result, videos]) => {
        if (videos.length > 1) {
            duplicateCount++;
            duplicateVideoCount += videos.length;

            // 解析result获取videoDescription
            let desc = '(无法解析)';
            try {
                const parsed = JSON.parse(result);
                desc = parsed.videoDescription ? parsed.videoDescription.substring(0, 80) + '...' : '(无videoDescription)';
            } catch (e) {
                desc = result.substring(0, 80) + '...';
            }

            duplicates.push({
                count: videos.length,
                desc: desc,
                videos: videos
            });
        }
    });

    console.log('\n=== 重复统计 ===');
    console.log('有重复内容的组数:', duplicateCount);
    console.log('涉及重复的视频总数:', duplicateVideoCount);
    console.log('唯一解说词数量:', Object.keys(resultCount).length);

    if (duplicates.length > 0) {
        console.log('\n=== 重复详情 (按重复次数排序) ===');
        duplicates.sort((a, b) => b.count - a.count);
        duplicates.slice(0, 20).forEach((dup, i) => {
            console.log(`\n[${i + 1}] 相同内容出现 ${dup.count} 次`);
            console.log('    描述:', dup.desc);
            console.log('    视频ID:', dup.videos.map(v => v.video_id).join(', '));
        });

        if (duplicates.length > 20) {
            console.log(`\n... 还有 ${duplicates.length - 20} 组重复未显示`);
        }
    }

    db.close();
} catch (e) {
    console.error('Error:', e.message);
    console.error(e.stack);
}
