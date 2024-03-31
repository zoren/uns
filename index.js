import fs from 'node:fs'
import { makeFuncEnv } from './js/funcEnv.js'
import { parse } from './js/read.js'
import { compile, CompileError, RuntimeError } from './js/compile.js'
import { print } from './js/print.js'

const commandLineArgs = process.argv.slice(2)

console.assert(commandLineArgs.length <= 1, 'usage: node . [file]')

const funcEnv = makeFuncEnv()

if (commandLineArgs.length === 1) {
  const content = fs.readFileSync(commandLineArgs[0], 'utf8')
  const { readForms } = parse(content)
  for (const cform of readForms().map(compile)) {
    cform(new Map(), funcEnv)
  }
}

import * as readline from 'node:readline'
import { stdin, nextTick, stdout } from 'node:process'

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
      const { readForms } = parse(line)
      for (const form of readForms()) {
        const cform = compile(form)
        console.log(print(cform(new Map(), funcEnv)))
      }
    } catch (e) {
      if (e instanceof CompileError || e instanceof RuntimeError) {
        console.log(e.message)
      } else {
        console.error('INTERNAL ERROR ' + e.message)
        console.error(e)
      }
    }
    nextTick(prompt)
  })
}
prompt()
