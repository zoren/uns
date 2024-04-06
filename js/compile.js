import { RuntimeError, isInt32, symbol } from './lib.js'

import { isSymbol } from './lib.js'

const pairwise = function* (arr) {
  for (let i = 0; i < arr.length - 1; i += 2) {
    yield arr.slice(i, i + 2)
  }
}

const getFromContext = (ctx, name) => {
  if (ctx === null) return null
  const { vars } = ctx
  if (vars.has(name)) return vars.get(name)
  return getFromContext(ctx.outer, name)
}

const getEnclosingLoopCtx = (ctx) => {
  while (ctx !== null) {
    const { bindingForm, outer } = ctx
    const { tokenType, value } = bindingForm[0]
    if (tokenType === 'symbol' && isSymbol(value) === 'loop') return ctx
    ctx = outer
  }
  return null
}

const rtAssert = (cond, msg) => {
  if (!cond) throw new RuntimeError(msg)
}

class ContinueWrapper {
  constructor(args) {
    this.args = args
  }
}

const evalData = (funMacEnv, macroCompiler) => {
  const evalD = (data, env) => {
    const { type } = data
    switch (type) {
      case 'value':
        return data.value
      case 'symbol': {
        const { name } = data
        while (true) {
          rtAssert(env !== null, 'undefined symbol: ' + name)
          const { varValues, outer } = env
          if (varValues.has(name)) return varValues.get(name)
          env = outer
        }
      }
      case 'if': {
        const econd = evalD(data.cond, env)
        rtAssert(isInt32(econd), 'condition must be a number')
        return evalD(econd === 0 ? data.else : data.then, env)
      }
      case 'call': {
        const { name, callType, args } = data
        const funmac = funMacEnv.get(name)
        rtAssert(funmac, 'undefined funmac: ' + name)
        switch (callType) {
          case 'func':
            return funmac(...args.map((a) => evalD(a, env)))
          case 'macro':
            const res = funmac(...args)
            const compiledRes = macroCompiler(res)
            const evaledRes = evalD(compiledRes, env)
            return evaledRes
        }
        throw new RuntimeError('unexpected funmacType: ' + callType)
      }
      case 'funmac': {
        const { funmacType, fname, paramNames, butLastBodies, lastBody } = data
        const arity = paramNames.length
        const f = (...args) => {
          rtAssert(
            args.length === arity,
            `wrong number of arguments to ${funmacType}: ${fname}`,
          )
          const varValues = new Map()
          for (let i = 0; i < arity; i++) varValues.set(paramNames[i], args[i])
          const newEnv = { varValues, outer: env }
          for (const body of butLastBodies) evalD(body, newEnv)
          return evalD(lastBody, newEnv)
        }
        funMacEnv.set(fname, f)
        return []
      }
      case 'let':
      case 'loop': {
        const { bindings, butLastBodies, lastBody } = data
        const varValues = new Map()
        const newEnv = { varValues, outer: env }
        for (const [name, cBindExpr] of bindings)
          varValues.set(name, evalD(cBindExpr, newEnv))
        if (type === 'let') {
          for (const body of butLastBodies) evalD(body, newEnv)
          return evalD(lastBody, newEnv)
        }
        while (true) {
          for (const body of butLastBodies) evalD(body, newEnv)
          const result = evalD(lastBody, newEnv)
          if (!(result instanceof ContinueWrapper)) return result
          const { args } = result
          rtAssert(
            bindings.length === args.length,
            'wrong number of loop arguments',
          )
          for (let i = 0; i < bindings.length; i++)
            varValues.set(bindings[i][0], args[i])
        }
      }
      case 'continue':
        return new ContinueWrapper(data.args.map((a) => evalD(a, env)))
    }
    throw new RuntimeError('evalData: unexpected data type: ' + type)
  }
  return evalD
}

export const transD = (data) => {
  const { type } = data
  switch (type) {
    case 'value': {
      const { value } = data
      return () => value
    }
    case 'symbol': {
      const { name } = data
      return (env) => {
        while (true) {
          rtAssert(env !== null, 'undefined symbol: ' + name)
          const { varValues, outer } = env
          if (varValues.has(name)) return varValues.get(name)
          env = outer
        }
      }
    }
    case 'if': {
      const { cond, then, else: elseData } = data
      const [ccond, cthen, celse] = [cond, then, elseData].map(transD)
      return (env, genv) => {
        const econd = ccond(env, genv)
        rtAssert(isInt32(econd), 'condition must be a number')
        return econd === 0 ? celse(env, genv) : cthen(env, genv)
      }
    }
    case 'call': {
      const { name, callType, args } = data
      switch (callType) {
        case 'func': {
          const cargs = args.map(transD)
          return (env, genv) => {
            const funmac = genv.funMacEnv.get(name)
            rtAssert(funmac, 'undefined func: ' + name)
            return funmac(...cargs.map((c) => c(env, genv)))
          }
        }
        case 'macro': {
          return (env, genv) => {
            const funmac = genv.funMacEnv.get(name)
            rtAssert(funmac, 'undefined macro: ' + name)
            const res = funmac(...args)
            const compiledRes = genv.macroCompiler(res)
            const evaledRes = transD(compiledRes)
            return evaledRes(env, genv)
          }
        }
      }
      throw new RuntimeError('unexpected funmacType: ' + callType)
    }
    case 'funmac': {
      const { funmacType, fname, paramNames, butLastBodies, lastBody } = data
      const cbutLastBodies = butLastBodies.map(transD)
      const clastBody = transD(lastBody)
      const arity = paramNames.length
      return (env, genv) => {
        const f = (...args) => {
          rtAssert(
            args.length === arity,
            `wrong number of arguments to ${funmacType}: ${fname}`,
          )
          const varValues = new Map()
          for (let i = 0; i < arity; i++) varValues.set(paramNames[i], args[i])
          const newEnv = { varValues, outer: env }
          for (const cbody of cbutLastBodies) cbody(newEnv, genv)
          return clastBody(newEnv, genv)
        }
        genv.funMacEnv.set(fname, f)
        return []
      }
    }
    case 'let':
    case 'loop': {
      const { bindings, butLastBodies, lastBody } = data
      const cbindings = bindings.map(([name, bindform]) => [
        name,
        transD(bindform),
      ])
      const cbutLastBodies = butLastBodies.map(transD)
      const clastBody = transD(lastBody)
      if (type === 'let') {
        return (env, genv) => {
          const varValues = new Map()
          const newEnv = { varValues, outer: env }
          for (const [name, cbind] of cbindings)
            varValues.set(name, cbind(newEnv, genv))
          for (const cbody of cbutLastBodies) cbody(newEnv, genv)
          return clastBody(newEnv, genv)
        }
      }
      return (env, genv) => {
        const varValues = new Map()
        const newEnv = { varValues, outer: env }
        for (const [name, cbind] of cbindings)
          varValues.set(name, cbind(newEnv, genv))
        while (true) {
          for (const cbody of cbutLastBodies) cbody(newEnv, genv)
          const result = clastBody(newEnv, genv)
          if (!(result instanceof ContinueWrapper)) return result
          const { args } = result
          rtAssert(
            bindings.length === args.length,
            'wrong number of loop arguments',
          )
          for (let i = 0; i < bindings.length; i++)
            varValues.set(bindings[i][0], args[i])
        }
      }
    }
    case 'continue': {
      const cargs = data.args.map(transD)
      return (env, genv) =>
        new ContinueWrapper(cargs.map((ca) => ca(env, genv)))
    }
  }
  throw new RuntimeError('transFunc: unexpected data type: ' + type)
}

export class CompileError extends Error {
  constructor(msg) {
    super('COMPILE: ' + msg)
  }
}

const ctAssert = (cond, msg) => {
  if (!cond) throw new CompileError(msg)
}

const ctAssertSymbol = (form, msg) => {
  const { tokenType, value } = form
  const name = isSymbol(tokenType === 'symbol' ? value : form)
  ctAssert(name, msg)
  return name
}

export const formWithTokensToForm = (ast) => {
  if (Array.isArray(ast)) return ast.map(formWithTokensToForm)
  if (isSymbol(ast)) return ast
  const { tokenType, value } = ast
  ctAssert(tokenType, 'formWithTokensToForm: no tokenType')
  if (tokenType === 'value' || tokenType === 'symbol') return value
  throw new CompileError(
    'formWithTokensToForm: unexpected token type: ' + tokenType,
  )
}

const quasiquote = (ast) => {
  if (isInt32(ast) || typeof ast === 'string') return ast
  if (isSymbol(ast)) return [symbol('quote'), ast]
  ctAssert(Array.isArray(ast), 'quasiquote: unexpected form: ' + ast)
  if (ast.length === 0) return ast
  const [first, ...rest] = ast
  const symbolName = isSymbol(first)
  if (symbolName === 'unquote') {
    ctAssert(rest.length === 1, 'unquote must have 1 argument')
    return rest[0]
  }
  const qqAst = ast.map(quasiquote)
  return [symbol('list'), ...qqAst]
}

const makeToDataCompiler = (funcCtx) => {
  const compile = (ast, ctx) => {
    if (isInt32(ast) || typeof ast === 'string')
      return { type: 'value', value: ast }
    const { tokenType, value } = ast
    if (tokenType === 'value') return { type: 'value', value }
    {
      const symbolName =
        tokenType === 'symbol' ? isSymbol(value) : isSymbol(ast)
      if (symbolName) {
        ctAssert(
          getFromContext(ctx, symbolName),
          'undefined symbol: ' + symbolName,
        )
        return { type: 'symbol', name: symbolName }
      }
    }
    ctAssert(Array.isArray(ast), 'ast must be an array at this point')
    if (ast.length === 0) return { type: 'value', value: [] }
    const [first, ...rest] = ast
    const firstName = ctAssertSymbol(first, 'first element must be a symbol')
    const isLoopTailPosition = ctx && ctx.isLoopTailPosition
    switch (firstName) {
      case 'if': {
        ctAssert(rest.length === 3, 'if must have 3 arguments')
        return {
          type: 'if',
          cond: compile(rest[0], { ...ctx, isLoopTailPosition: false }),
          then: compile(rest[1], ctx),
          else: compile(rest[2], ctx),
        }
      }
      case 'func':
      case 'macro': {
        ctAssert(rest.length >= 3, 'func must have at least 3 arguments')
        const fname = ctAssertSymbol(rest[0], 'first argument must be a symbol')
        ctAssert(Array.isArray(rest[1]), 'second argument must be a list')
        const paramNames = rest[1].map((x) =>
          ctAssertSymbol(x, 'parameters must be symbols'),
        )
        const fnCtx = {
          params: paramNames.map((pname) => {
            pname
          }),
          funmacType: firstName,
        }
        funcCtx.set(fname, fnCtx)
        const bodyCtxVars = new Map()
        for (const name of paramNames) bodyCtxVars.set(name, { isParam: true })
        const bodyCtx = { vars: bodyCtxVars, outer: ctx, bindingForm: ast }
        const cbodies = rest.slice(2, -1).map((f) => compile(f, bodyCtx))
        const clastBody = compile(rest.at(-1), bodyCtx)
        return {
          type: 'funmac',
          funmacType: firstName,
          fname,
          paramNames,
          butLastBodies: cbodies,
          lastBody: clastBody,
        }
      }
      case 'let':
      case 'loop': {
        ctAssert(
          rest.length >= 2,
          firstName + ' must have at least 2 arguments',
        )
        const [bindings, ...bodies] = rest
        ctAssert(Array.isArray(bindings), 'second argument must be a list')
        ctAssert(bindings.length % 2 === 0, 'bindings must be of even length')
        const newCtxVars = new Map()
        const newCtx = { vars: newCtxVars, outer: ctx, bindingForm: ast }

        const cbindings = [...pairwise(bindings)].map(([binder, form]) => {
          const name = ctAssertSymbol(binder, 'key must be a symbol')
          const cval = compile(form, newCtx)
          newCtxVars.set(name, { letOrLoop: firstName })
          return [name, cval]
        })
        newCtx.bindings = cbindings
        const butLastBodies = bodies.slice(0, -1).map((b) => compile(b, newCtx))
        const newCtxTail = {
          ...newCtx,
          isLoopTailPosition: firstName === 'let' ? isLoopTailPosition : true,
        }
        const lastBody = compile(bodies.at(-1), newCtxTail)
        return {
          type: firstName,
          bindings: cbindings,
          butLastBodies,
          lastBody,
        }
      }
      case 'cont': {
        ctAssert(isLoopTailPosition, 'cont must be in loop tail position')
        const loopCtx = getEnclosingLoopCtx(ctx)
        ctAssert(loopCtx, 'cont must be inside a loop')
        const { bindings } = loopCtx
        ctAssert(
          bindings.length === rest.length,
          'wrong number of arguments to cont',
        )
        const args = rest.map((a) => compile(a, ctx))
        return { type: 'continue', args }
      }
      case 'quote': {
        ctAssert(rest.length === 1, 'quote must have 1 argument')
        const [arg] = rest
        const valueForm = formWithTokensToForm(arg)
        return { type: 'value', value: valueForm }
      }
      case 'quasiquote': {
        ctAssert(rest.length === 1, 'quasiquote must have 1 argument')
        const [arg] = rest
        const valueForm = formWithTokensToForm(arg)
        const quasiForm = quasiquote(valueForm)
        return compile(quasiForm, ctx)
      }
    } // end of special form switch

    ctAssert(funcCtx.has(firstName), 'undefined function/macro: ' + firstName)
    const { params, variadic, funmacType } = funcCtx.get(firstName)
    ctAssert(
      variadic || params.length === rest.length,
      `wrong number of arguments to ${funmacType}: ${firstName}`,
    )
    if (funmacType === 'macro')
      return {
        type: 'call',
        callType: funmacType,
        name: firstName,
        args: rest.map(formWithTokensToForm),
      }
    ctAssert(funmacType === 'func', 'unexpected type')
    return {
      type: 'call',
      callType: funmacType,
      name: firstName,
      args: rest.map((a) => compile(a, ctx)),
    }
  }
  return (ast) => compile(ast, null)
}

export const makeCompiler = (funcCtx) => {
  const funmacCtx = new Map()
  for (const [name, funcObj] of funcCtx)
    funmacCtx.set(name, { ...funcObj, funmacType: 'func' })
  const compileToData = makeToDataCompiler(funmacCtx)
  const compileMacro = (astFromMacro) => {
    try {
      return compileToData(astFromMacro, null)
    } catch (e) {
      if (e instanceof CompileError)
        throw new RuntimeError('macro compile error at runtime: ' + e.message)
      throw e
    }
  }
  return (ast) => {
    const ctx = null
    const data = compileToData(ast, ctx)
    const translated = transD(data)
    // const translator = new Translator(compileMacro)
    // const closure = translator.transD(data)
    return (funMacEnv) => {
      // const unsEvaluator = evalData(funMacEnv, compileMacro)
      // translator.funMacEnv = funMacEnv

      // const eres = unsEvaluator(data, new Map())
      // if (JSON.stringify(cres) !== JSON.stringify(eres)) {
      //   console.log('expected', eres, 'got', cres)
      //   throw new Error('compile error: expected ' + eres + ' got ' + cres)
      // }
      // return eres
      const cres = translated(null, {
        funMacEnv: funMacEnv,
        macroCompiler: compileMacro,
      })
      return cres
    }
  }
}
