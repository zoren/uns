import { run } from './readEvalPrint.js'

const commandLineArgs = process.argv.slice(2)

console.assert(commandLineArgs.length <= 1, 'usage: node . [file]')

if (commandLineArgs.length === 1) {
  const content = fs.readFileSync(commandLineArgs[0], 'utf8')
  const result = run(content)
  console.log(result)
  exit(0)
}

import * as readline from 'node:readline'
import { exit, stdin, nextTick, stdout } from 'node:process'

const rl = readline.createInterface({
  input: stdin,
  output: stdout,
  terminal: true,
  historySize: 1024,
  removeHistoryDuplicates: true,
})

const prompt = () => {
  rl.question(`user> `, (line) => {
    if (line === '') {
      console.log(`Bye!`)
      rl.close()
      return
    }
    try {
      console.log(run(line, env))
    } catch (e) {
      console.log(e.message)
    }
    nextTick(prompt)
  })
}
prompt()
