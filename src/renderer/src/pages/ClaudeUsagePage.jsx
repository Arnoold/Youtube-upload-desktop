import React, { useState, useEffect, useRef } from 'react'
import { Typography, Button, Space, Switch, TimePicker, message, Card } from 'antd'
import { PlayCircleOutlined, StopOutlined, ClockCircleOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'

const { Title, Text } = Typography

const ClaudeUsagePage = () => {
  const [running, setRunning] = useState(false)
  const [logs, setLogs] = useState([])
  const logContainerRef = useRef(null)

  // 定时配置
  const [scheduleEnabled, setScheduleEnabled] = useState(false)
  const [time1, setTime1] = useState('09:00')
  const [time1Enabled, setTime1Enabled] = useState(true)
  const [time2, setTime2] = useState('21:00')
  const [time2Enabled, setTime2Enabled] = useState(true)

  useEffect(() => {
    window.electron.claudeUsage.onLog((data) => {
      setLogs(prev => [...prev, data])
    })

    // 加载定时配置
    window.electron.claudeUsage.getSchedule().then(config => {
      if (config) {
        setScheduleEnabled(config.enabled || false)
        setTime1(config.time1 || '09:00')
        setTime1Enabled(config.time1Enabled !== false)
        setTime2(config.time2 || '21:00')
        setTime2Enabled(config.time2Enabled !== false)
      }
    })

    return () => {
      window.electron.claudeUsage.removeLogListener()
    }
  }, [])

  // 自动滚动到底部
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight
    }
  }, [logs])

  const handleStart = async () => {
    setRunning(true)
    setLogs([])
    try {
      const result = await window.electron.claudeUsage.start()
      if (result.success) {
        message.success(`采集完成：成功 ${result.fetched}/${result.total}`)
      } else {
        message.error(result.error || '采集失败')
      }
    } catch (err) {
      message.error('采集异常: ' + err.message)
    } finally {
      setRunning(false)
    }
  }

  const handleStop = async () => {
    await window.electron.claudeUsage.stop()
    message.info('正在停止...')
  }

  const saveSchedule = async (overrides = {}) => {
    const config = {
      enabled: scheduleEnabled,
      time1, time1Enabled,
      time2, time2Enabled,
      ...overrides
    }
    await window.electron.claudeUsage.setSchedule(config)
  }

  const handleScheduleToggle = async (checked) => {
    setScheduleEnabled(checked)
    await saveSchedule({ enabled: checked })
    message.success(checked ? '定时任务已开启' : '定时任务已关闭')
  }

  const handleTimeToggle = async (which, checked) => {
    if (which === 1) {
      setTime1Enabled(checked)
      await saveSchedule({ time1Enabled: checked })
    } else {
      setTime2Enabled(checked)
      await saveSchedule({ time2Enabled: checked })
    }
  }

  const handleTimeChange = async (timeStr, which) => {
    if (which === 1) {
      setTime1(timeStr)
      await saveSchedule({ time1: timeStr })
    } else {
      setTime2(timeStr)
      await saveSchedule({ time2: timeStr })
    }
  }

  return (
    <div style={{ padding: '0 4px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={4} style={{ margin: 0 }}>获取当前用量</Title>
        <Space>
          {!running ? (
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={handleStart}
            >
              开始获取
            </Button>
          ) : (
            <Button
              danger
              icon={<StopOutlined />}
              onClick={handleStop}
            >
              停止
            </Button>
          )}
        </Space>
      </div>

      {/* 定时配置 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <ClockCircleOutlined />
            <Text strong>每日定时采集</Text>
            <Switch
              checked={scheduleEnabled}
              onChange={handleScheduleToggle}
              size="small"
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Switch
              checked={time1Enabled}
              onChange={(checked) => handleTimeToggle(1, checked)}
              size="small"
              disabled={!scheduleEnabled}
            />
            <TimePicker
              value={dayjs(time1, 'HH:mm')}
              format="HH:mm"
              onChange={(_, timeStr) => handleTimeChange(timeStr, 1)}
              size="small"
              disabled={!scheduleEnabled || !time1Enabled}
              allowClear={false}
            />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Switch
              checked={time2Enabled}
              onChange={(checked) => handleTimeToggle(2, checked)}
              size="small"
              disabled={!scheduleEnabled}
            />
            <TimePicker
              value={dayjs(time2, 'HH:mm')}
              format="HH:mm"
              onChange={(_, timeStr) => handleTimeChange(timeStr, 2)}
              size="small"
              disabled={!scheduleEnabled || !time2Enabled}
              allowClear={false}
            />
          </div>
          <Text type="secondary" style={{ fontSize: 12 }}>
            （本地北京时间，每分钟检查一次）
          </Text>
        </div>
      </Card>

      {/* 执行日志 */}
      <div
        ref={logContainerRef}
        style={{
          background: '#1e1e1e',
          color: '#d4d4d4',
          padding: 12,
          borderRadius: 4,
          minHeight: 300,
          maxHeight: 500,
          overflow: 'auto',
          fontFamily: 'Consolas, monospace',
          fontSize: 12,
          lineHeight: '20px'
        }}
      >
        {logs.length === 0 ? (
          <Text style={{ color: '#666' }}>等待执行...</Text>
        ) : (
          logs.map((log, i) => (
            <div
              key={i}
              style={{
                color: log.type === 'error' ? '#ff6b6b'
                  : log.type === 'success' ? '#51cf66'
                  : '#d4d4d4'
              }}
            >
              <span style={{ color: '#666' }}>[{log.time}]</span> {log.message}
            </div>
          ))
        )}
      </div>
    </div>
  )
}

export default ClaudeUsagePage
