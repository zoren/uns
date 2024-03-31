import { parse } from './read.js'
import { makeCompiler, CompileError } from './compile.js'
import { RuntimeError } from './lib.js'
import { print } from './print.js'
import { makeFuncEnv, funcCtx } from './funcEnv.js'

export const makeReadEvalPrint = () => {
  const funcEnv = makeFuncEnv()
  const compile = makeCompiler(funcCtx)
  return (content, { log, error }) => {
    try {
      const { readForms } = parse(content)
      for (const form of readForms()) {
        const cform = compile(form)
        log(print(cform(new Map(), funcEnv)))
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
