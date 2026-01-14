# HTTP/1.x ↔ HTTP/2 Framing 思维对照表

> 本文不是对规范的复述，而是**实现者层面的思维模型对照**。
> 目标：防止用 HTTP/2 的 framing 直觉去实现 HTTP/1.x parser（以及反过来）。

---

## 1. Framing 的根本差异（一句话版）

| 协议       | Framing 的本质     |
| -------- | --------------- |
| HTTP/1.x | **字节流 + 约定式解析** |
| HTTP/2   | **显式帧 + 长度前缀**  |

> HTTP/1.x 的 framing 是“解释出来的”，
> HTTP/2 的 framing 是“声明出来的”。

---

## 2. 连接 vs 流（最危险的认知偏差）

| 维度     | HTTP/1.x | HTTP/2        |
| ------ | -------- | ------------- |
| 并发单位   | TCP 连接   | Stream（逻辑）    |
| 顺序保证   | 必须严格有序   | 每个 stream 内有序 |
| 连接生命周期 | 承载语义的一部分 | 仅作为传输通道       |

### 实现后果

* HTTP/1.x：

  * **connection close = 协议事件**
* HTTP/2：

  * connection close = 传输失败

---

## 3. Body 结束条件（核心差异区）

| 场景      | HTTP/1.x                 | HTTP/2            |
| ------- | ------------------------ | ----------------- |
| Body 长度 | 推断（CL / chunked / close） | DATA frame length |
| Body 结束 | 语义事件                     | 帧边界               |
| EOF 含义  | 可能是 body 结束              | 永远是错误             |

> **HTTP/2 中不存在 close-delimited body 的概念。**

---

## 4. Close-delimited：只属于 HTTP/1.x 的“历史负担”

| 维度           | HTTP/1.x  | HTTP/2 |
| ------------ | --------- | ------ |
| 是否允许         | 是（legacy） | 不存在    |
| 是否可 pipeline | ❌ 不可      | N/A    |
| 实现复杂度        | 极高        | 0      |

### 思维陷阱

> ❌ “buffer 空了，body 应该结束了吧”

这是 HTTP/2 思维在 HTTP/1.x 中的**致命误用**。

---

## 5. Parser 状态机复杂度来源

| 来源   | HTTP/1.x | HTTP/2 |
| ---- | -------- | ------ |
| 字节对齐 | 无        | 强      |
| 中途恢复 | 困难       | 简单     |
| 错误定位 | 模糊       | 精确     |

### 工程结论

* HTTP/1.x：状态机是**协议的一部分**
* HTTP/2：状态机是**实现细节**

---

## 6. Upgrade / CONNECT 的语义鸿沟

| 行为       | HTTP/1.x    | HTTP/2           |
| -------- | ----------- | ---------------- |
| Upgrade  | 协议切换        | 禁止               |
| CONNECT  | 建立裸字节隧道     | 特殊 pseudo-stream |
| HTTP 终止点 | Upgrade 后立即 | 永远存在             |

> HTTP/1.x Upgrade = **放弃 framing**
> HTTP/2 没有这个逃生舱

---

## 7. 错误处理模型

| 维度   | HTTP/1.x | HTTP/2                |
| ---- | -------- | --------------------- |
| 错误传播 | 连接级      | stream / connection 级 |
| 恢复能力 | 极弱       | 强                     |
| 容错策略 | 保守       | 明确                    |

### 实现者直觉校正

* HTTP/1.x：

  > **一旦不确定，就必须关闭连接**
* HTTP/2：

  > 不确定 = protocol error frame

---

## 8. Pipeline vs Multiplexing

| 对比点  | HTTP/1.x Pipeline | HTTP/2 Multiplex |
| ---- | ----------------- | ---------------- |
| 并发   | 表面并发              | 真并发              |
| 阻塞   | Head-of-line      | 无（逻辑层）           |
| 失败影响 | 全连接               | 单 stream         |

> HTTP/1.x pipeline 是历史折中方案，不是并发模型。

---

## 9. 安全模型差异（为什么 H2 更“安全”）

| 风险                | HTTP/1.x | HTTP/2 |
| ----------------- | -------- | ------ |
| Request smuggling | 高风险      | 结构性避免  |
| Desync            | 常见       | 理论上不可  |
| Parser 复杂性        | 攻击面      | 限定     |

---

## 10. 实现者必备心智切换清单

### 写 HTTP/1.x parser 时，必须反复提醒自己

* framing 是**推断的**，不是已知的
* EOF 可能是合法语义
* connection 是协议状态的一部分
* buffer 状态 ≠ message 状态

### 写 HTTP/2 parser 时，必须反复提醒自己

* framing 是**显式的**
* EOF 永远是错误
* stream 才是语义主体
* 长度字段永远可信（否则协议错误）

---

## 11. 一句话总结

> **HTTP/1.x 是“在不可靠字节流上模拟消息协议”，
> HTTP/2 是“在可靠帧协议上承载 HTTP 语义”。**

混用这两套思维，
是 parser 实现中最昂贵、也最隐蔽的错误来源。
