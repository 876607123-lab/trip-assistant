// ===== 数据模型与本地存储 =====
// 数据保存在浏览器 localStorage，支持导出/导入 JSON 备份

export type Transport = 'plane' | 'train' | 'car' | 'other'

export interface Trip {
  id: string
  date: string          // yyyy-MM-dd
  time?: string         // HH:mm
  from: string
  to: string
  transport: Transport
  no?: string           // 班次号 如 G7511 / CA1831
  note?: string
}

export type MoneyType = 'expense' | 'income'

export interface Expense {
  id: string
  date: string          // yyyy-MM-dd
  type: MoneyType
  category: string
  amount: number
  note?: string
}

export interface BookingPlan {
  id: string
  day: number           // 档期第几天（从1开始）
  time?: string
  content: string
}

export interface Booking {
  id: string
  name: string
  start: string         // yyyy-MM-dd
  end: string
  color: string
  note?: string
  plans: BookingPlan[]
}

export interface AppData {
  trips: Trip[]
  expenses: Expense[]
  bookings: Booking[]
}

export const EXPENSE_CATS = ['交通费', '住宿费', '餐饮费', '市内交通', '其他支出']
export const INCOME_CATS = ['差旅报销', '出差补贴', '拍摄报酬', '其他收入']

export const TRANSPORT_META: Record<Transport, { label: string; icon: string; cls: string }> = {
  plane: { label: '飞机', icon: '✈️', cls: 'bg-sky-100 text-sky-700 dark:bg-sky-900/50 dark:text-sky-300' },
  train: { label: '高铁', icon: '🚄', cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300' },
  car:   { label: '自驾', icon: '🚗', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300' },
  other: { label: '其他', icon: '📌', cls: 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300' },
}

export const BOOKING_COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316']

export const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36)

export const todayStr = () => fmtDate(new Date())

export function fmtDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function parseDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function addDays(s: string, n: number): string {
  const d = parseDate(s)
  d.setDate(d.getDate() + n)
  return fmtDate(d)
}

export function dayDiff(a: string, b: string): number {
  return Math.round((parseDate(b).getTime() - parseDate(a).getTime()) / 86400000)
}

/** 档期包含的所有日期 */
export function bookingDays(b: Booking): string[] {
  const out: string[] = []
  const n = dayDiff(b.start, b.end)
  for (let i = 0; i <= n; i++) out.push(addDays(b.start, i))
  return out
}

export const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六']

export function fmtMoney(n: number): string {
  return '¥' + n.toLocaleString('zh-CN', { maximumFractionDigits: 2 })
}

// ---------- Store ----------

const KEY = 'trip-app-v1'

function load(): AppData {
  try {
    const raw = localStorage.getItem(KEY)
    if (raw) {
      const d = JSON.parse(raw)
      return { trips: d.trips ?? [], expenses: d.expenses ?? [], bookings: d.bookings ?? [] }
    }
  } catch { /* ignore */ }
  return { trips: [], expenses: [], bookings: [] }
}

type Listener = () => void

class Store {
  data: AppData = load()
  private listeners = new Set<Listener>()

  subscribe = (fn: Listener) => {
    this.listeners.add(fn)
    return () => { this.listeners.delete(fn) }
  }

  getData = () => this.data

  private emit() {
    localStorage.setItem(KEY, JSON.stringify(this.data))
    this.listeners.forEach((f) => f())
  }

  setData(d: AppData) { this.data = d; this.emit() }

  addTrip(t: Omit<Trip, 'id'>) { this.data.trips.push({ ...t, id: uid() }); this.emit() }
  updateTrip(id: string, patch: Partial<Trip>) {
    const t = this.data.trips.find((x) => x.id === id)
    if (t) Object.assign(t, patch)
    this.emit()
  }
  removeTrip(id: string) { this.data.trips = this.data.trips.filter((x) => x.id !== id); this.emit() }

  addExpense(e: Omit<Expense, 'id'>) { this.data.expenses.push({ ...e, id: uid() }); this.emit() }
  updateExpense(id: string, patch: Partial<Expense>) {
    const e = this.data.expenses.find((x) => x.id === id)
    if (e) Object.assign(e, patch)
    this.emit()
  }
  removeExpense(id: string) { this.data.expenses = this.data.expenses.filter((x) => x.id !== id); this.emit() }

  addBooking(b: Omit<Booking, 'id' | 'color'>): Booking {
    const color = BOOKING_COLORS[this.data.bookings.length % BOOKING_COLORS.length]
    const nb: Booking = { ...b, id: uid(), color }
    this.data.bookings.push(nb)
    this.emit()
    return nb
  }
  updateBooking(id: string, patch: Partial<Booking>) {
    const b = this.data.bookings.find((x) => x.id === id)
    if (b) Object.assign(b, patch)
    this.emit()
  }
  removeBooking(id: string) { this.data.bookings = this.data.bookings.filter((x) => x.id !== id); this.emit() }

  /** 导出备份 JSON */
  exportJSON(): string {
    return JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), ...this.data }, null, 2)
  }

  /** 导入备份；mode: merge 合并 / overwrite 覆盖 */
  importJSON(text: string, mode: 'merge' | 'overwrite'): string {
    const d = JSON.parse(text)
    const trips: Trip[] = Array.isArray(d.trips) ? d.trips : []
    const expenses: Expense[] = Array.isArray(d.expenses) ? d.expenses : []
    const bookings: Booking[] = Array.isArray(d.bookings) ? d.bookings : []
    if (mode === 'overwrite') {
      this.data = { trips, expenses, bookings }
    } else {
      const tids = new Set(this.data.trips.map((t) => t.id))
      const eids = new Set(this.data.expenses.map((e) => e.id))
      const bids = new Set(this.data.bookings.map((b) => b.id))
      this.data.trips.push(...trips.filter((t) => !tids.has(t.id)))
      this.data.expenses.push(...expenses.filter((e) => !eids.has(e.id)))
      this.data.bookings.push(...bookings.filter((b) => !bids.has(b.id)))
    }
    this.emit()
    return `导入成功：行程 ${trips.length} 条，账目 ${expenses.length} 条，档期 ${bookings.length} 个`
  }
}

export const store = new Store()
