import { Test } from 'fresh-tape'
import {
  wait,
  timeoutIn,
  runWithTimeout,
  memoize
} from '..'
import * as test from 'fresh-tape'

test('wait', async (t: Test) => {
  const now = Date.now()
  await wait(100)
  t.ok(Date.now() - now >= 100)
})

test('wait is cancelable', async (t: Test) => {
  const now = Date.now()
  const promiseWait = wait(100)
  await wait(10)
  promiseWait.cancel()
  await promiseWait
  t.ok(Date.now() - now < 100)
})

test('timeoutIn throws on timeout', async (t: Test) => {
  const promiseTimeout = timeoutIn({ millis: 100 })
  try {
    await Promise.race([
      promiseTimeout,
      wait(150)
    ])

    t.fail('expected timeout')
  } catch (err: any) {
    t.ok(/timed out/.test(err.message))
  }

  try {
    promiseTimeout.cancel()
  } catch (err) {
    t.error(err)
  }
})

test('timeoutIn is cancelable before timeout', async (t: Test) => {
  const now = Date.now()
  const promiseTimeout = timeoutIn(100)
  await wait(10)
  promiseTimeout.cancel()
  await promiseTimeout
  t.ok(Date.now() - now < 100)
})

test('runWithTimeout doesnt throw on task success', async (t: Test) => {
  const promiseTimeout = runWithTimeout(async () => await wait(100).then(() => 'a'), 150)
  t.equal(await promiseTimeout, 'a')
  // wait to see if we catch a rejection
  process.on('unhandledRejection', t.error)
  await wait(100)
  process.removeListener('unhandledRejection', t.error)
})

test('runWithTimeout throws on timeout', async (t: Test) => {
  const promiseTimeout = runWithTimeout(async () => await wait(100).then(() => 'a'), 50)
  try {
    await promiseTimeout
    t.fail('expected timeout')
  } catch (err: any) {
    t.ok(/timed out/.test(err.message))
  }
})

test('memoize (simple)', async (t: Test) => {
  const fn = (() => {
    let counter = 0
    return async (input?: number) => {
      if (counter++ % 2 !== 0) throw new Error('odd!')
      return counter
    }
  })()

  const count = memoize(fn, {
    cacheKey: (input?: number) => 1
  })

  t.equal(await count(), 1)
  t.equal(await count(), 1, 'memoized')
  t.equal(await count(123), 1, 'respects cacheKey')
})

test('memoize', async (t: Test) => {
  const evilEcho = (() => {
    let evil = true
    return async (a: any) => {
      evil = !evil
      if (evil) throw new Error('haha!')
      return a
    }
  })()

  const echo = memoize(evilEcho, {
    cacheKey: arg => arg
  })

  // evil is false
  t.equal(await echo('hey'), 'hey')
  // evil is cached as false
  t.equal(await echo('hey'), 'hey', 'memoized')
  try {
    // evil is true
    await echo('ho')
    t.fail('expected error')
  } catch (err) {
    t.ok(err)
  }

  // evil is false (not cached cause of rejection)
  t.equal(await echo('ho'), 'ho', 'rejections are not cached')
})
