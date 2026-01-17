export const validRequests = {
  simple: Buffer.from('GET / HTTP/1.1\r\nHost: example.com\r\n\r\n'),
  withHeaders: Buffer.from(
    'GET /api/data HTTP/1.1\r\nHost: example.com\r\nUser-Agent: Test/1.0\r\nAccept: application/json\r\n\r\n',
  ),
  postWithBody: Buffer.from(
    'POST /api/users HTTP/1.1\r\nHost: example.com\r\nContent-Type: application/json\r\nContent-Length: 18\r\n\r\n{"name":"test"}',
  ),
};

export const invalidRequests = {
  noHost: Buffer.from('GET / HTTP/1.1\r\n\r\n'),
  malformed: Buffer.from('GET / HTTP/1\r\n\r\n'),
  noPath: Buffer.from('GET HTTP/1.1\r\nHost: example.com\r\n\r\n'),
};

export const chunkedBodies = {
  simple: Buffer.from('5\r\nhello\r\n0\r\n\r\n'),
  multiple: Buffer.from('5\r\nhello\r\n6\r\n world\r\n0\r\n\r\n'),
  empty: Buffer.from('0\r\n\r\n'),
  withTrailer: Buffer.from('5\r\nhello\r\n0\r\nX-Trailer: value\r\n\r\n'),
};
