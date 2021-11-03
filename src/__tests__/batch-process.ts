import {
  batchProcess,
  wait,
  timeoutIn,
  allSettledReject
} from '..'
import { ISettleError } from '../types'
import * as test from 'fresh-tape'

const sum = (arr: number[]): number => arr.reduce((total, one) => total + one, 0)

test('batchProcess', async (t: any) => {
  let i = 0

  // series
  await batchProcess({
    data: [0, 1, 2],
    batchSize: 1,
    processOne: async (num, idx) => {
      t.equal(idx, i)
      t.equal(num, i++)
      return await wait(10)
    }
  })

  // parallel, max concurrency > input size
  let time = Date.now()
  await batchProcess({
    data: [100, 100, 100],
    batchSize: 10,
    processOne: async millis => await wait(millis)
  })

  t.ok(Math.abs(Date.now() - time - 100) < 100)
  time = Date.now()

  // parallel, settle
  let results = await batchProcess<number>({
    data: [100, 100, 100],
    batchSize: 10,
    processOne: async millis => await timeoutIn({ millis }),
    settle: true
  })

  t.ok(results.every(r => (r as ISettleError).reason))

  time = Date.now()
  // parallel, max concurrency < input size
  results = await batchProcess<any>({
    data: [100, 100, 100, 100],
    batchSize: 2,
    processBatch: async batch => {
      t.equal(batch.length, 2)
      return await wait(sum(batch)).then(() => [])
    }
  })

  t.ok(Math.abs(Date.now() - time - 400) < 100)
})

test('allSettledReject (reject)', async (t): Promise<void> => {
  let slowResolved = false
  try {
    await allSettledReject([
      Promise.reject(new Error('quick')),
      new Promise<void>(resolve => setTimeout(() => {
        slowResolved = true
        resolve()
      }, 30))
    ])
    t.fail('unexpected resolve without error')
  } catch (err: any) {
    t.equals(err.message, 'quick', 'the quick promises error was recorded')
  }
  t.equals(slowResolved, true, 'the slow promise was resolved as well')
})

test('allSettledReject (resolve)', async (t): Promise<void> => {
  t.deepEquals(await allSettledReject([
    Promise.resolve('a'),
    Promise.resolve('b')
  ]), ['a', 'b'])
})
