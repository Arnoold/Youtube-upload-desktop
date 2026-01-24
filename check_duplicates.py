# -*- coding: utf-8 -*-
import sqlite3
import json
from collections import defaultdict
from datetime import datetime

db_path = r'C:\Users\Administrator\AppData\Roaming\youtube-upload-desktop\uploads.db'
print(f'Database: {db_path}')

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# 只查询这几个任务ID
task_ids = [105, 106, 107, 108, 109, 110]

print(f'查询任务ID: {task_ids}')
print('=' * 60)

# 收集所有需要重新获取的视频
videos_to_redo = []

for task_id in task_ids:
    # 获取任务信息
    cursor.execute('SELECT name FROM commentary_tasks WHERE id = ?', (task_id,))
    task_row = cursor.fetchone()
    task_name = task_row[0] if task_row else f'任务{task_id}'
    
    # 查询该任务内的完成记录
    cursor.execute('''
        SELECT id, video_id, result, video_info, updated_at 
        FROM commentary_task_items 
        WHERE task_id = ?
          AND status = 'completed' 
          AND result IS NOT NULL
        ORDER BY updated_at ASC
    ''', (task_id,))
    
    items = cursor.fetchall()
    
    if not items:
        continue
    
    # 统计该任务内的重复
    result_map = defaultdict(list)
    for item in items:
        item_id, video_id, result, video_info, updated_at = item
        result_map[result].append({
            'id': item_id, 
            'video_id': video_id, 
            'video_info': video_info,
            'updated_at': updated_at
        })
    
    # 对于每组重复，所有视频都加入重做列表
    for result, videos in result_map.items():
        if len(videos) > 1:
            # 所有重复的都需要重做
            for v in videos:
                videos_to_redo.append({
                    'item_id': v['id'],
                    'video_id': v['video_id'],
                    'video_info': v['video_info'],
                    'from_task': task_id
                })

print(f'\n需要重新获取解说词的视频数: {len(videos_to_redo)}')

if len(videos_to_redo) == 0:
    print('没有需要重做的视频！')
    conn.close()
    exit()

# 创建新任务
new_task_name = f'重做重复解说词_{datetime.now().strftime("%Y-%m-%d_%H%M")}'
cursor.execute('''
    INSERT INTO commentary_tasks (name, filters, status, created_at)
    VALUES (?, ?, ?, ?)
''', (new_task_name, '{}', 'pending', datetime.now().isoformat()))
new_task_id = cursor.lastrowid
print(f'\n创建新任务: ID={new_task_id}, 名称="{new_task_name}"')

# 添加视频到新任务
added_count = 0
for v in videos_to_redo:
    video_info = v['video_info']
    video_id = v['video_id']
    
    cursor.execute('''
        INSERT INTO commentary_task_items (task_id, video_id, video_info, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
    ''', (new_task_id, video_id, video_info, 'pending', datetime.now().isoformat(), datetime.now().isoformat()))
    added_count += 1

# 同时将原来重复的记录状态改为 pending，以便可以重做
# 可选：也可以不改，让用户手动处理
# for v in videos_to_redo:
#     cursor.execute('UPDATE commentary_task_items SET status = ? WHERE id = ?', ('pending', v['item_id']))

conn.commit()
print(f'已添加 {added_count} 个视频到新任务')

# 显示来源分布
from_task_count = defaultdict(int)
for v in videos_to_redo:
    from_task_count[v['from_task']] += 1

print('\n来源任务分布:')
for task_id, count in sorted(from_task_count.items()):
    print(f'  任务 {task_id}: {count} 个视频')

conn.close()
print(f'\n完成！新任务 ID: {new_task_id}')
