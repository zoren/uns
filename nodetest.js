import { parseRelatedTest, runFileTest } from './js/test.js'
import { exit } from 'node:process'

{
  const failed = parseRelatedTest()
  if (failed) {
    console.log('parseRelatedTest failed')
    exit(1)
  }
}

import fs from 'node:fs'

const failed = runFileTest(fs.readFileSync('./examples/test.uns', 'utf8'))
if (failed) {
  console.log('runFileTest failed')
  exit(1)
}
console.log('nodejs test done')
