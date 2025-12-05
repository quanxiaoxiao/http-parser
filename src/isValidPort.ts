import parseInteger from './parseInteger.js';

export default (port: string | number): boolean => {
  const value = parseInteger(port);

  return (
    value !== null &&
    value >= 0 &&
    value <= 65535
  );
};
