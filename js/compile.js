import { isInt32 } from './lib.js'

const ctAssert = (cond, msg) => {
  if (!cond) throw new Error('COMPILE: ' + msg)
}

const rtAssert = (cond, msg) => {
  if (!cond) throw new Error('RUNTIME: ' + msg)
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

class Recur {
  constructor(args) {
    this.args = args
  }
}

export const compile = (ast) => {
  if (isInt32(ast) || typeof ast === 'string') return () => ast
  {
    const symbolName = isSymbol(ast)
    if (symbolName) {
      return (env) => {
        if (!env.has(symbolName)) {
          console.log('undefined symbol: ' + symbolName)
          console.log(env)
        }
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
      const ccond = compile(rest[0])
      const cthen = compile(rest[1])
      const celse = compile(rest[2])
      return (env, fenv) => {
        const econd = ccond(env, fenv)
        rtAssert(isInt32(econd) && !isNaN(econd), 'condition must be a number')
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
      const cbodies = rest.slice(2, -1).map(compile)
      const clastBody = compile(rest.at(-1))
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
      ctAssert(rest.length >= 2, firstName + ' must have at least 2 arguments')
      const [bindings, ...bodies] = rest
      ctAssert(Array.isArray(bindings), 'second argument must be a list')
      ctAssert(bindings.length % 2 === 0, 'bindings must be of even length')
      const cbindings = [...pairwise(bindings)].map(([name, form]) => [
        assertSymbol(name, 'key must be a symbol'),
        compile(form),
      ])
      const butLastBodies = bodies.slice(0, -1).map(compile)
      const lastBody = compile(bodies.at(-1))
      if (firstName === 'let') {
        return (env, fenv) => {
          const newEnv = new Map(env)
          for (const [name, cBindExpr] of cbindings) {
            newEnv.set(name, cBindExpr(newEnv, fenv))
          }
          for (const body of butLastBodies) body(newEnv, fenv)
          return lastBody(newEnv, fenv)
        }
      }
      const bindingNames = cbindings.map(([name]) => name)
      const bindingCount = cbindings.length
      // todo check statically args to cont
      return (env, fenv) => {
        const newEnv = new Map(env)
        for (const [name, cBindExpr] of cbindings) {
          newEnv.set(name, cBindExpr(newEnv, fenv))
        }
        while (true) {
          for (const body of butLastBodies) body(newEnv, fenv)
          const result = lastBody(newEnv, fenv)
          if (!(result instanceof Recur)) return result
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
      const cargs = rest.map(compile)
      return (env, fenv) => new Recur(cargs.map((c) => c(env, fenv)))
    }
    case 'case': {
      ctAssert(rest.length >= 2, 'case must have at least 2 arguments')
      ctAssert(
        rest.length % 2 === 0,
        'case must have an even number of arguments',
      )
      const [key, ...cases] = rest
      const ckey = compile(key)
      const cCases = []
      const usedKeys = new Set()
      const checkDuplicateKeys = (k) => {
        ctAssert(!usedKeys.has(k), 'duplicate case key: ' + k)
        usedKeys.add(k)
      }
      for (const [caseKey, caseBody] of pairwise(cases)) {
        const cKeys = []
        if (isInt32(caseKey)) {
          ctAssert(!isNaN(caseKey), 'case key must be a number')
          checkDuplicateKeys(caseKey)
          cKeys.push(caseKey)
        } else if (Array.isArray(caseKey)) {
          for (const k of caseKey) {
            ctAssert(isInt32(k), 'case key in list must be a number ' + k)
            checkDuplicateKeys(k)
            cKeys.push(k)
          }
        } else {
          ctAssert(false, 'illegal case key')
        }
        cCases.push([cKeys, compile(caseBody)])
      }
      const cdefaultCase = compile(cases.at(-1))
      return (env) => {
        const ekey = ckey(env)
        rtAssert(isInt32(ekey), 'case key must be a number: ' + ekey)
        for (const [cKeys, cBody] of cCases) {
          for (const k of cKeys) {
            if (k === ekey) return cBody(env)
          }
        }
        return cdefaultCase(env)
      }
    }
  } // end of switch on first name

  const cargs = rest.map(compile)
  return (env, funcEnv) => {
    const fn = funcEnv.get(firstName)
    rtAssert(fn, 'undefined function: ' + firstName)
    return fn(...cargs.map((c) => c(env, funcEnv)))
  }
}
