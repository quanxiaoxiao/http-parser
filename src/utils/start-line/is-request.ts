import type { RequestStartLine, ResponseStartLine } from '../../types.js';

export function isRequestStartLine(startLine: RequestStartLine | ResponseStartLine): startLine is RequestStartLine {
  return 'method' in startLine;
}
