// uns is a lispy programming language using primarily the characters one can reach without using the shift key
// uns uses [ and ] for lists
// ; for line comments
// 0x20 and 0x09 for whitespace
// '' for strings
// symbols are only [a-z0-9.-=]
// only 32 bit signed integers are supported for now
// all other characters are illegal

const assert = (cond, msg) => {
  if (!cond) throw new Error(msg)
}

const isWhitespace = (c) => c === ' ' || c === '\n'
const isSymbol = (c) => /[a-z0-9.=]|-/.test(c)
const isControl = (c) => {
  const code = c.charCodeAt(0)
  return code < 32 || code === 127
}

const firstToken = (s) => {
  if (s.length === 0) return null
  const c = s[0]
  const scan = (pred) => {
    let i = 1
    while (i < s.length && pred(s[i])) i++
    return i
  }
  switch (c) {
    case ';': {
      const i = scan((c) => c !== '\n')
      return [{ text: s.slice(0, i), tokenType: 'comment' }, s.slice(i + 1)]
    }
    case ' ':
    case '\n': {
      const i = scan(isWhitespace)
      return [{ text: s.slice(0, i), tokenType: 'whitespace' }, s.slice(i)]
    }
    case '[':
    case ']':
      return [{ text: c, tokenType: 'bracket' }, s.slice(1)]
    case "'": {
      const i = scan((c) => c !== "'" && !isControl(c))
      return [{ text: s.slice(1, i), tokenType: 'string' }, s.slice(i + 1)]
    }
    default:
      assert(isSymbol(c), `illegal character ${c}`)
      const i = scan(isSymbol)
      return [{ text: s.slice(0, i), tokenType: 'symbol' }, s.slice(i)]
  }
}

class UnsSymbol {
  constructor(name) {
    this.name = name
  }
  toString() {
    return this.name
  }
}

const parse = (s) => {
  let currentToken = null

  const next = () => {
    do {
      if (s.length === 0) {
        currentToken = null
        return
      }
      let [ntoken, newS] = firstToken(s)
      s = newS
      const { tokenType } = ntoken
      if (tokenType === 'whitespace' || tokenType === 'comment') continue
      currentToken = ntoken
      return
    } while (true)
  }

  next()

  const readForm = () => {
    const token = currentToken
    if (!token) return null
    next()
    const { text, tokenType } = token
    switch (tokenType) {
      case 'string':
        return text
      case 'symbol': {
        if (text.startsWith('0x')) {
          const h = parseInt(text.slice(2), 16)
          assert(!isNaN(h), `illegal hex number ${text}`)
          return h
        }
        const n = parseInt(text, 10)
        if (!isNaN(n)) {
          return n
        }
        return new UnsSymbol(text)
      }
      case 'bracket':
        assert(text === '[', 'unexpected bracket')
        const list = []
        while (currentToken && currentToken.text !== ']') {
          list.push(readForm())
        }
        assert(currentToken, 'unexpected end of input')
        next()
        return list

      default:
        throw new Error(`unexpected token ${text} of type ${tokenType}`)
    }
  }
  return readForm
}

class Recur {
  constructor(args) {
    this.args = args
  }
}

const funcEnv = new Map()

const EVAL = (ast, env) => {
  assert(ast !== undefined, 'ast is undefined')
  assert(ast !== null, 'ast is null')
  if (typeof ast === 'number' || typeof ast === 'string') return ast
  if (ast instanceof UnsSymbol) {
    const { name } = ast
    assert(env.has(name), 'undefined symbol: ' + name)
    return env.get(name)
  }
  assert(Array.isArray(ast), 'ast must be an array at this point')
  if (ast.length === 0) return ast
  const [first, ...rest] = ast
  assert(first instanceof UnsSymbol, 'first element must be a symbol: ' + first)
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
      assert(rest[0] instanceof UnsSymbol, 'first argument must be a symbol')
      const fname = rest[0].name
      assert(Array.isArray(rest[1]), 'second argument must be a list')
      const paramNames = rest[1].map((x) => {
        assert(x instanceof UnsSymbol, 'parameters must be symbols')
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
        assert(key instanceof UnsSymbol, 'key must be a symbol')
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
    case 'recur':
      return new Recur(rest.map((x) => EVAL(x, env)))
    case 'switch': {
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

const print = (x) => {
  switch (typeof x) {
    case 'string':
      return `'${x}'`
    case 'number':
      return String(x)
    // functions aren't values
    // case 'function':
    //   return '#<function>'
  }
  if (Array.isArray(x)) return `[${x.map(print).join(' ')}]`
  if (x instanceof UnsSymbol) return x.name
  // if (x instanceof Recur) return `#<recur ${print(x.args)}>`
  throw new Error(`cannot print ${x}`)
}

for (const [name, fn] of [
  ['add', (a, b) => a + b],
  ['sub', (a, b) => a - b],

  ['and', (a, b) => a & b],
  ['or', (a, b) => a | b],
]) {
  funcEnv.set(name, (a, b) => {
    assert(typeof a === 'number', 'first argument must be a number')
    assert(typeof b === 'number', 'second argument must be a number')
    return fn(a, b)
  })
}

for (const [name, fn] of [
  ['eq', (a, b) => a === b],
  ['lt', (a, b) => a < b],
  ['le', (a, b) => a <= b],
  ['gt', (a, b) => a > b],
  ['ge', (a, b) => a >= b],
]) {
  funcEnv.set(name, (a, b) => {
    assert(typeof a === 'number', 'first argument must be a number')
    assert(typeof b === 'number', 'second argument must be a number')
    return Number(fn(a, b))
  })
}

funcEnv.set('list', (...args) => args)

export const run = (s) => print(EVAL(parse(s)(), new Map()))

export const runAll = (s) => {
  const readForm = parse(s)
  let form
  while ((form = readForm())) {
    console.log(print(EVAL(form, new Map())))
  }
}
