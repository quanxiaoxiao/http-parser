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

export default parseInteger;
