/** A controlled, expected job failure with a safe error code that's fine to
 * surface to the client (never a raw stack trace — blueprint §46). */
export class JobFailure extends Error {
  code: string;

  constructor(code: string) {
    super(code);
    this.code = code;
  }
}
