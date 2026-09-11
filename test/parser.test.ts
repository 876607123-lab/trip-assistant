// 解析器单元测试：用文档里的 3 个测试句子 + 指令用例
import { parseTrip, parseCommand } from '../src/lib/parser'

const base = new Date(2026, 8, 11) // 2026-09-11 周五
let pass = 0, fail = 0
function eq(actual: unknown, expect: unknown, label: string) {
  const ok = JSON.stringify(actual) === JSON.stringify(expect)
  if (ok) { pass++; console.log('  ✓', label) }
  else { fail++; console.log('  ✗', label, '| 期望', JSON.stringify(expect), '实际', JSON.stringify(actual)) }
}

console.log('案例1：14去大理高铁。1516拍摄，17回广州，高铁380，返程420，拍摄收入5000')
const r1 = parseTrip('14去大理高铁。1516拍摄，17回广州，高铁380，返程420，拍摄收入5000', base)
eq(r1.events.length, 3, '3个事件')
eq(r1.events[0].startDate, '2026-09-14', '14号去大理')
eq(r1.events[0].transport, 'train', '高铁')
eq(r1.events[1].startDate, '2026-09-15', '15开始拍摄')
eq(r1.events[1].endDate, '2026-09-16', '16结束拍摄')
eq(r1.events[2].kind, 'back', '17号是返程')
eq(r1.expenses.length, 3, '3笔账')
eq(r1.expenses[0].amount, 380, '高铁380')
eq(r1.expenses[0].date, '2026-09-14', '380挂14号')
eq(r1.expenses[1].amount, 420, '返程420')
eq(r1.expenses[1].date, '2026-09-17', '420挂17号')
eq(r1.expenses[2].type, 'income', '5000是收入')
eq(r1.expenses[2].category, '拍摄报酬', '拍摄报酬类别')

console.log('案例2：下周二去深圳，开会，酒店260元')
const r2 = parseTrip('下周二去深圳，开会，酒店260元', base)
eq(r2.events.length, 1, '1个事件')
eq(r2.events[0].startDate, '2026-09-15', '下周二=9/15')
eq(r2.events[0].title.includes('开会'), true, '标题含开会')
eq(r2.expenses[0]?.category, '住宿费', '住宿费')
eq(r2.expenses[0]?.amount, 260, '260元')
eq(r2.expenses[0]?.date, '2026-09-15', '挂在9/15')

console.log('案例3：5号下午3点和客户面谈，打车80元')
const r3 = parseTrip('5号下午3点和客户面谈，打车80元', base)
eq(r3.events[0].startDate, '2026-10-05', '9/5已过→10/5')
eq(r3.events[0].time, '15:00', '下午3点=15:00')
eq(r3.expenses[0]?.category, '交通费', '打车→交通费')
eq(r3.expenses[0]?.amount, 80, '80元')

console.log('指令：删除')
const c1 = parseCommand('把14号去大理的行程删掉', base)
eq(c1.kind, 'delete', '删除指令')
eq(c1.kind === 'delete' && c1.date, '2026-09-14', '删除日期14号')
eq(c1.kind === 'delete' && c1.keyword, '大理', '删除关键词大理')

console.log('指令：改价')
const c2 = parseCommand('把17号回广州的车票价格改成450元', base)
eq(c2.kind, 'modify', '修改指令')
eq(c2.kind === 'modify' && c2.newAmount, 450, '改成450')
eq(c2.kind === 'modify' && c2.category, '交通费', '车票→交通费')

console.log('边界：垃圾输入')
eq(parseTrip('今天天气真不错', base).events.length, 0, '无事件')

console.log('边界：中文数字金额')
const r4 = parseTrip('明天飞北京，机票八百', base)
eq(r4.events[0]?.startDate, '2026-09-12', '明天')
eq(r4.events[0]?.transport, 'plane', '飞→飞机')
eq(r4.expenses[0]?.amount, 800, '八百=800')

console.log(`\n结果：${pass} 通过，${fail} 失败`)
if (fail > 0) process.exit(1)
