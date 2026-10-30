/**
 * `/ocusage` — Ollama Cloud の使用量（usage）と残高（balance）を表示する。
 *
 * 設置: このディレクトリをバンドルとしてプロファイルに入れる。
 *   dsh plugin --profile web add <このディレクトリ>
 * これで profile の package.json に link: 依存が入り、dsh.profile.bundles に
 * 追加され、同梱の cordis.patch.yml が適用される。
 *
 * なぜ @deepseek-ai/dsh-credentials を import しないか:
 *   プロファイルには node_modules が無く、プロファイル配下の素の .mjs から
 *   パッケージを解決できない。credentialRef() は構文検証とブランド付けだけを
 *   行う関数で、実行時の値は文字列そのものなので、参照名を文字列で渡しても
 *   解決結果は変わらない。
 *
 * なぜ curl ではなく fetch か:
 *   サンドボックス下の子プロセスは TLS 資格情報を渡されず、curl.exe は
 *   schannel の SEC_E_NO_CREDENTIALS で失敗する。Node の fetch は自前の TLS
 *   実装なので通る。
 */

export const name = 'dsh-ollama-cloud-usage'
export const inject = ['commands', 'credentials']

const ORIGIN = 'https://ollama.com'
const REF = 'OLLAMA_CLOUD_API_KEY'
const RANGES = ['24h', '7d', '30d']
const JST_OFFSET_MS = 9 * 60 * 60 * 1000

/**
 * @param {{ commands: { register(definition: unknown): unknown }, credentials: { resolve(ref: string): Promise<{ value: string, source: string } | undefined> } }} ctx
 */
export function apply(ctx) {
  ctx.commands.register({
    name: 'ocusage',
    description: 'Ollama Cloud の使用量と残高を表示する',
    input: { hint: '[24h|7d|30d]' },
    handler: async ({ rawInput, signal }) => {
      const range = rawInput.trim().toLowerCase() || '7d'
      if (!RANGES.includes(range)) {
        return { kind: 'error', text: `range は ${RANGES.join(' / ')} のいずれかです: ${range}` }
      }
      const hit = await ctx.credentials.resolve(REF)
      if (hit === undefined) {
        return {
          kind: 'error',
          text: `${REF} が未設定です。設定 → モデル から保存するか、$DSH_HOME/.credentials.yaml の refs に追加してください。`,
        }
      }
      try {
        const [balance, usage] = await Promise.all([
          request('/api/balance', hit.value, signal),
          request(`/api/usage?range=${range}`, hit.value, signal),
        ])
        return { kind: 'success', text: render(balance, usage) }
      } catch (error) {
        return { kind: 'error', text: error instanceof Error ? error.message : String(error) }
      }
    },
  })
}

async function request(path, key, signal) {
  const timeout = AbortSignal.timeout(20_000)
  const response = await fetch(ORIGIN + path, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.any([signal, timeout]),
  })
  if (!response.ok) {
    let detail = ''
    try {
      const body = await response.json()
      if (typeof body?.error === 'string') detail = `: ${body.error}`
    } catch {
      // 本文が JSON でない失敗はステータスだけで報告する。
    }
    const retryAfter = response.headers.get('retry-after')
    const retry = retryAfter === null ? '' : `（${retryAfter} 秒後に再試行してください）`
    throw new Error(`${path} が HTTP ${response.status} を返しました${detail}${retry}`)
  }
  return response.json()
}

function render(balance, usage) {
  const lines = [`Ollama Cloud (${usage.scope ?? 'self'})  ${stamp(new Date())}`]

  const included = balance.included ?? {}
  if (typeof included.balance_usd === 'number') {
    const period = included.period ?? {}
    lines.push(
      `残高  included ${usd(included.balance_usd)} / ${usd(included.allowance_usd)}   ${stamp(period.from)} → ${stamp(period.until)}`,
    )
  } else if (included.session !== undefined && included.weekly !== undefined) {
    lines.push(
      `残高  session ${included.session.remaining_percent}% (${stamp(included.session.resets_at)} リセット)  weekly ${included.weekly.remaining_percent}% (${stamp(included.weekly.resets_at)} リセット)`,
    )
  }
  if (typeof balance.purchased?.balance_usd === 'number') {
    lines.push(`      purchased ${usd(balance.purchased.balance_usd)}`)
  }

  const totals = usage.totals ?? {}
  lines.push(
    `${usage.range}  ${number(totals.request_count)} req  ${usd(totals.usage_usd)}  入力 ${tokens(totals.input_tokens)} (cache ${tokens(totals.cached_input_tokens)})  出力 ${tokens(totals.output_tokens)}`,
  )
  lines.push(`      範囲 ${stamp(usage.from)} → ${stamp(usage.until)}`)

  const daily = (usage.buckets ?? []).filter((bucket) => (bucket.request_count ?? 0) > 0)
  if (usage.granularity === 'day' && daily.length > 0) {
    const shown = daily.slice(-8)
    const parts = shown.map((bucket) => `${monthDay(bucket.from)} ${usd(bucket.usage_usd)}${bucket.partial === true ? '*' : ''}`)
    if (daily.length > shown.length) parts.unshift(`他 ${daily.length - shown.length} 日`)
    lines.push(`日別  ${parts.join('  ')}`)
  }

  return lines.join('\n')
}

function usd(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-'
  const digits = value >= 1 ? 2 : value >= 0.01 ? 3 : 4
  return `$${value.toFixed(digits)}`
}

function tokens(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-'
  if (value >= 1e9) return `${(value / 1e9).toFixed(2)}B`
  if (value >= 1e6) return `${(value / 1e6).toFixed(1)}M`
  if (value >= 1e3) return `${(value / 1e3).toFixed(1)}K`
  return String(value)
}

function number(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-'
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

// small-ICU のビルドでも確実に日本時間で出せるよう、タイムゾーン名ではなく
// 固定オフセットで変換する（このプロジェクトのタイムゾーンは日本時間）。
function toJst(value) {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return undefined
  return new Date(date.getTime() + JST_OFFSET_MS)
}

function stamp(value) {
  const date = toJst(value)
  if (date === undefined) return '-'
  const pad = (part) => String(part).padStart(2, '0')
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())} ${pad(date.getUTCHours())}:${pad(date.getUTCMinutes())}`
}

function monthDay(value) {
  const date = toJst(value)
  if (date === undefined) return '-'
  return `${String(date.getUTCMonth() + 1).padStart(2, '0')}/${String(date.getUTCDate()).padStart(2, '0')}`
}
