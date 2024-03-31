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
        scan((c) => c !== "'" && !isControlChar(c))
        const text = inputString.slice(startIndex + 1, index)
        index++
        return { tokenType: 'string', text, startIndex }
      }
    }
    assert(isSymbolChar(firstChar), `illegal character ${firstChar}`)
    scan(isSymbolChar)
    return {
      tokenType: 'word',
      text: inputString.slice(startIndex, index),
      startIndex,
    }
  }
}

const textToNumberOrSymbol = (text) => {
  try {
    const bi = BigInt(text)
    assert(-0x80000000n <= bi && bi <= 0x7fffffffn, `number out of i32 range`)
    return Number(bi)
  } catch (e) {
    if (!(e instanceof SyntaxError)) throw e
  }
  return symbol(text)
}

const setOrGetMeta = (form) => {
  if (form.meta === undefined) form.meta = {}
  return form.meta
}

export const parse = (sArg) => {
  const lexer = makeLexer(sArg)
  let currentToken = null

  let prevForm = null

  const next = () => {
    do {
      currentToken = lexer()
      if (currentToken === null) return
      const { tokenType } = currentToken
      if (tokenType === 'comment') {
        if (prevForm !== null) {
          setOrGetMeta(prevForm).comments = []
          const { comments } = prevForm.meta
          comments.push(currentToken)
        }
        continue
      }
      if (tokenType === 'whitespace') continue
      return
    } while (true)
  }

  next()

  const readForm = () => {
    const token = currentToken
    next()
    const { text, tokenType } = token
    switch (tokenType) {
      case 'string':
        prevForm = null
        return text
      case 'word':
        prevForm = null
        return textToNumberOrSymbol(text)
      case '[': {
        const list = []
        setOrGetMeta(list).startBracket = token
        while (true) {
          if (currentToken === null) break
          const { tokenType } = currentToken
          if (tokenType === ']') {
            prevForm = list
            next()
            break
          }
          list.push(readForm())
        }
        return list
      }
      default:
        throw new Error(`unexpected token ${text} of type ${tokenType}`)
    }
  }

  const readForms = () => {
    const forms = []
    while (currentToken !== null) forms.push(readForm())
    return forms
  }

  return { readForms }
}
