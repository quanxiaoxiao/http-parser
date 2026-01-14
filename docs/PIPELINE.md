# HTTP/1.x Pipeline + Close-Delimited

## 1. 场景定义

本演算描述 **HTTP/1.x pipeline** 场景下，
当 **前一个 response 使用 close-delimited body** 时，
连接关闭如何作为 **唯一合法的 body 结束信号**，以及它对后续 pipeline message 的影响。

> 目标：证明 close-delimited body 在 pipeline 语义下 **必然终止连接生命周期**。

---

## 2. 基础前提（RFC 7230 语义约束）

* HTTP/1.x pipeline 允许：

  * client 连续发送多个 request
  * server **顺序** 返回 response
* message body 的 framing 方式只有：

  * Content-Length
  * chunked
  * close-delimited

RFC 核心约束：

> If the connection is closed to signal the end of the response body,
> the server MUST NOT send any further responses on that connection.

---

## 3. Pipeline 初始状态

```
TCP connection: OPEN

Client → Server (pipeline):

  Req#1: GET /a HTTP/1.1
  Req#2: GET /b HTTP/1.1

Parser state:
  connection_alive = true
  outbound_queue = [Req#1, Req#2]
```

---

## 4. Response #1（close-delimited）开始

```
Server → Client:

HTTP/1.1 200 OK
Date: ...
Content-Type: text/plain

<streaming bytes>
```

### Decoder 状态迁移

```
START_LINE
  → HEADERS
    → BODY_CLOSE_DELIMITED
```

此时的关键判定：

* headers 中 **没有 Content-Length**
* headers 中 **没有 Transfer-Encoding: chunked**
* method / status 允许 body

👉 framing strategy = close-delimited

---

## 5. Body streaming 期（不可完成态）

```
BODY_CLOSE_DELIMITED:
  - parser 持续消费 socket bytes
  - 每个字节都属于 response #1 body
  - 不存在内部 FINISHED 条件
```

### 核心不变量

```
while (socket.isOpen()) {
  all_bytes → current_response.body
}
```

* parser **绝不能**：

  * buffer 空 → 推断结束
  * 下一个 response start-line 探测

---

## 6. TCP FIN / RST 到达

```
TCP event: socket EOF
```

### Decoder 反应

```
BODY_CLOSE_DELIMITED
  → BODY_FINISHED (implicit)
  → MESSAGE_COMPLETE
  → CONNECTION_TERMINATED
```

这是 **唯一合法的完成路径**。

---

## 7. Pipeline 断裂点分析

### 关键事实

* Req#2 已经发送
* Server 尚未（也永远不会）返回 Resp#2

RFC 语义结论：

> Any outstanding pipelined requests are aborted.

因此：

```
outbound_queue:
  Req#2 → FAILED (connection closed)
```

这是协议允许且必须的结果。

---

## 8. 为什么不可能继续解析 Resp#2

### ❌ 错误实现（常见 bug）

```
if (buffer.empty()) {
  assume response #1 ended
  try parse next start-line
}
```

该行为违反：

* framing 定义
* pipeline 顺序保证
* 安全边界（可能导致 request smuggling）

---

## 9. 正确的状态机终态

```
Connection State:
  CLOSED

Decoder State:
  TERMINATED

Parser Guarantees:
  - no further HTTP semantics
  - no reuse of connection
```

---

## 10. 对实现者的硬性结论

### Close-delimited + pipeline = 单响应连接

| 事实                 | 结果           |
| ------------------ | ------------ |
| 使用 close-delimited | 连接必须关闭       |
| 连接关闭               | pipeline 被截断 |
| pipeline 被截断       | 后续请求失败       |

---

## 11. 工程级断言（强烈推荐）

```ts
if (state.bodyType === 'close-delimited') {
  invariant(!connection.keepAlive);
}

if (socket.closed && pendingRequests.length > 0) {
  abortAllPendingRequests();
}
```

---

## 12. 总结一句话

> **Close-delimited body 不是一种 framing 技巧，
> 而是一种连接生命周期的终结声明。**

任何试图在其后继续 HTTP/1.x pipeline 的实现，
都必然是协议错误实现。
