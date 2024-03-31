class UnsSymbol {
  constructor(name) {
    this.name = name
  }
  toString() {
    return this.name
  }
}

export const isSymbol = (form) => (form instanceof UnsSymbol ? form.name : null)

const assert = (cond, msg) => {
  if (!cond) throw new Error('LIB ' + msg)
}

export const symbol = (name) => {
  assert(typeof name === 'string', 'symbol name must be a string')
  assert(name.length > 0, 'symbol name must not be empty')
  return new UnsSymbol(name)
}

export const isInt32 = (x) => typeof x === 'number' && !isNaN(x) && (x | 0) === x

export class RuntimeError extends Error {
  constructor(msg) {
    super('RUNTIME: ' + msg)
  }
}
