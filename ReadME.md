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

## Headers

`Authorization` 的标准格式：

```
Authorization: <auth-scheme> <credentials>
```

- `<auth-scheme>`：认证方案，如 `Basic` / `Bearer` / `Digest` / `HOBA` / `Mutual` 等
- `<credentials>`：凭证（可能是 Base64、Token、签名字符串）

⚠️ **auth-scheme** 必须首字母大写（区分度不强但这是行业规范）

### 常见认证类型及其规范

#### Basic Auth（RFC 7617）

```
Authorization: Basic <base64(username:password)>
Authorization: Basic QWxhZGRpbjpvcGVuIHNlc2FtZQ==
```


#### Bearer Token（RFC 6750）

```
Authorization: Bearer <token>
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### Host

Host header validation rules:

- Must exist for HTTP/1.1+
- Must appear exactly once
- Format: \<domain\> | \<IPv4\> | '[' IPv6 ']'
- Optional port: ":" <1-65535>
- Max host length: 255 chars
- No whitespace, CR, LF
- No comma
- Domain labels: A-Z a-z 0-9 - (not leading or trailing)
- IPv6 must be in brackets
- Reject multiple Host headers
- Reject malformed ports
- Reject embedded credentials (e.g. user:pass@host)


含有 `_`

- 严格按照 RFC 1035/1123，域名 label 不能有下划线 `_`，只允许 `[A-Za-z0-9-]`
- 实际情况：很多系统（例如内部 DNS、一些云服务）允许下划线，尤其在 SRV 记录里常见，但严格意义上它是非法的域名 label。


### Content-Type

Content-Type header rules:

- Format: type/subtype[; parameter=value]*
- type/subtype: token, recommended lowercase
- Parameters: token=value or token="quoted string"
- Multiple parameters separated by ;
- Must not contain CR/LF
- charset parameter recommended for text/*
- boundary required for multipart/form-data
- Validate against allowed types/subtypes if needed


### Cache-Control


```
Cache-Control: directive[=value][, directive[=value]]*
```

- 多个 `directive` 用逗号 `,` 分隔
- `value` 可能是：
  - `token`
  - `quoted-string`
  - `delta-seconds`（整数秒）


```
Cache-Control: no-cache
Cache-Control: max-age=3600
Cache-Control: no-cache, no-store, must-revalidate
Cache-Control: public, max-age=86400
```
