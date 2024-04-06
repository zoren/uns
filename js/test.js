import { makeLexBox, parse } from './read.js'
import { RuntimeError } from './lib.js'
import { makeToDataCompiler, transData, CompileError } from './compile.js'
import { print } from './print.js'
import { makeFuncEnv, makeFuncCtx } from './funcEnv.js'

const makeEvaluator = () => {
  const funmacCtx = makeFuncCtx()

  const funMacEnv = makeFuncEnv()

  const compileToData = makeToDataCompiler(
    (name) => funmacCtx.get(name),
    (name) => funMacEnv.get(name),
  )

  const genv = {
    funMacResolve: (name) => {
      const f = funMacEnv.get(name)
      if (!f) throw new Error('undefined funmac: ' + name)
      return f
    },
  }
  return (form) => {
    const data = compileToData(form)
    const isFuncOrMacro = data.type === 'funmac'
    if (isFuncOrMacro) {
      // could make recursive by extracting fname, isMacro and paramNames from from form and binding before compiling
      const { fname, isMacro, paramNames } = data
      funmacCtx.set(fname, {
        isMacro,
        params: paramNames.map((pname) => {
          pname
        }),
      })
      const { transTopLevel } = transData()
      const translated = transTopLevel(data)
      let f = translated(genv)
      funMacEnv.set(data.fname, f)
      return []
    }
    const { transForm } = transData()
    const translated = transForm(data)
    return translated(genv)
  }
}

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

  const evaluator = makeEvaluator()

  let i = 0
  let numberOfFailures = 0
  for (const [expected, input] of tests) {
    const lexbox = makeLexBox(input)
    const readForm = parse(lexbox)
    const form = readForm()
    const eform = evaluator(form)
    const result = print(eform)
    // console.log(`${input} ; => ${result}`)
    if (result !== expected) {
      console.log('expected', expected, 'got', result)
      numberOfFailures++
    }
    i++
  }
  console.log(`ran ${i} tests, ${numberOfFailures} failures`)
  return numberOfFailures
}

export const runFileTest = (testContent) => {
  const lexbox = makeLexBox(testContent)
  const readForm = parse(lexbox)
  const evaluator = makeEvaluator()

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

    // const now = performance.now()

    const cres = evaluator(form)

    // const elapsed = performance.now() - now
    // if (elapsed > 0.1) {
    //   console.log(`${print(formWithTokensToForm(form))} elapsed ${elapsed}ms`)
    // }
    const result = print(cres)

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
