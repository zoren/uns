const assert = (cond, msg) => {
  if (!cond) throw new Error('COMPILE: ' + msg)
}

import { isSymbol } from './lib.js'

class Recur {
  constructor(args) {
    this.args = args
  }
}

export const compile = (ast) => {
  if (typeof ast === 'number' || typeof ast === 'string') return () => ast
  if (isSymbol(ast)) {
    const { name } = ast
    return (env) => {
      if (!env.has(name)) {
        console.log('undefined symbol: ' + name)
        console.log(env)
      }
      assert(env.has(name), 'undefined symbol: ' + name)
      return env.get(name)
    }
  }
  assert(Array.isArray(ast), 'ast must be an array at this point')
  if (ast.length === 0) return () => ast
  const [first, ...rest] = ast
  assert(isSymbol(first), 'first element must be a symbol: ' + first)
  const { name } = first
  switch (name) {
    case 'if': {
      assert(rest.length === 3, 'if must have 3 arguments')
      const ccond = compile(rest[0])
      const cthen = compile(rest[1])
      const celse = compile(rest[2])
      return (env, fenv) => {
        const econd = ccond(env, fenv)
        assert(
          typeof econd === 'number' && !isNaN(econd),
          'condition must be a number',
        )
        return (econd !== 0 ? cthen : celse)(env, fenv)
      }
    }
    case 'func': {
      assert(rest.length >= 3, 'func must have at least 3 arguments')
      assert(isSymbol(rest[0]), 'first argument must be a symbol')
      const fname = rest[0].name
      assert(Array.isArray(rest[1]), 'second argument must be a list')
      const paramNames = rest[1].map((x) => {
        assert(isSymbol(x), 'parameters must be symbols')
        return x.name
      })
      const cbodies = rest.slice(2, -1).map(compile)
      const clastBody = compile(rest.at(-1))
      const arity = paramNames.length

      return (env, fenv) => {
        fenv.set(fname, (...args) => {
          assert(
            args.length === arity,
            'wrong number of arguments to function: ' + fname,
          )
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
      assert(rest.length >= 2, name + ' must have at least 2 arguments')
      const [bindings, ...bodies] = rest
      assert(Array.isArray(bindings), 'second argument must be a list')
      assert(bindings.length % 2 === 0, 'bindings must be of even length')

      const bindingNames = []
      const cBindExprs = []
      for (let i = 0; i < bindings.length; i += 2) {
        const key = bindings[i]
        assert(isSymbol(key), 'key must be a symbol')
        const { name } = key
        bindingNames.push(name)
        cBindExprs.push(compile(bindings[i + 1]))
      }

      const butLastBodies = bodies.slice(0, -1).map(compile)
      const lastBody = compile(bodies.at(-1))
      const bindingCount = bindingNames.length
      if (name === 'let') {
        return (env, fenv) => {
          const newEnv = new Map(env)
          for (let i = 0; i < bindingCount; i++) {
            newEnv.set(bindingNames[i], cBindExprs[i](newEnv, fenv))
          }
          for (const body of butLastBodies) body(newEnv, fenv)
          return lastBody(newEnv, fenv)
        }
      }
      // todo check statically args to cont
      return (env, fenv) => {
        const newEnv = new Map(env)
        for (let i = 0; i < bindingCount; i++) {
          newEnv.set(bindingNames[i], cBindExprs[i](newEnv, fenv))
        }
        while (true) {
          for (const body of butLastBodies) body(newEnv, fenv)
          const result = lastBody(newEnv, fenv)
          if (!(result instanceof Recur)) return result
          const { args } = result
          assert(
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
      assert(rest.length >= 2, 'switch must have at least 2 arguments')
      assert(
        rest.length % 2 === 0,
        'switch must have an even number of arguments',
      )
      const [key, ...cases] = rest
      const ckey = compile(key)
      const cCases = []
      const usedKeys = new Set()
      const checkDuplicateKeys = (k) => {
        assert(!usedKeys.has(k), 'duplicate case key: ' + k)
        usedKeys.add(k)
      }
      for (let i = 0; i < cases.length - 1; i += 2) {
        const caseKey = cases[i]
        const cKeys = []
        if (typeof caseKey === 'number') {
          assert(!isNaN(caseKey), 'case key must be a number')
          checkDuplicateKeys(caseKey)
          cKeys.push(caseKey)
        } else if (Array.isArray(caseKey)) {
          for (const k of caseKey) {
            assert(
              typeof k === 'number',
              'case key in list must be a number ' + k,
            )
            checkDuplicateKeys(k)
            cKeys.push(k)
          }
        } else {
          assert(false, 'illegal case key')
        }
        cCases.push([cKeys, compile(cases[i + 1])])
      }
      const cdefaultCase = compile(cases.at(-1))
      return (env) => {
        const ekey = ckey(env)
        assert(typeof ekey === 'number', 'switch key must be a number')
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
    const fn = funcEnv.get(name)
    assert(fn, 'undefined function: ' + name)
    return fn(...cargs.map((c) => c(env, funcEnv)))
  }
}
