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

export const parse = (inputString) => {
  const lexer = makeLexer(inputString)
  let token = null
  const next = () => {
    token = lexer()
    return null
  }
  next()
  const currentToken = () => token

  const readForm = () => {
    const token = currentToken()
    assert(token !== null, 'unexpected end of input in readForm')
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
          list.push(readForm())
        }
        return Object.freeze(list)
      }
      case ']':
        throw new Error('unexpected ]')
      default:
        return token
    }
  }

  return readForm
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
  const actual = parse(input)()
  const jsonExpected = JSON.stringify(expected)
  const jsonActual = JSON.stringify(actual)
  assert(
    jsonExpected === jsonActual,
    `for '${input}' expected ${jsonExpected} but got ${jsonActual}`,
  )
}
