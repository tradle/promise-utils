const isPromise = obj => obj &&
  typeof obj.then === 'function' &&
  typeof obj.catch === 'function'

const cancelableTimeout = (millis, onTimeout, onCancel) => {
  let timeout
  let resolve
  let reject
  const promise = new Promise((res, rej) => {
    resolve = res
    reject = rej
    timeout = setTimeout(() => onTimeout(resolve, reject), millis)
  })

  promise.cancel = () => {
    clearTimeout(timeout)
    if (onCancel) onCancel(resolve, reject)
  }

  return promise
}

const runFirstArg = fn => fn()
const wait = millis => cancelableTimeout(millis, runFirstArg, runFirstArg)
const timeoutIn = (millis, message) => cancelableTimeout(
  millis,
  (resolve, reject) => {
    // timed out
    reject(new Error(message || `timed out after ${millis}ms`))
  },
  runFirstArg // canceled
)

const runWithTimeout = async (fnOrPromise, millis, message) => {
  const promise = isPromise(fnOrPromise) ? fnOrPromise : fnOrPromise()
  if (!(millis > 0)) return promise

  return Promise.race([
    promise,
    timeoutIn(millis, message)
  ])
}

const settle = promise => promise.then(value => ({
    isFulfilled: true,
    isRejected: false,
    value
  }))
  .catch(reason => ({
    isFulfilled: false,
    isRejected: true,
    reason
  }))

const allSettled = promises => Promise.all(promises.map(settle))

const memoize = (fn, { cacheKey }) => {
  const cache = new Map()
  const memoized = async function (...args) {
    const key = cacheKey(...args)
    if (cache.has(key)) {
      return cache.get(key)
    }

    // eslint-disable-next-line no-invalid-this
    const promise = fn.apply(this, args)
    cache.set(key, promise)
    promise.catch(() => cache.delete(key))
    return promise
  }

  memoized.clear = () => cache.clear()
  return memoized
}

module.exports = {
  isPromise,
  cancelableTimeout,
  wait,
  timeoutIn,
  runWithTimeout,
  settle,
  allSettled,
  memoize,
}
