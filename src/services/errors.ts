export class NotImplementedError extends Error {
  constructor(public readonly operation: string) {
    super(`${operation} is not implemented in the environment setup.`);
    this.name = "NotImplementedError";
  }
}
