// copied and adapted from
// https://github.com/sindresorhus/p-map/blob/master/test.js

import * as test from 'fresh-tape'
import { Test } from 'fresh-tape'
import { isPromise, map } from '..'

const randomInt = (min = 0, max = 0): number => min + Math.floor(Math.random() * max - min)
const input = [
  Promise.resolve([10, 300]),
  [20, 100],
  [30, 200]
]

const delay = async (millis: number): Promise<void> => await new Promise(resolve => setTimeout(resolve, millis))
const inRange = (val: number, min: number, max: number): boolean => val > min && val < max
const mapper = async ([val, ms]: number[]): Promise<number> => await delay(ms).then(() => val)

const timeSpan = (): () => number => {
  const start = Date.now()
  return () => Date.now() - start
}

const throws = async (t: Test, fn: Promise<any> | (() => Promise<any>), ErrClass: Function): Promise<void> => {
  try {
    await (isPromise(fn) ? fn : fn())
  } catch (err) {
    if (err instanceof ErrClass) {
      t.pass()
      return
    }
  }

  throw new Error(`expected ${ErrClass.name} error`)
}

const doesNotThrow = async (t: Test, fn: Promise<any> | (() => Promise<any>)): Promise<void> => {
  try {
    await (isPromise(fn) ? fn : fn())
    t.pass()
  } catch (err) {
    t.error(err)
  }
}

test('main', async (t: Test) => {
  const end = timeSpan()
  t.deepEqual(await map(input, mapper), [10, 20, 30])
  t.ok(inRange(end(), 290, 430))
})

test('concurrency: 1', async (t: Test) => {
  const end = timeSpan()
  t.deepEqual(await map(input, mapper, { concurrency: 1 }), [10, 20, 30])
  t.ok(inRange(end(), 590, 760))
})

test('concurrency: 4', async (t: Test) => {
  const concurrency = 4
  let running = 0

  await map(new Array(100).fill(0), async () => {
    running++
    t.ok(running <= concurrency)
    await delay(randomInt(30, 200))
    running--
  }, { concurrency })
})

test('handles empty iterable', async (t: Test) => {
  t.deepEqual(await map([], mapper), [])
})

test('async with concurrency: 2 (random time sequence)', async (t: Test): Promise<void> => {
  const input = new Array(10).map(() => randomInt(0, 100))
  const mapper = async (value: number): Promise<number> => await delay(value).then(() => value)
  const result = await map(input, mapper, { concurrency: 2 })
  t.deepEqual(result, input)
})

test('async with concurrency: 2 (problematic time sequence)', async (t: Test): Promise<void> => {
  const input = [100, 200, 10, 36, 13, 45]
  const mapper = async (value: number): Promise<number> => await delay(value).then(() => value)
  const result = await map(input, mapper, { concurrency: 2 })
  t.deepEqual(result, input)
})

test('async with concurrency: 2 (out of order time sequence)', async (t: any): Promise<void> => {
  const input = [200, 100, 50]
  const mapper = async (value: number): Promise<number> => await delay(value).then(() => value)
  const result = await map(input, mapper, { concurrency: 2 })
  t.deepEqual(result, input)
})

test('enforce number in options.concurrency', async (t: Test): Promise<void> => {
  const noop = async (): Promise<void> => {}
  await throws(t, map([], noop, { concurrency: 0 }), TypeError)
  // eslint-disable-next-line no-undefined
  await throws(t, map([], noop, { concurrency: undefined }), TypeError)
  await doesNotThrow(t, map([], noop, { concurrency: 1 }))
  await doesNotThrow(t, map([], noop, { concurrency: 10 }))
  await doesNotThrow(t, map([], noop, { concurrency: Infinity }))
})
