const assert = (cond, msg) => {
  if (!cond) throw new Error('assert failed: ' + msg)
}

const isWhitespace = (c) => c === ' ' || c === '\n'
export const isWordChar = (c) => /[a-z0-9.=]|-/.test(c)

const lexerFromString = (s) => {
  let index = 0
  return () => {
    while (index < s.length) {
      const tokStart = index
      const c = s[index++]
      if (isWhitespace(c)) continue
      if (c === '[' || c === ']') return c
      assert(isWordChar(c), `illegal character ${c}`)
      while (index < s.length && isWordChar(s[index])) index++
      return s.slice(tokStart, index)
    }
    return null
  }
}

const tuple = (...args) => Object.freeze(args)
export const unit = tuple()

const makeParserFromLexer = (lexNext) => {
  let token = lexNext()
  const nextToken = () => (token = lexNext())
  const go = () => {
    if (token === null) return null
    {
      const peekTok = token
      nextToken()
      if (peekTok !== '[') return peekTok
    }
    const list = []
    while (true) {
      if (token === null || token === ']') break
      list.push(go())
    }
    nextToken()
    return list.length === 0 ? unit : Object.freeze(list)
  }
  return go
}

export const makeParser = (is) => {
  const lexer = lexerFromString(is)
  return makeParserFromLexer(lexer)
}

export const parse1 = (s) => makeParser(s)()

export const parseAll = (s) => {
  const parser = makeParser(s)
  const forms = []
  while (true) {
    const form = parser()
    if (form === null) break
    forms.push(form)
  }
  return forms
}

export const print = (x) => {
  if (typeof x === 'string') return x
  if (Array.isArray(x)) return `[${x.map(print).join(' ')}]`
  throw new Error(`cannot print ${x}`)
}

const symbolContinue = Symbol.for('wuns-continue')
const symbolFuncOrMacro = Symbol.for('wuns-func-or-macro')

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
    if (form.length === 0) return unit
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
          if (firstWord !== 'loop' || !elast[symbolContinue]) return elast
          for (let i = 0; i < elast.length; i++)
            varValues.set(bindings[i * 2], elast[i])
        }
      }
      case 'cont': {
        const contArgs = args.map((a) => wunsEval(a, env))
        contArgs[symbolContinue] = true
        return Object.freeze(contArgs)
      }
      case 'func':
      case 'macro': {
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
        f[symbolFuncOrMacro] = firstWord
        funcEnv.set(fname, f)
        return unit
      }
    }
    const funcOrMacro = funcEnv.get(firstWord)
    assert(funcOrMacro, `function ${firstWord} not found ${print(form)}`)
    if (funcOrMacro[symbolFuncOrMacro] === 'macro')
      return wunsEval(funcOrMacro(...args), env)
    return funcOrMacro(...args.map((arg) => wunsEval(arg, env)))
  }
  const gogomacro = (form) => {
    if (typeof form === 'string') return form
    assert(Array.isArray(form), `cannot expand ${form} expected string or array`)
    if (form.length === 0) return unit
    const [firstWord, ...args] = form
    switch (firstWord) {
      case 'quote':
        return form
      case 'if':
        return [firstWord, ...args.map(gogomacro)]
      case 'let':
      case 'loop': {
        const [bindings, ...bodies] = args
        return [
          firstWord,
          bindings.map((borf, i) => (i % 2 === 0 ? borf : gogomacro(borf))),
          ...bodies.map(gogomacro),
        ]
      }
      case 'cont':
        return [firstWord, ...args.map(gogomacro)]
      case 'func':
      case 'macro': {
        const [fname, origParams, ...bodies] = args
        return [firstWord, fname, origParams, ...bodies.map(gogomacro)]
      }
    }
    const funcOrMacro = funcEnv.get(firstWord)
    if (funcOrMacro && funcOrMacro[symbolFuncOrMacro] === 'macro')
      return gogomacro(funcOrMacro(...args.map(gogomacro)))
    return [firstWord, ...args.map(gogomacro)]
  }
  return (form) => wunsEval(gogomacro(form), null)
}
