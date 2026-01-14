# HTTP Decoder Phase Semantics

> 本文档定义 **HTTP/1.x decoder 中各个 phase 的语义、职责边界与不变量（invariants）**。
>
> 目标：
>
> * 让 parser 行为 **可预测、可证明、可维护**
> * 明确 parser / transport / upper layer 的职责边界
> * 为 RFC 对齐、性能优化、协议扩展提供稳定基线

---

## 1. 设计总原则（Design Principles）

### 1.1 单一职责（Single Responsibility）

* **Parser 只负责 HTTP framing**
* Parser 不负责：

  * socket 生命周期
  * 超时
  * 重试
  * 新协议（WebSocket / TLS / Tunnel）

### 1.2 Phase 是“协议语义”，不是实现细节

* Phase 表示 **当前字节流的协议解释方式**
* Phase 切换 = 语义切换
* Phase 不等价于“函数调用顺序”

### 1.3 明确“不知道”的边界

* close-delimited body 的结束 **parser 永远无法自行判断**
* Upgrade / CONNECT 之后的数据 **不再是 HTTP**

---

## 2. Phase 总览

```text
START_LINE
HEADERS
BODY_FIXED_LENGTH
BODY_CHUNKED
BODY_CLOSE_DELIMITED
UPGRADE
FINISHED
```

| Phase                | 是否可继续解析 | 是否消耗 buffer | 是否可转 FINISHED |
| -------------------- | ------- | ----------- | ------------- |
| START_LINE           | ✅       | 部分          | ❌             |
| HEADERS              | ✅       | 部分          | ❌             |
| BODY_FIXED_LENGTH    | ✅       | 精确          | ✅             |
| BODY_CHUNKED         | ✅       | 精确          | ✅             |
| BODY_CLOSE_DELIMITED | ✅       | 全部          | ❌（需外部触发）      |
| UPGRADE              | ❌       | ❌           | ❌             |
| FINISHED             | ❌       | ❌           | —             |

---

## 3. Phase 语义定义（逐一）

### 3.1 START_LINE

**语义**

* 解析 HTTP start-line

  * request: `METHOD SP TARGET SP VERSION`
  * response: `VERSION SP STATUS SP REASON`

**职责**

* 查找 CRLF
* 校验长度限制
* 不解析 headers

**不变量**

* 不得读取 headers 字节
* 若 CRLF 不完整：保持 phase 不变

**允许迁移**

```
START_LINE → HEADERS
```

---

### 3.2 HEADERS

**语义**

* 解析 header fields
* 构建规范化 headers map
* 决定 body framing strategy

**职责**

* 处理 header folding / limits
* 生成 headers 相关事件
* 调用 `decideBodyStrategy`

**不变量**

* 不得消费 body 字节
* headers 结束必须以空行（CRLF CRLF）

**允许迁移**

```
HEADERS → BODY_FIXED_LENGTH
HEADERS → BODY_CHUNKED
HEADERS → BODY_CLOSE_DELIMITED
HEADERS → UPGRADE
HEADERS → FINISHED
```

---

### 3.3 BODY_FIXED_LENGTH

**语义**

* 根据 Content-Length 精确读取 body

**职责**

* 累计 decodedBodyBytes
* 精确消费指定字节数

**不变量**

* decodedBodyBytes ≤ Content-Length
* 读取完成即 message 完成

**允许迁移**

```
BODY_FIXED_LENGTH → FINISHED
```

---

### 3.4 BODY_CHUNKED

**语义**

* 解析 Transfer-Encoding: chunked body

**职责**

* chunk-size / extensions / trailers
* 累计 decodedBodyBytes

**不变量**

* 必须以 0-size chunk 结束
* trailer headers 属于 body framing 的一部分

**允许迁移**

```
BODY_CHUNKED → FINISHED
```

---

### 3.5 BODY_CLOSE_DELIMITED

**语义（RFC 7230 §3.3.3）**

* body 长度由 **连接关闭** 决定

**职责**

* 消费所有到达的字节
* 累计 decodedBodyBytes

**明确限制**

* parser **永远不知道 body 是否结束**
* parser **不得自行进入 FINISHED**

**允许迁移**

```
BODY_CLOSE_DELIMITED → FINISHED   （仅由 transport 触发）
```

---

### 3.6 UPGRADE

**语义**

* HTTP framing 终止
* 字节流语义移交给新协议

**触发条件**

* Response status = 101 Switching Protocols
* CONNECT 成功响应（2xx）

**职责**

* 停止 HTTP parser
* 保留未消费 buffer

**不变量**

* 不得消费任何后续字节
* 不得再触发 HTTP 事件

**允许迁移**

```
UPGRADE → （无）
```

---

### 3.7 FINISHED

**语义**

* 一个 HTTP message 的 framing 已完整解析

**职责**

* 作为 message 边界信号

**不变量**

* parser 不再读取 buffer
* 任何新数据属于下一条 message

---

## 4. Phase 与 Transport 的边界

### Parser 负责

* HTTP framing
* RFC 7230 合规性
* 明确 phase / event

### Transport 负责

* socket open / close
* close-delimited 完成信号
* upgrade 后协议处理

---

## 5. 关键不变量总结（Checklist）

* ❗ FINISHED ≠ socket closed
* ❗ BODY_CLOSE_DELIMITED 永远不会自行完成
* ❗ UPGRADE 之后 HTTP 语义彻底终止
* ❗ Phase 决定 buffer 解释方式

---

## 6. 设计收益

* Phase 语义稳定 → 实现可替换
* RFC 对齐 → 行为可证明
* Parser / Transport 解耦 → 可复用性极高

---

> **结论**：
>
> Phase 是协议语义的“法律文本”，
> 实现只是执行者。
