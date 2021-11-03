type ErrorCreator = () => Error

export type IResolve<T = any> = (value: T) => void
export type IReject = (error: Error) => void
export type IPromiseHandler<T = any> = (resolve: IResolve<T>, reject: IReject) => void

export interface ICancelable<T> extends Promise<T> {
  cancel: () => void
}

export interface ITimeoutOpts {
  millis?: number
  error?: Error | ErrorCreator
  unref?: boolean
}

export interface ISettleError {
  isFulfilled: false
  isRejected: true
  reason: Error
}
export interface ISettleResult<T> {
  isFulfilled: true
  isRejected: false
  value: T
}

export type ISettled<T> = ISettleError | ISettleResult<T>

export type ISettledPromise<T> = Promise<ISettled<T>>
