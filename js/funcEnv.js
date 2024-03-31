import { isInt32 } from './lib.js'
import { print } from './print.js'
import { RuntimeError } from './lib.js'

class RuntimeErrorBuiltIn extends RuntimeError {
  constructor(msg) {
    super('BUILT-In: ' + msg)
  }
}

const assert = (cond, msg) => {
  if (!cond) throw new RuntimeErrorBuiltIn(msg)
}

export const funcCtx = new Map()
{
  const params = [
    { pname: 'a', type: 'i32' },
    { pname: 'b', type: 'i32' },
  ]
  const results = [{ type: 'i32' }]
  for (const n of [
    'add',
    'sub',
    'mul',
    'bit-and',
    'bit-or',
    'xor',
    'shift-right',

    'eq',
    'neq',
    'lt',
    'le',
    'gt',
    'ge',
  ]) {
    funcCtx.set(n, { params, results })
  }
}

funcCtx.set('abort', {params: [{pname: 'msg', type: 'string'}], results: []})

export const makeFuncCtx = () => {
  return new Map(funcCtx)
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
    funcEnv.set(name, (...args) => {
      assert(args.length === 2, name + ': expected 2 arguments')
      const [a, b] = args
      assert(isInt32(a), 'first argument must be a number')
      assert(isInt32(b), 'second argument must be a number')
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
    funcEnv.set(name, (...args) => {
      assert(args.length === 2, name + ': expected 2 arguments')
      const [a, b] = args
      assert(isInt32(a), 'first argument must be a number')
      assert(isInt32(b), 'second argument must be a number')
      return Number(fn(a, b))
    })
  }

  funcEnv.set('list', (...args) => args)

  funcEnv.set('print', (...args) => {
    console.log(...args.map(print))
    return []
  })

  funcEnv.set('nth', (...args) => {
    assert(args.length === 2, 'expected 2 arguments')
    const [list, n] = args
    assert(Array.isArray(list), 'first argument must be a list')
    assert(isInt32(n), 'second argument must be a number')
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
    assert(isInt32(addr), fname + ': address must be a number ' + typeof addr)
    assert(addr >= 0 && addr < memory.length, fname + ': address out of bounds')
  }

  funcEnv.set('print-object', (...args) => {
    assert(args.length === 1, 'print-object: expected 1 argument')
    const [addr] = args
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

  funcEnv.set('memory-copy', (...args) => {
    assert(args.length === 3, 'memory-copy: expected 3 arguments')
    const [dest, src, size] = args
    assertAddress(dest, 'memory-copy')
    assertAddress(src, 'memory-copy')
    assert(isInt32(size), 'memory-copy: length must be a number')
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
  funcEnv.set('memory-init-string', (...args) => {
    assert(args.length === 2, 'memory-init-string: expected 2 arguments')
    const [dest, s] = args
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

  funcEnv.set('load8u', (...args) => {
    assert(args.length === 1, 'load8u: expected 1 argument')
    const [addr] = args
    assertAddress(addr, 'load8u')
    return memory[addr]
  })

  funcEnv.set('load32', (...args) => {
    assert(args.length === 1, 'load32: expected 1 argument')
    const [addr] = args
    assertAddress(addr, 'load32')
    const view = new DataView(memory.buffer)
    return view.getInt32(addr, true)
  })

  funcEnv.set('store8', (...args) => {
    assert(args.length === 2, 'store8: expected 2 arguments')
    const [addr, value] = args
    assertAddress(addr, 'store8')
    assert(isInt32(value), 'store8: value must be a number')
    assert(value >= 0 && value < 256, 'store8: value out of bounds')
    memory[addr] = value
    return []
  })

  funcEnv.set('store32', (...args) => {
    assert(args.length === 2, 'store32: expected 2 arguments')
    const [addr, value] = args
    assertAddress(addr, 'store32')
    assert(isInt32(value), 'store32: value must be a number')
    // memory[addr] = value
    const view = new DataView(memory.buffer)
    view.setInt32(addr, value, true)
    return []
  })

  let activeDataIndex = 4

  const align4 = (n) => (n + 3) & ~3

  funcEnv.set('active', (...args) => {
    assert(args.length === 1, 'active: expected 1 argument')
    const [s] = args
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
  })

  return funcEnv
}
