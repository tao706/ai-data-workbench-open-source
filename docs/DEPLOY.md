# 单机部署

这份配置用于 Linux 单机演示环境，包含 Caddy、Node 业务服务和 Python 分析服务。外部仅开放 80、443；分析接口不映射到公网。需要服务器、已安装的 Docker Engine / Compose，以及解析到服务器的域名。当前电脑没有 Docker，因此镜像构建和整套容器启动尚未实际验收。

## 首次启动

在服务器项目根目录执行：

```sh
cp deploy/production.env.example .env
openssl rand -hex 32
```

把生成值写入 `.env` 的 JWT_SECRET；DOMAIN 填自己的域名，不带 https://。模型密钥可留空；需要真实解读时再填写自己的模型配置。不要提交 `.env`。

```sh
docker compose config --quiet
docker compose up -d --build
docker compose ps
docker compose logs --tail=100 api analysis web
```

域名解析正确且 80/443 可访问时，Caddy 自动申请 HTTPS 证书。打开 `https://你的域名`，注册自己的账号。生产环境不会创建默认演示账号，弱会话密钥或缺少 HTTPS 来源配置会阻止业务服务启动。

## 数据与更新

数据保存在 state、uploads、output 三个 Docker 卷中；上传文件和清洗版本需要一起备份。备份时先停止 api、analysis，使用 Docker 卷备份工具复制这三个卷，再启动服务。恢复必须使用同一组快照。不要执行 `docker compose down -v`，该操作会删除数据卷。

更新前备份数据，保留旧源码提交号；获取新源码后运行 `docker compose up -d --build`。回退代码需要配合兼容的数据备份，不能只依赖重建容器。

## 验证范围

已提供注册、登录和按用户归属校验项目资源的实现。现有验证主要覆盖本地功能与回归测试，尚未完成公网多用户环境的容量、稳定性和安全验收；容器构建与启动也需要在目标环境验证。

## 验收清单

注册新账号；导入示例；清洗并恢复版本；运行统计；保存图表；刷新页面；生成报告；验证流式回答；删除已结束任务；创建第二个账号确认看不到第一个账号的项目；重启容器确认数据仍在。

目前仍是单进程 JSON 存储和同步分析，不支持横向扩容。登录限流按当前进程计数，重启后重置。公开服务长期运行前需继续完成容量测试、备份恢复演练和错误监控。
