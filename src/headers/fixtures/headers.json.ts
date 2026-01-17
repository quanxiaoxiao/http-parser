export const validHeaders = {
  host: { Host: 'example.com' },
  multiple: {
    Host: 'example.com',
    'User-Agent': 'Test/1.0',
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
  caseInsensitive: {
    HOST: 'example.com',
    'Content-Type': 'text/plain',
  },
};

export const invalidHeaders = {
  emptyValue: { Host: '' },
  duplicate: {
    Host: 'example.com',
    host: 'other.com',
  },
};

export const headerNormalizationCases = {
  toLower: {
    input: { 'Content-Type': 'text/plain', 'X-CUSTOM-HEADER': 'value' },
    expected: { 'content-type': 'text/plain', 'x-custom-header': 'value' },
  },
  trim: {
    input: { Host: '  example.com  ' },
    expected: { host: 'example.com' },
  },
};
