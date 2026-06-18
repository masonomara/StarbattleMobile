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
