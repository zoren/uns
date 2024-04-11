const assert = (cond, msg) => {
  if (!cond) throw new Error('assert failed: ' + msg)
}

const isWhitespace = (c) => c === ' ' || c === '\n'
const isSymbolChar = (c) => /[a-z0-9.=]|-/.test(c)

const lex = function* (s) {
  let index = 0
  while (index < s.length) {
    const tokStart = index
    const c = s[index++]
    if (isWhitespace(c)) continue
    if (c === '[' || c === ']') {
      yield c
      continue
    }
    assert(isSymbolChar(c), `illegal character ${c}`)
    while (index < s.length && isSymbolChar(s[index])) index++
    yield s.slice(tokStart, index)
  }
}

const tuple = (...args) => Object.freeze(args)
const unit = tuple()

export const makeParser = (is) => {
  const tokens = [...lex(is)]
  let index = 0
  const go = () => {
    while (true) {
      if (index >= tokens.length) return null
      const token = tokens[index]
      index++
      if (token !== '[') return token
      const list = []
      while (index < tokens.length && tokens[index] !== ']') list.push(go())
      index++
      return list.length === 0 ? unit : Object.freeze(list)
    }
  }

  return go
}

export const print = (x) => {
  if (typeof x === 'string') return x
  if (Array.isArray(x)) return `[${x.map(print).join(' ')}]`
  throw new Error(`cannot print ${x}`)
}

const continueSymbol = Symbol.for('wuns-continue')

export const makeEvaluator = (funcEnv) => {
  const wunsEval = (form, env) => {
    if (typeof form === 'string')
      while (true) {
        assert(env, 'undefined word: ' + form)
        const { varValues, outer } = env
        if (varValues.has(form)) return varValues.get(form)
        env = outer
      }

    assert(Array.isArray(form), `cannot eval ${form} expected string or array`)
    const [firstWord, ...args] = form
    switch (firstWord) {
      case 'quote':
        return args[0]
      case 'if':
        return wunsEval(args[wunsEval(args[0], env) === '0' ? 2 : 1], env)
      case 'let':
      case 'loop': {
        const [bindings, ...bodies] = args
        const varValues = new Map()
        const inner = { varValues, outer: env }
        for (let i = 0; i < bindings.length - 1; i += 2)
          varValues.set(bindings[i], wunsEval(bindings[i + 1], inner))
        while (true) {
          for (const body of bodies.slice(0, -1)) wunsEval(body, inner)
          const elast = wunsEval(bodies.at(-1), inner)
          if (firstWord !== 'loop' || !elast[continueSymbol]) return elast
          for (let i = 0; i < elast.length; i++)
            varValues.set(bindings[i * 2], elast[i])
        }
      }
      case 'cont': {
        const contArgs = args.map((a) => wunsEval(a, env))
        contArgs[continueSymbol] = true
        return Object.freeze(contArgs)
      }
      case 'func': {
        const [fname, origParams, ...bodies] = args
        let params = origParams
        let restParam = null
        if (origParams.at(-2) === '..') {
          params = origParams.slice(0, -2)
          restParam = origParams.at(-1)
        }
        const f = (...args) => {
          const varValues = new Map()
          for (let i = 0; i < params.length; i++)
            varValues.set(params[i], args[i])
          if (restParam) varValues.set(restParam, args.slice(params.length))
          const inner = { varValues, outer: null }
          for (const body of bodies.slice(0, -1)) wunsEval(body, inner)
          return wunsEval(bodies.at(-1), inner)
        }
        funcEnv.set(fname, f)
        return unit
      }
      case 'mac': {
        const [fname, ...margs] = args
        const macro = funcEnv.get(fname)
        assert(macro, `function ${fname} not found for macro call`)
        return wunsEval(macro(...margs), env)
      }
    }
    const func = funcEnv.get(firstWord)
    assert(func, `function ${firstWord} not found`)
    return func(...args.map((arg) => wunsEval(arg, env)))
  }
  return wunsEval
}
