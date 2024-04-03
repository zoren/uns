import { isInt32, RuntimeError, symbol } from './lib.js'

export class CompileError extends Error {
  constructor(msg) {
    super('COMPILE: ' + msg)
  }
}

const ctAssert = (cond, msg) => {
  if (!cond) throw new CompileError(msg)
}

const rtAssert = (cond, msg) => {
  if (!cond) throw new RuntimeError(msg)
}

import { isSymbol } from './lib.js'

const assertSymbol = (form, msg) => {
  const { tokenType, value } = form
  const name = isSymbol(tokenType === 'symbol' ? value : form)
  ctAssert(name, msg)
  return name
}

const pairwise = function* (arr) {
  for (let i = 0; i < arr.length - 1; i += 2) {
    yield arr.slice(i, i + 2)
  }
}

class ContinueWrapper {
  constructor(args) {
    this.args = args
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

const formWithTokensToForm = (ast) => {
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
  if (Array.isArray(ast)) {
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

  throw new CompileError('quasiquote: unexpected form: ' + ast)
}

export const makeCompiler = (funcCtx) => {
  const compile = (ast, ctx) => {
    if (isInt32(ast) || typeof ast === 'string') return () => ast
    const { tokenType, value } = ast
    if (tokenType === 'value') return () => value
    {
      const symbolName =
        tokenType === 'symbol' ? isSymbol(value) : isSymbol(ast)
      if (symbolName) {
        ctAssert(
          getFromContext(ctx, symbolName),
          'undefined symbol: ' + symbolName,
        )
        return (env) => {
          while (true) {
            rtAssert(env !== null, 'undefined symbol: ' + symbolName)
            const { varValues, outer } = env
            if (varValues.has(symbolName)) return varValues.get(symbolName)
            env = outer
          }
        }
      }
    }
    ctAssert(Array.isArray(ast), 'ast must be an array at this point')
    if (ast.length === 0) return () => ast
    const [first, ...rest] = ast
    const firstName = assertSymbol(first, 'first element must be a symbol')
    const isLoopTailPosition = ctx && ctx.isLoopTailPosition
    switch (firstName) {
      case 'if': {
        ctAssert(rest.length === 3, 'if must have 3 arguments')
        const ccond = compile(rest[0], { ...ctx, isLoopTailPosition: false })
        const cthen = compile(rest[1], ctx)
        const celse = compile(rest[2], ctx)
        return (env, fenv) => {
          const econd = ccond(env, fenv)
          rtAssert(isInt32(econd), 'condition must be a number')
          return (econd !== 0 ? cthen : celse)(env, fenv)
        }
      }
      case 'func':
      case 'macro': {
        ctAssert(rest.length >= 3, 'func must have at least 3 arguments')
        const fname = assertSymbol(rest[0], 'first argument must be a symbol')
        ctAssert(Array.isArray(rest[1]), 'second argument must be a list')
        const paramNames = rest[1].map((x) =>
          assertSymbol(x, 'parameters must be symbols'),
        )
        const fnCtx = {
          params: paramNames.map((pname) => {
            pname
          }),
        }
        funcCtx.set(fname, fnCtx)
        const bodyCtxVars = new Map()
        for (const name of paramNames) bodyCtxVars.set(name, { isParam: true })
        const bodyCtx = { vars: bodyCtxVars, outer: ctx, bindingForm: ast }
        const cbodies = rest.slice(2, -1).map((f) => compile(f, bodyCtx))
        const clastBody = compile(rest.at(-1), bodyCtx)
        const arity = paramNames.length
        const mkParamEnv = (args) => {
          rtAssert(
            args.length === arity,
            `wrong number of arguments to ${firstName}: ${fname}`,
          )
          const varValues = new Map()
          for (let i = 0; i < arity; i++) varValues.set(paramNames[i], args[i])
          return varValues
        }
        const f = (env, fenv, args) => {
          const newEnv = { varValues: mkParamEnv(args), outer: env }
          for (const cbody of cbodies) cbody(newEnv, fenv)
          return clastBody(newEnv, fenv)
        }
        if (firstName === 'macro') {
          fnCtx.macroFunc = (env, fenv, ...args) => f(env, fenv, args)
          // todo should we return here
          return () => {
            return []
          }
        }
        return (env, fenv) => {
          fenv.set(fname, (...args) => f(env, fenv, args))
          return []
        }
      }
      case 'let':
      case 'loop': {
        ctAssert(
          rest.length >= 2,
          firstName + ' must have at least 2 arguments',
        )
        const [bindings, ...bodies] = rest
        ctAssert(Array.isArray(bindings), 'second argument must be a list')
        ctAssert(bindings.length % 2 === 0, 'bindings must be of even length')
        const newCtxVars = new Map()
        const newCtx = { vars: newCtxVars, outer: ctx, bindingForm: ast }

        const cbindings = [...pairwise(bindings)].map(([binder, form]) => {
          const name = assertSymbol(binder, 'key must be a symbol')
          const cval = compile(form, newCtx)
          newCtxVars.set(name, { letOrLoop: firstName })
          return [name, cval]
        })
        const bindingNames = cbindings.map(([name]) => name)
        const bindingCount = cbindings.length
        newCtx.bindingCount = bindingCount
        const cbind = (env, fenv) => {
          const varValues = new Map()
          const newEnv = { varValues, outer: env }
          for (const [name, cBindExpr] of cbindings)
            varValues.set(name, cBindExpr(newEnv, fenv))
          return newEnv
        }
        const butLastBodies = bodies.slice(0, -1).map((b) => compile(b, newCtx))
        if (firstName === 'let') {
          const lastBody = compile(bodies.at(-1), {
            ...newCtx,
            isLoopTailPosition,
          })
          return (env, fenv) => {
            const newEnv = cbind(env, fenv)
            for (const body of butLastBodies) body(newEnv, fenv)
            return lastBody(newEnv, fenv)
          }
        }
        const lastBody = compile(bodies.at(-1), {
          ...newCtx,
          isLoopTailPosition: true,
        })
        return (env, fenv) => {
          const newEnv = cbind(env, fenv)
          const { varValues } = newEnv
          while (true) {
            for (const body of butLastBodies) body(newEnv, fenv)
            const result = lastBody(newEnv, fenv)
            if (!(result instanceof ContinueWrapper)) return result
            const { args } = result
            rtAssert(
              bindingCount === args.length,
              'wrong number of arguments to cont',
            )
            for (let i = 0; i < bindingCount; i++)
              varValues.set(bindingNames[i], args[i])
          }
        }
      }
      case 'cont': {
        ctAssert(isLoopTailPosition, 'cont must be in loop tail position')
        const loopCtx = getEnclosingLoopCtx(ctx)
        ctAssert(loopCtx, 'cont must be inside a loop')
        const { bindingCount } = loopCtx
        ctAssert(
          bindingCount === rest.length,
          'wrong number of arguments to cont',
        )
        const cargs = rest.map((a) => compile(a, ctx))
        return (env, fenv) =>
          new ContinueWrapper(cargs.map((c) => c(env, fenv)))
      }
      case 'quote': {
        ctAssert(rest.length === 1, 'quote must have 1 argument')
        const [arg] = rest
        const valueForm = formWithTokensToForm(arg)
        return () => valueForm
      }
      case 'quasiquote': {
        ctAssert(rest.length === 1, 'quasiquote must have 1 argument')
        const [arg] = rest
        const valueForm = formWithTokensToForm(arg)
        const quasiForm = quasiquote(valueForm)
        return compile(quasiForm, ctx)
      }
    } // end of special form switch

    ctAssert(funcCtx.has(firstName), 'undefined function/macro: ' + firstName)
    const { params, variadic, macroFunc } = funcCtx.get(firstName)
    ctAssert(
      variadic || params.length === rest.length,
      `wrong number of arguments to ${
        macroFunc ? 'macro' : 'function'
      }: ${firstName}`,
    )
    if (macroFunc) {
      const valueArgs = rest.map(formWithTokensToForm)
      return (env, fenv) => {
        const form = macroFunc(env, fenv, ...valueArgs)
        const cform = compile(form, ctx)
        return cform(env, fenv)
      }
    }
    const cargs = rest.map((a) => compile(a, ctx))
    return (env, funcEnv) => {
      const fn = funcEnv.get(firstName)
      rtAssert(fn, 'undefined function: ' + firstName)
      return fn(...cargs.map((c) => c(env, funcEnv)))
    }
  }
  return (ast) => {
    const cform = compile(ast, null)
    return (fenv) => cform(null, fenv)
  }
}
