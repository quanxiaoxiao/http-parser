```
┌────────────┐
│ START_LINE │  HTTP/1.1 101 Switching Protocols
└─────┬──────┘
      ▼
┌────────────┐
│  HEADERS   │  Upgrade: websocket
└─────┬──────┘
      ▼
┌────────────────────┐
│     UPGRADE        │
└────────────────────┘
```


```
CLIENT → PROXY

Request:
┌────────────┐
│ START_LINE │  CONNECT host:port HTTP/1.1
└─────┬──────┘
      ▼
┌────────────┐
│  HEADERS   │
└─────┬──────┘
      ▼
┌────────────┐
│  FINISHED  │  (no request body)
└────────────┘


Response:
┌────────────┐
│ START_LINE │  HTTP/1.1 200 Connection Established
└─────┬──────┘
      ▼
┌────────────┐
│  HEADERS   │
└─────┬──────┘
      ▼
┌────────────────────┐
│     UPGRADE        │  (special terminal state)
└────────────────────┘
```

```
                ┌─────────────────────┐
                │     START_LINE      │
                └─────────┬───────────┘
                          │
                          ▼
                ┌─────────────────────┐
                │       HEADERS       │
                └─────────┬───────────┘
                          │
          ┌───────────────┼─────────────────────────┐
          │               │                         │
          ▼               ▼                         ▼
┌────────────────┐ ┌───────────────────┐ ┌──────────────────────┐
│ BODY_FIXED_LEN │ │   BODY_CHUNKED    │ │ BODY_CLOSE_DELIMITED │
└───────┬────────┘ └─────────┬─────────┘ └──────────┬───────────┘
        │                    │                        │
        ▼                    ▼                        │
┌────────────────┐ ┌───────────────────┐              │
│    FINISHED    │ │     FINISHED      │              │
└────────────────┘ └───────────────────┘              │
                                                        │
                                                        ▼
                                           (transport closes connection)
                                                        │
                                                        ▼
                                                ┌────────────┐
                                                │  FINISHED  │
                                                └────────────┘
```

```
┌──────────────────────────────────────────────┐
│ Start-Line                                   │  ← 例如：GET /path HTTP/1.1
│                                              │     Method + Request-Target + HTTP-Version
├──────────────────────────────────────────────┤
│ Headers                                      │  ← Host, User-Agent, Accept, ...
│                                              │     每个 Header 一行，格式 key: value
├──────────────────────────────────────────────┤
│ (空行 CRLF)                                  │  ← 区分 Header 与 Body
├──────────────────────────────────────────────┤
│ Body（可选）                                 │  ← JSON / Form / Binary / Multipart
│                                              │     通过 Content-Length 或 Transfer-Encoding 判断
├──────────────────────────────────────────────┤
│ Trailer Headers（可选, chunked 特有）       │  ← 仅在 Transfer-Encoding: chunked 时出现
│                                              │     例如：Content-MD5, Signature
└──────────────────────────────────────────────┘
```

```
┌──────────────────────────────────────────────┐
│ Start-Line                                   │  ← 例如：HTTP/1.1 200 OK
│                                              │     HTTP-Version + Status-Code + Reason-Phrase
├──────────────────────────────────────────────┤
│ Headers                                      │  ← Content-Type, Content-Length, Set-Cookie...
│                                              │     每个 Header 一行，格式 key: value
├──────────────────────────────────────────────┤
│ (空行 CRLF)                                  │
├──────────────────────────────────────────────┤
│ Body（可选）                                 │  ← HTML / JSON / Binary / Stream
│                                              │     通过 Content-Length 或 Transfer-Encoding 判断
├──────────────────────────────────────────────┤
│ Trailer Headers（可选, chunked 特有）       │  ← 仅在 Transfer-Encoding: chunked 时出现
│                                              │     例如：Content-MD5, Signature
└──────────────────────────────────────────────┘
```

```
START_LINE
   |
   v
HEADER_FIELD
   |
   | (empty line)
   v
HEADER_END
   |
   v
BODY_DETERMINE
   |        \
   |         \
   v          v
BODY        FINISHED
   |
   v
FINISHED
```
