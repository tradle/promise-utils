import { ICancelable, IPromiseHandler, IReject, IResolve, ISettled, ISettledPromise, ISettleError, ISettleResult, ITimeoutOpts } from './types'
import * as Errors from '@tradle/errors'

export const isPromise = (obj: any): obj is Promise<any> => obj !== null && typeof obj === 'object' && typeof obj.then === 'function'
export const toPromise = async <T>(obj: T | Promise<T>): Promise<T> =>
  isPromise(obj) ? await obj : await Promise.resolve(obj)

export const Timeout = Errors.createError('Timeout')

// eslint-disable-next-line @typescript-eslint/promise-function-async
export function cancelableTimeout (millis: number, onTimeout: IPromiseHandler<void>, onCancel?: IPromiseHandler<void>, unref?: boolean): ICancelable<any> {
  let timeout: NodeJS.Timeout
  let _resolve: IResolve
  let _reject: IReject
  const promise: ICancelable<any> = new Promise<void>((resolve, reject) => {
    _resolve = resolve
    _reject = reject
    timeout = createTimeout(() => onTimeout(resolve, reject), millis, unref)
  }) as ICancelable<any>

  promise.cancel = () => {
    clearTimeout(timeout)
    if (onCancel !== null && onCancel !== undefined) onCancel(_resolve, _reject)
  }

  return promise
}

function createTimeout (fn: () => void, millis: number, unref?: boolean): NodeJS.Timeout {
  const timeout = setTimeout(fn, millis)
  if (unref === true && 'unref' in timeout) timeout.unref()
  return timeout
}

export const waitImmediate = async (): Promise<any> =>
  await new Promise<void>(resolve => queueMicrotask(() => resolve()))

const directResolve = (resolve: IResolve<void>): void => resolve()

// eslint-disable-next-line @typescript-eslint/promise-function-async
export const wait = (millis = 0, unref?: boolean): ICancelable<any> =>
  cancelableTimeout(
    millis,
    directResolve,
    directResolve,
    unref
  )

// eslint-disable-next-line @typescript-eslint/promise-function-async
export function timeoutIn (opts: ITimeoutOpts | number): ICancelable<any> {
  if (typeof opts === 'number') {
    opts = { millis: opts }
  }
  const { millis = 0, error, unref } = opts
  let timeout: NodeJS.Timeout
  let _resolve: IResolve<any>
  const promise: ICancelable<any> = new Promise((resolve, reject) => {
    _resolve = resolve
    timeout = createTimeout(
      () => {
        const actualErr = typeof error === 'function' ? error() : error

        reject(actualErr ?? new Timeout(`timed out after ${millis}ms`))
      },
      millis,
      unref
    )
  }) as ICancelable<any>

  promise.cancel = () => {
    clearTimeout(timeout)
    _resolve(undefined)
  }
  return promise
}

export async function runWithTimeout <T> (fn: () => Promise<T>, opts: ITimeoutOpts | number): Promise<T> {
  const promise = fn()
  const millis = typeof opts === 'number' ? opts : opts.millis
  if (millis === undefined || millis >= Infinity) return await promise

  const timeout = timeoutIn(opts)
  try {
    return await Promise.race([promise, timeout as Promise<T>])
  } finally {
    timeout.cancel()
  }
}

export async function settle <T> (promise: Promise<T>): ISettledPromise<T> {
  return await promise
    .then(
      value => ({
        isFulfilled: true,
        isRejected: false,
        value
      }),
      reason => ({
        isFulfilled: false,
        isRejected: true,
        reason
      })
    )
}

export class MultiErrorWrapper extends Error {
  public errors: Error[]
  constructor (message: string, errors: Error[]) {
    super(message)
    this.errors = errors
  }
}

export class FirstSuccessWrapper extends Error {
  public firstSuccessResult: any
}

// trick from: https://stackoverflow.com/questions/37234191/resolve-es6-promise-with-first-success
export async function firstSuccess <T = any> (promises: Array<Promise<T>>): Promise<T> {
  return await Promise.all(
    promises.map(async p => {
      // If a request fails, count that as a resolution so it will keep
      // waiting for other possible successes. If a request succeeds,
      // treat it as a rejection so Promise.all immediately bails out.
      return await p.then(
        async val => {
          const wrapper = new FirstSuccessWrapper('wrapper for success')
          wrapper.firstSuccessResult = val
          return await Promise.reject(wrapper)
        },
        async err => await Promise.resolve(err)
      )
    })
  ).then(
    // If '.all' resolved, we've just got an array of errors.
    async errors => {
      return await Promise.reject(new MultiErrorWrapper('wrapper for errors', errors))
    },
    // If '.all' rejected, we've got the result we wanted.
    async val => await Promise.resolve(val.firstSuccessResult)
  )
}

export const allSettled = async <T>(promises: Array<Promise<T>>): Promise<Array<ISettled<T>>> => {
  return await Promise.all(promises.map(async promise => await settle(promise)))
}

export const isSettleError = (result: ISettled<any>): result is ISettleError => {
  return result.isRejected
}

export const isSettleResult = <T>(result: ISettled<T>): result is ISettleResult<T> => {
  return result.isFulfilled
}

export const allSettledReject = async <T> (promises: Array<Promise<T>>): Promise<T[]> => {
  return await allSettled(promises).then((settleResults: Array<ISettled<T>>) => {
    const results = []
    for (const entry of settleResults) {
      if (isSettleError(entry)) {
        return Promise.reject(entry.reason)
      }
      results.push(entry.value)
    }
    return results
  })
}

export function memoize <Input extends any[] = any[], Output = any> (
  fn: (...input: Input) => Promise<Output>,
  { cacheKey }: { cacheKey: (...input: Input) => string | { toString: () => string } }
): (...input: Input) => Promise<Output> {
  const cache = new Map()
  const memoized = async function (...args: Input): Promise<Output> {
    const key = cacheKey(...args)
    if (cache.has(key)) {
      return cache.get(key)
    }

    // eslint-disable-next-line no-invalid-this
    const promise = fn(...args)
    cache.set(key, promise)
    promise.catch(() => cache.delete(key))
    return await promise
  }

  memoized.clear = () => cache.clear()
  return memoized
}

export async function map <Input = any, Output = any> (
  arr: Array<Input | Promise<Input>>,
  mapper: (input: Input, index: number) => Promise<Output>,
  opts: { concurrency?: number } = { concurrency: Infinity }
): Promise<Output[]> {
  return await new Promise((resolve, reject) => {
    const { concurrency } = opts
    if (typeof concurrency !== 'number' || !(concurrency > 0)) {
      throw new TypeError('expected "concurrency" to be a positive integer')
    }

    const count = arr.length
    const pending: Array<Promise<any>> = []
    const results = new Array(count)

    let doneCount = 0
    let itemIndex = 0
    let failed = false
    const next = (): void => {
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
        .then(async item => await mapper(item, resultIndex))
        .then(
          result => {
            doneCount++
            if (typeof result !== 'undefined') {
              results[resultIndex] = result
            }

            pending.shift() // eslint-disable-line @typescript-eslint/no-floating-promises
            next()
          },
          err => {
            failed = true
            reject(err)
          }
        )

      pending.push(promise)
      next()
    }

    next()
  })
}

export const mapSeries = async <Input = any, Output = any> (
  arr: Input[],
  mapper: (input: Input, index: number) => Promise<Output>
): Promise<Output[]> => await map(arr, mapper, { concurrency: 1 })

export const settleMap = async <Input = any, Output = any> (
  data: Input[],
  mapper: (input: Input, index: number) => Promise<Output>
): Promise<Array<ISettled<Output>>> => await allSettled(data.map(mapper))

export const settleSeries = async <Input = any, Output = any>(
  data: Input[],
  mapper: (item: Input, index: number) => Promise<Output>
): Promise<Array<ISettled<Output>>> => await mapSeries(data, async (item, index) => await settle(mapper(item, index)))

export function chunk <T = any> (arr: T[], chunkSize: number): T[][] {
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

export const flatten = <T = any> (arr: Array<T[] | T>): T[] => arr.reduce((all: T[], some) => all.concat(some), [])

export interface IBaseBatchOpts <Input> {
  data: Input[]
  batchSize?: number
}

export interface IBatchByOneOpts <Input, Output> extends IBaseBatchOpts<Input> {
  processOne: (input: Input, index: number) => Promise<Output>
  settle?: boolean
}

export interface IBatchByChunkOpts <Input, Output> extends IBaseBatchOpts<Input> {
  processBatch: (input: Input[], batch: number, batchSize: number) => Promise<Output[]>
}

export type IBatchOpts <Input, Output> = IBatchByOneOpts<Input, Output> | IBatchByChunkOpts<Input, Output>

export function isBatchByOne <Input, Output> (input: IBatchOpts<Input, Output>): input is IBatchByOneOpts<Input, Output> {
  return (input as any).processOne !== undefined
}

export async function batchProcess <Input=any, Output=any> (opts: IBatchOpts<Input, Output>): Promise<Array<Output | ISettled<Output>>> {
  const batchSize = opts.batchSize ?? 1
  const batches = chunk(opts.data, batchSize)
  let handler: (batch: Input[], i: number) => Promise<Output[] | Array<ISettled<Output>>>
  if (isBatchByOne(opts)) {
    const batchProcess = opts.settle === true ? settleMap : map
    handler = async (batch, i) => await batchProcess(batch, async (one, j) => await opts.processOne(one, i * batchSize + j))
  } else {
    handler = async (batch, i) => await opts.processBatch(batch, i, batchSize)
  }
  return flatten<Output | ISettled<Output>>(await mapSeries(batches, handler))
}
