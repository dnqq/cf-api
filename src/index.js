/**
 * ===================================================================================
 *  API Worker for Random Wallpapers
 *
 *  说明:
 *  - 此 Worker 直接响应任何请求，返回一张随机壁纸。
 *  - 它会根据 User-Agent 判断设备类型 (PC 或 Mobile)，并从相应的列表中选择图片。
 *  - 图片列表通过一个定时任务 (scheduled handler) 每天更新并缓存在 KV 中。
 * ===================================================================================
 */

export default {
  /**
   * 处理所有传入的 HTTP 请求，返回一张随机壁纸。
   */
  async fetch(request, env, ctx) {
    try {
      const userAgent = (request.headers.get("User-Agent") || "").toLowerCase();
      const isMobile = /iphone|ipod|android|blackberry|iemobile|opera mini/.test(userAgent);
      const kvKey = isMobile ? "MOBILE_IMAGE_KEYS" : "PC_IMAGE_KEYS";

      const imageKeys = await env.WALLPAPER_KV.get(kvKey, "json");

      if (!imageKeys || imageKeys.length === 0) {
        console.error(`KV 缓存未命中或为空，键名: ${kvKey}。`);
        return new Response("图片服务正在预热中，请稍后重试。", {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        });
      }

      const randomKey = imageKeys[Math.floor(Math.random() * imageKeys.length)];
      const object = await env.WALLPAPER_BUCKET.get(randomKey);

      if (object === null) {
        console.error(`在 R2 中未找到 Key 为 "${randomKey}" 的对象。`);
        return new Response("无法获取到所选的图片。", { status: 404 });
      }

      const headers = new Headers();
      object.writeHttpMetadata(headers);
      headers.set('etag', object.httpEtag);
      headers.set('cache-control', 'public, max-age=300'); // 缓存5分钟

      return new Response(object.body, {
        headers,
      });
    } catch (error) {
      console.error("处理请求时发生意外错误:", error);
      return new Response("服务器内部错误。", { status: 500 });
    }
  },

  /**
   * 处理定时任务，用于更新壁纸列表缓存。
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
