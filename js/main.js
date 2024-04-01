import { parse } from './read.js'
import { makeCompiler, CompileError } from './compile.js'
import { RuntimeError } from './lib.js'
import { print } from './print.js'
import { makeFuncEnv, makeFuncCtx } from './funcEnv.js'

export const makeReadEvalPrint = () => {
  const funcEnv = makeFuncEnv()
  const funcCtx = makeFuncCtx()
  const compile = makeCompiler(funcCtx)
  return (content, { log, error }) => {
    try {
      for (const form of parse(content)) {
        const cform = compile(form)
        log(print(cform(funcEnv)))
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
