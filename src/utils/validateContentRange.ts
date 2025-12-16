export type ContentRangeResult =
  | {
      valid: true;
      unit: 'bytes';
      start: number;
      end: number;
      size: number;
      type: 'partial';
    }
  | {
      valid: true;
      unit: 'bytes';
      size: number;
      type: 'unsatisfied';
    }
  | {
      valid: false;
      reason: string;
    };

const CONTENT_RANGE_REGEX = /^bytes\s+(?:(\d+)-(\d+)\/(\d+)|\*\/(\d+))$/i;
const CRLF_REGEX = /[\r\n]/;

function validateUnsatisfiedRange(sizeStr: string): ContentRangeResult {
  const size = Number(sizeStr);

  if (!Number.isSafeInteger(size) || size < 0) {
    return { valid: false, reason: 'invalid size (must be non-negative integer)' };
  }

  return {
    valid: true,
    unit: 'bytes',
    size,
    type: 'unsatisfied',
  };
}

function validatePartialRange(
  startStr: string,
  endStr: string,
  sizeStr: string,
): ContentRangeResult {
  const start = Number(startStr);
  const end = Number(endStr);
  const size = Number(sizeStr);

  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || !Number.isSafeInteger(size)) {
    return { valid: false, reason: 'range values must be safe integers' };
  }

  if (start < 0) {
    return { valid: false, reason: 'start must be >= 0' };
  }

  if (end < start) {
    return { valid: false, reason: `end (${end}) must be >= start (${start})` };
  }

  if (size <= 0) {
    return { valid: false, reason: 'size must be > 0' };
  }

  if (end >= size) {
    return { valid: false, reason: `end (${end}) must be < size (${size})` };
  }

  return {
    valid: true,
    unit: 'bytes',
    start,
    end,
    size,
    type: 'partial',
  };
}

export function validateContentRange(value: string): ContentRangeResult {
  if (typeof value !== 'string') {
    return { valid: false, reason: 'not a string' };
  }

  if (CRLF_REGEX.test(value)) {
    return { valid: false, reason: 'contains CR/LF characters' };
  }

  const match = value.match(CONTENT_RANGE_REGEX);
  if (!match) {
    return { valid: false, reason: 'invalid Content-Range syntax' };
  }

  if (match[4] !== undefined) {
    return validateUnsatisfiedRange(match[4]);
  }

  return validatePartialRange(match[1]!, match[2]!, match[3]!);
}
