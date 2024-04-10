const assert = (cond, msg) => {
  if (!cond) throw new Error('READ ' + msg)
}

const isSymbolChar = (c) => /[a-z0-9.=]|-/.test(c)

export const makeParser = (inputString) => {
  let index = 0
  const go = () => {
    while (true) {
      if (index >= inputString.length) return null
      const startIndex = index
      const firstChar = inputString[index]
      index++
      switch (firstChar) {
        case '\n':
        case ' ':
          continue
        case '[': {
          const list = []
          while (true) {
            if (index >= inputString.length) break
            const c = inputString[index]
            if (c === ' ' || c === '\n') {
              index++
              continue
            }
            if (c === ']') {
              index++
              break
            }
            list.push(go())
          }
          return Object.freeze(list)
        }
        case ']':
          throw new Error('unexpected ]')
      }
      assert(isSymbolChar(firstChar), `illegal character ${firstChar}`)
      while (index < inputString.length && isSymbolChar(inputString[index]))
        index++
      if (startIndex >= index) throw new Error('empty symbol')
      return inputString.slice(startIndex, index)
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

const tuple = (...args) => Object.freeze(args)
const unit = tuple()

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
      case 'func': {
        const [fname, params, ...bodies] = args
        let restParam = null
        if (params.at(-2) === '..') {
          params = params.slice(0, -2)
          restParam = params.at(-1)
        }
        const f = (...args) => {
          const varValues = new Map()
          const inner = { varValues, outer: null }
          for (let i = 0; i < params.length; i++)
            varValues.set(params[i], args[i])
          if (restParam) varValues.set(restParam, args.slice(params.length))
          for (const body of bodies.slice(0, -1)) wunsEval(body, inner)
          return wunsEval(bodies.at(-1), inner)
        }
        funcEnv.set(fname, f)
        return unit
      }
    }
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

[func inc [x] [add x [quote 1]]] [.= []]
[inc [quote 1]] [.= 2]
[inc [inc [quote 1]]] [.= 3]
`
const funcEnv = new Map()
funcEnv.set('add', (a, b) => String(Number(a) + Number(b)))
funcEnv.set('sub', (a, b) => String(Number(a) - Number(b)))
const wunsEval = makeEvaluator(funcEnv)
const parse = makeParser(tests)

let prev = null
let eprev = null

let asserts = 0
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
    asserts++
    continue
  }

  prev = form
  eprev = wunsEval(form)
}
console.log('ran eval', asserts, 'asserts')
