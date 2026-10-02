#!/usr/bin/env node
const merge = require('deepmerge')
const { cosmiconfig } = require('cosmiconfig')

const defaultConf = require('./default-conf')
const minFile = require('./')

const MODULE_NAME = 'imagemin'

const explorer = cosmiconfig(MODULE_NAME)

const findPlugin = async (plugin, config) => {
  try {
    const { default: createPlugin } = await import(`imagemin-${plugin}`)
    return createPlugin(config)
  } catch (error) {
    console.log(`Failed to find plugin imagemin-${plugin}.`)
  }
};

(async () => {
  try {
    const { default: prettyBytes } = await import('pretty-bytes')
    const result = await explorer.search()
    const config = merge(defaultConf, result && result.config ? result.config : {})
    const filenames = process.argv.slice(2)

    const plugins = []
    for (const [pluginName, pluginConfig] of Object.entries(config)) {
      if (typeof pluginConfig === 'object' && pluginConfig !== null) {
        const plugin = await findPlugin(pluginName, pluginConfig)
        if (plugin) plugins.push(plugin)
      }
    }

    await Promise.all(filenames.map(async filename => {
      console.log(`Optimizing ${filename}`)
      const { saved, originalSize, optimizedSize } = await minFile(filename, plugins)
      console.log(saved > 0 ? `Saved ${prettyBytes(saved)} on ${filename} (${prettyBytes(originalSize)} → ${prettyBytes(optimizedSize)})` : `${filename} is already optimized at ${prettyBytes(originalSize)}`)
    }))
  } catch (error) {
    console.error(error)
    process.exit(1)
  }
})()
