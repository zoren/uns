import { makeParser, print, makeEvaluator } from './wuns.js'

const assert = (cond, msg) => {
  if (!cond) throw new Error('test failed ' + msg)
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
[loop [r [quote 0] i [quote 10]] [if i [cont [add r i] [sub i [quote 1]]] r]] [.= 55]

[func inc [x] [add x [quote 1]]] [.= []]
[inc [quote 1]] [.= 2]
[inc [inc [quote 1]]] [.= 3]

[func list [.. args] args] [.= []]
[list [quote 1] [quote 2] [quote 3]] [.= [1 2 3]]

[func if-not [cond then else]
  [list [quote if] cond else then]]
[mac if-not [quote 0] [quote t] [quote f]] [.= t]
`
const funcEnv = new Map()
// would be cool to do in a host-func special form
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
