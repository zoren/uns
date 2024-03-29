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
      if (!isSymbol(c)) {
        throw new Error(`illegal character ${c}`)
      }
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
    if (!token) throw new Error('unexpected end of input')
    next()
    const { text, tokenType } = token
    switch (tokenType) {
      case 'string':
        return text
      case 'symbol': {
        if (text.startsWith('0x')) {
          const h = parseInt(text.slice(2), 16)
          if (isNaN(h)) throw new Error(`illegal hex number ${text}`)
          return h
        }
        const n = parseInt(text, 10)
        if (!isNaN(n)) {
          return n
        }
        return new UnsSymbol(text)
      }
      case 'bracket':
        if (text === '[') {
          const list = []
          while (currentToken && currentToken.text !== ']') {
            list.push(readForm())
          }
          if (!currentToken) throw new Error('unexpected end of input')
          next()
          return list
        } else {
          throw new Error('unexpected ]')
        }
      default:
        throw new Error(`unexpected token ${text} of type ${tokenType}`)
    }
  }
  return readForm()
}

const assert = (cond, msg) => {
  if (!cond) throw new Error(msg)
}

const EVAL = (ast, env) => {
  if (!Array.isArray(ast)) {
    if (typeof ast === 'number' || typeof ast === 'string') return ast
    if (ast instanceof UnsSymbol) return env.get(ast.name)
    if (Array.isArray(ast)) return ast.map((x) => EVAL(x, env))
    return ast
  }
  if (ast.length === 0) return ast
  const [first, ...rest] = ast
  if (first instanceof UnsSymbol) {
    const name = first.name
    switch (name) {
      case 'if': {
        const [cond, then, else_] = rest
        const econd = EVAL(cond, env)
        assert(typeof econd === 'number', 'condition must be a number')
        return EVAL(econd !== 0 ? then : else_, env)
      }
    }
  }

  const [fn, ...args] = ast.map((x) => EVAL(x, env))
  assert(typeof fn === 'function', 'first element must be a function')
  return fn(...args)
}

const print = (x) => {
  if (Array.isArray(x)) {
    return `[${x.map(print).join(' ')}]`
  }
  return String(x)
}

const env = new Map()
env.set('add', (a, b) => a + b)
env.set('sub', (a, b) => a - b)

const run = (s) => {
  console.log(s)
  const form = parse(s)
  return print(EVAL(form, env))
}

const tests = [
  [`3`, `[add 1 2]`],
  [`2`, `[add 1 [sub 3 2]]`],
  [`2`, `[if 0 1 2]`],
  [`1`, `[if 1 1 2]`],
]
let i = 0
for (const [expected, input] of tests) {
  const result = run(input)
  assert(result === expected, `expected ${expected}, got ${result}`)
  i++
}
console.log(`ran ${i} tests`)
