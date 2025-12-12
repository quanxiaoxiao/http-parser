import parseInteger from '../parseInteger.js';

export default (port: string | number): boolean => {
  const value = parseInteger(port);

  return (
    value !== null &&
    value >= 1 &&
    value <= 65535
  );
};
