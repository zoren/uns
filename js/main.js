import { makeLexBox, skipWhitespaceComments, parse } from './read.js'
import { makeCompiler, CompileError } from './compile.js'
import { RuntimeError } from './lib.js'
import { print } from './print.js'
import { makeFuncEnv, makeFuncCtx } from './funcEnv.js'

export const makeReadEvalPrint = () => {
  const funcEnv = makeFuncEnv()
  const funcCtx = makeFuncCtx()
  const compile = makeCompiler(funcCtx)
  return (content, { log, error }) => {
    const lexBox = makeLexBox(content)
    const readForm = parse(lexBox)
    try {
      while (true) {
        skipWhitespaceComments(lexBox)
        if (lexBox.currentToken() === null) break
        const form = readForm()
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
