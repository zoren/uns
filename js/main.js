import { makeLexBox, skipWhitespaceComments, parse } from './read.js'
import { makeToDataCompiler, transData, CompileError } from './compile.js'
import { RuntimeError } from './lib.js'
import { print } from './print.js'
import { makeFuncEnv, makeFuncCtx } from './funcEnv.js'

export const makeEvaluator = () => {
  const funmacCtx = makeFuncCtx()

  const funMacEnv = makeFuncEnv()

  const funmacResolve = (name) => funMacEnv.get(name)

  const compileToData = makeToDataCompiler(
    (name) => funmacCtx.get(name),
    funmacResolve,
  )

  const { transTopLevel, transForm } = transData(funmacResolve)

  return (form) => {
    const data = compileToData(form)
    const isFuncOrMacro = data.type === 'funmac'
    if (isFuncOrMacro) {
      // could make recursive by extracting fname, isMacro and paramNames from from form and binding before compiling
      const { fname, isMacro, paramNames, restParam } = data
      const prevDef = funmacCtx.get(fname)
      if (prevDef) {
        if (isMacro)
          throw new CompileError(
            `macro ${fname} already defined, redefinining macros is not allowed`,
          )
        if (prevDef.isMacro)
          throw new CompileError(
            `function ${fname} already defined as a macro,  redefinining macros is not allowed`,
          )
      }
      funmacCtx.set(fname, {
        isMacro,
        params: paramNames.map((pname) => {
          pname
        }),
        restParam,
      })
      const f = transTopLevel(data)
      funMacEnv.set(data.fname, f)
      return []
    }
    return transForm(data)
  }
}

export const makeReadEvalPrint = () => {
  const evalUns = makeEvaluator()
  return (content, { log, error }) => {
    if (!error) throw new Error('error must be provided')
    const lexBox = makeLexBox(content)
    const readForm = parse(lexBox)
    try {
      while (true) {
        skipWhitespaceComments(lexBox)
        if (lexBox.currentToken() === null) break
        const form = readForm()
        const resForm = evalUns(form)
        log(print(resForm))
      }
    } catch (e) {
      if (e instanceof CompileError || e instanceof RuntimeError) {
        log(e.message)
      } else {
        error('INTERNAL ERROR ' + e.message)
        error(e)
      }
    }
  }
}
