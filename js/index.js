// uns is a lispy programming language using primarily the characters one can reach without using the shift key
// uns uses [ and ] for lists
// ; for line comments
// 0x20 and 0x09 for whitespace
// '' for strings
// symbols are only [a-z0-9.-=]
// only 32 bit signed integers are supported for now
// all other characters are illegal

const isWhitespace = (c) => c === ' ' || c === '\n'
const isSymbol = (c) => /[a-z0-9.=]|-/.test(c)

const firstToken = (s) => {
  if (s.length === 0) return null
  const c = s[0]
  const scan = (pred) => {
    let i = 1
    while (i < s.length && pred(s[i])) i++
    return i
  }
  switch (c) {
    case ';': {
      const i = scan((c) => c !== '\n')
      return [{ text: s.slice(0, i), tokenType: 'comment' }, s.slice(i + 1)]
    }
    case ' ':
    case '\n': {
      const i = scan(isWhitespace)
      return [{ text: s.slice(0, i), tokenType: 'whitespace' }, s.slice(i)]
    }
    case '[':
    case ']':
      return [{ text: c, tokenType: 'bracket' }, s.slice(1)]
    case "'": {
      const i = scan((c) => c !== "'")
      return [{ text: s.slice(1, i), tokenType: 'string' }, s.slice(i + 1)]
    }
    default:
      if (!isSymbol(c)) {
        throw new Error(`illegal character ${c}`)
      }
      const i = scan(isSymbol)
      return [{ text: s.slice(0, i), tokenType: 'symbol' }, s.slice(i)]
  }
}

const allTokens = (s) => {
  const tokens = []
  let rest = s
  while (rest.length > 0) {
    const [token, newRest] = firstToken(rest)
    tokens.push(token)
    rest = newRest
  }
  return tokens
}

const parse = (s) => {
  let currentToken = null
  const next = () => {
    const pnext = () => {
      if (s.length === 0) return null
      let [token, newS] = firstToken(s)
      s = newS
      return token
    }
    let token = pnext()
    while (
      token &&
      (token.tokenType === 'whitespace' || token.tokenType === 'comment')
    ) {
      token = pnext()
    }
    currentToken = token
  }

  next()

  const readForm = () => {
    const token = currentToken
    if (!token) throw new Error('unexpected end of input')
    next()
    const { text, tokenType } = token
    switch (tokenType) {
      case 'string':
        return text
      case 'symbol': {
        if (text.startsWith('0x')) {
          const h = parseInt(text.slice(2), 16)
          if (isNaN(h)) throw new Error(`illegal hex number ${text}`)
          return h
        }
        const n = parseInt(text, 10)
        if (!isNaN(n)) {
          return n
        }
        return text
      }
      case 'bracket':
        if (text === '[') {
          const list = []
          while (currentToken && currentToken.text !== ']') {
            list.push(readForm())
          }
          if (!currentToken) throw new Error('unexpected end of input')
          next()
          return list
        } else {
          throw new Error('unexpected ]')
        }
      default:
        throw new Error(`unexpected token ${text} of type ${tokenType}`)
    }
  }
  return readForm()
}

console.dir(parse(`[hello 324 0x20 'wor ld' 0x20]`))
