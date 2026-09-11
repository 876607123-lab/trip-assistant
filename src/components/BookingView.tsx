import { useState } from 'react'
import {
  type AppData, type Booking, bookingDays, dayDiff, fmtMoney, parseDate, store,
  TRANSPORT_META, WEEK_CN,
} from '../lib/model'

interface Props {
  data: AppData
  booking: Booking
  onBack: () => void
  onOpenDay: (date: string) => void
}

export default function BookingView({ data, booking, onBack, onOpenDay }: Props) {
  const [planText, setPlanText] = useState('')
  const [planDay, setPlanDay] = useState(1)
  const [planTime, setPlanTime] = useState('')
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(booking.name)
  const [start, setStart] = useState(booking.start)
  const [end, setEnd] = useState(booking.end)
  const [note, setNote] = useState(booking.note ?? '')

  const days = bookingDays(booking)
  const totalDays = dayDiff(booking.start, booking.end) + 1

  // 自动识别：档期内所有行程和收支
  const inTrips = data.trips.filter((t) => t.date >= booking.start && t.date <= booking.end)
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time ?? '').localeCompare(b.time ?? ''))
  const inExpenses = data.expenses.filter((e) => e.date >= booking.start && e.date <= booking.end)
    .sort((a, b) => a.date.localeCompare(b.date))

  const out = inExpenses.filter((e) => e.type === 'expense').reduce((s, e) => s + e.amount, 0)
  const inc = inExpenses.filter((e) => e.type === 'income').reduce((s, e) => s + e.amount, 0)

  const addPlan = () => {
    if (!planText.trim()) return
    const plans = [...booking.plans, { id: Math.random().toString(36).slice(2, 9), day: planDay, time: planTime || undefined, content: planText.trim() }]
    plans.sort((a, b) => a.day - b.day || (a.time ?? '').localeCompare(b.time ?? ''))
    store.updateBooking(booking.id, { plans })
    setPlanText(''); setPlanTime('')
  }

  const saveEdit = () => {
    if (!name.trim() || !start || !end) return
    store.updateBooking(booking.id, { name: name.trim(), start, end: end < start ? start : end, note: note.trim() || undefined })
    setEditing(false)
  }

  const del = () => {
    if (confirm(`删除档期「${booking.name}」？行程安排会一并删除，行程和账目保留。`)) {
      store.removeBooking(booking.id)
      onBack()
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="text-blue-600 text-sm font-medium active:scale-95">← 日历</button>
        <h2 className="font-bold text-lg flex-1 truncate" style={{ color: booking.color }}>📌 {booking.name}</h2>
        <button onClick={() => setEditing(!editing)} className="text-sm text-slate-400 active:scale-95">{editing ? '取消' : '编辑'}</button>
        <button onClick={del} className="text-sm text-red-400 active:scale-95">删除</button>
      </div>

      <div className="text-sm text-slate-500 dark:text-slate-400">
        {booking.start} ~ {booking.end} · 共{totalDays}天
        {booking.note && <span className="ml-2">{booking.note}</span>}
      </div>

      {editing && (
        <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 space-y-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="档期名称"
            className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm" />
          <div className="flex gap-2">
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)}
              className="flex-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm" />
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)}
              className="flex-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm" />
          </div>
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="备注（选填）"
            className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm" />
          <button onClick={saveEdit} className="w-full py-2 rounded-lg bg-blue-600 text-white text-sm font-medium">保存修改</button>
        </div>
      )}

      {/* 档期每日速览 */}
      <section>
        <h3 className="font-semibold text-sm text-slate-500 dark:text-slate-400 mb-2">每日速览（点日期进当日页）</h3>
        <div className="flex flex-wrap gap-1.5">
          {days.map((d, i) => {
            const pd = parseDate(d)
            return (
              <button key={d} onClick={() => onOpenDay(d)}
                className="rounded-lg px-2.5 py-1.5 text-xs text-white active:scale-95"
                style={{ backgroundColor: booking.color }}>
                第{i + 1}天 {pd.getMonth() + 1}/{pd.getDate()} 周{WEEK_CN[pd.getDay()]}
              </button>
            )
          })}
        </div>
      </section>

      {/* 行程安排 */}
      <section>
        <h3 className="font-semibold text-sm text-slate-500 dark:text-slate-400 mb-2">行程安排（{booking.plans.length}）</h3>
        <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 space-y-2 mb-2">
          <div className="flex gap-2">
            <select value={planDay} onChange={(e) => setPlanDay(+e.target.value)}
              className="rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm">
              {Array.from({ length: totalDays }, (_, i) => <option key={i + 1} value={i + 1}>第{i + 1}天</option>)}
            </select>
            <input type="time" value={planTime} onChange={(e) => setPlanTime(e.target.value)}
              className="w-24 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm" />
            <input value={planText} onChange={(e) => setPlanText(e.target.value)} placeholder="安排内容，如：正式拍摄"
              className="flex-1 min-w-0 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm" />
          </div>
          <button onClick={addPlan} className="w-full py-2 rounded-lg text-white text-sm font-medium active:scale-[0.98]" style={{ backgroundColor: booking.color }}>添加安排</button>
        </div>
        <div className="space-y-1.5">
          {booking.plans.map((p) => (
            <div key={p.id} className="flex items-center gap-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2">
              <span className="text-xs rounded-md px-1.5 py-0.5 text-white shrink-0" style={{ backgroundColor: booking.color }}>第{p.day}天</span>
              {p.time && <span className="text-xs text-slate-400 shrink-0">{p.time}</span>}
              <span className="flex-1 min-w-0 text-sm truncate">{p.content}</span>
              <button onClick={() => store.updateBooking(booking.id, { plans: booking.plans.filter((x) => x.id !== p.id) })}
                className="text-slate-300 hover:text-red-500 px-1">🗑</button>
            </div>
          ))}
        </div>
      </section>

      {/* 档期内行程（自动识别） */}
      <section>
        <h3 className="font-semibold text-sm text-slate-500 dark:text-slate-400 mb-2">档期内行程 · 自动识别（{inTrips.length}）</h3>
        <div className="space-y-1.5">
          {inTrips.length === 0 && <div className="text-sm text-slate-400 text-center py-2">档期内暂无行程，去当日页添加</div>}
          {inTrips.map((t) => (
            <div key={t.id} className="flex items-center gap-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm">
              <span className={`text-xs rounded-md px-1.5 py-0.5 ${TRANSPORT_META[t.transport].cls}`}>{TRANSPORT_META[t.transport].icon}</span>
              <span className="text-xs text-slate-400 shrink-0">{t.date.slice(5)}</span>
              <span className="flex-1 min-w-0 truncate">{t.from} → {t.to}{t.no ? ` ${t.no}` : ''}</span>
            </div>
          ))}
        </div>
      </section>

      {/* 档期内收支（自动识别） */}
      <section>
        <h3 className="font-semibold text-sm text-slate-500 dark:text-slate-400 mb-2">档期内收支 · 自动识别（{inExpenses.length}）</h3>
        <div className="space-y-1.5">
          {inExpenses.length === 0 && <div className="text-sm text-slate-400 text-center py-2">档期内暂无账目</div>}
          {inExpenses.map((e) => (
            <div key={e.id} className="flex items-center gap-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2 text-sm">
              <span className="text-xs text-slate-400 shrink-0">{e.date.slice(5)}</span>
              <span className={`text-xs rounded-md px-1.5 py-0.5 ${e.type === 'expense' ? 'bg-red-100 text-red-600 dark:bg-red-900/40' : 'bg-green-100 text-green-700 dark:bg-green-900/40'}`}>{e.category}</span>
              <span className="flex-1 min-w-0 text-xs text-slate-400 truncate">{e.note}</span>
              <span className={`font-semibold ${e.type === 'expense' ? 'text-red-500' : 'text-green-600'}`}>
                {e.type === 'expense' ? '-' : '+'}{fmtMoney(e.amount)}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* 档期汇总 */}
      <section className="rounded-xl p-4 grid grid-cols-4 text-center text-white" style={{ backgroundColor: booking.color }}>
        <div><div className="text-lg font-bold">{inTrips.length}</div><div className="text-xs opacity-80">行程</div></div>
        <div><div className="text-lg font-bold">{fmtMoney(out)}</div><div className="text-xs opacity-80">总支出</div></div>
        <div><div className="text-lg font-bold">{fmtMoney(inc)}</div><div className="text-xs opacity-80">总收入</div></div>
        <div>
          <div className="text-lg font-bold">{inc - out >= 0 ? '+' : ''}{fmtMoney(inc - out)}</div>
          <div className="text-xs opacity-80">档期结余</div>
        </div>
      </section>
    </div>
  )
}
