import { useEffect, useRef, useState } from 'react'
import { type ParseResult, type ParsedEvent, parseCommand } from '../lib/parser'
import { store, dayDiff, fmtMoney } from '../lib/model'
import { AsrHelper, asrAvailable, speak } from '../lib/speech'

interface Props { onClose: () => void; onApplied: (bookingId?: string) => void }

type Stage =
  | { step: 'input' }
  | { step: 'preview'; result: ParseResult; removed: Set<number>; removedExp: Set<number>; name: string }
  | { step: 'confirmDelete'; tripId: string; label: string }
  | { step: 'confirmModify'; expenseId: string; label: string; newAmount: number }

export default function VoiceSheet({ onClose, onApplied }: Props) {
  const [text, setText] = useState('')
  const [listening, setListening] = useState(false)
  const [status, setStatus] = useState('点麦克风说话，或直接打字。例如：「15号到17号去杭州拍摄，高铁380，拍摄报酬5000」')
  const [stage, setStage] = useState<Stage>({ step: 'input' })
  const asrRef = useRef<AsrHelper | null>(null)

  useEffect(() => {
    asrRef.current = new AsrHelper({
      onText: (t) => { setText(t); setListening(false); handleText(t) },
      onPartial: (t) => setStatus('识别中：' + t),
      onError: (m) => { setStatus(m); setListening(false) },
      onEnd: () => setListening(false),
    })
    return () => asrRef.current?.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const toggleMic = () => {
    if (listening) { asrRef.current?.stop(); setListening(false); return }
    setListening(true)
    setStatus('请说行程…')
    asrRef.current?.start()
  }

  // ---------- 指令处理 ----------
  const handleText = (raw?: string) => {
    const t = (raw ?? text).trim()
    if (!t) return
    const cmd = parseCommand(t)
    if (cmd.kind === 'delete') {
      const data = store.getData()
      const cands = data.trips.filter((tr) =>
        (!cmd.date || tr.date === cmd.date) &&
        (!cmd.keyword || (tr.from + tr.to + (tr.note ?? '')).includes(cmd.keyword)))
      if (cands.length === 0) { setStatus('没找到匹配的行程，请说具体一点，比如「删除14号去大理」'); speak('没找到匹配的行程'); return }
      const tr = cands[0]
      setStage({ step: 'confirmDelete', tripId: tr.id, label: `${tr.date} ${tr.from}→${tr.to}` })
      speak(`找到行程${tr.date}，从${tr.from || '出发地'}到${tr.to}，确认删除吗`)
      return
    }
    if (cmd.kind === 'modify') {
      const data = store.getData()
      const cands = data.expenses.filter((e) =>
        (!cmd.date || e.date === cmd.date) &&
        (!cmd.category || e.category === cmd.category) &&
        (!cmd.keyword || (e.note ?? '').includes(cmd.keyword)))
      if (cands.length === 0) { setStatus('没找到要修改的账目'); speak('没找到要修改的账目'); return }
      const e = cands[0]
      setStage({ step: 'confirmModify', expenseId: e.id, label: `${e.date} ${e.category}`, newAmount: cmd.newAmount })
      speak(`找到${e.category}${e.amount}元，确认改成${cmd.newAmount}元吗`)
      return
    }
    // create
    const r = cmd.result
    if (r.events.length === 0) {
      setStatus('没听懂行程。请这样说：「14号去大理，高铁。15、16号拍摄」')
      speak('没听懂，请再说一次')
      return
    }
    openPreview(r)
  }

  const openPreview = (r: ParseResult) => {
    // 档期名：优先 地点+动作（如「大理拍摄」）
    const loc = r.events.find((e) => e.location)?.location
    const act = r.events.find((e) => e.kind === 'action')
    const actTitle = act?.title.replace(/（.*?）/, '')
    const name = actTitle ? (loc && !actTitle.includes(loc) ? loc + actTitle : actTitle)
      : loc ? loc + '之行' : '新档期'
    setStage({ step: 'preview', result: r, removed: new Set(), removedExp: new Set(), name })
    const totalIn = r.expenses.filter((e) => e.type === 'income').reduce((s, e) => s + e.amount, 0)
    const totalOut = r.expenses.filter((e) => e.type === 'expense').reduce((s, e) => s + e.amount, 0)
    speak(`识别到${r.events.length}个行程${r.expenses.length ? `，支出${totalOut}元，收入${totalIn}元` : ''}，请确认`)
  }

  // ---------- 确认写入 ----------
  const apply = (st: Extract<Stage, { step: 'preview' }>) => {
    const evs = st.result.events.filter((_, i) => !st.removed.has(i))
    const exps = st.result.expenses.filter((_, i) => !st.removedExp.has(i))
    if (evs.length === 0) return

    const start = evs.map((e) => e.startDate).sort()[0]
    const end = evs.map((e) => e.endDate).sort().reverse()[0]
    const span = dayDiff(start, end) + 1
    const hasAction = evs.some((e) => e.kind === 'action')

    let bookingId: string | undefined
    // 跨天或含活动 → 创建档期
    if (span > 1 || hasAction) {
      const plans: { id: string; day: number; time?: string; content: string }[] = []
      evs.forEach((e) => {
        const d1 = dayDiff(start, e.startDate) + 1
        const n = dayDiff(e.startDate, e.endDate)
        for (let i = 0; i <= n; i++) {
          plans.push({
            id: Math.random().toString(36).slice(2, 9),
            day: d1 + i,
            time: i === 0 ? e.time : undefined,
            content: e.title.replace(/（.*?）/, ''),
          })
        }
      })
      const b = store.addBooking({ name: st.name || '新档期', start, end, note: st.result.rawText, plans })
      bookingId = b.id
    }
    // 去/回 → 行程
    let home: string | undefined
    for (const e of evs) {
      if (e.kind === 'go' || e.kind === 'back') {
        const to = e.location ?? e.title.replace(/^[去回]|（.*?）/g, '')
        const from = e.kind === 'go' ? (home ?? '') : (evs.find((x) => x.kind === 'go')?.location ?? '')
        if (e.kind === 'go' && !home) home = undefined // 去程不知道出发地，留空
        for (let d = e.startDate; ; ) {
          store.addTrip({
            date: d, time: e.time, from, to,
            transport: e.transport ?? 'other', note: e.note,
          })
          if (d >= e.endDate) break
          const nd = new Date(d); nd.setDate(nd.getDate() + 1)
          d = nd.toISOString().slice(0, 10)
        }
      }
    }
    for (const ex of exps) {
      store.addExpense({
        date: ex.date ?? start, type: ex.type, category: ex.category, amount: ex.amount, note: ex.note,
      })
    }
    const totalIn = exps.filter((e) => e.type === 'income').reduce((s, e) => s + e.amount, 0)
    const totalOut = exps.filter((e) => e.type === 'expense').reduce((s, e) => s + e.amount, 0)
    speak(`已添加${bookingId ? '档期' : ''}${st.name || ''}，共${evs.length}个行程。支出${totalOut}元，收入${totalIn}元。`)
    onApplied(bookingId)
  }

  const doDelete = (st: Extract<Stage, { step: 'confirmDelete' }>) => {
    store.removeTrip(st.tripId)
    speak('已删除')
    onApplied()
  }

  const doModify = (st: Extract<Stage, { step: 'confirmModify' }>) => {
    store.updateExpense(st.expenseId, { amount: st.newAmount })
    speak(`已改成${st.newAmount}元`)
    onApplied()
  }

  // ---------- 渲染 ----------
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={onClose}>
      <div className="w-full sm:max-w-md bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl max-h-[85vh] overflow-y-auto p-4 space-y-3"
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="font-bold">🎙 语音行程助手</h3>
          <button onClick={onClose} className="text-slate-400 text-xl px-2">×</button>
        </div>

        <div className="text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 rounded-lg p-2.5">{status}</div>

        {stage.step === 'input' && (
          <>
            <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3}
              placeholder="也可以直接打字，例如：下周二去深圳开会，酒店260元"
              className="w-full rounded-xl border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-3 py-2 text-sm" />
            <div className="flex gap-2">
              <button onClick={toggleMic}
                className={`flex-1 py-3 rounded-xl text-sm font-medium text-white active:scale-[0.98] ${listening ? 'bg-red-500 animate-pulse' : 'bg-blue-600'}`}>
                {listening ? '⏹ 停止' : '🎙 ' + (asrAvailable() ? '按住说话' : '语音识别不可用')}
              </button>
              <button onClick={() => handleText()}
                className="flex-1 py-3 rounded-xl bg-emerald-600 text-white text-sm font-medium active:scale-[0.98]">
                识别并生成
              </button>
            </div>
            <details className="text-xs text-slate-400">
              <summary className="cursor-pointer">能听懂什么？</summary>
              <ul className="mt-1 space-y-1 list-disc pl-4">
                <li>「14去大理高铁。1516拍摄，17回广州，高铁380，返程420，拍摄收入5000」</li>
                <li>「下周二去深圳开会，酒店260元」</li>
                <li>「5号下午3点和客户面谈，打车80元」</li>
                <li>「把14号去大理的行程删掉」「把17号车票改成450元」</li>
              </ul>
            </details>
          </>
        )}

        {stage.step === 'preview' && (
          <PreviewPanel stage={stage} setStage={setStage} onApply={() => apply(stage)} />
        )}

        {stage.step === 'confirmDelete' && (
          <div className="space-y-3">
            <div className="text-sm">确认删除行程：<b>{stage.label}</b>？</div>
            <div className="flex gap-2">
              <button onClick={() => doDelete(stage)} className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-medium">确认删除</button>
              <button onClick={() => setStage({ step: 'input' })} className="flex-1 py-2.5 rounded-xl bg-slate-200 dark:bg-slate-700 text-sm">取消</button>
            </div>
          </div>
        )}

        {stage.step === 'confirmModify' && (
          <div className="space-y-3">
            <div className="text-sm">确认把 <b>{stage.label}</b> 改成 <b className="text-red-500">{fmtMoney(stage.newAmount)}</b>？</div>
            <div className="flex gap-2">
              <button onClick={() => doModify(stage)} className="flex-1 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-medium">确认修改</button>
              <button onClick={() => setStage({ step: 'input' })} className="flex-1 py-2.5 rounded-xl bg-slate-200 dark:bg-slate-700 text-sm">取消</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function PreviewPanel({ stage, setStage, onApply }: {
  stage: Extract<Stage, { step: 'preview' }>
  setStage: (s: Stage) => void
  onApply: () => void
}) {
  const { result, removed, removedExp, name } = stage
  const evs = result.events.map((e, i) => ({ e, i })).filter(({ i }) => !removed.has(i))
  const exps = result.expenses.map((e, i) => ({ e, i })).filter(({ i }) => !removedExp.has(i))
  const totalOut = exps.filter((x) => x.e.type === 'expense').reduce((s, x) => s + x.e.amount, 0)
  const totalIn = exps.filter((x) => x.e.type === 'income').reduce((s, x) => s + x.e.amount, 0)

  const rmEv = (i: number) => { const s = new Set(removed); s.add(i); setStage({ ...stage, removed: s }) }
  const rmEx = (i: number) => { const s = new Set(removedExp); s.add(i); setStage({ ...stage, removedExp: s }) }

  return (
    <div className="space-y-3">
      <div>
        <label className="text-xs text-slate-400">档期名称（可改）</label>
        <input value={name} onChange={(e) => setStage({ ...stage, name: e.target.value })}
          className="w-full mt-1 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 px-2 py-1.5 text-sm" />
      </div>
      <div>
        <label className="text-xs text-slate-400">识别到的行程（点 × 删除识别错的）</label>
        <div className="mt-1 space-y-1.5">
          {evs.map(({ e, i }) => <EventRow key={i} e={e} onRemove={() => rmEv(i)} />)}
          {evs.length === 0 && <div className="text-xs text-slate-400">已删空，无法创建</div>}
        </div>
      </div>
      {exps.length > 0 && (
        <div>
          <label className="text-xs text-slate-400">识别到的收支</label>
          <div className="mt-1 space-y-1.5">
            {exps.map(({ e, i }) => (
              <div key={i} className="flex items-center gap-2 text-sm bg-slate-50 dark:bg-slate-800 rounded-lg px-2.5 py-1.5">
                <span className={e.type === 'income' ? 'text-green-600' : 'text-red-500'}>
                  {e.type === 'income' ? '收' : '支'} {e.category} {fmtMoney(e.amount)}
                </span>
                <span className="text-xs text-slate-400 flex-1 truncate">{e.date ?? '日期待定'}</span>
                <button onClick={() => rmEx(i)} className="text-slate-300 hover:text-red-500">×</button>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="text-xs text-slate-400">
        合计：支出 {fmtMoney(totalOut)} · 收入 {fmtMoney(totalIn)} · 净{totalIn - totalOut >= 0 ? '盈' : '亏'} {fmtMoney(Math.abs(totalIn - totalOut))}
      </div>
      <div className="flex gap-2">
        <button onClick={onApply} disabled={evs.length === 0}
          className="flex-1 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-medium disabled:opacity-40">✓ 确认创建</button>
        <button onClick={() => setStage({ step: 'input' })} className="flex-1 py-2.5 rounded-xl bg-slate-200 dark:bg-slate-700 text-sm">返回重说</button>
      </div>
    </div>
  )
}

function EventRow({ e, onRemove }: { e: ParsedEvent; onRemove: () => void }) {
  return (
    <div className="flex items-center gap-2 text-sm bg-slate-50 dark:bg-slate-800 rounded-lg px-2.5 py-1.5">
      <span className="shrink-0">{e.kind === 'go' ? '🛫' : e.kind === 'back' ? '🛬' : '🎬'}</span>
      <span className="flex-1 min-w-0 truncate">
        {e.startDate === e.endDate ? e.startDate : `${e.startDate} ~ ${e.endDate}`}
        {e.time ? ' ' + e.time : ''} {e.title}
      </span>
      <button onClick={onRemove} className="text-slate-300 hover:text-red-500">×</button>
    </div>
  )
}
