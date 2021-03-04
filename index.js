const path = require('path')
const { readFile, writeFile } = require('fs/promises')

const imagemin = require('imagemin')

const supportedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.svg']

const getExtension = name => path.extname(name).toLowerCase()

const getSavings = (originalFile, newFile) => {
  const originalSize = originalFile.length
  const optimizedSize = newFile.length
  const saved = originalSize - optimizedSize

  return {
    originalSize,
    optimizedSize,
    saved
  }
}

module.exports = async function minFile (filename, plugins = []) {
  const extension = getExtension(filename)
  if (!supportedExtensions.includes(extension)) {
    throw new Error(`Invalid extensions ${extension} found.`)
  }

  const originalFile = await readFile(filename)

  const data = await imagemin.buffer(originalFile, { plugins })

  writeFile(filename, data)
  return getSavings(originalFile, data)
}
