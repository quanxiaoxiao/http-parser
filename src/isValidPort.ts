export default (port: string | number): boolean => {
  const value = typeof port === 'string' ? parseInt(port, 10) : port;

  return (
    `${port}` === `${value}` &&
    Number.isInteger(value) &&
    value >= 0 &&
    value <= 65535
  );
};
