// copied and adapted from
// https://github.com/sindresorhus/p-map/blob/master/test.js

const test = require('tape')
const { isPromise, map } = require('../')
const randomInt = (min=0, max) => min + Math.floor(Math.random(max - min))
const input = [
  Promise.resolve([10, 300]),
  [20, 100],
  [30, 200]
]

const delay = millis => new Promise(resolve => setTimeout(resolve, millis))
const inRange = (val, min, max) => val > min && val < max
const mapper = ([val, ms]) => delay(ms).then(() => val)

const timeSpan = () => {
  const start = Date.now()
  return () => Date.now() - start
}

const throws = async (t, fn, ErrClass) => {
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

const doesNotThrow = async (t, fn) => {
  try {
    await (isPromise(fn) ? fn : fn())
    t.pass()
  } catch (err) {
    t.error(err)
  }
}

test('main', async t => {
  const end = timeSpan()
  t.deepEqual(await map(input, mapper), [10, 20, 30])
  t.ok(inRange(end(), 290, 430))
  t.end()
})

test('concurrency: 1', async t => {
  const end = timeSpan()
  t.deepEqual(await map(input, mapper, {concurrency: 1}), [10, 20, 30])
  t.ok(inRange(end(), 590, 760))
  t.end()
})

test('concurrency: 4', async t => {
  const concurrency = 4
  let running = 0

  await map(new Array(100).fill(0), async () => {
    running++
    t.ok(running <= concurrency)
    await delay(randomInt(30, 200))
    running--
  }, {concurrency})
  t.end()
})

test('handles empty iterable', async t => {
  t.deepEqual(await map([], mapper), [])
  t.end()
})

test('async with concurrency: 2 (random time sequence)', async t => {
  const input = new Array(10).map(() => randomInt(0, 100))
  const mapper = value => delay(value).then(() => value)
  const result = await map(input, mapper, {concurrency: 2})
  t.deepEqual(result, input)
  t.end()
})

test('async with concurrency: 2 (problematic time sequence)', async t => {
  const input = [100, 200, 10, 36, 13, 45]
  const mapper = value => delay(value).then(() => value)
  const result = await map(input, mapper, {concurrency: 2})
  t.deepEqual(result, input)
  t.end()
})

test('async with concurrency: 2 (out of order time sequence)', async t => {
  const input = [200, 100, 50]
  const mapper = value => delay(value).then(() => value)
  const result = await map(input, mapper, {concurrency: 2})
  t.deepEqual(result, input)
  t.end()
})

test('enforce number in options.concurrency', async t => {
  await throws(t, map([], () => {}, {concurrency: 0}), TypeError)
  // eslint-disable-next-line no-undefined
  await throws(t, map([], () => {}, {concurrency: undefined}), TypeError)
  await doesNotThrow(t, map([], () => {}, {concurrency: 1}))
  await doesNotThrow(t, map([], () => {}, {concurrency: 10}))
  await doesNotThrow(t, map([], () => {}, {concurrency: Infinity}))
  t.end()
})
