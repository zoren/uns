import { makeLexBox, parse } from './read.js'
import { makeToDataCompiler, transData } from './compile.js'
import { print } from './print.js'
import { makeFuncEnv, makeFuncCtx } from './funcEnv.js'

const makeEvaluator = () => {
  const funcCtx = makeFuncCtx()

  const funmacCtx = new Map()
  for (const [name, funcObj] of funcCtx)
    funmacCtx.set(name, { ...funcObj, funmacType: 'func' })
  const compileToData = makeToDataCompiler(funmacCtx)

  const funMacEnv = makeFuncEnv()

  return (form) => {
    const data = compileToData(form)
    const isFuncOrMacro = data.type === 'funmac'
    const { transTopLevel, transForm } = transData()
    const genv = {
      funMacResolve: (name) => {
        const f = funMacEnv.get(name)
        if (!f) throw new Error('undefined funmac: ' + name)
        return f
      },
      macroCompiler: (astFromMacro) => {
        try {
          return compileToData(astFromMacro)
        } catch (e) {
          if (e instanceof CompileError)
            throw new RuntimeError(
              'macro compile error at runtime: ' + e.message,
            )
          throw e
        }
      },
    }
    if (isFuncOrMacro) {
      const translated = transTopLevel(data)
      let f = translated(genv)
      funMacEnv.set(data.fname, f)
      return []
    }
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

    const cres = evaluator(form)
    // const cform = compile(form)
    // const now = performance.now()
    // const eform = cform(funcEnv)
    const result = print(cres)
    // const elapsed = performance.now() - now
    // if (elapsed > 0.1) {
    //   console.log(`${print(formWithTokensToForm(form))} elapsed ${elapsed}ms`)
    // }
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
