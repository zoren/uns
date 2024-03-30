// uns is a lispy programming language using primarily the characters one can reach without using the shift key
// uns uses [ and ] for lists
// ; for line comments
// 0x20 and 0x09 for whitespace
// '' for strings
// symbols are only [a-z0-9.-=]
// only 32 bit signed integers are supported for now
// all other characters are illegal

import { isSymbol } from './lib.js'

const assert = (cond, msg) => {
  if (!cond) throw new Error("EVAL " + msg)
}

class Recur {
  constructor(args) {
    this.args = args
  }
}

export const makeEvaluator = (funcEnv) => {
  const EVAL = (ast, env) => {
    assert(ast !== undefined, 'ast is undefined')
    assert(ast !== null, 'ast is null')
    if (typeof ast === 'number' || typeof ast === 'string') return ast
    if (isSymbol(ast)) {
      const { name } = ast
      assert(env.has(name), 'undefined symbol: ' + name)
      return env.get(name)
    }
    assert(Array.isArray(ast), 'ast must be an array at this point')
    if (ast.length === 0) return ast
    const [first, ...rest] = ast
    assert(isSymbol(first), 'first element must be a symbol: ' + first + ' ' + rest)
    const { name } = first
    switch (name) {
      case 'if': {
        assert(rest.length === 3, 'if must have 3 arguments')
        const [cond, then, else_] = rest
        const econd = EVAL(cond, env)
        assert(typeof econd === 'number', 'condition must be a number')
        assert(!isNaN(econd), 'condition must be a number')
        return EVAL(econd !== 0 ? then : else_, env)
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
        const bodies = rest.slice(2, -1)
        const lastBody = rest.at(-1)
        const fn = (...args) => {
          assert(
            args.length === paramNames.length,
            'wrong number of arguments to function: ' + fname,
          )
          const newEnv = new Map(env)
          for (let i = 0; i < args.length; i++) {
            newEnv.set(paramNames[i], args[i])
          }
          for (const body of bodies) {
            EVAL(body, newEnv)
          }
          return EVAL(lastBody, newEnv)
        }
        funcEnv.set(fname, fn)
        return []
      }
      case 'let':
      case 'loop': {
        assert(rest.length >= 2, name + ' must have at least 2 arguments')
        const [bindings, ...bodies] = rest
        assert(Array.isArray(bindings), 'second argument must be a list')
        assert(bindings.length % 2 === 0, 'bindings must be of even length')
        const newEnv = new Map(env)
        const bindingNames = []
        for (let i = 0; i < bindings.length; i += 2) {
          const key = bindings[i]
          assert(isSymbol(key), 'key must be a symbol')
          const { name } = key
          bindingNames.push(name)
          newEnv.set(name, EVAL(bindings[i + 1], newEnv))
        }
        const butLastBodies = bodies.slice(0, -1)
        const lastBody = bodies.at(-1)
        if (name === 'let') {
          for (const body of butLastBodies) {
            EVAL(body, newEnv)
          }
          return EVAL(lastBody, newEnv)
        }
        while (true) {
          for (const body of butLastBodies) {
            EVAL(body, newEnv)
          }
          const result = EVAL(lastBody, newEnv)
          if (!(result instanceof Recur)) return result
          const { args } = result
          assert(
            bindingNames.length === args.length,
            'wrong number of arguments to recur',
          )
          for (let i = 0; i < args.length; i++) {
            newEnv.set(bindingNames[i], args[i])
          }
        }
      }
      case 'cont':
        return new Recur(rest.map((x) => EVAL(x, env)))
      case 'case': {
        assert(rest.length >= 2, 'switch must have at least 2 arguments')
        assert(
          rest.length % 2 === 0,
          'switch must have an even number of arguments',
        )
        const [key, ...cases] = rest
        const ekey = EVAL(key, env)
        assert(typeof ekey === 'number', 'switch key must be a number')
        for (let i = 0; i < cases.length - 1; i += 2) {
          const caseKey = cases[i]
          if (typeof caseKey === 'number') {
            if (caseKey === ekey) return EVAL(cases[i + 1], env)
          } else if (Array.isArray(caseKey)) {
            for (const k of caseKey) {
              assert(typeof k === 'number', 'case key must be a number')
              if (k === ekey) return EVAL(cases[i + 1], env)
            }
          } else {
            assert(false, 'illegal case key')
          }
        }
        return EVAL(cases.at(-1), env)
      }
    }

    const fn = funcEnv.get(name)
    assert(fn, 'undefined function: ' + name)
    return fn(...rest.map((x) => EVAL(x, env)))
  }
  return EVAL
}
