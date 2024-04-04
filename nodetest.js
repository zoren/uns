import { parseRelatedTest, runFileTest } from './js/test.js'
{
  const failed = parseRelatedTest()
  if (failed) {
    console.log('parseRelatedTest failed')
    process.exit(1)
  }
}

import fs from 'node:fs'

const failed = runFileTest(fs.readFileSync('./examples/test.uns', 'utf8'))
if (failed) {
  console.log('runFileTest failed')
  process.exit(1)
}
