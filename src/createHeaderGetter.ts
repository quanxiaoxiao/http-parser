export default (obj: Record<string, string | number | string[]>) => {
  const headers: Record<string, string | number | string[]> = {};
  for (const key in obj) {
    const headerValue = obj[key];
    if (headerValue != null) {
      headers[key.toLowerCase()] = headerValue;
    }
  }
  return (headerName: string): string | number | string[] | null =>
    headers[headerName.toLowerCase()] ?? null;
};
