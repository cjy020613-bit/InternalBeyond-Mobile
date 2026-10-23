# 在原生 IB 中使用 ChatGPT 订阅（Codex）

本分支以 [Sui-IB/InternalBeyond-Mobile v3.1.3](https://github.com/Sui-IB/InternalBeyond-Mobile) 为基础，不替换官方的聊天 UI、好友列表、备份结构和 IndexedDB 数据表。

## 设置

1. 打开 IB → API → 新增配置（或编辑原来的「澈」配置）。
2. 「服务商」选择 **ChatGPT 订阅 (Codex)**。这是添加在官方原生供应商菜单里的单个选项。
3. 接口地址填写自己部署的 Codex 网关 HTTPS 地址，默认指向原来已经使用的 Railway 网关；「网关配对口令」填写 `CY_GATEWAY_TOKEN`，不是 OpenAI API Key，更不是 ChatGPT 密码。
4. 在同一设置页点击「检查连接」或「登录 ChatGPT」。登录时在 **OpenAI 官方设备验证页面**完成账户授权。授权凭据只保存在网关服务器上的 `CODEX_HOME`。
5. 保存配置，然后使用 IB 官方的「拉取模型列表」按钮选择网关返回的实际可用模型，打开好友聊天即可。

注意：**ChatGPT 订阅与 OpenAI API 计费是不同产品**。此连接通过自部署的 Codex SDK 网关实现，依赖账号的 Codex 使用权限及服务端配置，并不意味着购买 ChatGPT Plus 就能直接调用 OpenAI API。

## 兼容性与迁移

- IB 原生 `apiConfigs` 存储仍作为好友、昵称、人设、会话数据的唯一来源。
- 旧 CY 订阅配置（`subscriptionGateway: true`）在本机首次载入时原位转换为 `provider: codex`，**不重建好友 ID、不删除聊天记录**。旧版网关登录信息仍在你的服务器。
- 原本的 CY UI、狗狗按钮、模型弹层、聊天覆盖层等已从工作版本移除。需要恢复时可使用备份分支 `backup/cy-before-native-codex-20261023`。
- Codex 网关使用已有的 OpenAI 兼容 `/v1/chat/completions`、`/v1/models`、`/v1/codex/status` 和设备授权接口。这个连接使用完整回复（非流式）；其他服务商仍保持原版 IB 的工作方式。
- 浏览器 API 配置中的密钥栏是 **网关自己的配对口令**，不要在此输入 ChatGPT 密码。
- 由于 IB 是 PWA，升级原有安装后可能需完全关闭并再次打开，让新的 Service Worker 生效。**不要清除站点存储或卸载 App** 来尝试刷新，否则可能丢失仅存在浏览器内的资料。

## 部署和验证

```bash
node --check custom/ib-codex-provider.js
node --check ib-sw.js
node scripts/check.mjs
node scripts/check-inline.mjs
cd gateway && python -m unittest test_gateway_core.py
```

`.github/workflows/verify.yml` 会在提交和 PR 中自动运行上述检查。CI 无法代替用户在自己的 ChatGPT 账号完成设备授权，也无法证明服务器当前登录态有效。
