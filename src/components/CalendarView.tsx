import { useMemo } from 'react'
import { type AppData, type Booking, WEEK_CN, bookingDays, fmtDate, fmtMoney, parseDate, todayStr, TRANSPORT_META, dayDiff } from '../lib/model'

interface Props {
  data: AppData
  month: Date                      // 当前显示月份（任意一天）
  onMonthChange: (d: Date) => void
  onOpenDay: (date: string) => void
  onOpenBooking: (id: string) => void
  onNewBooking: () => void
}

export default function CalendarView({ data, month, onMonthChange, onOpenDay, onOpenBooking, onNewBooking }: Props) {
  const today = todayStr()

  const y = month.getFullYear(), mo = month.getMonth()
  const first = new Date(y, mo, 1)
  const startOffset = first.getDay()          // 周日开头
  const daysInMonth = new Date(y, mo + 1, 0).getDate()

  const byDate = useMemo(() => {
    const trips = new Map<string, typeof data.trips>()
    const money = new Map<string, { out: number; in: number }>()
    for (const t of data.trips) {
      const arr = trips.get(t.date) ?? []; arr.push(t); trips.set(t.date, arr)
    }
    for (const e of data.expenses) {
      const m = money.get(e.date) ?? { out: 0, in: 0 }
      if (e.type === 'expense') m.out += e.amount; else m.in += e.amount
      money.set(e.date, m)
    }
    return { trips, money }
  }, [data])

  const bookingOfDay = useMemo(() => {
    const map = new Map<string, Booking[]>()
    for (const b of data.bookings) for (const d of bookingDays(b)) {
      const arr = map.get(d) ?? []; arr.push(b); map.set(d, arr)
    }
    return map
  }, [data.bookings])

  // 月统计
  const stats = useMemo(() => {
    const prefix = `${y}-${String(mo + 1).padStart(2, '0')}`
    let plane = 0, train = 0, out = 0, inc = 0
    for (const t of data.trips) if (t.date.startsWith(prefix)) {
      if (t.transport === 'plane') plane++
      if (t.transport === 'train') train++
    }
    for (const e of data.expenses) if (e.date.startsWith(prefix)) {
      if (e.type === 'expense') out += e.amount; else inc += e.amount
    }
    const bks = data.bookings.filter((b) => b.start.startsWith(prefix) || b.end.startsWith(prefix)).length
    return { plane, train, out, inc, bks, total: plane + train + data.trips.filter((t) => t.date.startsWith(prefix) && t.transport !== 'plane' && t.transport !== 'train').length }
  }, [data, y, mo])

  const shift = (n: number) => onMonthChange(new Date(y, mo + n, 1))

  const cells: (string | null)[] = []
  for (let i = 0; i < startOffset; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(fmtDate(new Date(y, mo, d)))

  // 点日期格进当日页；点档期色条进档期页

  return (
    <div>
      {/* 月份切换 + 统计 */}
      <div className="flex items-center justify-between px-1">
        <button onClick={() => shift(-1)} className="w-9 h-9 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 text-lg">‹</button>
        <div className="text-center">
          <button onClick={() => onMonthChange(new Date())} className="font-bold text-lg hover:text-blue-600">
            {y}年{mo + 1}月
          </button>
        </div>
        <button onClick={() => shift(1)} className="w-9 h-9 rounded-full hover:bg-slate-200 dark:hover:bg-slate-700 text-lg">›</button>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 px-2 text-xs text-slate-500 dark:text-slate-400">
        <span>✈️{stats.plane} 🚄{stats.train} · 档期{stats.bks}个</span>
        <span className="text-red-500">支 {fmtMoney(stats.out)}</span>
        <span className="text-green-600">收 {fmtMoney(stats.inc)}</span>
        <span className={stats.inc - stats.out >= 0 ? 'text-green-600 font-semibold' : 'text-red-500 font-semibold'}>
          盈亏 {stats.inc - stats.out >= 0 ? '+' : ''}{fmtMoney(stats.inc - stats.out)}
        </span>
        <button onClick={onNewBooking} className="ml-auto text-blue-600 font-medium active:scale-95">＋标记档期</button>
      </div>

      {/* 星期头 */}
      <div className="grid grid-cols-7 mt-2 text-center text-xs text-slate-400">
        {WEEK_CN.map((w) => <div key={w} className="py-1">{w}</div>)}
      </div>

      {/* 日期格 */}
      <div className="grid grid-cols-7 gap-px bg-slate-200 dark:bg-slate-700 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
        {cells.map((date, i) => {
          if (!date) return <div key={i} className="bg-white dark:bg-slate-900 min-h-[72px]" />
          const trips = byDate.trips.get(date) ?? []
          const money = byDate.money.get(date)
          const bks = bookingOfDay.get(date) ?? []
          const isToday = date === today
          const dayNum = parseDate(date).getDate()
          return (
            <div
              key={date}
              onClick={() => onOpenDay(date)}
              className={`bg-white dark:bg-slate-900 min-h-[72px] p-0.5 cursor-pointer active:bg-blue-50 dark:active:bg-slate-800 flex flex-col ${isToday ? 'ring-2 ring-inset ring-blue-500' : ''}`}
            >
              <div className={`text-xs text-center leading-5 w-5 h-5 mx-auto rounded-full ${isToday ? 'bg-blue-600 text-white font-bold' : 'text-slate-600 dark:text-slate-300'}`}>
                {dayNum}
              </div>
              {/* 档期色条 */}
              {bks.slice(0, 2).map((b) => (
                <div
                  key={b.id}
                  onClick={(e) => { e.stopPropagation(); onOpenBooking(b.id) }}
                  className="h-3.5 rounded-sm text-[9px] leading-3.5 text-white truncate px-0.5 mb-px"
                  style={{ backgroundColor: b.color }}
                >
                  {b.start === date ? b.name : dayDiff(b.start, date) > 0 ? '' : b.name}
                </div>
              ))}
              {/* 行程小标签 */}
              {trips.slice(0, bks.length ? 1 : 2).map((t) => (
                <div key={t.id} className={`text-[9px] leading-4 truncate rounded-sm px-0.5 mb-px ${TRANSPORT_META[t.transport].cls}`}>
                  {TRANSPORT_META[t.transport].icon}{t.from ? `${t.from}→${t.to}` : t.to}
                </div>
              ))}
              {trips.length > (bks.length ? 1 : 2) && (
                <div className="text-[9px] text-slate-400">+{trips.length - (bks.length ? 1 : 2)}</div>
              )}
              {/* 当日迷你金额 */}
              {money && (money.out > 0 || money.in > 0) && (
                <div className="mt-auto text-[9px] leading-3 text-slate-400 truncate">
                  {money.out > 0 && <span className="text-red-400">支{Math.round(money.out)}</span>}
                  {money.out > 0 && money.in > 0 && ' '}
                  {money.in > 0 && <span className="text-green-500">收{Math.round(money.in)}</span>}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <div className="text-xs text-slate-400 mt-1.5 px-2">点日期进当日页 · 点彩色档期条进档期详情</div>
    </div>
  )
}
