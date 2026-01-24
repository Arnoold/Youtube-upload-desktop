# -*- coding: utf-8 -*-
import urllib.request
import urllib.parse
import json

SUPABASE_URL = 'https://ychabajmtnknhhmxqqvk.supabase.co'
SUPABASE_KEY = 'sb_publishable_SZiuptmWaPD6OFLsD3L4bw_aH-n731f'

headers = {
    'apikey': SUPABASE_KEY,
    'Authorization': 'Bearer ' + SUPABASE_KEY,
    'Content-Type': 'application/json'
}

# 查询所有 video_error 状态的记录
params = urllib.parse.urlencode({
    'generation_status': 'eq.video_error',
    'select': 'id,video_id,url,title,script_generation_error'
})
url = SUPABASE_URL + '/rest/v1/benchmark_videos?' + params
req = urllib.request.Request(url, headers=headers)

with urllib.request.urlopen(req) as resp:
    data = json.loads(resp.read().decode('utf-8'))

    # 筛选包含"视频无效"的记录
    invalid_videos = [v for v in data if v.get('script_generation_error') and '视频无效' in v.get('script_generation_error', '')]

    # 写入结果文件
    with open('invalid_videos_result.txt', 'w', encoding='utf-8') as f:
        f.write(f'=== 视频无效 的记录 ===\n')
        f.write(f'共找到 {len(invalid_videos)} 条\n\n')
        for i, v in enumerate(invalid_videos):
            f.write(f"{i+1}. {v.get('title', 'N/A')}\n")
            f.write(f"   URL: {v.get('url', 'N/A')}\n")
            f.write(f"   Error: {v.get('script_generation_error', 'N/A')}\n\n")

    print(f'结果已写入 invalid_videos_result.txt，共 {len(invalid_videos)} 条记录')
