import { useEffect, useState } from 'react'
import { store } from '../lib/model'
import { downloadICS } from '../lib/notify'
import {
  asrAvailable, ttsAvailable, isTtsEnabled, setTtsEnabled,
  notifyAvailable, notifyPermission, requestNotifyPermission,
} from '../lib/speech'

interface Props { onClose: () => void; onMsg: (m: string) => void }

interface PermState { mic: string; notify: string }

export default function SettingsSheet({ onClose, onMsg }: Props) {
  const [perm, setPerm] = useState<PermState>({ mic: 'unknown', notify: notifyPermission() })
  const [tts, setTts] = useState(isTtsEnabled())

  useEffect(() => {
    // 查询麦克风权限状态（不触发弹窗）
    try {
      navigator.permissions?.query({ name: 'microphone' as PermissionName })
        .then((r) => {
          setPerm((p) => ({ ...p, mic: r.state }))
          r.onchange = () => setPerm((p) => ({ ...p, mic: r.state }))
        })
        .catch(() => {})
    } catch { /* ignore */ }
  }, [])

  const requestMic = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((t) => t.stop())
      setPerm((p) => ({ ...p, mic: 'granted' }))
      onMsg('麦克风已授权')
    } catch {
      setPerm((p) => ({ ...p, mic: 'denied' }))
      onMsg('麦克风被拒绝：请在浏览器地址栏左侧站点设置里允许麦克风')
    }
  }

  const requestNotify = async () => {
    const r = await requestNotifyPermission()
    setPerm((p) => ({ ...p, notify: r }))
    onMsg(r === 'granted' ? '通知已授权，行程会提前 1 天提醒' : '通知未授权')
  }

  const exportData = () => {
    const blob = new Blob([store.exportJSON()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `出差助手备份_${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
    onMsg('备份文件已下载')
  }

  const importData = (mode: 'merge' | 'overwrite') => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = '.json'
    input.onchange = async () => {
      const f = input.files?.[0]
      if (!f) return
      try {
        onMsg(store.importJSON(await f.text(), mode))
      } catch {
        onMsg('导入失败：文件格式不对')
      }
    }
    input.click()
  }

  const dot = (s: string) =>
    s === 'granted' ? '🟢' : s === 'denied' ? '🔴' : s === 'unsupported' ? '⚪' : '🟡'
  const label = (s: string) =>
    s === 'granted' ? '已授权' : s === 'denied' ? '被拒绝' : s === 'prompt' ? '未询问' : s === 'unsupported' ? '不支持' : '未知'

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl max-h-[85vh] overflow-y-auto p-4 space-y-4"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold">⚙️ 授权中心</h3>
          <button onClick={onClose} className="text-slate-400 text-xl px-2">×</button>
        </div>

        {/* 权限列表 */}
        <section className="space-y-2">
          <PermRow icon="🎙" name="麦克风" desc="语音输入行程用" state={dot(perm.mic) + ' ' + label(perm.mic)}
            action={perm.mic !== 'granted' ? { text: '开启', fn: requestMic } : undefined} />
          <PermRow icon="🔔" name="通知提醒" desc="行程提前 1 天提醒" state={dot(perm.notify) + ' ' + label(perm.notify)}
            action={perm.notify !== 'granted' && notifyAvailable() ? { text: '开启', fn: requestNotify } : undefined} />
          <PermRow icon="🗣" name="语音识别" desc="浏览器内置语音转文字"
            state={asrAvailable() ? '🟢 可用' : '⚪ 不支持（可打字）'} />
          <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800 rounded-xl px-3 py-2.5">
            <span className="text-lg">📢</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">语音播报</div>
              <div className="text-xs text-slate-400">{ttsAvailable() ? '识别结果自动朗读' : '当前浏览器不支持'}</div>
            </div>
            {ttsAvailable() && (
              <button onClick={() => { setTts(!tts); setTtsEnabled(!tts) }}
                className={`w-11 h-6 rounded-full transition-colors relative ${tts ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-600'}`}>
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${tts ? 'left-[22px]' : 'left-0.5'}`} />
              </button>
            )}
          </div>
        </section>

        {/* 系统日历 */}
        <section className="space-y-2">
          <h4 className="text-xs font-semibold text-slate-400">系统日历</h4>
          <button onClick={() => { downloadICS(store.getData()); onMsg('已生成日历文件，用华为日历打开即可导入') }}
            className="w-full flex items-center gap-3 bg-slate-50 dark:bg-slate-800 rounded-xl px-3 py-2.5 text-left active:scale-[0.99]">
            <span className="text-lg">📅</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium">导出到手机日历（.ics）</div>
              <div className="text-xs text-slate-400">全部行程+档期生成日历文件，华为/苹果日历均可导入</div>
            </div>
            <span className="text-blue-600 text-sm">导出</span>
          </button>
        </section>

        {/* 数据备份 */}
        <section className="space-y-2">
          <h4 className="text-xs font-semibold text-slate-400">数据备份</h4>
          <div className="grid grid-cols-3 gap-2">
            <button onClick={exportData} className="py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium active:scale-[0.98]">导出备份</button>
            <button onClick={() => importData('merge')} className="py-2.5 rounded-xl bg-slate-200 dark:bg-slate-700 text-sm active:scale-[0.98]">导入·合并</button>
            <button onClick={() => { if (confirm('覆盖导入会清空现有数据，确定？')) importData('overwrite') }}
              className="py-2.5 rounded-xl bg-slate-200 dark:bg-slate-700 text-sm active:scale-[0.98]">导入·覆盖</button>
          </div>
        </section>

        {/* 手机使用提示 */}
        <section className="text-xs text-slate-400 bg-amber-50 dark:bg-amber-900/20 rounded-xl p-3 space-y-1">
          <div className="font-semibold text-amber-600 dark:text-amber-400">📱 华为/鸿蒙手机使用提示</div>
          <div>· 用 Chrome 或华为浏览器打开本页面，菜单选「添加到主屏幕」，即可像 App 一样使用</div>
          <div>· 语音识别需要联网；若不可用请直接打字，识别引擎相同</div>
          <div>· 通知提醒在 App 页面打开或挂后台时有效；省电/超级省电模式下系统可能冻结提醒</div>
          <div>· 数据保存在本机浏览器，建议定期「导出备份」防止清缓存丢失</div>
        </section>
      </div>
    </div>
  )
}

function PermRow({ icon, name, desc, state, action }: {
  icon: string; name: string; desc: string; state: string
  action?: { text: string; fn: () => void }
}) {
  return (
    <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-800 rounded-xl px-3 py-2.5">
      <span className="text-lg">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium">{name}</div>
        <div className="text-xs text-slate-400">{desc} · {state}</div>
      </div>
      {action && (
        <button onClick={action.fn} className="text-sm text-blue-600 font-medium px-2 py-1 active:scale-95">{action.text}</button>
      )}
    </div>
  )
}
