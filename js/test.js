import { parse } from './read.js'
import { compile } from './compile.js'
import { print } from './print.js'
import { makeFuncEnv } from './funcEnv.js'

const tests = [
  [`3`, `[add 1 2] ; but a comment`],
  [
    `3`,
    `[add 1 ; line comment 2
     2] ; end comment`,
  ],
  [`2`, `[add 1 [sub 3 2]]`],

  [`'hello world'`, `'hello world'`],
  [`'hello world'`, `'hello world`], // unterminated strings work

  [`2`, `[if 0 1 2]`],
  [`1`, `[if 1 1 2]`],
  [`[]`, `[func inc [x] [add x 1]]`],
  [`2`, `[inc 1]`],
  [`5`, `[let [x 2 y 3] [add x y]]`],
  [`5`, `[let [x 2] [let [y 3] [add x y]]]`],
  [`55`, `[loop [r 0 i 10] [if i [cont [add r i] [sub i 1]] r]]`],
  [`[]`, `[func switcher [x] [case x 0 'zero' 1 'one' 'default']]`],
  [`['zero' 'one' 'default']`, `[list [switcher 0] [switcher 1] [switcher 2]]`],
  [`'zero'`, `[case 0 0 'zero' 'default']`],
  [`'default'`, `[case 1 0 'zero' 'default']`],
  [`'default'`, `[case 0 'default']`],
]

const funcEnv = makeFuncEnv()
// const unsEval = makeEvaluator(funcEnv)

let i = 0
for (const [expected, input] of tests) {
  const form = parse(input)()
  const cform = compile(form)
  const eform = cform(new Map(), funcEnv)
  const result = print(eform)
  console.log(`${input} ; => ${result}`)
  console.assert(result === expected, `expected ${expected}, got ${result}`)
  i++
}

console.log(`ran ${i} tests`)
