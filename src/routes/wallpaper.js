import { Router } from 'itty-router';

const router = Router({ base: '/wallpaper' });

router.get('/random', async (request, env) => {
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
    headers.set('cache-control', 'public, max-age=300');

    return new Response(object.body, {
      headers,
    });
  } catch (error) {
    console.error("/wallpaper/random 路由发生意外错误:", error);
    return new Response("服务器内部错误。", { status: 500 });
  }
});

export default router;