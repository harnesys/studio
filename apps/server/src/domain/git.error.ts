export class GitNotRepoError extends Error {
  constructor(message = 'not a git repository') {
    super(message);
    this.name = 'GitNotRepoError';
  }
}
export class GitNotFoundError extends Error {
  constructor(message = 'git not found') {
    super(message);
    this.name = 'GitNotFoundError';
  }
}
export class GitDirtyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitDirtyError';
  }
}
export class GitBranchExistsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitBranchExistsError';
  }
}
export class GitTimeoutError extends Error {
  constructor(message = 'git timeout') {
    super(message);
    this.name = 'GitTimeoutError';
  }
}
export class GitBranchInvalidError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GitBranchInvalidError';
  }
}
