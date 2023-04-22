#!/usr/bin/env node
import processSubtitle from './index.js'
import yargs from 'yargs-parser'

const argv = yargs(process.argv.slice(2), {
  array: ['folder']
})

await processSubtitle(Object.assign(argv, {
  subtitle: argv.subtitle || argv._[0],
  folders: argv.folder || (
    process.env.windir
      ? [`${process.env.windir}\\fonts`]
      : ['/usr/share/fonts', '~/.local/share/fonts']
  )
}))
