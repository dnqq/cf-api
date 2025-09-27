import { Router } from 'itty-router';
import wallpaperRouter from './routes/wallpaper';

/**
 * ===================================================================================
 *  可扩展的 API Worker (模块化结构)
 *
 *  架构说明:
 *  - 使用 itty-router 进行路由管理。
 *  - 核心路由在 src/index.js 中注册。
 *  - 复杂的 API 模块被拆分到 src/routes/ 目录下的独立文件中。
 *    - 例如: src/routes/wallpaper.js
 *
 *  后台任务 (scheduled 处理器):
 *  - 保持在主文件中，用于执行全局的定时任务。
 * ===================================================================================
 */

// 初始化主路由器
const router = Router();

// --- 注册模块化路由 ---
router.all('/wallpaper/*', wallpaperRouter.handle);


// --- 预留的 API 路由 (未来也可以拆分为模块) ---

// 音乐 API
router.get('/music/now-playing', () => new Response('音乐 API - 正在播放 (待实现)', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } }));

// 博客与分析 API
router.get('/blog/latest-post', () => new Response('博客 API - 最新文章 (待实现)', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } }));
router.get('/analytics/page-views', () => new Response('分析 API - 页面浏览量 (待实现)', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } }));

// 笔记 API
router.post('/notes/create', () => new Response('笔记 API - 创建笔记 (待实现)', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } }));


// --- 404 处理 ---
// 如果请求未被任何上述路由匹配，则返回 404
router.all('*', () => new Response('404, Not Found.', { status: 404 }));


export default {
  /**
   * 处理所有传入的 HTTP 请求。
   */
  async fetch(request, env, ctx) {
    return router.handle(request, env, ctx);
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
