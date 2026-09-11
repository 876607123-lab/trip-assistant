// ===== 中文口语行程 NLP 解析器（纯函数，可测试）=====
// 移植自与 AI 交流确定的 Kotlin TripParser / CommandParser 逻辑
// 支持：数字日期(14=本月14号)、粘连多天(1516)、X月Y到Z号、今天/明天/下周三、
//       下午3点/15:30、高铁/飞机/自驾、金额(数字+元/中文数字)、收入支出区分、语序颠倒

export type PTransport = 'train' | 'plane' | 'car' | 'other'

export interface ParsedEvent {
  title: string
  startDate: string      // yyyy-MM-dd
  endDate: string
  time?: string          // HH:mm
  location?: string
  transport?: PTransport
  kind: 'go' | 'back' | 'action'   // 去程 / 返程 / 活动
  note: string
}

export interface ParsedExpense {
  date?: string
  category: string
  type: 'expense' | 'income'
  amount: number
  note: string
}

export interface ParseResult {
  events: ParsedEvent[]
  expenses: ParsedExpense[]
  rawText: string
}

const KW_ACTION = ['拍摄', '摄影', '跟拍', '旅拍', '婚礼', '开会', '会议', '展会', '会展',
  '活动', '出差', '培训', '直播', '探店', '演出', '杀青', '面谈', '见面', '约谈', '拜访']
const KW_INCOME = ['酬劳', '报酬', '收入', '补贴', '报销', '工资', '结款', '尾款']
const KW_MONEY_CTX = ['元', '块', '高铁', '动车', '火车', '机票', '航班', '车票', '住', '酒店',
  '民宿', '餐', '饭', '酬劳', '报酬', '补贴', '报销', '收入', '结款', '油费', '过路费', '打车', '返程']
const KW_RETURN = ['回', '返', '返程', '回来']

// ---------- 日期工具 ----------

const p2 = (n: number) => String(n).padStart(2, '0')
const toStr = (d: Date) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`

/** “14”=本月14号；若已过，顺延下个月 */
function dayInMonth(day: number, base: Date): Date {
  const d = new Date(base.getFullYear(), base.getMonth(), Math.min(Math.max(day, 1), 28))
  if (toStr(d) < toStr(base)) d.setMonth(d.getMonth() + 1)
  return d
}

interface DT { start: Date; end: Date; time?: string }

/** 从子句提取日期（及时间），识别不到返回 null */
function extractDT(cl: string, base: Date): DT | null {
  // a) 粘连数字开头 "1516拍摄"
  let m = /^(\d{2})(\d{2})(?=\D|$)/.exec(cl)
  if (m) {
    const d1 = dayInMonth(+m[1], base), d2 = dayInMonth(+m[2], base)
    return toStr(d2) < toStr(d1) ? { start: d2, end: d1 } : { start: d1, end: d2 }
  }
  // b) X月Y号到Z号
  m = /(\d{1,2})月(\d{1,2})(?:号|日)?[到至-](\d{1,2})(?:号|日)?/.exec(cl)
  if (m) {
    const mo = +m[1]
    const y = mo < base.getMonth() + 1 ? base.getFullYear() + 1 : base.getFullYear()
    return { start: new Date(y, mo - 1, +m[2]), end: new Date(y, mo - 1, +m[3]) }
  }
  // b2) X号到Z号（同月范围）
  m = /(?<![\d:.])(\d{1,2})(?:号|日)[到至-](\d{1,2})(?:号|日)(?![\d:.])/.exec(cl)
  if (m) {
    const d1 = dayInMonth(+m[1], base), d2 = dayInMonth(+m[2], base)
    const time = extractTime(cl)
    return { start: d1, end: d2, time }
  }
  // c) 今天/明天/后天/大后天
  const rel = ['今天', '明天', '后天', '大后天'].find((w) => cl.includes(w))
  if (rel) {
    const d = new Date(base)
    d.setDate(d.getDate() + (rel === '今天' ? 0 : rel === '明天' ? 1 : rel === '后天' ? 2 : 3))
    return { start: d, end: d, time: extractTime(cl) }
  }
  // d) (下周)周X/星期X
  m = /(下周)?(?:周|星期)([一二三四五六日天])/.exec(cl)
  if (m) {
    const target = '一二三四五六日天'.indexOf(m[2]) + 1 // 1..7
    const cur = base.getDay() === 0 ? 7 : base.getDay()
    let diff = (target - cur + 7) % 7
    if (diff === 0) diff = 7
    const d = new Date(base)
    d.setDate(d.getDate() + diff)
    return { start: d, end: d, time: extractTime(cl) }
  }
  // e) 单日期 "14" "14号"（排除金额 3 位以上、时间 HH:MM）
  m = /(?<![\d:.])(\d{1,2})(?:号|日)?(?![\d:.])/.exec(cl)
  if (m) {
    const d = dayInMonth(+m[1], base)
    return { start: d, end: d, time: extractTime(cl) }
  }
  return null
}

/** 下午3点 / 上午9点半 / 15:30 → HH:mm */
function extractTime(cl: string): string | undefined {
  const m = /(早上|上午|中午|下午|晚上|夜里)?(\d{1,2})(?:[:：](\d{2}))?点/.exec(cl)
  if (m) {
    let h = +m[2]
    const ap = m[1]
    if ((ap === '下午' || ap === '晚上' || ap === '夜里') && h < 12) h += 12
    if (ap === '中午' && h < 12) h = 12
    return `${p2(h)}:${p2(m[3] ? +m[3] : 0)}`
  }
  const m2 = /(?<!\d)([01]?\d|2[0-3])[:：]([0-5]\d)/.exec(cl)
  if (m2) return `${p2(+m2[1])}:${m2[2]}`
  return undefined
}

/** 公共：从任意文本里抠一个日期（CommandParser 用） */
export function parseDateIn(text: string, base: Date = new Date()): string | null {
  const dt = extractDT(text.replace(/\s/g, ''), base)
  return dt ? toStr(dt.start) : null
}

// ---------- 中文数字金额 ----------

const CN: Record<string, number> = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 }

function cnMoney(s: string): number | null {
  if (/^\d+$/.test(s)) return +s
  let total = 0, cur = 0
  for (const c of s) {
    if (c in CN) cur = CN[c]
    else if (c === '十') { cur = cur === 0 ? 10 : cur * 10; total += cur; cur = 0 }
    else if (c === '百') { total += (cur === 0 ? 1 : cur) * 100; cur = 0 }
    else if (c === '千') { total += (cur === 0 ? 1 : cur) * 1000; cur = 0 }
  }
  total += cur
  return total > 0 ? total : null
}

// ---------- 主解析 ----------

function normalize(s: string): string {
  return s.replace(/[呃嗯]/g, '').replace(/那个|就是/g, '').replace(/\s/g, '')
}

/** “15、16拍摄” 合并为 “1516拍摄” */
function protectDateList(clause: string): string[] {
  const merged = clause.replace(/(?<=\d)[、，,和跟与\s]+(?=\d{1,2}(?:\D|$))/g, '')
  return merged.split('、').map((s) => s.trim()).filter(Boolean)
}

function transportOf(cl: string): PTransport | undefined {
  if (/高铁|动车|火车/.test(cl)) return 'train'
  if (/飞机|航班|机票/.test(cl) || (cl.includes('飞') && !cl.includes('高铁'))) return 'plane'
  if (/自驾|开车|驾车/.test(cl)) return 'car'
  return undefined
}

function parseEvent(cl: string, base: Date): ParsedEvent | null {
  const dt = extractDT(cl, base)
  if (!dt) return null
  const transport = transportOf(cl)

  const locM = /[去回飞到在]([一-龥]{2,4}?)(?=[高铁动火飞自驾开会拍影展会出差培训直播面谈]|$)/.exec(cl)
  const location = locM && !KW_ACTION.includes(locM[1]) ? locM[1] : undefined

  const action = KW_ACTION.find((w) => cl.includes(w))
  const isBack = KW_RETURN.some((w) => cl.includes(w)) && !cl.includes('去')
  // 纯日期、没有任何行程信息（如"今天天气真不错"）→ 不算事件
  if (!action && !location && !transport) return null
  let title: string
  if (action && location) title = location + action
  else if (action) title = action
  else if (location) title = (isBack ? '回' : '去') + location
  else title = '行程'
  if (transport) title += '（' + (transport === 'train' ? '高铁' : transport === 'plane' ? '飞机' : '自驾') + '）'

  return {
    title,
    startDate: toStr(dt.start),
    endDate: toStr(dt.end),
    time: dt.time,
    location,
    transport,
    kind: action ? 'action' : isBack ? 'back' : 'go',
    note: '语音输入：' + cl,
  }
}

function parseExpense(cl: string, base: Date, events: ParsedEvent[]): ParsedExpense | null {
  if (!KW_MONEY_CTX.some((w) => cl.includes(w))) return null

  // 数字金额 380 / 380元；中文 八百/一千二
  const numM = /(\d+(?:\.\d+)?)\s*(?:元|块|块钱)/.exec(cl)
  const cnM = /([一二两三四五六七八九十百千]{1,6})(?:元|块|块钱)/.exec(cl)
  // 裸数字：只在句中有明确钱上下文且数字不是日期时（如"高铁380"）
  const bareM = /(?:高铁|动车|火车|机票|航班|车票|打车|酒店|住宿|房费|餐费|酬劳|报酬|补贴|报销|收入|结款|尾款|返程?)(\d+(?:\.\d+)?)(?![\d:.号日])/.exec(cl)
  // 裸中文金额：紧跟钱关键词且不带"元"（如"机票八百"）
  const bareCnM = /(?:机票|航班|车票|高铁|动车|火车|打车|酒店|住宿|房费|餐费|酬劳|报酬|补贴|报销|收入|结款|尾款)([一二两三四五六七八九十百千]{2,6})(?![\d一二两三四五六七八九十百千])/.exec(cl)
  let amount: number | null = null
  if (numM) amount = +numM[1]
  else if (cnM) amount = cnMoney(cnM[1])
  else if (bareM) amount = +bareM[1]
  else if (bareCnM) amount = cnMoney(bareCnM[1])
  if (amount == null || amount <= 0) return null

  const isIncome = KW_INCOME.some((w) => cl.includes(w))
  const category =
    isIncome && /拍摄|摄影|跟拍/.test(cl) ? '拍摄报酬'
    : isIncome && cl.includes('报销') ? '差旅报销'
    : isIncome && cl.includes('补贴') ? '出差补贴'
    : isIncome ? '其他收入'
    : /高铁|动车|火车|机票|航班|车票|打车|出租车|滴滴|油费|过路费|返程|回程|返京|返沪/.test(cl) ? '交通费'
    : /住|酒店|民宿/.test(cl) ? '住宿费'
    : /餐|饭/.test(cl) ? '餐饮费'
    : '其他支出'

  // 归属日期：句内日期 > 地点匹配 > 动作匹配（拍摄收入→拍摄那天）> 回/去 匹配 > 首个事件
  const inDate = extractDT(cl, base)?.start
  let date: string | undefined = inDate ? toStr(inDate) : undefined
  if (!date) {
    const byLoc = events.find((e) => e.location && cl.includes(e.location))
    const byAct = events.find((e) => e.kind === 'action' &&
      KW_ACTION.some((a) => cl.includes(a) && e.title.includes(a)))
    if (byLoc) date = byLoc.startDate
    else if (byAct) date = byAct.startDate
    else if (KW_RETURN.some((w) => cl.includes(w))) date = events[events.length - 1]?.startDate
    else date = events[0]?.startDate
  }
  return { date, category, type: isIncome ? 'income' : 'expense', amount, note: cl }
}

export function parseTrip(text: string, base: Date = new Date()): ParseResult {
  const t = normalize(text)
  const clauses = t.split(/[。，,；;！!？?\n]/)
    .map((s) => s.trim()).filter(Boolean)
    .flatMap(protectDateList).filter(Boolean)

  const events: ParsedEvent[] = []
  for (const cl of clauses) {
    const ev = parseEvent(cl, base)
    if (ev) events.push(ev)
  }
  // 无日期、无金额、含动作词的小句 → 并进最近的行程标题
  for (const cl of clauses) {
    if (extractDT(cl, base)) continue
    if (KW_MONEY_CTX.some((w) => cl.includes(w)) && /\d/.test(cl)) continue
    const act = KW_ACTION.find((w) => cl.includes(w))
    if (!act) continue
    let idx = events.findIndex((e) => e.location && cl.includes(e.location))
    if (idx < 0) idx = 0
    if (events[idx] && !events[idx].title.includes(act)) {
      events[idx].title = events[idx].title.replace(/（/, `·${act}（`)
      if (!events[idx].title.includes(act)) events[idx].title += '·' + act
    }
  }
  const expenses: ParsedExpense[] = []
  for (const cl of clauses) {
    const ex = parseExpense(cl, base, events)
    if (ex) expenses.push(ex)
  }
  const seen = new Set<string>()
  return {
    events: events.filter((e) => {
      const k = e.title + e.startDate
      if (seen.has(k)) return false
      seen.add(k); return true
    }),
    expenses,
    rawText: text,
  }
}

// ---------- 语音指令分诊：创建 / 删除 / 修改 ----------

export type VoiceCommand =
  | { kind: 'create'; result: ParseResult }
  | { kind: 'delete'; date?: string; keyword?: string }
  | { kind: 'modify'; date?: string; keyword?: string; category?: string; newAmount: number }

export function parseCommand(text: string, base: Date = new Date()): VoiceCommand {
  const t = text.replace(/\s/g, '')
  const date = parseDateIn(t, base) ?? undefined
  const keyword = /[去回]([一-龥]{2,4}?)(?=的|行程|车票|机票|$)/.exec(t)?.[1] ?? KW_ACTION.find((w) => t.includes(w))

  if (t.includes('删') || t.includes('取消')) {
    return { kind: 'delete', date, keyword }
  }
  const mm = /改成|改为|修改为|调整到/.exec(t)
  if (mm) {
    const after = t.slice(mm.index + mm[0].length)
    const num = /(\d+(?:\.\d+)?)/.exec(after)?.[1]
    if (num) {
      const category = /车票|高铁|机票|火车|打车/.test(t) ? '交通费'
        : /酒店|住宿|房费/.test(t) ? '住宿费'
        : /餐|饭/.test(t) ? '餐饮费'
        : /酬劳|报酬/.test(t) ? '拍摄报酬' : undefined
      return { kind: 'modify', date, keyword, category, newAmount: +num }
    }
  }
  return { kind: 'create', result: parseTrip(text, base) }
}
