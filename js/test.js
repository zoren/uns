import { makeLexBox, parse } from './read.js'
import { makeCompiler } from './compile.js'
import { print } from './print.js'
import { makeFuncEnv, makeFuncCtx } from './funcEnv.js'

const tests = [
  ['255', `0xff`],
  ['0', `0`],
  ['0', `000`],
  ['7', `007`],
  ['123', `0123`],
  [`'hello world'`, `'hello world'`],
  [`'hello world'`, `'hello world`], // unterminated strings work
  ['5', '[add 3 2'], // unterminated lists work
]

const funcEnv = makeFuncEnv()
const funcCtx = makeFuncCtx()
const compile = makeCompiler(funcCtx)

let i = 0
for (const [expected, input] of tests) {
  const lexbox = makeLexBox(input)
  const readForm = parse(lexbox)
  const form = readForm()
  const cform = compile(form)
  const eform = cform(funcEnv)
  const result = print(eform)
  console.log(`${input} ; => ${result}`)
  console.assert(result === expected, `expected ${expected}, got ${result}`)
  i++
}

import fs from 'node:fs'

const testContent = fs.readFileSync('./examples/test.uns', 'utf8')
const lexbox = makeLexBox(testContent)
const readForm = parse(lexbox)
while (lexbox.currentToken() !== null) {
  const form = readForm()
  const cform = compile(form)
  const eform = cform(funcEnv)
  const result = print(eform)

  const comments = form.meta.comments || []
  const expecteds = []
  for (const comment of comments) {
    const commentText = comment.text.trim()
    if (!commentText.startsWith('=>')) continue
    const expected = commentText.slice(2).trim()
    expecteds.push(expected)
  }
  if (expecteds.length === 0) continue
  if (expecteds.length > 1) throw new Error('too many expecteds')
  const expected = expecteds[0]
  console.assert(result === expected, `expected ${expected}, got ${result}`)
  i++
}
console.log(`ran ${i} tests`)
