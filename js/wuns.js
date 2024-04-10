const assert = (cond, msg) => {
  if (!cond) throw new Error('READ ' + msg)
}

const isSymbolChar = (c) => /[a-z0-9.=]|-/.test(c)

const makeLexer = (inputString) => {
  assert(typeof inputString === 'string', 'inputString must be a string')

  let index = 0
  return () => {
    while (true) {
      if (index >= inputString.length) return null
      const startIndex = index
      const firstChar = inputString[index++]
      switch (firstChar) {
        case '\n':
        case ' ':
          continue
        case '[':
        case ']':
          return firstChar
      }
      assert(
        isSymbolChar(firstChar),
        `illegal character ${firstChar} charcode ${firstChar.charCodeAt(0)}`,
      )
      while (index < inputString.length && isSymbolChar(inputString[index]))
        index++
      return inputString.slice(startIndex, index)
    }
  }
}

const lexTests = [
  [[], ''],
  [[], ' '],
  [[], ' \n'],

  [['a'], 'a'],
  [['a', 'b', 'c'], ' a b c'],
  [['a', 'b', 'c'], ' a b c '],
  [['abdc', 'b', 'c', '[', ']'], ' abdc b c [ ] '],
  [['[', '[', ']', ']'], ' [[] ] '],
]

for (const [expected, input] of lexTests) {
  const lexer = makeLexer(input)
  const actual = []
  let token
  while ((token = lexer()) !== null) {
    actual.push(token)
  }
  const jsonExpected = JSON.stringify(expected)
  const jsonActual = JSON.stringify(actual)
  assert(
    jsonExpected === jsonActual,
    `for '${input}' expected ${jsonExpected} but got ${jsonActual}`,
  )
}

export const makeParser = (inputString) => {
  const lexer = makeLexer(inputString)
  let token = null
  const next = () => {
    token = lexer()
    return null
  }
  next()
  const currentToken = () => token

  const go = () => {
    const token = currentToken()
    if (token === null) return null
    next()
    switch (token) {
      case '[': {
        const list = []
        while (true) {
          const t = currentToken()
          if (t === null) break
          if (t === ']') {
            next()
            break
          }
          list.push(go())
        }
        return Object.freeze(list)
      }
      case ']':
        throw new Error('unexpected ]')
      default:
        return token
    }
  }

  return go
}

const parseTests = [
  ['a', 'a'],
  ['a', ' a '],
  ['a', ' a'],
  [[], '[]'],
  [[], ' [ ] '],
  [['a'], '[a]'],
  [['a'], ' [ a ] '],
  [['a', 'b', 'c'], ' [ a b c ] '],
  [['a', ['b', 'c']], ' [ a [ b c ] ] '],
  [['a', ['b', 'c']], ' [ a [ b c ] ] '],
  [['a', ['b', 'c', 'd']], ' [ a [ b c d ] ] '],
]

for (const [expected, input] of parseTests) {
  const actual = makeParser(input)()
  const jsonExpected = JSON.stringify(expected)
  const jsonActual = JSON.stringify(actual)
  assert(
    jsonExpected === jsonActual,
    `for '${input}' expected ${jsonExpected} but got ${jsonActual}`,
  )
}

const print = (x) => {
  if (typeof x === 'string') return x
  if (Array.isArray(x)) return `[${x.map(print).join(' ')}]`
  throw new Error(`cannot print ${x}`)
}

const printTests = [
  ['a', 'a'],
  ['a', ' a '],
  ['a', ' a'],
  ['[]', '[]'],
  ['[]', ' [ ] '],
  ['[a]', '[a]'],
  ['[a]', ' [ a ] '],
  ['[a b c]', ' [ a b c ] '],
  ['[a [b c]]', ' [ a [ b c ] ] '],
  ['[a [b c]]', ' [ a [ b c ] ] '],
  ['[a [b c d]]', ' [ a [ b c d ] ] '],
]

for (const [expected, input] of printTests) {
  const actual = print(makeParser(input)())
  assert(
    expected === actual,
    `for '${input}' expected ${expected} but got ${actual}`,
  )
}

const continueSymbol = Symbol.for('wuns-continue')

const makeEvaluator = (funcEnv) => {
  const wunsEval = (form, env) => {
    if (typeof form === 'string')
      while (true) {
        assert(env, 'undefined word: ' + form)
        const { varValues, outer } = env
        if (varValues.has(form)) return varValues.get(form)
        env = outer
      }

    assert(
      Array.isArray(form),
      `cannot eval ${form} expected string or array, found:  ${typeof form}`,
    )
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
          if (!elast[continueSymbol]) return elast
          for (let i = 0; i < elast.length; i++)
            varValues.set(bindings[i * 2], elast[i])
        }
      }
      case 'cont': {
        const contArgs = args.map((a) => wunsEval(a, env))
        contArgs[continueSymbol] = true
        return Object.freeze(contArgs)
      }
    }
    // throw new Error(`cannot eval ${print(form)}`)
    const func = funcEnv.get(firstWord)
    return func(...args.map((arg) => wunsEval(arg, env)))
  }
  return wunsEval
}

const tests = `
[quote 007] [.= 007]
[quote 007] [.= 007]
[quote x] [.= x]

[if [quote 0] [quote t] [quote f]] [.= f]
[if [quote 1] [quote t] [quote f]] [.= t]

[let [a [quote 1]] a] [.= 1]
[let [a [quote 1] b a] b] [.= 1]
[let [] [quote 007]] [.= 007]
[let [bond [quote 007]] bond] [.= 007]

[loop [a [quote 1]] a] [.= 1]
[loop [r [quote 0] i [quote 10]] [if i [cont [add r i] [sub i [quote 1]]] r]] [.= 55]
`
const funcEnv = new Map()
funcEnv.set('add', (a, b) => String(Number(a) + Number(b)))
funcEnv.set('sub', (a, b) => String(Number(a) - Number(b)))
const wunsEval = makeEvaluator(funcEnv)
const parse = makeParser(tests)

let prev = null
let eprev = null

while (true) {
  const form = parse()
  if (form === null) break
  if (Array.isArray(form) && form[0] === '.=') {
    const [_, second] = form
    if (prev === null) continue
    const peprev = print(eprev)
    const pesec = print(second)
    assert(
      peprev === pesec,
      `for ${print(prev)} expected '${pesec}' but got '${peprev}'`,
    )
    continue
  }

  prev = form
  eprev = wunsEval(form)
}
