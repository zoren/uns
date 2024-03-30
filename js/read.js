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
      const firstChar = inputString[index]
      const scan = (pred) => {
        let i = index + 1
        while (i < inputString.length && pred(inputString[i])) i++
        return i
      }
      switch (firstChar) {
        case ';':
          index = scan((c) => c !== '\n') + 1
          continue
        case ' ':
        case '\n':
          index = scan((c) => c === ' ' || c === '\n')
          continue
        case '[':
        case ']':
          index++
          currentToken = { text: firstChar, tokenType: 'bracket' }
          return
        case `'`: {
          const i = scan((c) => c !== "'" && !isControlChar(c))
          const text = inputString.slice(index + 1, i)
          index = i + 1
          currentToken = { text, tokenType: 'string' }
          return
        }
      }
      assert(isSymbolChar(firstChar), `illegal character ${firstChar}`)
      const i = scan(isSymbolChar)
      const text = inputString.slice(index, i)
      index = i
      currentToken = { text, tokenType: 'word' }
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
