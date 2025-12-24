import type { RequestStartLine, ResponseStartLine } from '../../types.js';

export function isResponseStartLine(startLine: RequestStartLine | ResponseStartLine): startLine is ResponseStartLine {
  return 'statusCode' in startLine;
}
