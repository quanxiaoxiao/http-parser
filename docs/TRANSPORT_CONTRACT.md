# Transport ↔ HTTP Decoder Contract

> 本文档定义 **Transport 层（socket / stream）与 HTTP Decoder 之间的契约（Contract）**。
>
> 目标：
>
> * 明确职责边界，避免隐式假设
> * 让 HTTP decoder 在不同运行环境中可复用
> * 为 close-delimited / upgrade / pipeline 场景提供确定性行为

---

## 1. 总体原则（Core Principles）

### 1.1 Decoder 不拥有 Transport

* Decoder **不管理 socket 生命周期**
* Decoder **不感知 TCP / TLS / half-close**
* Decoder **只消费字节流 + 外部信号**

Transport 是 decoder 的“数据提供者”，不是被解析对象。

---

### 1.2 Decoder 是同步、确定性的

* 相同输入序列 ⇒ 相同 phase / events
* 无定时器
* 无隐式 IO

---

### 1.3 所有“非字节级语义”必须显式传递

包括：

* socket close
* protocol switch
* pipeline 边界

这些 **不能靠 decoder 自行猜测**。

---

## 2. Transport → Decoder 的输入接口

### 2.1 字节输入（Data Ingress）

```ts
decode(prevState: HttpState | null, input: Buffer): HttpState
```

**语义**

* `input` 为 *连续的字节流片段*
* `input` 可能为空（合法）
* decoder **不得假设 input 对齐 message 边界**

**约束**

* Transport 必须保证字节顺序
* 不得重放、跳跃、乱序

---

### 2.2 连接关闭信号（Connection End）

Transport **必须显式通知 decoder 连接关闭**。

```ts
finalizeOnConnectionClose(state: HttpState): HttpState
```

**语义**

* 表示 *不会再有任何字节到达*
* 不等价于 FINISHED

**decoder 行为要求**

* 若 phase === BODY_CLOSE_DELIMITED

  * 生成 `body-complete`
  * transition → FINISHED
* 其他 phase：

  * 不得自动补全 message

---

### 2.3 错误信号（Transport Error）

```ts
abort(state: HttpState, error: Error): HttpState
```

**语义**

* 非 HTTP 语义错误（网络断开 / TLS error）

**decoder 行为要求**

* 设置 `state.error`
* transition → FINISHED
* 不得再消费 buffer

---

## 3. Decoder → Transport 的输出语义

### 3.1 Phase 变化（Phase Signal）

Transport 必须观察 decoder 的 phase。

| Phase                | Transport 行为          |
| -------------------- | --------------------- |
| START_LINE / HEADERS | 继续喂数据                 |
| BODY_*               | 继续喂数据                 |
| FINISHED             | message 边界成立          |
| UPGRADE              | **立即停止 HTTP feeding** |

---

### 3.2 UPGRADE 的处理（关键）

当 decoder 进入 `UPGRADE`：

* Transport **不得再向 decoder 发送任何字节**
* 所有剩余 buffer 属于新协议
* HTTP decoder 生命周期终止

```text
HTTP framing ends here
↓↓↓
[ raw bytes → new protocol handler ]
```

---

### 3.3 close-delimited 的完成条件

| 条件              | 是否完成 |
| --------------- | ---- |
| buffer 暂时为空     | ❌    |
| read 返回 0 bytes | ❌    |
| socket close    | ✅    |

**重要**：

> close-delimited body 只能由 transport 完成。

---

## 4. Pipeline 语义（HTTP/1.1）

### 4.1 FINISHED ≠ socket close

* FINISHED 表示 **一个 HTTP message framing 结束**
* socket 仍可继续读取下一条 message

```text
[message A] FINISHED
[message B] START_LINE
```

---

### 4.2 Buffer 剩余数据的归属

* decoder 在 FINISHED 时

  * 不得丢弃 buffer
  * buffer 属于下一条 message

Transport 负责：

* 用剩余 buffer 初始化下一次 decode

---

## 5. CONNECT 特殊语义

### 5.1 CONNECT 请求

* Request **永远没有 body**
* HEADERS 后直接 FINISHED

---

### 5.2 CONNECT 成功响应（2xx）

* decoder 进入 `UPGRADE`
* HTTP 协议终止
* socket 进入 tunnel 模式

```text
HTTP CONNECT
↓
HTTP framing ends
↓
Raw tunnel bytes
```

---

## 6. 错误与恢复策略

### 6.1 HTTP 语义错误

* 由 decoder 产生
* 设置 `state.error`
* phase → FINISHED

---

### 6.2 Transport 错误

* 由 transport 产生
* decoder 不尝试修复

---

## 7. 不变量（Contract Invariants）

* ❗ Decoder 永远不主动关闭 socket
* ❗ Decoder 永远不等待 socket
* ❗ close-delimited 完成 ≠ FINISHED 自动发生
* ❗ UPGRADE 后 HTTP decoder 不再参与

---

## 8. 设计收益

* Transport / Decoder 可独立测试
* HTTP framing 行为可形式化验证
* Upgrade / Tunnel / Pipeline 不再含糊

---

> **总结**：
>
> Decoder 是一个纯粹的协议解释器，
> Transport 是事实的裁判。
>
> 二者之间的契约，比任何单一实现都重要。
