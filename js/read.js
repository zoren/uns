const assert = (cond, msg) => {
  if (!cond) throw new Error('READ ' + msg)
}

import { symbol } from './lib.js'

const isControlChar = (c) => {
  const code = c.charCodeAt(0)
  return code < 32 || code === 127
}

const isSymbolChar = (c) => /[a-z0-9.=]|-/.test(c)

export const parse = (sArg) => {
  const inputString = sArg
  let index = 0
  let currentToken = null

  const next = () => {
    do {
      currentToken = null
      if (index >= inputString.length) return
      const startIndex = index
      const firstChar = inputString[index]
      index++
      const scan = (pred) => {
        let i = index
        while (i < inputString.length && pred(inputString[i])) i++
        index = i
      }
      switch (firstChar) {
        case ';':
          scan((c) => c !== '\n')
          index++
          continue
        case ' ':
        case '\n':
          scan((c) => c === ' ' || c === '\n')
          continue
        case '[':
        case ']':
          currentToken = { text: firstChar, tokenType: 'bracket' }
          return
        case `'`: {
          scan((c) => c !== "'" && !isControlChar(c))
          currentToken = {
            text: inputString.slice(startIndex + 1, index),
            tokenType: 'string',
          }
          index++
          return
        }
      }
      assert(isSymbolChar(firstChar), `illegal character ${firstChar}`)
      scan(isSymbolChar)
      currentToken = {
        text: inputString.slice(startIndex, index),
        tokenType: 'word',
      }
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
