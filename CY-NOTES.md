# CY 改造层

这条分支用于在保留 InternalBeyond Mobile 上游结构和数据兼容性的前提下，逐步加入自己的功能。

## 约定

- 尽量不把新增逻辑继续塞进巨型 `index.html`。
- 新功能放进 `custom/`，通过 `window.IBCY.register()` 注册。
- 不改原有 IndexedDB 名称与备份结构，除非附带迁移脚本。
- 每次提交运行 `node scripts/check.mjs`、`node scripts/check-inline.mjs` 和 JavaScript 语法检查。

## 接下来

1. OB 记忆桥接与故障降级：桥接内核已完成，待接入实际 OB 协议与设置界面。
2. 订阅额度、上下文 token 与缓存状态面板。
3. 狗狗快捷按钮与无痛换窗入口。
4. 日历、生理期、亲密事件与健康数据的权限化接入。
