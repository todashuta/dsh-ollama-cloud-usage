/**
 * ローカル動作確認用: 実 API を叩いて /ocusage の出力を確かめる。
 * キーは .credentials.yaml から読み、画面には出さない。
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { apply } from './index.js'

const home = process.env.DSH_HOME ?? join(process.env.USERPROFILE, '.dsh')
const raw = readFileSync(join(home, '.credentials.yaml'), 'utf8')
const match = raw.match(/^\s{2}OLLAMA_CLOUD_API_KEY:\s*(.+)$/m)
if (!match) throw new Error('OLLAMA_CLOUD_API_KEY not found in credential store')
const key = match[1].trim()

const registered = []
const ctx = {
  commands: { register: (definition) => registered.push(definition) },
  credentials: { resolve: async () => ({ value: key, source: 'file' }) },
}
apply(ctx)

const definition = registered[0]
console.log('registered:', definition.name, '| hint:', definition.input?.hint, '| desc:', definition.description)

for (const range of ['7d', '24h', '30d']) {
  const result = await definition.handler({ rawInput: range, signal: new AbortController().signal })
  console.log(`\n=== ${range} -> ${result.kind} ===`)
  console.log(result.text)
}

const badRange = await definition.handler({ rawInput: 'nope', signal: new AbortController().signal })
console.log(`\n=== bad range -> ${badRange.kind} ===`)
console.log(badRange.text)

const noKey = []
apply({
  commands: { register: (definition) => noKey.push(definition) },
  credentials: { resolve: async () => undefined },
})
const missing = await noKey[0].handler({ rawInput: '', signal: new AbortController().signal })
console.log(`\n=== missing key -> ${missing.kind} ===`)
console.log(missing.text)
