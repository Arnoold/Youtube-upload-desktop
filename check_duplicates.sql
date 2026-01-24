-- 查询2026年1月8日0点北京时间以后的完成记录中，有多少重复的解说词
-- 北京时间 2026-01-08 00:00:00 = UTC 2026-01-07 16:00:00

-- 总体统计
SELECT 
  '总完成数' as metric,
  COUNT(*) as value
FROM commentary_task_items 
WHERE status = 'completed' 
  AND result IS NOT NULL 
  AND updated_at >= '2026-01-07 16:00:00'

UNION ALL

SELECT 
  '唯一解说词数' as metric,
  COUNT(DISTINCT result) as value
FROM commentary_task_items 
WHERE status = 'completed' 
  AND result IS NOT NULL 
  AND updated_at >= '2026-01-07 16:00:00';

-- 重复的解说词详情（出现超过1次的）
SELECT 
  result,
  COUNT(*) as duplicate_count,
  GROUP_CONCAT(video_id) as video_ids
FROM commentary_task_items 
WHERE status = 'completed' 
  AND result IS NOT NULL 
  AND updated_at >= '2026-01-07 16:00:00'
GROUP BY result
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC
LIMIT 20;
