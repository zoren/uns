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

export const makeCompiler = (funcCtx) => {
  const compile = (ast, ctx) => {
    if (isInt32(ast) || typeof ast === 'string') return () => ast
    {
      const symbolName = isSymbol(ast)
      if (symbolName) {
        ctAssert(ctx.get(symbolName), 'undefined symbol: ' + symbolName)
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
        const fnCtx = new Map()
        for (const name of paramNames) fnCtx.set(name, { isParam: true })
        const cbodies = rest.slice(2, -1).map((f) => compile(f, fnCtx))
        const clastBody = compile(rest.at(-1), fnCtx)
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
        const newCtx = new Map(ctx)
        const cbindings = [...pairwise(bindings)].map(([binder, form]) => {
          const name = assertSymbol(binder, 'key must be a symbol')
          const cval = compile(form, newCtx)
          newCtx.set(name, { letOrLoop: firstName })
          return [name, cval]
        })
        const butLastBodies = bodies.slice(0, -1).map((b) => compile(b, newCtx))
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
        const cargs = rest.map((a) => compile(a, ctx))
        return (env, fenv) =>
          new ContinueWrapper(cargs.map((c) => c(env, fenv)))
      }
    } // end of switch on first name

    ctAssert(funcCtx.has(firstName), 'undefined function: ' + firstName)
    const { params } = funcCtx.get(firstName)
    ctAssert(
      params.length === rest.length,
      'wrong number of arguments to function: ' + firstName,
    )
    const cargs = rest.map((a) => compile(a, ctx))
    return (env, funcEnv) => {
      const fn = funcEnv.get(firstName)
      rtAssert(fn, 'undefined function: ' + firstName)
      return fn(...cargs.map((c) => c(env, funcEnv)))
    }
  }
  return (ast) => compile(ast, new Map())
}
