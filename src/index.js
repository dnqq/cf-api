/**
 * ===================================================================================
 *  生产环境就绪的随机壁纸 API Worker
 *
 *  架构说明:
 *  - 用户请求 (fetch 处理器):
 *    1. 从 Cloudflare KV 读取预先缓存好的文件列表 (速度极快)。
 *    2. 从列表中随机选择一个文件的 Key。
 *    3. 直接从 R2 获取该图片对象。
 *    4. 直接向用户返回图片数据 (不使用重定向，性能更佳)。
 *
 *  - 后台任务 (scheduled 处理器):
 *    1. 根据设定的时间表自动运行 (例如：每小时一次)。
 *    2. 列出 R2 存储桶中 PC 和 Mobile 文件夹下的所有对象。
 *    3. 将这些文件列表保存到 KV 中，以供 fetch 处理器使用。
 *
 *  安全策略:
 *  - 速率限制和机器人防护功能不在此代码中处理。
 *  - 为了达到最佳性能和安全性，这些功能应该在 Cloudflare 的仪表盘中
 *    通过配置 WAF 防火墙和速率限制规则来实现。
 * ===================================================================================
 */
export default {
  /**
   * 处理用户获取随机图片的 API 请求。
   * @param {Request} request 传入的请求对象。
   * @param {object} env 环境变量，包含了到 R2 和 KV 的绑定。
   * @returns {Response} 返回图片响应或错误响应。
   */
  async fetch(request, env) {
    try {
      // 1. 判断用户是否正在使用移动设备。
      const userAgent = (request.headers.get("User-Agent") || "").toLowerCase();
      const isMobile = /iphone|ipod|android|blackberry|iemobile|opera mini/.test(userAgent);
      
      // 2. 根据设备类型，决定使用哪个图片列表。
      const kvKey = isMobile ? "MOBILE_IMAGE_KEYS" : "PC_IMAGE_KEYS";

      // 3. 从 KV 中获取缓存的文件列表 (此操作速度极快)。
      const imageKeys = await env.WALLPAPER_KV.get(kvKey, "json");

      // 4. 处理缓存尚未填充或为空的情况。
      if (!imageKeys || imageKeys.length === 0) {
        console.error(`KV 缓存未命中或为空，键名: ${kvKey}。如果问题持续，请尝试手动触发一次定时任务。`);
        return new Response("图片服务正在预热中，请稍后重试。", {
          status: 503, // 503 Service Unavailable 服务不可用
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }

      // 5. 从列表中随机挑选一个图片的 Key。
      const randomKey = imageKeys[Math.floor(Math.random() * imageKeys.length)];

      // 6. 从 R2 存储桶中获取实际的图片对象。
      const object = await env.WALLPAPER_BUCKET.get(randomKey);

      if (object === null) {
        // 这种情况很罕见，可能发生在 KV 与 R2 数据短暂不同步时。
        console.error(`在 R2 中未找到 Key 为 "${randomKey}" 的对象，尽管它存在于 KV 缓存中。`);
        return new Response("无法获取到所选的图片。", { status: 404 });
      }

      // 7. 准备响应头，并直接返回图片数据。
      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set('etag', object.httpEtag);
      // 在用户的浏览器上缓存 5 分钟 (300秒)。
      headers.set('cache-control', 'public, max-age=300'); 

      return new Response(object.body, {
        headers,
      });

    } catch (error) {
      console.error("fetch 处理器发生意外错误:", error);
      return new Response("服务器内部错误。", { status: 500 });
    }
  },

  /**
   * 处理由 Cron 触发器调度的定时任务，用于更新 KV 缓存。
   * @param {ScheduledEvent} event 定时事件对象。
   * @param {object} env 环境变量，包含了到 R2 和 KV 的绑定。
   */
  async scheduled(event, env) {
    console.log("定时任务触发：正在刷新 R2 文件列表并存入 KV...");
    try {
      // 处理 PC 图片
      const pcList = await env.WALLPAPER_BUCKET.list({ prefix: "pc_img/" });
      const pcImageKeys = pcList.objects.map(obj => obj.key);
      await env.WALLPAPER_KV.put("PC_IMAGE_KEYS", JSON.stringify(pcImageKeys));
      console.log(`成功更新 PC_IMAGE_KEYS，包含 ${pcImageKeys.length} 个项目。`);

      // 处理 Mobile 图片
      const mobileList = await env.WALLPAPER_BUCKET.list({ prefix: "mobile_img/" });
      const mobileImageKeys = mobileList.objects.map(obj => obj.key);
      await env.WALLPAPER_KV.put("MOBILE_IMAGE_KEYS", JSON.stringify(mobileImageKeys));
      console.log(`成功更新 MOBILE_IMAGE_KEYS，包含 ${mobileImageKeys.length} 个项目。`);
      
    } catch (error) {
      console.error("定时任务执行期间发生错误:", error);
    }
  }
};
