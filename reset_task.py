# -*- coding: utf-8 -*-
import sqlite3

db_path = r'C:\Users\Administrator\AppData\Roaming\youtube-upload-desktop\uploads.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

task_id = 112

# 重置任务中所有视频的状态为 pending
cursor.execute('''
    UPDATE commentary_task_items 
    SET status = 'pending', result = NULL, error = NULL 
    WHERE task_id = ?
''', (task_id,))

affected = cursor.rowcount
conn.commit()
print(f'已将任务 {task_id} 中的 {affected} 个视频状态重置为 pending')

# 同时将任务状态也重置
cursor.execute('''
    UPDATE commentary_tasks 
    SET status = 'pending', started_at = NULL, finished_at = NULL 
    WHERE id = ?
''', (task_id,))
conn.commit()
print(f'任务 {task_id} 状态已重置为 pending')

conn.close()
print('完成!')
