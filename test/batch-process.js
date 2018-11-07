const test = require('tape')
const {
  batchProcess,
  wait,
  timeoutIn,
} = require('../')

const sum = arr => arr.reduce((total, one) => total + one, 0)

test('batchProcess', async t => {
  let i = 0

  // series
  await batchProcess({
    data: [0, 1, 2],
    batchSize: 1,
    processOne: (num, idx) => {
      t.equal(idx, i)
      t.equal(num, i++)
      return wait(10)
    }
  })

  // parallel, max concurrency > input size
  let time = Date.now()
  await batchProcess({
    data: [100, 100, 100],
    batchSize: 10,
    processOne: millis => wait(millis)
  })

  t.ok(Math.abs(Date.now() - time - 100) < 100)
  time = Date.now()

  // parallel, settle
  let results = await batchProcess({
    data: [100, 100, 100],
    batchSize: 10,
    processOne: millis => timeoutIn(millis),
    settle: true
  })

  t.ok(results.every(r => r.reason))

  time = Date.now()
  // parallel, max concurrency < input size
  results = await batchProcess({
    data: [100, 100, 100, 100],
    batchSize: 2,
    processBatch: batch => {
      t.equal(batch.length, 2)
      return wait(sum(batch))
    },
    settle: true
  })

  t.ok(Math.abs(Date.now() - time - 400) < 100)
  t.end()
})
