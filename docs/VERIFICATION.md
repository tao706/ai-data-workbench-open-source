# 验证范围

本地 Windows 环境，2026-11-12：

| 检查 | 结果 |
| --- | --- |
| 前后端生产构建 | 通过 |
| Node 接口与模型模拟测试 | 4 项通过 |
| Python 数据计算测试 | 6 项通过 |
| 浏览器示例流程 | 1 项通过，含注册、项目、导入、图表、演示解读、报告和首页 |
| 截图和录屏 | 来自上述浏览器实际运行 |
| GitHub Actions | Build and test、Publish v0.1.0 均通过；已核对公开状态徽章 |
| Linux 构建与 Node / Python 测试 | GitHub Actions 的 Ubuntu 运行器通过 |
| Docker Compose 配置语法 | GitHub Actions 检查通过 |
| Docker 容器 / HTTPS / 服务器部署 | 尚未实际验收 |

Node 生产配置测试检查了默认演示账号关闭、来源校验、Secure Cookie 和登录限流。图表版本测试使用模拟分析服务检查版本文件选择；模型测试使用本地模拟接口，不等于真实供应商可用性验证。

这些结果不代表并发性能、安全审计或真实业务效果。重新验证可运行 README 中的命令，容器部署验收见 DEPLOY.md。

首个发布版本：[v0.1.0](https://github.com/tao706/ai-data-workbench-open-source/releases/tag/v0.1.0)。已核对源码压缩包与 SHA-256 校验文件两个附件。
