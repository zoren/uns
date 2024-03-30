const assert = (cond, msg) => {
  if (!cond) throw new Error("built-in func assert" + msg)
}

export const makeFuncEnv = () => {
  const funcEnv = new Map()

  for (const [name, fn] of [
    ['add', (a, b) => a + b],
    ['sub', (a, b) => a - b],
    ['mul', (a, b) => a * b],

    ['bit-and', (a, b) => a & b],
    ['bit-or', (a, b) => a | b],
    ['xor', (a, b) => a ^ b],
    ['shift-right', (a, b) => a >> b],
  ]) {
    funcEnv.set(name, (a, b) => {
      assert(typeof a === 'number', 'first argument must be a number')
      assert(typeof b === 'number', 'second argument must be a number')
      return fn(a, b) | 0
    })
  }

  for (const [name, fn] of [
    ['eq', (a, b) => a === b],
    ['neq', (a, b) => a !== b],
    ['lt', (a, b) => a < b],
    ['le', (a, b) => a <= b],
    ['gt', (a, b) => a > b],
    ['ge', (a, b) => a >= b],
  ]) {
    funcEnv.set(name, (a, b) => {
      assert(typeof a === 'number', 'first argument must be a number')
      assert(typeof b === 'number', 'second argument must be a number')
      return Number(fn(a, b))
    })
  }

  funcEnv.set('list', (...args) => args)

  funcEnv.set('print', (...args) => {
    console.log(...args.map(print))
    return []
  })

  funcEnv.set('nth', (list, n) => {
    assert(Array.isArray(list), 'first argument must be a list')
    assert(typeof n === 'number', 'second argument must be a number')
    assert(n >= 0 && n < list.length, 'index out of bounds')
    return list[n]
  })

  funcEnv.set('abort', (msg) => {
    throw new Error('ABORT: ' + msg)
  })

  const memoryPages = 1
  const memory = new Uint8Array(65536 * memoryPages)

  funcEnv.set('memory-pages', () => memoryPages)

  const assertAddress = (addr, fname) => {
    assert(
      typeof addr === 'number',
      fname + ': address must be a number ' + typeof addr,
    )
    assert(addr >= 0 && addr < memory.length, fname + ': address out of bounds')
  }

  funcEnv.set('print-object', (addr) => {
    assertAddress(addr, 'print-object')
    const view = new DataView(memory.buffer)
    // return view.getInt32(addr, true)
    const tag = view.getInt32(addr, true)
    switch (tag) {
      case 1:
        console.log('i32: ' + view.getInt32(addr + 4, true))
        break
      case 15: {
        const bytes = new Uint8Array(memory.buffer, addr + 4, 1)
        console.log('char: ' + String.fromCharCode(...bytes))
        break
      }
      case 17: {
        const size = view.getInt32(addr + 4, true)
        const bytes = new Uint8Array(memory.buffer, addr + 8, size)
        console.log('string: ' + String.fromCharCode(...bytes))
        break
      }
      default:
        throw new Error('print-object: unknown tag ' + tag)
    }
    return []
  })

  funcEnv.set('memory-copy', (dest, src, size) => {
    assertAddress(dest, 'memory-copy')
    assertAddress(src, 'memory-copy')
    assert(typeof size === 'number', 'memory-copy: length must be a number')
    assert(size >= 0, 'memory-copy: length must be non-negative')
    assert(
      dest + size <= memory.length,
      'memory-copy: destination out of bounds',
    )
    assert(src + size <= memory.length, 'memory-copy: source out of bounds')
    memory.copyWithin(dest, src, src + size)
    return []
  })

  // https://github.com/WebAssembly/bulk-memory-operations/blob/master/proposals/bulk-memory-operations/Overview.md#memoryinit-instruction
  funcEnv.set('memory-init-string', (dest, s) => {
    assertAddress(dest, 'memory-init-string')
    assert(typeof s === 'string', 'memory-init-string: s must be a string')
    const textEncoder = new TextEncoder()
    const { read, written } = textEncoder.encodeInto(s, memory.subarray(dest))
    assert(
      read === s.length,
      'memory-init-string: could not encode entire string',
    )
    return []
  })

  funcEnv.set('load8u', (addr) => {
    assertAddress(addr, 'load8u')
    return memory[addr]
  })

  funcEnv.set('load32', (addr) => {
    assertAddress(addr, 'load32')
    const view = new DataView(memory.buffer)
    return view.getInt32(addr, true)
  })

  funcEnv.set('store8', (addr, value) => {
    assertAddress(addr, 'store8')
    assert(typeof value === 'number', 'store8: value must be a number')
    assert(value >= 0 && value < 256, 'store8: value out of bounds')
    memory[addr] = value
    return []
  })

  funcEnv.set('store32', (addr, value) => {
    assertAddress(addr, 'store32')
    assert(typeof value === 'number', 'store32: value must be a number')
    // memory[addr] = value
    const view = new DataView(memory.buffer)
    view.setInt32(addr, value, true)
    return []
  })

  let activeDataIndex = 4

  const align4 = (n) => (n + 3) & ~3

  funcEnv.set('active', (s) => {
    assert(typeof s === 'string', 'active: argument must be a string')
    const textEncoder = new TextEncoder()
    const { read, written } = textEncoder.encodeInto(
      s,
      memory.subarray(activeDataIndex),
    )
    assert(read === s.length, 'active: could not encode entire string')
    const pointer = activeDataIndex
    activeDataIndex += align4(written)
    return [pointer, written]
    // return 0
  })

  return funcEnv
}
