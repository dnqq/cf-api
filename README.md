# Cloudflare 随机图片 API

这是一个基于 Cloudflare Workers、R2 和 KV 构建的高性能随机图片 API。它可以根据访问者的设备类型（PC 或移动设备）智能提供相应尺寸的图片。

## ✨ 功能特性

- **高性能**: 利用 Cloudflare KV 缓存图片列表，API 响应速度极快。
- **智能适配**: 自动检测用户设备是 PC 还是移动端，并返回最适合的图片。
- **成本效益**: 所有服务均构建在 Cloudflare 的免费或低成本套餐之上，有效控制成本。
- **易于部署**: 通过 Wrangler CLI 可以轻松部署和管理。
- **自动更新**: 定时任务（Cron Triggers）会自动刷新 R2 存储桶中的图片列表，无需人工干预。

## 🚀 架构解析

本项目的核心逻辑分为两部分：

1.  **API 请求处理 (`fetch` handler)**:
    - 当用户访问 Worker URL 时触发。
    - 首先，通过 `User-Agent` 判断用户设备类型。
    - 然后，从 KV 中读取预先缓存好的图片 Key 列表（`PC_IMAGE_KEYS` 或 `MOBILE_IMAGE_KEYS`）。
    - 从列表中随机选择一个 Key。
    - 使用该 Key 从 R2 存储桶中获取图片对象。
    - 直接将图片数据返回给用户，并设置浏览器缓存（5分钟），以减少重复请求。

2.  **定时更新任务 (`scheduled` handler)**:
    - 由 `wrangler.toml` 中配置的 Cron 表达式（默认为每小时）自动触发。
    - 任务会分别列出 R2 存储桶中 `pc_img/` 和 `mobile_img/` 目录下的所有文件。
    - 将获取到的文件 Key 列表分别存入 KV 的 `PC_IMAGE_KEYS` 和 `MOBILE_IMAGE_KEYS` 中，以供 API 请求时使用。

## 📚 使用说明

### 1. 准备工作

- 一个 Cloudflare 账户。
- 在本地安装 [Node.js](https://nodejs.org/) 和 [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)。

### 2. 项目配置

#### a. 克隆或下载项目

```bash
# 替换为你的项目 Git URL
git clone <YOUR_GIT_REPO_URL>
cd cf-rand-img
```

#### b. 创建 R2 存储桶

1.  登录 Cloudflare 仪表盘。
2.  在左侧菜单中找到 **R2**。
3.  创建一个新的存储桶，例如 `cf-rand-img`。

#### c. 创建 KV 命名空间

1.  在左侧菜单中找到 **Workers & Pages** -> **KV**。
2.  创建一个新的命名空间，例如 `cf-rand-img`。

#### d. 修改 `wrangler.toml`

打开 `wrangler.toml` 文件，根据你创建的资源更新以下配置：

```toml
# Worker 的顶层名称
name = "cf-rand-img"

# Worker 的主入口点
main = "src/index.js"

# 指定 Workers 运行时的确切版本
compatibility_date = "2025-09-28"

# 绑定到您的 R2 存储桶
[[r2_buckets]]
binding = "WALLPAPER_BUCKET" # Worker 代码里用来调用的名字 (env.WALLPAPER_BUCKET)
bucket_name = "cf-rand-img" # 替换成你真实的 R2 存储桶名称

# 绑定到您的 KV 命名空间
[[kv_namespaces]]
binding = "WALLPAPER_KV" # Worker 代码里用来调用的名字 (env.WALLPAPER_KV)
id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" # 替换成你真实的 KV Namespace ID

# 用于运行计划任务的 Cron 触发器
[triggers]
# 这会在每小时的第 0 分钟运行 `scheduled` 函数。
crons = ["0 * * * *"]
```

**如何找到 KV Namespace ID?**
在 KV 命名空间列表页面，点击你创建的命名空间，ID 就在其名称下方。

### 3. 上传图片

将你的图片分别上传到 R2 存储桶的 `pc_img` 和 `mobile_img` 文件夹中。

-   **PC 图片**: `r2://<YOUR_BUCKET_NAME>/pc_img/`
-   **移动端图片**: `r2://<YOUR_BUCKET_NAME>/mobile_img/`

你可以使用 [wrangler r2](https://developers.cloudflare.com/r2/api/wrangler/) 命令或第三方工具（如 [S3 Browser](https://s3browser.com/)）进行上传。

### 4. 部署 Worker

在项目根目录下运行以下命令：

```bash
wrangler deploy
```

部署成功后，Wrangler 会提供一个 Worker 的 URL (`https://<WORKER_NAME>.<SUBDOMAIN>.workers.dev`)。

### 5. 首次手动触发定时任务（重要！）

新部署的 Worker 的 KV 缓存是空的。你需要手动运行一次定时任务来填充它，否则 API 会返回 "服务正在预热中" 的错误。

1.  登录 Cloudflare 仪表盘。
2.  进入 **Workers & Pages**，找到你部署的 Worker。
3.  点击进入 Worker 的管理页面，找到 **Triggers** (触发器) 选项卡。
4.  在 **Cron Triggers** 部分，点击 "Run now" 按钮来立即执行一次 `scheduled` 函数。

片刻之后，你的随机图片 API 就可以正常工作了！

## 💡 提示与优化

- **安全性**: 为了防止滥用，建议在 Cloudflare 仪表盘中为你的 Worker URL 配置 **WAF 防火墙规则** 和 **速率限制**。
- **自定义域名**: 你可以为你的 Worker 绑定一个自定义域名，使其更具专业性。
- **缓存策略**: `src/index.js` 中的 `cache-control` 头部设置了 5 分钟的浏览器缓存。你可以根据需要调整这个值。
