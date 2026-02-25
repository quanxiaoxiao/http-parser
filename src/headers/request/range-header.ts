import createHttpError from '../../http-error/index.js';

type RangeResult = [number, number];

const parseNumber = (string_: string | null | undefined, fieldName = 'number'): number => {
  if (string_ == null) {
    throw createHttpError(400, `Invalid range: empty ${fieldName}`);
  }
  const trimmed = string_.trim();

  if (trimmed === '') {
    throw createHttpError(400, `Invalid range: empty ${fieldName}`);
  }

  if (!/^\d+$/.test(trimmed)) {
    throw createHttpError(400, `Invalid range: ${fieldName} is not a valid number`);
  }

  const number_ = Number(trimmed);

  if (!Number.isSafeInteger(number_) || number_ < 0) {
    throw createHttpError(400, `Invalid range: ${fieldName} is not a valid safe integer`);
  }

  return number_;
};

export function parseRange(rangeHeaderValue: string, contentSize: number): RangeResult {
  if (typeof rangeHeaderValue !== 'string') {
    throw createHttpError(400, 'Range header must be a string');
  }

  if (!Number.isInteger(contentSize) || contentSize < 0) {
    throw createHttpError(500, 'Content size must be a non-negative integer');
  }

  if (contentSize === 0) {
    throw createHttpError(416, 'Range not satisfiable: end beyond content size');
  }

  const rangeRegex = /^\s*bytes\s*=\s*(\d*)\s*-\s*(\d*)\s*$/i;
  const matches = rangeHeaderValue.match(rangeRegex);

  if (!matches) {
    throw createHttpError(400, 'Invalid range format. Expected: bytes=start-end');
  }

  const [, startString, endString] = matches;

  const maxIndex = contentSize - 1;
  let start: number;
  let end: number;

  if (startString === '') {
    if (endString === '') {
      throw createHttpError(400, 'Invalid range: both start and end are empty');
    }

    const suffixLength = parseNumber(endString, 'suffix length');

    if (suffixLength === 0) {
      throw createHttpError(400, 'Invalid range format');
    }

    end = maxIndex;
    start = maxIndex - (suffixLength - 1);
    if (start < 0) {
      throw createHttpError(416, 'Range not satisfiable');
    }
  } else {
    start = parseNumber(startString, 'start');
    end = endString === '' ? maxIndex : parseNumber(endString, 'end');
  }

  if (start > end) {
    if (endString === '' || startString === '') {
      throw createHttpError(416, 'Range not satisfiable');
    }
    throw createHttpError(400, 'Invalid range: start is greater than end');
  }

  if (start >= contentSize) {
    throw createHttpError(416, 'Range not satisfiable: start beyond content size');
  }

  if (end >= contentSize) {
    throw createHttpError(416, 'Range not satisfiable: end beyond content size');
  }

  return [start, end];
}
