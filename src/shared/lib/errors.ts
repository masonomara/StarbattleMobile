// An error whose message is already a localized, user-presentable string (built
// from i18n.t at the throw site). useAsyncAction's toUserMessage() passes these
// straight through instead of trying to pattern-match them — which matters now
// that the message text varies by language and substring matching on English
// would silently fail.
export class UserFacingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UserFacingError';
  }
}

// A user-initiated cancellation (e.g. dismissing the StoreKit purchase sheet).
// Not an error condition: toUserMessage() maps it to null so nothing is shown,
// and because it's thrown, success callbacks — which only run when the action
// RESOLVES — don't fire. In Adapty v3 a cancelled purchase resolves with
// `{ type: 'user_cancelled' }` rather than throwing, so payments.ts converts
// that into this error to get the "silent, stay put" behaviour the UI expects.
export class CancelledError extends Error {
  constructor() {
    super('cancelled');
    this.name = 'CancelledError';
  }
}
