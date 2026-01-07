```markdown
# Parser Extension Constitution
1. 安全 > 正确性 > 兼容性 > 可用性
2. 拒绝未知优于猜测意图
3. 新增 recoverable error 必须减少攻击面，而不是增加
4. 所有宽容行为必须是可观测的
5. 默认行为必须是最保守的
```

```
┌─ Start Line Limits
├─ Header Limits
├─ Chunked Body Limits
├─ Parsing Time / Progress Limits
├─ Line Ending Limits
├─ Numeric Parsing Limits
├─ Parser State Limits
├─ Buffer Behavior Limits
└─ Protocol Consistency Limits
```

```
RAW INPUT
  ↓
PARSE (严格)
  ↓
NORMALIZE (明确标记)
  ↓
POLICY (决定 accept / reject)
```

- **Parse 层**：永远不 recover
- **Normalize 层**：可以 recover，但必须打 tag
- **Policy 层**：唯一允许“好心”的地方



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

```
onStartLineStart
onStartLineEnd

onHeaderNameStart
onHeaderValueStart
onHeaderLineEnd
onHeadersEnd

onBodyChunkStart
onBodyChunkEnd

onMessageDone
```

```
export enum ParserState {
  START_LINE,
  HEADER_NAME,
  HEADER_VALUE,
  HEADER_LINE_END,
  HEADERS_END,
  BODY_IDENTITY,
  BODY_CHUNK_SIZE,
  BODY_CHUNK_DATA,
  BODY_CHUNK_END,
  MESSAGE_DONE,
}
```

```
STATE              COUNT     TOTAL(ms)   AVG(ns)   %
-----------------------------------------------------
START_LINE         1         0.01        10000     0.2
HEADER_NAME        12        0.12        10000     2.1
HEADER_VALUE       12        4.80        400000    83.5  ← 🔥
HEADER_LINE_END    12        0.05        4000      0.9
BODY_CHUNK_DATA    3         0.70        230000    12.2
MESSAGE_DONE       1         0.01        9000      0.1
```

```
HTTP Semantic Core
- Spec-driven
- DFA-based
- Observable
- Embeddable
- Security-friendly
```
---

# HTTP Semantic Core

> **Spec-driven, DFA-based, observable HTTP parsing kernel**

HTTP Semantic Core is **not** a web server, framework, or proxy.
It is a **protocol-level semantic engine** designed to parse HTTP byte streams into **explicit, inspectable protocol states**, with strong guarantees around correctness, limits, and error classification.

This project exists for people who need **control, observability, and correctness** over HTTP parsing — not just something that “works”.

---

## Why this exists (when nginx / envoy already do HTTP)

Tools like **nginx**, **envoy**, and **haproxy** are:

* battle-tested
* extremely fast
* production hardened

But they are also:

* executable binaries, not libraries
* tightly coupled to their runtime and configuration model
* opaque during parsing (black-box behavior)
* unsuitable as **embedded semantic components**

HTTP Semantic Core solves a *different problem*:

> **Turn HTTP from an implicit side-effect into an explicit, programmable protocol object.**

---

## What this project is

HTTP Semantic Core is:

* 📜 **RFC-aligned** (7230 / 9110 driven)
* 🔁 **Deterministic finite-state machine (DFA)** based
* 🧩 **Embeddable** in servers, proxies, agents, test harnesses
* 🔬 **Observable** at every parsing stage
* 🛡️ **Security-oriented** (limits, fuzzing, error classification)

It parses HTTP as:

```
byte stream → parsing states → semantic events → structured output
```

Not as string splitting.

---

## What this project is NOT

To set expectations clearly:

❌ Not a replacement for nginx / envoy
❌ Not an HTTP framework
❌ Not a web server
❌ Not focused on maximum throughput benchmarks

If you want a server, use nginx.
If you want a framework, use existing ecosystems.

---

## Core design principles

### 1. Spec-driven, not behavior-driven

Parsing behavior is derived from RFC semantics, not historical quirks.
Ambiguous cases are:

* explicitly classified
* consistently handled
* documented

---

### 2. Explicit state machines

Parsing is modeled as deterministic state transitions:

* start-line
* headers
* body (content-length / chunked)
* terminal states

This enables:

* reproducibility
* fuzz testing
* state tracing
* formal reasoning

---

### 3. Observable by design

Every parsing stage can be observed:

* bytes consumed
* state transitions
* error boundaries
* partial completion

This makes the library suitable for:

* debugging malformed traffic
* teaching protocol internals
* security analysis

---

### 4. Strict limits as first-class concepts

All resource limits are explicit and configurable:

* header count
* header bytes
* line length
* name/value size

This prevents accidental DoS exposure and makes security posture visible.

---

### 5. Clear error taxonomy

Errors are classified, not thrown ad-hoc:

* fatal vs recoverable
* semantic vs structural
* spec violation vs policy violation

This allows callers to decide:

* drop connection
* reject request
* log and continue

---

## Typical use cases

### 🔐 Security & protocol research

* reproduce parsing CVEs
* inject malformed traffic
* fuzz edge cases (CR/LF, oversized headers)
* observe parser behavior at byte granularity

---

### 🧪 Testing & validation tools

* protocol compliance testing
* regression tests for HTTP behavior
* golden reference for other implementations

---

### 🧩 Embedded protocol parsing

* sidecars
* agents
* gateways
* custom transports

Where pulling in nginx or a full server is impractical.

---

### 🎓 Teaching & learning

* explain HTTP beyond string parsing
* visualize protocol state machines
* demonstrate RFC ambiguities concretely

---

## Example: header parsing as a semantic process

```ts
state = createHeadersState(limits)

state = decodeHeaders(state, bufferChunk)

if (state.finished) {
  // headers complete
  inspect(state.headers)
}
```

The caller controls:

* how input is chunked
* when parsing advances
* how errors are handled

---

## Why not reuse existing HTTP libraries?

Most existing HTTP parsers:

* are tightly coupled to servers
* hide parsing decisions internally
* prioritize convenience over explicit semantics

HTTP Semantic Core prioritizes **clarity and correctness over convenience**.

---

## Project philosophy

> **Protocols are not strings.**

They are:

* state machines
* resource-bounded systems
* security boundaries

This project treats HTTP accordingly.

---

## Intended audience

This project is for:

* systems engineers
* security researchers
* protocol implementers
* educators
* advanced learners

It is intentionally *not* optimized for beginners.

---

## Status & scope

* Focused on HTTP/1.x semantics
* No TLS
* No socket management
* No request routing

Those belong elsewhere.

---

## License & openness

This project is intended to be:

* readable
* auditable
* adaptable

It favors clarity over cleverness.

---

## Final note

If nginx is a *machine*,

**HTTP Semantic Core is a *microscope*.**

You don’t deploy microscopes to production —

but you rely on them to understand what’s really happening.


