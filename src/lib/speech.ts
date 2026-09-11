// ===== 语音识别（ASR）与语音播报（TTS）=====
// 走浏览器内置 Web Speech API；手机端 Chrome / 华为浏览器效果较好，需要联网

export interface AsrCallbacks {
  onText: (text: string) => void
  onPartial?: (text: string) => void
  onError?: (msg: string) => void
  onEnd?: () => void
}

interface SpeechRecognitionLike {
  lang: string
  interimResults: boolean
  maxAlternatives: number
  continuous: boolean
  start: () => void
  stop: () => void
  abort: () => void
  onresult: ((e: unknown) => void) | null
  onerror: ((e: unknown) => void) | null
  onend: (() => void) | null
}

function getRecognizer(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as Record<string, unknown>
  return (w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null) as (new () => SpeechRecognitionLike) | null
}

export const asrAvailable = () => getRecognizer() !== null

export class AsrHelper {
  private rec: SpeechRecognitionLike | null = null
  private cb: AsrCallbacks

  constructor(cb: AsrCallbacks) { this.cb = cb }

  start() {
    const Ctor = getRecognizer()
    if (!Ctor) { this.cb.onError?.('当前浏览器不支持语音识别，请直接打字输入'); return }
    this.stop()
    const rec = new Ctor()
    rec.lang = 'zh-CN'
    rec.interimResults = true
    rec.maxAlternatives = 1
    rec.continuous = false
    rec.onresult = (e: unknown) => {
      const ev = e as { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }
      let final = '', interim = ''
      for (let i = 0; i < ev.results.length; i++) {
        const r = ev.results[i]
        if (r.isFinal) final += r[0].transcript
        else interim += r[0].transcript
      }
      if (interim) this.cb.onPartial?.(interim)
      if (final) this.cb.onText(final)
    }
    rec.onerror = (e: unknown) => {
      const code = (e as { error?: string }).error ?? ''
      const msg = code === 'not-allowed' ? '麦克风权限被拒绝，请在授权中心开启'
        : code === 'no-speech' ? '没听清，请再说一次'
        : code === 'network' ? '识别需要联网，请检查网络'
        : '识别出错（' + code + '）'
      this.cb.onError?.(msg)
    }
    rec.onend = () => this.cb.onEnd?.()
    this.rec = rec
    try { rec.start() } catch { this.cb.onError?.('无法启动语音识别') }
  }

  stop() { try { this.rec?.stop() } catch { /* ignore */ } }
}

// ---------- TTS ----------

export const ttsAvailable = () => 'speechSynthesis' in window

let ttsEnabled = localStorage.getItem('trip-app-tts') !== 'off'
export const isTtsEnabled = () => ttsEnabled
export function setTtsEnabled(on: boolean) {
  ttsEnabled = on
  localStorage.setItem('trip-app-tts', on ? 'on' : 'off')
}

export function speak(text: string) {
  if (!ttsEnabled || !ttsAvailable()) return
  window.speechSynthesis.cancel()
  const u = new SpeechSynthesisUtterance(text)
  u.lang = 'zh-CN'
  u.rate = 1.05
  window.speechSynthesis.speak(u)
}

// ---------- 通知权限 ----------

export const notifyAvailable = () => 'Notification' in window

export function notifyPermission(): string {
  return notifyAvailable() ? Notification.permission : 'unsupported'
}

export async function requestNotifyPermission(): Promise<string> {
  if (!notifyAvailable()) return 'unsupported'
  try { return await Notification.requestPermission() } catch { return Notification.permission }
}

export function showNotification(title: string, body: string) {
  if (!notifyAvailable() || Notification.permission !== 'granted') return
  try { new Notification(title, { body, icon: '/favicon.ico' }) } catch { /* ignore */ }
}
