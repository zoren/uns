import { makeParser, print, makeEvaluator, parse1, parseAll } from './wuns.js'

const assert = (cond, msg) => {
  if (!cond) throw new Error('test failed ' + msg)
}

const parseTests = [
  ['a', 'a'],
  ['a', ' a '],
  ['a', ' a'],
  [[], '['],
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
  const actual = parse1(input)
  const jsonExpected = JSON.stringify(expected)
  const jsonActual = JSON.stringify(actual)
  assert(
    jsonExpected === jsonActual,
    `for '${input}' expected ${jsonExpected} but got ${jsonActual}`,
  )
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
  const actual = print(parse1(input))
  assert(
    expected === actual,
    `for '${input}' expected ${expected} but got ${actual}`,
  )
}

const isDecIntWord = (s) => /^[0-9]+$/.test(s)

const mkFuncEnv = () => {
  const funcEnv = new Map()
  // would be cool to do in a host-func special form
  funcEnv.set('add', (a, b) => String(Number(a) + Number(b)))
  funcEnv.set('sub', (a, b) => String(Number(a) - Number(b)))

  funcEnv.set('bit-and', (a, b) => String(Number(a) & Number(b)))
  funcEnv.set('bit-or', (a, b) => String(Number(a) | Number(b)))

  funcEnv.set('eq', (a, b) => String(Number(Boolean(a === b))))
  funcEnv.set('lt', (a, b) => String(Number(Boolean(Number(a) < Number(b)))))
  funcEnv.set('gt', (a, b) => String(Number(Boolean(Number(a) > Number(b)))))
  funcEnv.set('ge', (a, b) => String(Number(Boolean(Number(a) >= Number(b)))))
  funcEnv.set('le', (a, b) => String(Number(Boolean(Number(a) <= Number(b)))))

  funcEnv.set('size', (a) => String(Number(a.length)))
  funcEnv.set('nth', (v, i) => {
    const ni = Number(i)
    if (ni < 0 || ni >= v.length) {
      console.log('nth error', ni, v.length, i, v)
      throw new Error('index out of bounds: ' + i)
    }
    return v[ni]
  })
  funcEnv.set('slice', (v, i, j) => v.slice(Number(i), Number(j)))
  funcEnv.set('list', (...args) => args)
  funcEnv.set('concat', (...args) => args.flat())
  funcEnv.set('concat-words', (ws) => ws.join(''))
  funcEnv.set('is-word', (s) => typeof s === 'string')
  funcEnv.set('word', (cs) => {
    // assert(is)
    assert(Array.isArray(cs), 'word expects array')
    assert(cs.length > 0, 'word expects non-empty array')
    return cs
      .map((c) => {
        if (typeof c !== 'string') throw new Error('word expects words')
        assert(isDecIntWord(c), 'word expects word chars' + c)
        const s = String.fromCharCode(parseInt(c, 10))
        // assert(isWordChar(s), 'word expects word chars: '+s)
        return s
      })
      .join('')
  })
  funcEnv.set('log', (a) => console.log(print(a)) || a)

  funcEnv.set('abort', (w) => {
    throw new Error(print(w))
  })

  return funcEnv
}

const tests = `
[quote 7] [.= 7]
[quote 007] [.= 007]
[quote x] [.= x]

[if [quote 0] [quote t] [quote f]] [.= f]
[if [quote 1] [quote t] [quote f]] [.= t]

[let [a [quote 1]] a] [.= 1]
[let [a [quote 1] b a] b] [.= 1]
[let [] [quote 007]] [.= 007]
[let [bond [quote 007]] bond] [.= 007]

[loop [a [quote 1]] a] [.= 1]
[loop [r [quote 0] i [quote 10]] 
  [if i
    [cont [add r i] [sub i [quote 1]]]
    r]] [.= 55]
[loop [r [quote 0] i [quote 10]]
  [if i
    [let [] [cont [add r i] [sub i [quote 1]]]]
    r]] [.= 55]

[func inc [x] [add x [quote 1]]] [.= []]
[inc [quote 1]] [.= 2]
[inc [inc [quote 1]]] [.= 3]

[func list [.. args] args] [.= []]
[list [quote 1] [quote 2] [quote 3]] [.= [1 2 3]]

[macro if-not [cond then else]
  [list [quote if] cond else then]]
[if-not [quote 0] [quote t] [quote f]] [.= t]
`
{
  const funcEnv = mkFuncEnv()
  const wunsEval = makeEvaluator(funcEnv)
  const forms = parseAll(tests)

  let prev = null
  let eprev = null

  let asserts = 0
  for (const form of forms) {
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
}

import fs from 'fs'

const selfWuns = fs.readFileSync('examples/self.wuns', 'utf8')
const funcEnv = mkFuncEnv()

const wunsEval = makeEvaluator(funcEnv)
const forms = parseAll(selfWuns)

for (const form of forms) {
  if (form === null) break
  wunsEval(form)
}

const stringToWunsList = (s) => {
  const chars = s.split('')
  const words = chars.map((c) => String(c.charCodeAt(0)))
  return words
}
const parseChars = funcEnv.get('parse-chars')
console.log(
  'parse-chars',
  parseChars(stringToWunsList('[if [quote 0] [quote t] [quote f]]')),
)

for (const [expected, input] of parseTests) {
  console.log('parse self!', expected, input)
  const actual = parseChars(stringToWunsList(input))
  const jsonExpected = JSON.stringify(expected)
  const jsonActual = JSON.stringify(actual)
  assert(
    jsonExpected === jsonActual,
    `for '${input}' expected ${jsonExpected} but got ${jsonActual}`,
  )
}
