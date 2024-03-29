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
      const i = scan((c) => c === ' ' || c === '\n')
      return [{ text: s.slice(0, i), tokenType: 'whitespace' }, s.slice(i)]
    }
    case '[':
    case ']':
      return [{ text: c, tokenType: 'bracket' }, s.slice(1)]
    case `'`: {
      const isControlChar = (c) => {
        const code = c.charCodeAt(0)
        return code < 32 || code === 127
      }
      const i = scan((c) => c !== "'" && !isControlChar(c))
      return [{ text: s.slice(1, i), tokenType: 'string' }, s.slice(i + 1)]
    }
    default:
      const isSymbolChar = (c) => /[a-z0-9.=]|-/.test(c)
      assert(isSymbolChar(c), `illegal character ${c}`)
      const i = scan(isSymbolChar)
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

const isSymbol = (form) => form instanceof UnsSymbol

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
        try {
          const bi = BigInt(text)
          assert(-0x80000000n <= bi && bi <= 0x7fffffffn, `number out of range`)
          return Number(bi)
        } catch (e) {
          if (!(e instanceof SyntaxError)) throw e
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
  if (isSymbol(ast)) {
    const { name } = ast
    assert(env.has(name), 'undefined symbol: ' + name)
    return env.get(name)
  }
  assert(Array.isArray(ast), 'ast must be an array at this point')
  if (ast.length === 0) return ast
  const [first, ...rest] = ast
  assert(isSymbol(first), 'first element must be a symbol: ' + first)
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
  if (isSymbol(x)) return x.name
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
    return fn(a, b) | 0
  })
}

for (const [name, fn] of [
  ['eq', (a, b) => a === b],
  ['neq', (a, b) => a !== b],
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

funcEnv.set('print', (...args) => {
  console.log(...args.map(print))
  return []
})

funcEnv.set('nth', (list, n) => {
  assert(Array.isArray(list), 'first argument must be a list')
  assert(typeof n === 'number', 'second argument must be a number')
  assert(n >= 0 && n < list.length, 'index out of bounds')
  return list[n]
})

const memoryPages = 1
const memory = new Uint8Array(65536 * memoryPages)

funcEnv.set('load8u', (addr) => {
  assert(typeof addr === 'number', 'load8u: address must be a number')
  assert(addr >= 0 && addr < memory.length, 'load8u: address out of bounds')
  return memory[addr]
})

funcEnv.set('store8', (addr, value) => {
  assert(typeof addr === 'number', 'store8: address must be a number')
  assert(addr >= 0 && addr < memory.length, 'store8: address out of bounds')
  assert(typeof value === 'number', 'store8: value must be a number')
  assert(value >= 0 && value < 256, 'store8: value out of bounds')
  memory[addr] = value
  return value
})

let activeDataIndex = 0

const align4 = (n) => (n + 3) & ~3

funcEnv.set('active', (s) => {
  assert(typeof s === 'string', 'active: argument must be a string')
  const textEncoder = new TextEncoder()
  const { read, written } = textEncoder.encodeInto(
    s,
    memory.subarray(activeDataIndex),
  )
  assert(read === s.length, 'active: could not encode entire string')
  const pointer = activeDataIndex
  activeDataIndex += align4(written)
  return [pointer, written]
  // return 0
})

export const run = (s) => print(EVAL(parse(s)(), new Map()))

export const runAll = (s) => {
  const readForm = parse(s)
  let form
  while ((form = readForm())) {
    console.log(print(EVAL(form, new Map())))
  }
}
