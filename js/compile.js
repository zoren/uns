import { RuntimeError, isInt32, symbol } from './lib.js'

import { isSymbol } from './lib.js'

const pairwise = function* (arr) {
  for (let i = 0; i < arr.length - 1; i += 2) {
    yield arr.slice(i, i + 2)
  }
}

const getFromContext = (ctx, name) => {
  if (ctx === null) return null
  const { vars } = ctx
  if (vars.has(name)) return vars.get(name)
  return getFromContext(ctx.outer, name)
}

const getEnclosingLoopCtx = (ctx) => {
  while (ctx !== null) {
    const { bindingForm, outer } = ctx
    const { tokenType, value } = bindingForm[0]
    if (tokenType === 'symbol' && isSymbol(value) === 'loop') return ctx
    ctx = outer
  }
  return null
}

const rtAssert = (cond, msg) => {
  if (!cond) throw new RuntimeError(msg)
}

class ContinueWrapper {
  constructor(args) {
    this.args = args
  }
}

export const transData = () => {
  let funMacResolve = null
  let macroCompiler = null
  const transD = (data) => {
    const { type } = data
    switch (type) {
      case 'value': {
        const { value } = data
        return () => value
      }
      case 'symbol': {
        const { name } = data
        return (env) => {
          while (true) {
            rtAssert(env !== null, 'undefined symbol: ' + name)
            const { varValues, outer } = env
            if (varValues.has(name)) return varValues.get(name)
            env = outer
          }
        }
      }
      case 'if': {
        const { cond, then, else: elseData } = data
        const [ccond, cthen, celse] = [cond, then, elseData].map(transD)
        return (env) => {
          const econd = ccond(env)
          rtAssert(isInt32(econd), 'condition must be a number')
          return econd === 0 ? celse(env) : cthen(env)
        }
      }
      case 'call': {
        const { name, isMacroCall, args } = data
        if (isMacroCall) {
          return (env) => {
            const funmac = funMacResolve(name)
            rtAssert(funmac, 'undefined macro: ' + name)
            const res = funmac(...args)
            const compiledRes = macroCompiler(res)
            const evaledRes = transD(compiledRes)
            return evaledRes(env)
          }
        }
        const cargs = args.map(transD)
        return (env) => {
          const funmac = funMacResolve(name)
          rtAssert(funmac, 'undefined func: ' + name)
          return funmac(...cargs.map((c) => c(env)))
        }
      }
      case 'let-loop': {
        const { isLet, bindings, butLastBodies, lastBody } = data
        const cbindings = bindings.map(([name, bindform]) => [
          name,
          transD(bindform),
        ])
        const makeEnv = (env) => {
          const varValues = new Map()
          const newEnv = { varValues, outer: env }
          for (const [name, cbind] of cbindings)
            varValues.set(name, cbind(newEnv))
          return { newEnv, varValues }
        }
        const cbutLastBodies = butLastBodies.map(transD)
        const clastBody = transD(lastBody)
        if (isLet) {
          return (env) => {
            const { newEnv } = makeEnv(env)
            for (const cbody of cbutLastBodies) cbody(newEnv)
            return clastBody(newEnv)
          }
        }
        return (env) => {
          const { varValues, newEnv } = makeEnv(env)
          while (true) {
            for (const cbody of cbutLastBodies) cbody(newEnv)
            const result = clastBody(newEnv)
            if (!(result instanceof ContinueWrapper)) return result
            const { args } = result
            rtAssert(
              bindings.length === args.length,
              'wrong number of loop arguments',
            )
            for (let i = 0; i < bindings.length; i++)
              varValues.set(bindings[i][0], args[i])
          }
        }
      }
      case 'continue': {
        const cargs = data.args.map(transD)
        return (env) => new ContinueWrapper(cargs.map((ca) => ca(env)))
      }
    }
    throw new RuntimeError('transFunc: unexpected data type: ' + type)
  }

  return {
    transForm: (data) => {
      if (data.type === 'funmac') throw new Error('unexpected funmac')
      const closure = transD(data)
      return (givenGenv) => {
        funMacResolve = givenGenv.funMacResolve
        macroCompiler = givenGenv.macroCompiler
        return closure(null)
      }
    },
    transTopLevel: (data) => {
      if (data.type !== 'funmac') throw new Error('expected funmac')
      const { fname, paramNames, butLastBodies, lastBody } = data
      const cbutLastBodies = butLastBodies.map(transD)
      const clastBody = transD(lastBody)
      const arity = paramNames.length
      return (givenGenv) => {
        funMacResolve = givenGenv.funMacResolve
        macroCompiler = givenGenv.macroCompiler
        return (...args) => {
          rtAssert(
            args.length === arity,
            `wrong number of arguments to: ${fname}`,
          )
          const varValues = new Map()
          for (let i = 0; i < arity; i++) varValues.set(paramNames[i], args[i])
          const newEnv = { varValues, outer: null }
          for (const cbody of cbutLastBodies) cbody(newEnv)
          return clastBody(newEnv)
        }
      }
    },
  }
}

export class CompileError extends Error {
  constructor(msg) {
    super('COMPILE: ' + msg)
  }
}

const ctAssert = (cond, msg) => {
  if (!cond) throw new CompileError(msg)
}

const ctAssertSymbol = (form, msg) => {
  const { tokenType, value } = form
  const name = isSymbol(tokenType === 'symbol' ? value : form)
  ctAssert(name, msg)
  return name
}

export const formWithTokensToForm = (ast) => {
  if (Array.isArray(ast)) return ast.map(formWithTokensToForm)
  if (isSymbol(ast)) return ast
  const { tokenType, value } = ast
  ctAssert(tokenType, 'formWithTokensToForm: no tokenType')
  if (tokenType === 'value' || tokenType === 'symbol') return value
  throw new CompileError(
    'formWithTokensToForm: unexpected token type: ' + tokenType,
  )
}

const quasiquote = (ast) => {
  if (isInt32(ast) || typeof ast === 'string') return ast
  if (isSymbol(ast)) return [symbol('quote'), ast]
  ctAssert(Array.isArray(ast), 'quasiquote: unexpected form: ' + ast)
  if (ast.length === 0) return ast
  const [first, ...rest] = ast
  const symbolName = isSymbol(first)
  if (symbolName === 'unquote') {
    ctAssert(rest.length === 1, 'unquote must have 1 argument')
    return rest[0]
  }
  const qqAst = ast.map(quasiquote)
  return [symbol('list'), ...qqAst]
}

export const makeToDataCompiler = (funcCtxResolve) => {
  const compile = (ast, ctx) => {
    if (isInt32(ast) || typeof ast === 'string')
      return { type: 'value', value: ast }
    const { tokenType, value } = ast
    if (tokenType === 'value') return { type: 'value', value }
    {
      const symbolName =
        tokenType === 'symbol' ? isSymbol(value) : isSymbol(ast)
      if (symbolName) {
        ctAssert(
          getFromContext(ctx, symbolName),
          'undefined symbol: ' + symbolName,
        )
        return { type: 'symbol', name: symbolName }
      }
    }
    ctAssert(Array.isArray(ast), 'ast must be an array at this point')
    if (ast.length === 0) return { type: 'value', value: [] }
    const [first, ...rest] = ast
    const firstName = ctAssertSymbol(first, 'first element must be a symbol')
    const isLoopTailPosition = ctx && ctx.isLoopTailPosition
    switch (firstName) {
      case 'if': {
        ctAssert(rest.length === 3, 'if must have 3 arguments')
        return {
          type: 'if',
          cond: compile(rest[0], { ...ctx, isLoopTailPosition: false }),
          then: compile(rest[1], ctx),
          else: compile(rest[2], ctx),
        }
      }
      case 'func':
      case 'macro': {
        ctAssert(ctx === null, 'func/macro must be at top level')
        ctAssert(rest.length >= 3, 'func must have at least 3 arguments')
        const fname = ctAssertSymbol(rest[0], 'first argument must be a symbol')
        ctAssert(Array.isArray(rest[1]), 'second argument must be a list')
        const paramNames = rest[1].map((x) =>
          ctAssertSymbol(x, 'parameters must be symbols'),
        )
        const bodyCtxVars = new Map()
        for (const name of paramNames) bodyCtxVars.set(name, { isParam: true })
        const bodyCtx = { vars: bodyCtxVars, outer: ctx, bindingForm: ast }
        const cbodies = rest.slice(2, -1).map((f) => compile(f, bodyCtx))
        const clastBody = compile(rest.at(-1), bodyCtx)
        return {
          type: 'funmac',
          isMacro: firstName === 'macro',
          fname,
          paramNames,
          butLastBodies: cbodies,
          lastBody: clastBody,
        }
      }
      case 'let':
      case 'loop': {
        ctAssert(
          rest.length >= 2,
          firstName + ' must have at least 2 arguments',
        )
        const isLet = firstName === 'let'
        const [bindings, ...bodies] = rest
        ctAssert(Array.isArray(bindings), 'second argument must be a list')
        ctAssert(bindings.length % 2 === 0, 'bindings must be of even length')
        const newCtxVars = new Map()
        const newCtx = { vars: newCtxVars, outer: ctx, bindingForm: ast }

        const cbindings = [...pairwise(bindings)].map(([binder, form]) => {
          const name = ctAssertSymbol(binder, 'key must be a symbol')
          const cval = compile(form, newCtx)
          newCtxVars.set(name, { letOrLoop: firstName })
          return [name, cval]
        })
        newCtx.bindings = cbindings
        const butLastBodies = bodies.slice(0, -1).map((b) => compile(b, newCtx))
        const newCtxTail = {
          ...newCtx,
          isLoopTailPosition: isLet ? isLoopTailPosition : true,
        }
        const lastBody = compile(bodies.at(-1), newCtxTail)
        return {
          type: 'let-loop',
          isLet,
          bindings: cbindings,
          butLastBodies,
          lastBody,
        }
      }
      case 'cont': {
        ctAssert(isLoopTailPosition, 'cont must be in loop tail position')
        const loopCtx = getEnclosingLoopCtx(ctx)
        ctAssert(loopCtx, 'cont must be inside a loop')
        const { bindings } = loopCtx
        ctAssert(
          bindings.length === rest.length,
          'wrong number of arguments to cont',
        )
        const args = rest.map((a) => compile(a, ctx))
        return { type: 'continue', args }
      }
      case 'quote': {
        ctAssert(rest.length === 1, 'quote must have 1 argument')
        const [arg] = rest
        const valueForm = formWithTokensToForm(arg)
        return { type: 'value', value: valueForm }
      }
      case 'quasiquote': {
        ctAssert(rest.length === 1, 'quasiquote must have 1 argument')
        const [arg] = rest
        const valueForm = formWithTokensToForm(arg)
        const quasiForm = quasiquote(valueForm)
        return compile(quasiForm, ctx)
      }
    } // end of special form switch

    const fnctx = funcCtxResolve(firstName)
    ctAssert(fnctx, 'undefined function/macro: ' + firstName)
    const { params, variadic, isMacro } = fnctx
    ctAssert(
      variadic || params.length === rest.length,
      `wrong number of arguments to: ${firstName}`,
    )
    if (isMacro)
      return {
        type: 'call',
        isMacroCall: true,
        name: firstName,
        args: rest.map(formWithTokensToForm),
      }
    return {
      type: 'call',
      isMacroCall: false,
      name: firstName,
      args: rest.map((a) => compile(a, ctx)),
    }
  }
  return (ast) => compile(ast, null)
}
