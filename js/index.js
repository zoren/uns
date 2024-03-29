// uns is a lispy programming language using primarily the characters one can reach without using the shift key
// uns uses [ and ] for lists
// ; for line comments
// 0x20 and 0x09 for whitespace
// '' for strings
// symbols are only [a-z0-9.-=]
// only 32 bit signed integers are supported for now
// all other characters are illegal

const isWhitespace = (c) => c === ' ' || c === '\n'
const isSymbol = (c) => /[a-z0-9.=]|-/.test(c)

const assert = (cond, msg) => {
  if (!cond) throw new Error(msg)
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
      const i = scan((c) => c !== "'")
      return [{ text: s.slice(1, i), tokenType: 'string' }, s.slice(i + 1)]
    }
    default:
      assert(isSymbol(c), `illegal character ${c}`)
      const i = scan(isSymbol)
      return [{ text: s.slice(0, i), tokenType: 'symbol' }, s.slice(i)]
  }
}

const allTokens = (s) => {
  const tokens = []
  let rest = s
  while (rest.length > 0) {
    const [token, newRest] = firstToken(rest)
    tokens.push(token)
    rest = newRest
  }
  return tokens
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
    const pnext = () => {
      if (s.length === 0) return null
      let [token, newS] = firstToken(s)
      s = newS
      return token
    }
    let token = pnext()
    while (
      token &&
      (token.tokenType === 'whitespace' || token.tokenType === 'comment')
    ) {
      token = pnext()
    }
    currentToken = token
  }

  next()

  const readForm = () => {
    const token = currentToken
    assert(token, 'unexpected end of input')
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
  return readForm()
}

const funcEnv = new Map()

const EVAL = (ast, env) => {
  assert(ast !== undefined, 'ast is undefined')
  assert(ast !== null, 'ast is null')
  if (!Array.isArray(ast)) {
    if (ast instanceof UnsSymbol) {
      const { name } = ast
      if (env.has(name)) return env.get(name)
      if (funcEnv.has(name)) return funcEnv.get(name)
      throw new Error(`undefined symbol ${name}`)
    }
    if (Array.isArray(ast)) return ast.map((x) => EVAL(x, env))
    return ast
  }
  if (ast.length === 0) return ast
  const [first, ...rest] = ast
  if (first instanceof UnsSymbol) {
    const name = first.name
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
    }
  }

  const [fn, ...args] = ast.map((x) => EVAL(x, env))
  assert(
    typeof fn === 'function',
    'first element must be a function: ' + fn + ' ' + ast[0],
  )
  return fn(...args)
}

const print = (x) => {
  if (Array.isArray(x)) {
    return `[${x.map(print).join(' ')}]`
  }
  return String(x)
}

funcEnv.set('add', (a, b) => a + b)
funcEnv.set('sub', (a, b) => a - b)

const run = (s) => {
  console.log(s)
  const form = parse(s)
  return print(EVAL(form, funcEnv))
}

const tests = [
  [`3`, `[add 1 2]`],
  [`2`, `[add 1 [sub 3 2]]`],
  [`2`, `[if 0 1 2]`],
  [`1`, `[if 1 1 2]`],
  [`[]`, `[func inc [x] [add x 1]]`],
  [`2`, `[inc 1]`],
]
let i = 0
for (const [expected, input] of tests) {
  const result = run(input)
  assert(result === expected, `expected ${expected}, got ${result}`)
  i++
}
console.log(`ran ${i} tests`)
