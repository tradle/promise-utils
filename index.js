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

module.exports = {
  isPromise,
  cancelableTimeout,
  wait,
  timeoutIn,
  runWithTimeout,
}
