export function parseInteger(string_: string | number): number | null {
  const value = typeof string_ === 'string' ? parseInt(string_, 10) : string_;

  if (
    !Number.isInteger(value) ||
    value < 0 ||
    Number.isNaN(value) ||
    `${string_}` !== `${value}`
  ) {
    return null;
  }
  return value;
}

export function parseHex(string_: string | number): number | null {
  const value = typeof string_ === 'string' ? parseInt(string_, 16) : string_;
  if (
    !Number.isInteger(value) ||
    value < 0 ||
    Number.isNaN(value) ||
    (typeof string_ === 'string' && string_.toLowerCase() !== value.toString(16))
  ) {
    return null;
  }
  return value;
}
