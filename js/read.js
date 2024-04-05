const assert = (cond, msg) => {
  if (!cond) throw new Error('READ ' + msg)
}

import { symbol } from './lib.js'

const isControlChar = (c) => {
  const code = c.charCodeAt(0)
  return code < 32 || code === 127
}

const isSymbolChar = (c) => /[a-z0-9.=]|-/.test(c)

const makeLexer = (inputString) => {
  assert(typeof inputString === 'string', 'inputString must be a string')
  let index = 0
  return () => {
    if (index >= inputString.length) return null
    const startIndex = index
    const firstChar = inputString[startIndex]
    index++
    const scan = (pred) => {
      let i = index
      while (i < inputString.length && pred(inputString[i])) i++
      index = i
    }
    switch (firstChar) {
      case '\n':
      case ' ':
        scan((c) => c === ' ' || c === '\n')
        return {
          tokenType: 'whitespace',
          text: inputString.slice(startIndex, index),
          startIndex,
        }
      case ';':
        scan((c) => c !== '\n')
        index++
        return {
          tokenType: 'comment',
          text: inputString.slice(startIndex + 1, index - 1),
          startIndex,
        }
      case '[':
      case ']':
        return { tokenType: firstChar, startIndex }
      case `'`: {
        // todo this allows chars greater than 127
        scan((c) => c !== "'" && !isControlChar(c))
        const text = inputString.slice(startIndex + 1, index)
        // should we skip over when it's a control char?
        index++
        return { tokenType: 'value', text, startIndex, value: text }
      }
    }
    assert(
      isSymbolChar(firstChar),
      `illegal character ${firstChar} charcode ${firstChar.charCodeAt(0)}`,
    )
    scan(isSymbolChar)
    const text = inputString.slice(startIndex, index)

    try {
      const bi = BigInt(text)
      assert(-0x80000000n <= bi && bi <= 0x7fffffffn, `number out of i32 range`)
      // maybe only allow decimal numbers, and only allow leading zeroes for the number 0
      // also maybe use bigint for the number we can bound check at compile time
      return {
        tokenType: 'value',
        text,
        startIndex,
        value: Number(bi),
      }
    } catch (e) {
      if (!(e instanceof SyntaxError)) throw e
    }
    return {
      tokenType: 'symbol',
      text,
      startIndex,
      value: symbol(text),
    }
  }
}

export const makeLexBox = (inputString) => {
  const lexer = makeLexer(inputString)
  let token = null
  const currentToken = () => token
  const next = () => {
    token = lexer()
    return null
  }
  return {
    currentToken,
    next,
  }
}

const skipWhitespaceComments = ({ currentToken, next }) => {
  do {
    const token = currentToken()
    if (token === null) return
    const { tokenType } = token
    if (tokenType !== 'comment' && tokenType !== 'whitespace') return
    next()
  } while (true)
}

export const parse = (lexBox) => {
  lexBox.next()

  const readForm = () => {
    skipWhitespaceComments(lexBox)
    const token = lexBox.currentToken()
    assert(token !== null, 'unexpected end of input in readForm')
    lexBox.next()
    const { text, tokenType, startIndex } = token
    switch (tokenType) {
      case 'value':
      case 'symbol':
        return token
      case '[': {
        const list = []
        while (true) {
          skipWhitespaceComments(lexBox)
          const currentToken = lexBox.currentToken()
          if (currentToken === null) break
          const { tokenType } = currentToken
          if (tokenType === ']') {
            lexBox.next()
            break
          }
          list.push(readForm())
        }
        return list
      }
      default:
        throw new Error(
          `unexpected token ${text} of type ${tokenType} at ${startIndex}`,
        )
    }
  }

  return readForm
}
