# REQUEST_SMUGGLING_PLAYBOOK

> 本文是 **HTTP/1.x 实现者视角** 的 Request Smuggling 作战手册。
> 不是漏洞罗列，而是：**为什么 parser 一定会在这些点出事，以及如何结构性避免。**

---

## 0. 一句话定义（实现者版）

> **Request Smuggling = 前后两层对“消息边界”的理解不一致。**

不是黑魔法，不是巧合，
而是 framing 推断差异的必然结果。

---

## 1. 攻击成立的三要素（缺一不可）

| 要素       | 说明                       |
| -------- | ------------------------ |
| 多层解析     | client → proxy → backend |
| HTTP/1.x | framing 依赖推断             |
| 行为差异     | 至少一个边界判断不一致              |

**没有 parser 差异，就没有 smuggling。**

---

## 2. 所有 Smuggling 的母问题

### 问题原型

> 「**body 到底在哪结束？**」

HTTP/1.x 的合法答案有 **3 个**：

1. Content-Length
2. Transfer-Encoding: chunked
3. connection close（close-delimited）

只要前后组件选了不同答案，
攻击空间就出现了。

---

## 3. CL.TE / TE.CL（最经典变体）

### CL.TE

```
POST / HTTP/1.1
Host: victim
Content-Length: 44
Transfer-Encoding: chunked

0

GET /admin HTTP/1.1
Host: victim

```

| 层  | 使用规则           | 结果              |
| -- | -------------- | --------------- |
| 前端 | Content-Length | body 含恶意请求      |
| 后端 | chunked        | body 为空，下一条请求生效 |

### TE.CL

反过来，前端用 chunked，后端用 CL。

---

## 4. 为什么 RFC 7230 也救不了你

RFC 7230 写得非常清楚：

> Transfer-Encoding 优先于 Content-Length

但问题是：

* 很多历史实现 **没有完全遵守**
* 中间件可能 **normalize / strip / reorder headers**

> **规范一致 ≠ 实现一致**

---

## 5. Close-delimited：最高风险区

### 为什么它危险

| 特性          | 风险              |
| ----------- | --------------- |
| 无长度         | 边界不显式           |
| 依赖 EOF      | 连接复用即灾难         |
| 不可 pipeline | 一旦 pipeline 就必炸 |

### 常见事故模式

* proxy 认为：response body 结束了
* backend 认为：还在 body 中

结果：

> 下一条请求被拼进上一条 body

---

## 6. Header 规范化 = 攻击放大器

### 高危行为

* 合并多个 Content-Length
* 忽略非法 header 值
* 自动补 chunked

### 攻击者最爱看到的代码

```ts
parseInt(value) || 0
```

这不是容错，
这是**攻击面扩展器**。

---

## 7. Pipeline 是 smuggling 的温床

| 特性   | 后果           |
| ---- | ------------ |
| 顺序请求 | 边界共享         |
| 复用连接 | 攻击可跨请求       |
| 错误延迟 | exploit 难以定位 |

> HTTP/1.x pipeline = 安全债务

---

## 8. 防御原则（结构级，不是 patch）

### 8.1 单一权威规则

> **body framing 决策必须在 headers 完成后一次性确定**

之后禁止任何回退。

### 8.2 冲突即失败

| 场景      | 正确行为   |
| ------- | ------ |
| CL + TE | 直接 400 |
| 多 CL    | 直接 400 |
| 非法 CL   | 直接 400 |

> 不要“猜测用户意图”。

---

## 9. Parser 实现 Checklist（你可以直接对照）

* [ ] `decideBodyStrategy()` 是纯函数
* [ ] 只返回一种 framing
* [ ] close-delimited 禁止 pipeline
* [ ] FINISHED ≠ socket close
* [ ] Upgrade 后 HTTP 语义终止

如果有一条做不到，
就默认：**可被 smuggling。**

---

## 10. 为什么 HTTP/2 几乎免疫

| 原因         | 说明                |
| ---------- | ----------------- |
| 显式 framing | DATA frame length |
| stream 隔离  | 不共享边界             |
| 错误即终止      | 不尝试恢复             |

> HTTP/2 不是“更安全”，
> 而是**不允许你犯这些错误**。

---

## 11. 一句话结论（实现者须牢记）

> **Request Smuggling 不是漏洞，
> 而是 HTTP/1.x framing 模型的必然代价。**

你的 parser 能否抵御它，
取决于你是否：

* 明确边界
* 拒绝模糊
* 拒绝宽容

---

## 12. 推荐阅读（实现者方向）

* RFC 7230 §3.3 Message Body Length
* PortSwigger Research: HTTP Request Smuggling
* Browser / CDN 历史事故复盘
