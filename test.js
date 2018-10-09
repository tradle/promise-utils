
const test = require('tape')
const {
  wait,
  timeoutIn,
  runWithTimeout,
} = require('./')

test('wait', async t => {
  const now = Date.now()
  await wait(100)
  t.ok(Date.now() - now >= 100)
  t.end()
})

test('wait is cancelable', async t => {
  const now = Date.now()
  const promiseWait = wait(100)
  await wait(10)
  promiseWait.cancel()
  await promiseWait
  t.ok(Date.now() - now < 100)
  t.end()
})

test('timeoutIn throws on timeout', async t => {
  const promiseTimeout = timeoutIn(100)
  try {
    await Promise.race([
      promiseTimeout,
      wait(150)
    ])

    t.fail('expected timeout')
  } catch (err) {
    t.ok(/timed out/.test(err.message))
  }

  try {
    promiseTimeout.cancel()
  } catch (err) {
    t.error(err)
  }

  t.end()
})

test('timeoutIn is cancelable before timeout', async t => {
  const now = Date.now()
  const promiseTimeout = timeoutIn(100)
  await wait(10)
  promiseTimeout.cancel()
  await promiseTimeout
  t.ok(Date.now() - now < 100)
  t.end()
})

test('runWithTimeout doesnt throw on task success', async t => {
  const promiseTimeout = runWithTimeout(() => wait(100).then(() => 'a'), 150)
  t.equal(await promiseTimeout, 'a')
  // wait to see if we catch a rejection
  process.on('unhandledRejection', t.error)
  await wait(100)
  process.removeListener('unhandledRejection', t.error)
  t.end()
})

test('runWithTimeout throws on timeout', async t => {
  const promiseTimeout = runWithTimeout(() => wait(100).then(() => 'a'), 50)
  try {
    await promiseTimeout
    t.fail('expected timeout')
  } catch (err) {
    t.ok(/timed out/.test(err.message))
  }

  t.end()
})
