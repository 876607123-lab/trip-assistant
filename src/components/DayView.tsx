import { useState } from 'react'
import {
  type AppData, type Trip, type Expense, type Transport, EXPENSE_CATS, INCOME_CATS, TRANSPORT_META,
  fmtMoney, parseDate, WEEK_CN, todayStr, store,
} from '../lib/model'

interface Props {
  data: AppData
  date: string
  onBack: () => void
  onOpenBooking: (id: string) => void
}

function TripForm({ date, onDone }: { date: string; onDone: () => void }) {
  const [time, setTime] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [transport, setTransport] = useState<Transport>('train')
  const [no, setNo] = useState('')
  const [note, setNote] = useState('')

  const submit = () => {
    if (!from.trim() || !to.trim()) return alert('请填写出发地和目的地')
    store.addTrip({ date, time: time || undefined, from: from.trim(), to: to.trim(), transport, no: no.trim() || undefined, note: note.trim() || undefined })
    setFrom(''); setTo(''); setNo(''); setNote(''); setTime('')
    onDone()
  }

  return (
    <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 space-y-2">
      <div className="flex gap-2">
        <input type="time" value={time} onChange={(e) => setTime(e.target.value)}
          className="w-24 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm" />
        <input placeholder="出发地" value={from} onChange={(e) => setFrom(e.target.value)}
          className="flex-1 min-w-0 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm" />
        <span className="self-center text-slate-400">→</span>
        <input placeholder="目的地" value={to} onChange={(e) => setTo(e.target.value)}
          className="flex-1 min-w-0 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm" />
      </div>
      <div className="flex gap-2">
        <div className="flex rounded-lg overflow-hidden border border-slate-300 dark:border-slate-600 text-sm">
          {(Object.keys(TRANSPORT_META) as Transport[]).map((k) => (
            <button key={k} onClick={() => setTransport(k)}
              className={`px-2 py-1.5 ${transport === k ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-900'}`}>
              {TRANSPORT_META[k].icon}
            </button>
          ))}
        </div>
        <input placeholder="班次（选填）" value={no} onChange={(e) => setNo(e.target.value)}
          className="flex-1 min-w-0 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm" />
      </div>
      <input placeholder="备注（选填）" value={note} onChange={(e) => setNote(e.target.value)}
        className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm" />
      <button onClick={submit} className="w-full py-2 rounded-lg bg-blue-600 text-white text-sm font-medium active:scale-[0.98]">添加行程</button>
    </div>
  )
}

function ExpenseForm({ date, onDone }: { date: string; onDone: () => void }) {
  const [type, setType] = useState<'expense' | 'income'>('expense')
  const [cat, setCat] = useState(EXPENSE_CATS[0])
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')

  const cats = type === 'expense' ? EXPENSE_CATS : INCOME_CATS

  const submit = () => {
    const n = parseFloat(amount)
    if (!n || n <= 0) return alert('请填写金额')
    store.addExpense({ date, type, category: cat, amount: n, note: note.trim() || undefined })
    setAmount(''); setNote('')
    onDone()
  }

  return (
    <div className="bg-slate-50 dark:bg-slate-800/60 rounded-xl p-3 space-y-2">
      <div className="flex gap-2">
        <div className="flex rounded-lg overflow-hidden border border-slate-300 dark:border-slate-600 text-sm shrink-0">
          <button onClick={() => { setType('expense'); setCat(EXPENSE_CATS[0]) }}
            className={`px-3 py-1.5 ${type === 'expense' ? 'bg-red-500 text-white' : 'bg-white dark:bg-slate-900'}`}>支出</button>
          <button onClick={() => { setType('income'); setCat(INCOME_CATS[0]) }}
            className={`px-3 py-1.5 ${type === 'income' ? 'bg-green-600 text-white' : 'bg-white dark:bg-slate-900'}`}>收入</button>
        </div>
        <select value={cat} onChange={(e) => setCat(e.target.value)}
          className="flex-1 min-w-0 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm">
          {cats.map((c) => <option key={c}>{c}</option>)}
        </select>
        <input placeholder="金额" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)}
          className="w-24 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm" />
      </div>
      <input placeholder="备注（选填）" value={note} onChange={(e) => setNote(e.target.value)}
        className="w-full rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 px-2 py-1.5 text-sm" />
      <button onClick={submit} className={`w-full py-2 rounded-lg text-white text-sm font-medium active:scale-[0.98] ${type === 'expense' ? 'bg-red-500' : 'bg-green-600'}`}>
        记一笔
      </button>
    </div>
  )
}

export default function DayView({ data, date, onBack, onOpenBooking }: Props) {
  const [showTripForm, setShowTripForm] = useState(false)
  const [showExpForm, setShowExpForm] = useState(false)

  const d = parseDate(date)
  const trips = data.trips.filter((t) => t.date === date).sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))
  const expenses = data.expenses.filter((e) => e.date === date)
  const bks = data.bookings.filter((b) => b.start <= date && b.end >= date)

  const out = expenses.filter((e) => e.type === 'expense').reduce((s, e) => s + e.amount, 0)
  const inc = expenses.filter((e) => e.type === 'income').reduce((s, e) => s + e.amount, 0)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={onBack} className="text-blue-600 text-sm font-medium active:scale-95">← 日历</button>
        <h2 className="font-bold text-lg">
          {d.getMonth() + 1}月{d.getDate()}日 星期{WEEK_CN[d.getDay()]}
          {date === todayStr() && <span className="ml-2 text-xs text-blue-600 font-normal">今天</span>}
        </h2>
      </div>

      {/* 所属档期标签 */}
      {bks.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {bks.map((b) => (
            <button key={b.id} onClick={() => onOpenBooking(b.id)}
              className="text-xs text-white rounded-full px-3 py-1 active:scale-95"
              style={{ backgroundColor: b.color }}>
              📌 {b.name} · 第{Math.round((parseDate(date).getTime() - parseDate(b.start).getTime()) / 86400000) + 1}天
            </button>
          ))}
        </div>
      )}

      {/* 行程 */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-sm text-slate-500 dark:text-slate-400">当日行程（{trips.length}）</h3>
          <button onClick={() => setShowTripForm(!showTripForm)} className="text-blue-600 text-sm active:scale-95">
            {showTripForm ? '收起' : '＋ 添加'}
          </button>
        </div>
        {showTripForm && <TripForm date={date} onDone={() => setShowTripForm(false)} />}
        <div className="space-y-2 mt-2">
          {trips.length === 0 && !showTripForm && <div className="text-sm text-slate-400 text-center py-3">暂无行程</div>}
          {trips.map((t: Trip) => (
            <div key={t.id} className="group flex items-center gap-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5">
              <span className={`text-xs rounded-md px-1.5 py-0.5 ${TRANSPORT_META[t.transport].cls}`}>{TRANSPORT_META[t.transport].icon}{TRANSPORT_META[t.transport].label}</span>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">
                  {t.time && <span className="text-slate-400 mr-1">{t.time}</span>}
                  {t.from ? `${t.from} → ${t.to}` : `→ ${t.to}`}
                  {t.no && <span className="ml-1 text-xs text-slate-400">{t.no}</span>}
                </div>
                {t.note && <div className="text-xs text-slate-400 truncate">{t.note}</div>}
              </div>
              <button onClick={() => { if (confirm('删除这条行程？')) store.removeTrip(t.id) }}
                className="text-slate-300 hover:text-red-500 text-lg px-1">🗑</button>
            </div>
          ))}
        </div>
      </section>

      {/* 收支 */}
      <section>
        <div className="flex items-center justify-between mb-2">
          <h3 className="font-semibold text-sm text-slate-500 dark:text-slate-400">当日收支（{expenses.length}）</h3>
          <button onClick={() => setShowExpForm(!showExpForm)} className="text-blue-600 text-sm active:scale-95">
            {showExpForm ? '收起' : '＋ 记一笔'}
          </button>
        </div>
        {showExpForm && <ExpenseForm date={date} onDone={() => setShowExpForm(false)} />}
        <div className="space-y-2 mt-2">
          {expenses.length === 0 && !showExpForm && <div className="text-sm text-slate-400 text-center py-3">暂无账目</div>}
          {expenses.map((e: Expense) => (
            <div key={e.id} className="flex items-center gap-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 px-3 py-2.5">
              <span className={`text-xs rounded-md px-1.5 py-0.5 ${e.type === 'expense' ? 'bg-red-100 text-red-600 dark:bg-red-900/40' : 'bg-green-100 text-green-700 dark:bg-green-900/40'}`}>
                {e.category}
              </span>
              <div className="flex-1 min-w-0 text-xs text-slate-400 truncate">{e.note}</div>
              <span className={`text-sm font-semibold ${e.type === 'expense' ? 'text-red-500' : 'text-green-600'}`}>
                {e.type === 'expense' ? '-' : '+'}{fmtMoney(e.amount)}
              </span>
              <button onClick={() => { if (confirm('删除这笔账目？')) store.removeExpense(e.id) }}
                className="text-slate-300 hover:text-red-500 text-lg px-1">🗑</button>
            </div>
          ))}
        </div>
      </section>

      {/* 当日汇总 */}
      <section className="bg-slate-100 dark:bg-slate-800 rounded-xl p-4 grid grid-cols-4 text-center">
        <div><div className="text-lg font-bold">{trips.length}</div><div className="text-xs text-slate-400">行程</div></div>
        <div><div className="text-lg font-bold text-red-500">{fmtMoney(out)}</div><div className="text-xs text-slate-400">支出</div></div>
        <div><div className="text-lg font-bold text-green-600">{fmtMoney(inc)}</div><div className="text-xs text-slate-400">收入</div></div>
        <div>
          <div className={`text-lg font-bold ${inc - out >= 0 ? 'text-green-600' : 'text-red-500'}`}>
            {inc - out >= 0 ? '+' : ''}{fmtMoney(inc - out)}
          </div>
          <div className="text-xs text-slate-400">结余</div>
        </div>
      </section>
    </div>
  )
}
