// ===== 系统日历导出（ICS）与本地提醒调度 =====
// ICS：生成标准 .ics 文件，手机上下载后可直接导入华为自带日历
// 提醒：App 打开期间用 setTimeout 调度系统通知（提前 1 天 09:00）

import { type AppData, type Booking, type Trip, parseDate, fmtDate, addDays, dayDiff } from './model'
import { showNotification } from './speech'

function icsDate(s: string): string { return s.replace(/-/g, '') }

function icsEscape(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n')
}

/** 生成全部行程 + 档期的 ICS 内容 */
export function buildICS(data: AppData): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//TripAssistant//CN', 'CALSCALE:GREGORIAN',
  ]
  const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'

  for (const t of data.trips) {
    const title = `${t.from}→${t.to}${t.transport === 'plane' ? '（飞机）' : t.transport === 'train' ? '（高铁）' : t.transport === 'car' ? '（自驾）' : ''}`
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:trip-${t.id}@tripapp`)
    lines.push(`DTSTAMP:${stamp}`)
    if (t.time) {
      lines.push(`DTSTART:${icsDate(t.date)}T${t.time.replace(':', '')}00`)
      lines.push(`DTEND:${icsDate(t.date)}T${String((+t.time.slice(0, 2) + 1) % 24).padStart(2, '0')}${t.time.slice(3).replace(':', '')}00`)
    } else {
      lines.push(`DTSTART;VALUE=DATE:${icsDate(t.date)}`)
      lines.push(`DTEND;VALUE=DATE:${icsDate(addDays(t.date, 1))}`)
    }
    lines.push(`SUMMARY:${icsEscape(title)}`)
    lines.push(`LOCATION:${icsEscape(t.to)}`)
    lines.push(`DESCRIPTION:${icsEscape([t.no ? '班次 ' + t.no : '', t.note ?? ''].filter(Boolean).join(' '))}`)
    lines.push('END:VEVENT')
  }
  for (const b of data.bookings) {
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:booking-${b.id}@tripapp`)
    lines.push(`DTSTAMP:${stamp}`)
    lines.push(`DTSTART;VALUE=DATE:${icsDate(b.start)}`)
    lines.push(`DTEND;VALUE=DATE:${icsDate(addDays(b.end, 1))}`)
    lines.push(`SUMMARY:${icsEscape('📌 ' + b.name)}`)
    const planText = b.plans.map((p) => `第${p.day}天${p.time ? ' ' + p.time : ''} ${p.content}`).join('\\n')
    lines.push(`DESCRIPTION:${icsEscape((b.note ? b.note + '\\n' : '') + planText)}`)
    lines.push('END:VEVENT')
  }
  lines.push('END:VCALENDAR')
  return lines.join('\r\n')
}

export function downloadICS(data: AppData) {
  const blob = new Blob(['﻿' + buildICS(data)], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = '行程日历.ics'
  a.click()
  URL.revokeObjectURL(url)
}

// ---------- 提醒调度 ----------

const timers: number[] = []
const NOTIFIED_KEY = 'trip-app-notified'

function notifiedSet(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(NOTIFIED_KEY) ?? '[]')) } catch { return new Set() }
}
function markNotified(id: string) {
  const s = notifiedSet(); s.add(id)
  localStorage.setItem(NOTIFIED_KEY, JSON.stringify([...s].slice(-500)))
}

/** 为即将到来的行程/档期安排系统通知（App 打开期间有效） */
export function scheduleReminders(data: AppData) {
  timers.forEach((t) => clearTimeout(t))
  timers.length = 0
  const notified = notifiedSet()
  const now = Date.now()
  const MAX = 0x7fffffff

  const schedule = (id: string, at: number, title: string, body: string) => {
    const delay = at - now
    if (delay <= 0 || delay > MAX || notified.has(id)) return
    timers.push(window.setTimeout(() => {
      markNotified(id)
      showNotification(title, body)
    }, delay))
  }

  for (const t of data.trips) {
    // 提前 1 天 09:00 提醒
    const d = parseDate(t.date)
    d.setDate(d.getDate() - 1)
    d.setHours(9, 0, 0, 0)
    schedule('trip-' + t.id, d.getTime(), '行程提醒', `明天 ${t.time ?? ''} ${t.from}→${t.to}${t.no ? ' ' + t.no : ''}`)
  }
  for (const b of data.bookings) {
    const d = parseDate(b.start)
    d.setDate(d.getDate() - 1)
    d.setHours(9, 0, 0, 0)
    schedule('booking-' + b.id, d.getTime(), '档期提醒', `明天开始：${b.name}（${b.start} ~ ${b.end}，共${dayDiff(b.start, b.end) + 1}天）`)
  }
}

/** 明天的行程/档期（首页“明日提醒”横幅用） */
export function tomorrowItems(data: AppData): { trips: Trip[]; bookings: Booking[] } {
  const tomorrow = fmtDate((() => { const d = new Date(); d.setDate(d.getDate() + 1); return d })())
  return {
    trips: data.trips.filter((t) => t.date === tomorrow),
    bookings: data.bookings.filter((b) => b.start === tomorrow || (b.start <= tomorrow && b.end >= tomorrow)),
  }
}
