import fs from 'node:fs'
import { run, runAll } from './js/readEvalPrint.js'

const commandLineArgs = process.argv.slice(2)

console.assert(commandLineArgs.length <= 1, 'usage: node . [file]')

if (commandLineArgs.length === 1) {
  runAll(fs.readFileSync(commandLineArgs[0], 'utf8'))
  exit(0)
}

import * as readline from 'node:readline'
import { exit, stdin, nextTick, stdout } from 'node:process'

let history = []
try {
  const histO = JSON.parse(fs.readFileSync('history.json', 'utf8'))
  history = histO.history
} catch (err) {
  if (err.code !== 'ENOENT') throw err
}

const rl = readline.createInterface({
  input: stdin,
  output: stdout,
  terminal: true,
  historySize: 1024,
  history,
  removeHistoryDuplicates: true,
  tabSize: 2,
})

rl.on('history', (history) => {
  const historyObject = { history, date: new Date().toISOString() }
  fs.writeFileSync('history.json', JSON.stringify(historyObject))
})

const prompt = () => {
  rl.question(`user> `, (line) => {
    if (line === '') {
      console.log(`Bye!`)
      rl.close()
      return
    }
    try {
      console.log(run(line))
    } catch (e) {
      console.log(e.message)
    }
    nextTick(prompt)
  })
}
prompt()
