import { isInt32, RuntimeError } from './lib.js'

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
  const name = isSymbol(form)
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
  const { vars, outer } = ctx
  if (!vars) {
    console.error('no vars in context', ctx)
  }
  if (vars.has(name)) return vars.get(name)
  return getFromContext(outer, name)
}

export const makeCompiler = (funcCtx) => {
  const compile = (ast, ctx) => {
    if (isInt32(ast) || typeof ast === 'string') return () => ast
    {
      const symbolName = isSymbol(ast)
      if (symbolName) {
        ctAssert(getFromContext(ctx, symbolName), 'undefined symbol: ' + symbolName)
        return (env) => {
          rtAssert(env.has(symbolName), 'undefined symbol: ' + symbolName)
          return env.get(symbolName)
        }
      }
    }
    ctAssert(Array.isArray(ast), 'ast must be an array at this point')
    if (ast.length === 0) return () => ast
    const [first, ...rest] = ast
    const firstName = assertSymbol(first, 'first element must be a symbol')
    switch (firstName) {
      case 'if': {
        ctAssert(rest.length === 3, 'if must have 3 arguments')
        const ccond = compile(rest[0], ctx)
        // propagate tail position here
        const cthen = compile(rest[1], ctx)
        const celse = compile(rest[2], ctx)
        return (env, fenv) => {
          const econd = ccond(env, fenv)
          rtAssert(
            isInt32(econd) && !isNaN(econd),
            'condition must be a number',
          )
          return (econd !== 0 ? cthen : celse)(env, fenv)
        }
      }
      case 'func': {
        ctAssert(rest.length >= 3, 'func must have at least 3 arguments')
        const fname = assertSymbol(rest[0], 'first argument must be a symbol')
        ctAssert(Array.isArray(rest[1]), 'second argument must be a list')
        const paramNames = rest[1].map((x) =>
          assertSymbol(x, 'parameters must be symbols'),
        )
        funcCtx.set(fname, {
          params: paramNames.map((pname) => {
            pname
          }),
        })
        const bodyCtxVars = new Map()
        for (const name of paramNames) bodyCtxVars.set(name, { isParam: true })
        const bodyCtx = { vars: bodyCtxVars, outer: ctx }
        const cbodies = rest.slice(2, -1).map((f) => compile(f, bodyCtx))
        // should be compiled as in tail position
        const clastBody = compile(rest.at(-1), bodyCtx)
        const arity = paramNames.length
        return (env, fenv) => {
          fenv.set(fname, (...args) => {
            rtAssert(
              args.length === arity,
              'wrong number of arguments to function: ' + fname,
            )
            // todo don't copy env
            const newEnv = new Map(env)
            for (let i = 0; i < arity; i++) newEnv.set(paramNames[i], args[i])
            for (const cbody of cbodies) cbody(newEnv, fenv)
            return clastBody(newEnv, fenv)
          })
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
        const newCtx = { vars: newCtxVars, outer: ctx }

        const cbindings = [...pairwise(bindings)].map(([binder, form]) => {
          const name = assertSymbol(binder, 'key must be a symbol')
          const cval = compile(form, newCtx)
          newCtxVars.set(name, { letOrLoop: firstName })
          return [name, cval]
        })
        const butLastBodies = bodies.slice(0, -1).map((b) => compile(b, newCtx))
        // compile last body as in tail position, but only if in a loop??
        const lastBody = compile(bodies.at(-1), newCtx)
        if (firstName === 'let')
          return (env, fenv) => {
            const newEnv = new Map(env)
            for (const [name, cBindExpr] of cbindings) {
              newEnv.set(name, cBindExpr(newEnv, fenv))
            }
            for (const body of butLastBodies) body(newEnv, fenv)
            return lastBody(newEnv, fenv)
          }

        const bindingNames = cbindings.map(([name]) => name)
        const bindingCount = cbindings.length
        // todo check statically args arity to cont
        return (env, fenv) => {
          const newEnv = new Map(env)
          for (const [name, cBindExpr] of cbindings) {
            newEnv.set(name, cBindExpr(newEnv, fenv))
          }
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
              newEnv.set(bindingNames[i], args[i])
          }
        }
      }
      case 'cont': {
        // check we are in tail position of a loop, or let in a loop
        // and arity matches
        const cargs = rest.map((a) => compile(a, ctx))
        return (env, fenv) =>
          new ContinueWrapper(cargs.map((c) => c(env, fenv)))
      }
    } // end of special form switch

    ctAssert(funcCtx.has(firstName), 'undefined function: ' + firstName)
    const { params, variadic } = funcCtx.get(firstName)
    ctAssert(
      variadic || params.length === rest.length,
      'wrong number of arguments to function: ' + firstName,
    )
    const cargs = rest.map((a) => compile(a, ctx))
    return (env, funcEnv) => {
      const fn = funcEnv.get(firstName)
      rtAssert(fn, 'undefined function: ' + firstName)
      return fn(...cargs.map((c) => c(env, funcEnv)))
    }
  }
  return (ast) => {
    const cform = compile(ast, null)
    return (fenv) => cform(new Map(), fenv)
  }
}
