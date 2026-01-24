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

    # 统计错误类型
    error_types = {}
    for v in data:
        error = v.get('script_generation_error', 'N/A')
        # 截取前50个字符作为错误类型的标识
        error_key = error[:80] if error else 'N/A'
        if error_key not in error_types:
            error_types[error_key] = []
        error_types[error_key].append(v)

    # 写入结果文件
    with open('all_video_errors.txt', 'w', encoding='utf-8') as f:
        f.write(f'=== 所有 video_error 记录 ===\n')
        f.write(f'共 {len(data)} 条\n\n')

        f.write('=== 错误类型统计 ===\n')
        for error_type, videos in sorted(error_types.items(), key=lambda x: -len(x[1])):
            f.write(f'\n错误类型 ({len(videos)}条): {error_type}\n')
            f.write('-' * 80 + '\n')
            for v in videos[:5]:  # 每种类型只显示前5条
                f.write(f"  - {v.get('url', 'N/A')}\n")
            if len(videos) > 5:
                f.write(f"  ... 还有 {len(videos) - 5} 条\n")

    print(f'结果已写入 all_video_errors.txt，共 {len(data)} 条记录，{len(error_types)} 种错误类型')
