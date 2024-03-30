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
        return { tokenType: 'whitespace' }
      case ';':
        scan((c) => c !== '\n')
        index++
        return { tokenType: 'comment' }
      case '[':
      case ']':
        return { tokenType: firstChar }
      case `'`: {
        scan((c) => c !== "'" && !isControlChar(c))
        const text = inputString.slice(startIndex + 1, index)
        index++
        return { tokenType: 'string', text }
      }
    }
    assert(isSymbolChar(firstChar), `illegal character ${firstChar}`)
    scan(isSymbolChar)
    return {
      tokenType: 'word',
      text: inputString.slice(startIndex, index),
    }
  }
}

export const parse = (sArg) => {
  const lexer = makeLexer(sArg)
  let currentToken = null

  const next = () => {
    do {
      currentToken = lexer()
      if (currentToken === null) return
      const { tokenType } = currentToken
      if (tokenType === 'whitespace' || tokenType === 'comment') continue
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
      case 'word': {
        try {
          const bi = BigInt(text)
          assert(
            -0x80000000n <= bi && bi <= 0x7fffffffn,
            `number out of i32 range`,
          )
          return Number(bi)
        } catch (e) {
          if (!(e instanceof SyntaxError)) throw e
        }
        return symbol(text)
      }
      case '[':
        const list = []
        while (currentToken && currentToken.tokenType !== ']') {
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
