## 1. Request / Response 总体结构

### 1.1 Request

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

### 1.2 Response

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

---

## 2. Headers 规范

### 2.1 Authorization

格式：

```
Authorization: <auth-scheme> <credentials>
```

* `<auth-scheme>`：认证方案，如 `Basic` / `Bearer` / `Digest` / `HOBA` / `Mutual`
* `<credentials>`：凭证（可能是 Base64、Token、签名字符串）
* ⚠️ **首字母大写**为规范（如 `Basic`、`Bearer`）

#### 常见认证类型

**Basic Auth (RFC 7617)**

```
Authorization: Basic <base64(username:password)>
Authorization: Basic QWxhZGRpbjpvcGVuIHNlc2FtZQ==
```

**Bearer Token (RFC 6750)**

```
Authorization: Bearer <token>
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

### 2.2 Host

* 必须存在（HTTP/1.1+）
* 仅允许出现一次
* 格式：`<domain>` | `<IPv4>` | `[IPv6]`
* 可选端口：`:<1-65535>`
* 最大长度：255
* 不允许空格、CR/LF、逗号
* 域名标签：A-Z a-z 0-9 - （不能首尾 `-`）
* IPv6 必须用方括号 `[ ]`
* 不允许内嵌认证信息（如 `user:pass@host`）

> 注意 `_` 的使用
> RFC 1035/1123 中域名 label 不能含 `_`，但实际很多内部 DNS 或 SRV 记录允许。

---

### 2.3 Content-Type

* 格式：`type/subtype[; parameter=value]*`
* `type/subtype` 建议小写
* 参数格式：`token=value` 或 `token="quoted string"`
* 多个参数用 `;` 分隔
* 不允许 CR/LF
* `charset` 推荐用于 `text/*`
* `boundary` 必须用于 `multipart/form-data`
* 可以校验是否属于允许类型

---

### 2.4 Cache-Control

格式：

```
Cache-Control: directive[=value][, directive[=value]]*
```

* 多个 directive 用逗号分隔
* value 可为：

  * token
  * quoted-string
  * delta-seconds（整数秒）

示例：

```
Cache-Control: no-cache
Cache-Control: max-age=3600
Cache-Control: no-cache, no-store, must-revalidate
Cache-Control: public, max-age=86400
```

---

### 2.5 Connection

#### Hop-by-Hop Header

> 只作用于当前 TCP 连接，代理不得转发，否则协议违规。

常见 Hop-by-Hop：

```
Connection
Keep-Alive
Transfer-Encoding
Upgrade
TE
Trailer
Proxy-Authenticate
Proxy-Authorization
```

* Connection 可声明任意自定义 header 为 Hop-by-Hop：

```
Connection: Foo
Foo: bar
```

#### End-to-End Header（必须转发）

```
Host
Cookie
Authorization
Cache-Control
Content-Type
```


### HTTP Header 值编码决策树

```
HTTP Header 值编码决策树
├─ 是否是标准协议字段？ (Host, User-Agent, Accept, Accept-Encoding, Accept-Language, Connection, Content-Type, Content-Length, X-Requested-With)
│   ├─ 是 → ❌ 不需要 encodeURIComponent
│   └─ 否 → 继续判断
├─ 是否是 URL 类型字段？ (Location, Referer, Content-Location)
│   ├─ 是 → ✅ 需要 encodeURIComponent （URL 包含非 ASCII 或特殊字符时）
│   └─ 否 → 继续判断
├─ 是否是 Cookie 类型字段？ (Cookie, Set-Cookie)
│   ├─ 是 → ✅ 需要 encodeURIComponent （值中含 ; , = 空格或非 ASCII 字符）
│   └─ 否 → 继续判断
├─ 是否是 Authorization？
│   ├─ Bearer / Basic token → ⚠️ 一般不需要编码
│   └─ 自定义 token 含特殊字符 → ✅ 需要 encodeURIComponent
├─ 是否是自定义 Header？ (X-*)
│   ├─ 值含空格、中文、# & = ? 等特殊字符 → ✅ 需要 encodeURIComponent
│   └─ 其他 → ❌ 可不编码
└─ 其他未知 Header → ⚠️ 根据值类型判断：
      - 含 URL、中文或特殊字符 → ✅ 编码
      - 纯 ASCII 字符 → ❌ 不编码
```

---

## 3. Body

### 3.1 Content-Length vs Transfer-Encoding

* **Content-Length**：直接指定字节长度
* **Transfer-Encoding: chunked**：分块传输

### 3.2 Chunked 编码格式

```
chunk-size(hex) CRLF
chunk-data CRLF
...
0 CRLF
(trailer headers) CRLF
CRLF
```

* 每个块前是十六进制长度
* 最后块长度为 `0` 表示结束
* 可带 Trailer Headers

---

## 4. 常用规范补充

| Header            | 类型         | 说明                |
| ----------------- | ---------- | ----------------- |
| Host              | 必须         | HTTP/1.1+ 必须存在，唯一 |
| Authorization     | End-to-End | 用于身份认证            |
| Connection        | Hop-by-Hop | 不可转发，代理需清理        |
| Content-Length    | End-to-End | 指明 body 字节数       |
| Transfer-Encoding | Hop-by-Hop | 分块传输编码，代理需清理      |
| Cookie            | End-to-End | 客户端状态             |
| Cache-Control     | End-to-End | 缓存控制              |
| Content-Type      | End-to-End | body 类型           |

---


```
// body
isChunked
hasContentLength
hasValidContentLength
hasZeroContentLength
hasBody
isBodyDelimitedByClose

// connection
isConnectionClose
isConnectionKeepAlive
hasHopByHopHeaders

// upgrade
isUpgradeRequest
isRequestWebSocket
isTunnelRequest

// cache
isCacheableRequest
isCacheableResponse

// content
hasContentType
isTextualContent
isCompressed

// security
hasConflictingBodyHeaders
hasMultipleContentLength
hasObsoleteLineFolding
```

### request

| Method      | 是否推荐 CL:0 | 说明           |
| ----------- | --------- | ------------ |
| GET         | ❌         | 默认无 body     |
| HEAD        | ❌         | 同 GET        |
| POST        | ✅ 必须      | 消歧义          |
| PUT         | ✅ 必须      | 消歧义          |
| PATCH       | ✅ 必须      | 消歧义          |
| DELETE      | ✅ 推荐      | 兼容           |
| OPTIONS | ✅ 推荐      | 实际等同 POST    |
| CONNECT | ✅ 推荐      | 隧道前的 HTTP 阶段 |

### response

| Status Code | body 为空时策略                     |
| ----------- | ------------------------------ |
| 1xx         | 禁止 `Content-Length`            |
| 204         | 禁止                             |
| 304         | 禁止                             |
| 200 / 201   | **可写 `Content-Length: 0`（推荐）** |
| 404 / 500 等 | **推荐写**                        |
