// Loads a TypeScript module (and its local imports) for node:test without a build step.
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const ts = require('typescript')

const root = path.join(__dirname, '..', '..')

function resolveLocal(fromFile, name) {
  let target
  if (name.startsWith('@/')) target = path.join(root, name.slice(2))
  else if (name.startsWith('.')) target = path.resolve(path.dirname(fromFile), name)
  else return null
  for (const ext of ['.ts', '.tsx', '/index.ts']) if (fs.existsSync(target + ext)) return target + ext
  return null
}

function loadTs(file, { stubs = {}, globals = {} } = {}, cache = new Map()) {
  const abs = path.resolve(root, file)
  if (cache.has(abs)) return cache.get(abs).exports
  const source = fs.readFileSync(abs, 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } }).outputText
  const module = { exports: {} }
  cache.set(abs, module)
  const requireShim = name => {
    if (Object.prototype.hasOwnProperty.call(stubs, name)) return stubs[name]
    const local = resolveLocal(abs, name)
    if (local) return loadTs(local, { stubs, globals }, cache)
    return require(name)
  }
  const context = {
    module, exports: module.exports, require: requireShim, console, TextEncoder, URL, URLSearchParams, AbortSignal, setTimeout, clearTimeout,
    process: { env: {} },
    fetch: async () => { throw new Error('Network is disabled in tests') },
    ...globals,
  }
  context.globalThis = context
  vm.runInNewContext(compiled, context)
  return module.exports
}

module.exports = { loadTs }
