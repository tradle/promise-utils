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

const map = async (arr, mapper, opts={ concurrency: Infinity }) => new Promise((resolve, reject) => {
  const { concurrency } = opts
  if (!(concurrency > 0)) {
    throw new TypeError(`expected "concurrency" to be a positive integer`)
  }

  const count = arr.length
  const pending = []
  const results = new Array(count)

  let doneCount = 0
  let itemIndex = 0
  let failed
  const next = () => {
    if (doneCount === count) {
      resolve(results)
      return
    }

    if (failed ||
      itemIndex === count ||
      pending.length === concurrency ||
      pending.length === count) return

    const resultIndex = itemIndex++
    const promise = Promise
      // support promise for values as items in array, a la p-map (but do we really need to?)
      .resolve(arr[resultIndex])
      .then(item => mapper(item, resultIndex))
      .then(result => {
        doneCount++
        if (typeof result !== 'undefined') {
          results[resultIndex] = result
        }

        pending.shift()
        next()
      }, err => {
        failed = true
        reject(err)
      })

    pending.push(promise)
    next()
  }

  next()
})

const mapSeries = (arr, mapper) => map(arr, mapper, { concurrency: 1 })
const settleMap = async (data, fn) => allSettled(data.map(item => fn(item)))
const settleSeries = (data, fn) => mapSeries(data, async item => settle(fn(item)))

const chunk = (arr, chunkSize) => {
  if (!(chunkSize > 0)) throw new Error('expected chunk size > 0')

  const chunks = []
  let offset = 0
  while (offset < arr.length) {
    chunks.push(arr.slice(offset, offset + chunkSize))
    offset += chunkSize
  }

  if (offset < arr.length) {
    chunks.push(arr.slice(offset))
  }

  return chunks
}

const flatten = arr => arr.reduce((all, some) => all.concat(some), [])

const batchProcess = async ({
  data,
  batchSize=1,
  processOne,
  processBatch,
  settle
}) => {
  const batches = chunk(data, batchSize)
  const batchResolver = settle ? settleMap : map
  const results = await mapSeries(batches, (batch, i) => {
    if (processBatch) {
      return processBatch(batch, i)
    }

    return batchResolver(batch, (one, j) => processOne(one, i * batchSize + j))
  })

  return flatten(results)
}

module.exports = {
  isPromise,
  cancelableTimeout,
  wait,
  timeoutIn,
  runWithTimeout,
  settle,
  allSettled,
  settleMap,
  settleSeries,
  memoize,
  map,
  mapSeries,
  batchProcess,
  // not promise utils but might as well export
  chunk,
  flatten,
}
