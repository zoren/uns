import { makeLexBox, parse } from './read.js'
import { makeCompiler } from './compile.js'
import { print } from './print.js'
import { makeFuncEnv, makeFuncCtx } from './funcEnv.js'

export const parseRelatedTest = () => {
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
  let numberOfFailures = 0

  for (const [expected, input] of tests) {
    const lexbox = makeLexBox(input)
    const readForm = parse(lexbox)
    const form = readForm()
    const cform = compile(form)
    const eform = cform(funcEnv)
    const result = print(eform)
    console.log(`${input} ; => ${result}`)
    if (result !== expected) {
      console.log('expected', expected, 'got', result)
      numberOfFailures++
    }
    i++
  }
  console.log(`ran ${i} tests, ${numberOfFailures} failures`)
  return numberOfFailures
}
// import fs from 'node:fs'

// const testContent = fs.readFileSync('./examples/test.uns', 'utf8')
export const runFileTest = (testContent) => {
  const lexbox = makeLexBox(testContent)
  const readForm = parse(lexbox)
  const funcEnv = makeFuncEnv()
  const funcCtx = makeFuncCtx()
  const compile = makeCompiler(funcCtx)
  let i = 0
  let numberOfFailures = 0
  while (lexbox.currentToken() !== null) {
    const form = readForm()
    const expecteds = []
    {
      let token
      while ((token = lexbox.currentToken())) {
        const { tokenType } = token
        if (tokenType === 'whitespace') {
          lexbox.next()
          continue
        } else if (tokenType === 'comment') {
          const commentText = token.text.trim()
          if (commentText.startsWith('=>')) {
            expecteds.push(commentText.slice(2).trim())
          }
          lexbox.next()
          continue
        } else break
      }
    }
    const cform = compile(form)
    const eform = cform(funcEnv)
    const result = print(eform)

    if (expecteds.length === 0) continue
    if (expecteds.length > 1) throw new Error('too many expecteds')
    const expected = expecteds[0]
    // console.assert(result === expected, `expected ${expected}, got ${result}`)
    if (result !== expected) {
      console.log('expected', expected, 'got', result)
      numberOfFailures++
    }
    i++
  }
  console.log(`ran ${i} tests, ${numberOfFailures} failures`)
  return numberOfFailures
}
