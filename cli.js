#!/usr/bin/env node
const merge = require('deepmerge')
const prettyBytes = require('pretty-bytes')
const { cosmiconfig } = require('cosmiconfig')

const defaultConf = require('./default-conf')
const minFile = require('./')

const MODULE_NAME = 'imagemin'

const explorer = cosmiconfig(MODULE_NAME)

const findPlugin = (plugin, config) => {
  try {
    return require(`imagemin-${plugin}`)(config)
  } catch (error) {
    console.log(`Failed to find plugin imagemin-${plugin}.`)
  }
};

(async () => {
  try {

    const result = await explorer.search()
    const config = merge(defaultConf, result && result.config ? result.config : {})
    const filenames = process.argv.slice(2)

    const plugins = Object.entries(config).reduce((plugins, [pluginName, config]) => {
      if (typeof config === 'object' && config !== null) {
        const plugin = findPlugin(pluginName, config)
        if (plugin) plugins.push(plugin)
      }

      return plugins
    }, [])

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
