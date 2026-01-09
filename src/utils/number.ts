export function parseInteger(str: string | number): number | null {
  const value = typeof str === 'string' ? parseInt(str, 10) : str;

  if (
    !Number.isInteger(value) ||
    value < 0 ||
    Number.isNaN(value) ||
    `${str}` !== `${value}`
  ) {
    return null;
  }
  return value;
}

export function parseHex(str: string | number): number | null {
  const value = typeof str === 'string' ? parseInt(str, 16) : str;
  if (
    !Number.isInteger(value) ||
    value < 0 ||
    Number.isNaN(value) ||
    (typeof str === 'string' && str.toLowerCase() !== value.toString(16))
  ) {
    return null;
  }
  return value;
}
