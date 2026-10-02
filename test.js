const assert = require('assert').strict
const fs = require('fs')
const { tmpdir } = require('os')
const path = require('path')
const { spawnSync } = require('child_process')
const { pathToFileURL } = require('url')

const temporaryDirectory = fs.mkdtempSync(path.join(tmpdir(), 'lint-staged-imagemin-test-'))
const project = path.join(temporaryDirectory, 'project')
const packageDirectory = path.join(project, 'node_modules', 'lint-staged-imagemin')
const entry = path.join(packageDirectory, 'index.js')
const cli = path.join(packageDirectory, 'cli.js')
const svg = '<svg xmlns="http://www.w3.org/2000/svg"><!-- ORIGINAL --><path d="M0 0"/></svg>'
const disabledDefaults = { gifsicle: null, mozjpeg: null, optipng: null, svgo: null }

fs.mkdirSync(packageDirectory, { recursive: true })
for (const filename of ['package.json', 'index.js', 'cli.js', 'default-conf.js']) {
  fs.copyFileSync(path.join(__dirname, filename), path.join(packageDirectory, filename))
}
for (const dependency of Object.keys(require('./package.json').dependencies)) {
  fs.symlinkSync(fs.realpathSync(path.join(__dirname, 'node_modules', dependency)), path.join(project, 'node_modules', dependency), 'junction')
}

const configure = (plugins = {}) => {
  fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({ imagemin: { ...disabledDefaults, ...plugins } }))
}

const createPlugin = (name, type, source) => {
  const directory = path.join(project, 'node_modules', `imagemin-${name}`)
  fs.mkdirSync(directory)
  fs.writeFileSync(path.join(directory, 'package.json'), JSON.stringify({ name: `imagemin-${name}`, type, exports: './index.js' }))
  fs.writeFileSync(path.join(directory, 'index.js'), source)
}

const runCli = (...filenames) => spawnSync(process.execPath, [cli, ...filenames], {
  cwd: project,
  encoding: 'utf8'
})

const assertSuccess = result => {
  assert.ifError(result.error)
  assert.equal(result.status, 0, result.stderr)
  assert.equal(result.stderr, '')
}

const removeDirectory = directory => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const filename = path.join(directory, entry.name)
    if (entry.isDirectory()) removeDirectory(filename)
    else fs.unlinkSync(filename)
  }
  fs.rmdirSync(directory)
}

const main = async () => {
  const minFile = require(entry)
  assert.equal(typeof minFile, 'function', 'CommonJS API remains a function')
  assert.equal((await import(pathToFileURL(entry).href)).default, minFile, 'ESM can import the CommonJS API')

  const filename = path.join(project, 'sample.SVG')
  fs.writeFileSync(filename, svg)
  const output = svg.replace('<!-- ORIGINAL -->', '')
  const savings = await minFile(filename, [async buffer => Buffer.from(buffer.toString().replace('<!-- ORIGINAL -->', ''))])
  assert.deepEqual(savings, {
    originalSize: Buffer.byteLength(svg),
    optimizedSize: Buffer.byteLength(output),
    saved: Buffer.byteLength(svg) - Buffer.byteLength(output)
  })
  assert.equal(fs.readFileSync(filename, 'utf8'), output, 'write is finished when the API resolves')
  assert.equal((await minFile(filename)).saved, 0, 'no plugins preserves the input')
  await assert.rejects(minFile(path.join(project, 'sample.txt')), /Invalid extensions \.txt/)
  await assert.rejects(minFile(path.join(project, 'missing.png')), { code: 'ENOENT' })
  await assert.rejects(minFile(filename, [async () => { throw new Error('optimizer rejected') }]), /optimizer rejected/)
  assert.equal(fs.readFileSync(filename, 'utf8'), output)

  const originalWriteFile = fs.promises.writeFile
  let releaseWrite
  let startedWrite
  const writeStarted = new Promise(resolve => { startedWrite = resolve })
  const writeAllowed = new Promise(resolve => { releaseWrite = resolve })
  try {
    fs.promises.writeFile = async (...args) => {
      startedWrite()
      await writeAllowed
      return originalWriteFile(...args)
    }
    delete require.cache[entry]
    let resolved = false
    const writing = require(entry)(filename).then(() => { resolved = true })
    await writeStarted
    await Promise.resolve()
    assert.equal(resolved, false, 'API waits for pending writes')
    releaseWrite()
    await writing

    fs.promises.writeFile = async () => { throw new Error('write rejected') }
    delete require.cache[entry]
    await assert.rejects(require(entry)(filename), /write rejected/)
  } finally {
    releaseWrite()
    fs.promises.writeFile = originalWriteFile
    delete require.cache[entry]
  }

  configure()
  assertSuccess(runCli())
  assertSuccess(runCli(filename))
  assert.match(runCli(filename).stdout, /already optimized at/)

  createPlugin('test-cjs', 'commonjs', 'module.exports = options => async buffer => Buffer.from(buffer.toString().replace("ORIGINAL", options.marker))')
  createPlugin('test-esm', 'module', 'await Promise.resolve(); export default options => async buffer => Buffer.from(buffer.toString().replace("FIRST", options.marker))')
  configure({ 'test-cjs': { marker: 'FIRST' }, 'test-esm': { marker: 'X' } })
  const secondFilename = path.join(project, 'second.svg')
  for (const file of [filename, secondFilename]) fs.writeFileSync(file, svg)
  const optimized = runCli(filename, secondFilename)
  assertSuccess(optimized)
  assert.match(optimized.stdout, /Saved 7 B on/)
  for (const file of [filename, secondFilename]) {
    assert.equal(fs.readFileSync(file, 'utf8'), svg.replace('ORIGINAL', 'X'), 'CJS and ESM plugins run in configured order')
  }

  configure({ 'test-missing': {} })
  const missingPlugin = runCli(filename)
  assertSuccess(missingPlugin)
  assert.match(missingPlugin.stdout, /Failed to find plugin imagemin-test-missing/)

  createPlugin('test-factory-error', 'module', 'export default () => { throw new Error("factory rejected") }')
  configure({ 'test-factory-error': {} })
  const factoryFailure = runCli(filename)
  assertSuccess(factoryFailure)
  assert.match(factoryFailure.stdout, /Failed to find plugin imagemin-test-factory-error/)

  createPlugin('test-error', 'module', 'export default () => async () => { throw new Error("optimizer rejected") }')
  configure({ 'test-error': {} })
  const pluginFailure = runCli(filename)
  assert.equal(pluginFailure.status, 1)
  assert.match(pluginFailure.stderr, /optimizer rejected/)
  assert.equal(fs.readFileSync(filename, 'utf8'), svg.replace('ORIGINAL', 'X'))

  configure()
  const missingFile = runCli(path.join(project, 'missing.png'))
  assert.equal(missingFile.status, 1)
  assert.match(missingFile.stderr, /ENOENT/)
  const unsupportedFile = runCli(path.join(project, 'sample.txt'))
  assert.equal(unsupportedFile.status, 1)
  assert.match(unsupportedFile.stderr, /Invalid extensions/)

  fs.writeFileSync(path.join(project, 'package.json'), '{invalid json')
  const invalidConfig = runCli(filename)
  assert.equal(invalidConfig.status, 1)
  assert.match(invalidConfig.stderr, /JSON/)
  console.log('API and CLI regression tests passed')
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
}).finally(() => {
  removeDirectory(temporaryDirectory)
})
