/** Same shape as `../errors.js`'s `JobFailure`, duplicated rather than
 * imported: this module runs inside the isolated `pureComputeRunner`
 * child process, which only imports `pureCompute/*` modules -- keeping it
 * free of any dependency on the rest of the worker (Prisma client,
 * storage client) is what keeps that process's own footprint minimal and
 * its failure modes easy to reason about. */
export class ComputeFailure extends Error {
  code: string;

  constructor(code: string) {
    super(code);
    this.code = code;
  }
}
