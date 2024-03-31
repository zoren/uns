import { parse } from './read.js'
import { compile } from './compile.js'
import { print } from './print.js'
import { makeFuncEnv } from './funcEnv.js'

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

let i = 0
for (const [expected, input] of tests) {
  const { readForms } = parse(input)
  const forms = readForms()
  if (forms.length !== 1) throw new Error('expected 1 form')
  const [form] = forms
  const cform = compile(form)
  const eform = cform(new Map(), funcEnv)
  const result = print(eform)
  console.log(`${input} ; => ${result}`)
  console.assert(result === expected, `expected ${expected}, got ${result}`)
  i++
}

import fs from 'node:fs'

const testContent = fs.readFileSync('./examples/test.uns', 'utf8')
const { readForms } = parse(testContent)
const forms = readForms()
for (const form of forms) {
  const cform = compile(form)
  const eform = cform(new Map(), funcEnv)
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
