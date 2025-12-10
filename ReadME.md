### Request

```
┌──────────────────────────────────────────────┐
│ Start-Line                                   │  ← 例如：GET /path HTTP/1.1
│                                              │     Method + Request-Target + Version
├──────────────────────────────────────────────┤
│ Headers                                      │  ← Host, User-Agent, Accept, ...
│                                              │     各种请求头
├──────────────────────────────────────────────┤
│ (空行 CRLF)                                   │  ← 用于区分 Header 与 Body
├──────────────────────────────────────────────┤
│ Body（可选）                                   │  ← JSON / Form / Binary / multipart
│                                              │     Content-Length 或 chunked
├──────────────────────────────────────────────┤
│ Trailer Headers（可选, chunked 特有）           │  ← 如：Content-MD5, Signature
│                                              │     仅在 Transfer-Encoding: chunked 时出现
└──────────────────────────────────────────────┘
```


### Response
```
┌──────────────────────────────────────────────┐
│ Start-Line                                   │  ← 例如：HTTP/1.1 200 OK
│                                              │     Version + Status-Code + Reason-Phrase
├──────────────────────────────────────────────┤
│ Headers                                      │  ← Content-Type, Content-Length, Set-Cookie...
│                                              │     各种响应头
├──────────────────────────────────────────────┤
│ (空行 CRLF)                                   │
├──────────────────────────────────────────────┤
│ Body（可选）                                   │  ← HTML / JSON / Binary / Stream
│                                              │     Content-Length 或 chunked
├──────────────────────────────────────────────┤
│ Trailer Headers（可选, chunked 特有）           │  ← 如：Content-MD5, Signature
│                                              │     仅在 Transfer-Encoding: chunked 时出现
└──────────────────────────────────────────────┘
```
