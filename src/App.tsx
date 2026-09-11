import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { store, fmtMoney, todayStr, EXPENSE_CATS, INCOME_CATS } from './lib/model'
import CalendarView from './components/CalendarView'
import DayView from './components/DayView'
import BookingView from './components/BookingView'
import VoiceSheet from './components/VoiceSheet'
import SettingsSheet from './components/SettingsSheet'
import { scheduleReminders, tomorrowItems } from './lib/notify'

type View =
  | { type: 'calendar' }
  | { type: 'day'; date: string }
  | { type: 'booking'; id: string }

function useData() {
  return useSyncExternalStore(store.subscribe, store.getData)
}

/** 实时时钟 */
function Clock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(t)
  }, [])
  const p = (n: number) => String(n).padStart(2, '0')
  return (
    <div className="text-right leading-tight">
      <div className="font-mono font-bold text-lg tabular-nums">{p(now.getHours())}:{p(now.getMinutes())}<span className="text-xs text-slate-400">:{p(now.getSeconds())}</span></div>
      <div className="text-[10px] text-slate-400">{now.getMonth() + 1}月{now.getDate()}日</div>
    </div>
  )
}

/** 新建档期弹窗 */
function NewBookingSheet({ defaultDate, onClose, onCreated }: { defaultDate?: string; onClose: () => void; onCreated: (id: string) => void }) {
  const today = defaultDate ?? todayStr()
  const [name, setName] = useState('')
  const [start, setStart] = useState(today)
  const [end, setEnd] = useState(today)
  const [note, setNote] = useState('')

  const submit = () => {
    if (!name.trim()) return alert('请填写档期名称')
    if (end < start) return alert('结束日期不能早于开始日期')
    const b = store.addBooking({ name: name.trim(), start, end, note: note.trim() || undefined, plans: [] })
    onCreated(b.id)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl p-4 space-y-3"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold">📌 标记档期</h3>
          <button onClick={onClose} className="text-slate-400 text-xl px-2">×</button>
        </div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="档期名称，如：杭州拍摄"
          className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm" />
        <div className="flex gap-2 items-center">
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)}
            className="flex-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-2 text-sm" />
          <span className="text-slate-400 text-sm">至</span>
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)}
            className="flex-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-2 text-sm" />
        </div>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="备注（选填）"
          className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm" />
        <button onClick={submit} className="w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium active:scale-[0.98]">创建档期</button>
      </div>
    </div>
  )
}

/** 底部记账汇总 */
function SummaryPanel({ month }: { month: Date }) {
  const data = useData()
  const prefix = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, '0')}`

  const { outByCat, inByCat, totalOut, totalIn } = useMemo(() => {
    const outByCat = new Map<string, number>(), inByCat = new Map<string, number>()
    let totalOut = 0, totalIn = 0
    for (const e of data.expenses) {
      if (!e.date.startsWith(prefix)) continue
      const map = e.type === 'expense' ? outByCat : inByCat
      map.set(e.category, (map.get(e.category) ?? 0) + e.amount)
      if (e.type === 'expense') totalOut += e.amount; else totalIn += e.amount
    }
    return { outByCat, inByCat, totalOut, totalIn }
  }, [data.expenses, prefix])

  const catOrder = (cats: string[], map: Map<string, number>) =>
    [...cats.filter((c) => map.has(c)), ...[...map.keys()].filter((c) => !cats.includes(c))]
      .map((c) => ({ name: c, value: map.get(c)! }))
      .sort((a, b) => b.value - a.value)

  const CatBars = ({ title, total, items, barCls }: { title: string; total: number; items: { name: string; value: number }[]; barCls: string }) => (
    <div className="flex-1 min-w-0">
      <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-1.5">{title}</div>
      {items.length === 0 && <div className="text-xs text-slate-300 dark:text-slate-600">暂无</div>}
      {items.map((it) => (
        <div key={it.name} className="mb-1.5">
          <div className="flex justify-between text-xs">
            <span>{it.name}</span>
            <span className="text-slate-400">{fmtMoney(it.value)} · {total ? Math.round((it.value / total) * 100) : 0}%</span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-100 dark:bg-slate-700 mt-0.5">
            <div className={`h-full rounded-full ${barCls}`} style={{ width: `${total ? (it.value / total) * 100 : 0}%` }} />
          </div>
        </div>
      ))}
    </div>
  )

  return (
    <section className="mt-5 space-y-3">
      <h3 className="font-semibold text-sm text-slate-500 dark:text-slate-400">📊 {month.getMonth() + 1}月记账汇总</h3>
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-3 text-center">
          <div className="text-red-500 font-bold">{fmtMoney(totalOut)}</div>
          <div className="text-xs text-slate-400">支出合计</div>
        </div>
        <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-3 text-center">
          <div className="text-green-600 font-bold">{fmtMoney(totalIn)}</div>
          <div className="text-xs text-slate-400">收入合计</div>
        </div>
        <div className={`rounded-xl p-3 text-center ${totalIn - totalOut >= 0 ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
          <div className={`font-bold ${totalIn - totalOut >= 0 ? 'text-green-600' : 'text-red-500'}`}>
            {totalIn - totalOut >= 0 ? '+' : ''}{fmtMoney(totalIn - totalOut)}
          </div>
          <div className="text-xs text-slate-400">结余</div>
        </div>
      </div>
      <div className="flex gap-4 bg-white dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 p-3">
        <CatBars title="支出去向" total={totalOut} items={catOrder(EXPENSE_CATS, outByCat)} barCls="bg-red-400" />
        <CatBars title="收入来源" total={totalIn} items={catOrder(INCOME_CATS, inByCat)} barCls="bg-green-500" />
      </div>
    </section>
  )
}

export default function App() {
  const data = useData()
  const [view, setView] = useState<View>({ type: 'calendar' })
  const [month, setMonth] = useState(new Date())
  const [voiceOpen, setVoiceOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [newBookingOpen, setNewBookingOpen] = useState(false)
  const [toast, setToast] = useState('')

  // 数据变化时重排提醒
  useEffect(() => { scheduleReminders(data) }, [data])

  // toast 自动消失
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 3000)
    return () => clearTimeout(t)
  }, [toast])

  // 档期被删除后自动回到日历页
  useEffect(() => {
    if (view.type === 'booking' && !data.bookings.some((b) => b.id === view.id)) {
      setView({ type: 'calendar' })
    }
  }, [view, data.bookings])

  const booking = view.type === 'booking' ? data.bookings.find((b) => b.id === view.id) : undefined
  const tomorrow = useMemo(() => tomorrowItems(data), [data])

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100">
      <div className="max-w-lg mx-auto px-3 pb-10">
        {/* 顶栏 */}
        <header className="flex items-center gap-2 py-3">
          <h1 className="font-bold text-lg">🧳 出差助手</h1>
          <div className="flex-1" />
          <Clock />
          <button onClick={() => setSettingsOpen(true)}
            className="w-9 h-9 rounded-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 active:scale-95">⚙️</button>
          <button onClick={() => setVoiceOpen(true)}
            className="h-9 px-3 rounded-full bg-blue-600 text-white text-sm font-medium active:scale-95">🎙 语音</button>
        </header>

        {/* 明日提醒横幅 */}
        {view.type === 'calendar' && (tomorrow.trips.length > 0 || tomorrow.bookings.length > 0) && (
          <div className="mb-3 rounded-xl bg-blue-50 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-800 px-3 py-2.5 text-sm">
            <span className="font-medium text-blue-700 dark:text-blue-300">🔔 明天：</span>
            {tomorrow.bookings.map((b) => b.name).join('、')}
            {tomorrow.trips.map((t) => `${t.time ? t.time + ' ' : ''}${t.from ? t.from + '→' : ''}${t.to}`).join('；')}
          </div>
        )}

        {/* 主视图 */}
        {view.type === 'calendar' && (
          <>
            <CalendarView
              data={data} month={month} onMonthChange={setMonth}
              onOpenDay={(date) => setView({ type: 'day', date })}
              onOpenBooking={(id) => setView({ type: 'booking', id })}
              onNewBooking={() => setNewBookingOpen(true)}
            />
            <SummaryPanel month={month} />
          </>
        )}
        {view.type === 'day' && (
          <DayView
            data={data} date={view.date}
            onBack={() => setView({ type: 'calendar' })}
            onOpenBooking={(id) => setView({ type: 'booking', id })}
          />
        )}
        {view.type === 'booking' && booking && (
          <BookingView
            data={data} booking={booking}
            onBack={() => setView({ type: 'calendar' })}
            onOpenDay={(date) => setView({ type: 'day', date })}
          />
        )}

        {/* 弹层 */}
        {voiceOpen && (
          <VoiceSheet
            onClose={() => setVoiceOpen(false)}
            onApplied={(bookingId) => {
              setVoiceOpen(false)
              if (bookingId) setView({ type: 'booking', id: bookingId })
              setToast('已保存')
            }}
          />
        )}
        {settingsOpen && <SettingsSheet onClose={() => setSettingsOpen(false)} onMsg={setToast} />}
        {newBookingOpen && (
          <NewBookingSheet
            onClose={() => setNewBookingOpen(false)}
            onCreated={(id) => { setNewBookingOpen(false); setView({ type: 'booking', id }) }}
          />
        )}

        {/* toast */}
        {toast && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-slate-800 text-white text-sm rounded-full px-4 py-2 shadow-lg z-[60]">
            {toast}
          </div>
        )}
      </div>
    </div>
  )
}
