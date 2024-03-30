export const print = (x) => {
  switch (typeof x) {
    case 'string':
      return `'${x}'`
    case 'number':
      return String(x)
  }
  if (Array.isArray(x)) return `[${x.map(print).join(' ')}]`
  if (isSymbol(x)) return String(x)
  throw new Error(`cannot print ${x}`)
}
