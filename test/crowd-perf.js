/* 仅供本地测试：人群画面开销。在 test/social.html?crowd=80 里控制台跑：
 *   await XCrowdPerf.run()     三档画质各测一次，站在 A3 广场中间，朝四个方向各测一遍取平均：
 *     ms / calls / tris        整个画面：每帧毫秒（XPerf.stats：画一帧并等 GPU 画完，含阴影）、绘制调用、三角形
 *     ghostMs / ghostCalls / ghostTris   其中别的玩家（影子和他们的车）占多少：同一时刻把影子藏起来再测一遍，两次相减
 *                              （这台电脑上别的程序会让整帧毫秒忽高忽低，相减的这部分比较准）
 *     full / lite / label      完整模型 / 简化模型 / 只剩名字 的人数
 *   参数：{at:[x, z], levels:['low'], frames:10, settle:3000}
 * 加 &perf 不放假人，测没有人群时的数字。 */
'use strict';
window.XCrowdPerf = {
  roots(){
    const out = [];
    for (const r of XNet.peers().values()){
      const G = r.g; if (!G) continue;
      if (G.car && G.car.root.visible) out.push(G.car.root);
      else if (G.n && G.n.root.visible && G.n.root.parent === scene) out.push(G.n.root);
    }
    return out;
  },
  count(){
    let full = 0, lite = 0, label = 0;
    for (const r of XNet.peers().values()){
      const G = r.g; if (!G || !(G.vis || G.on)) continue;
      if (G.lod === 'mid') lite++; else if (G.lod === 'far' || !G.n) label++; else full++;
    }
    return {full, lite, label};
  },
  async run(o){
    o = o || {};
    const wait = ms => new Promise(r => setTimeout(r, ms)), at = o.at || [105, 128], out = {};
    if (typeof titleOpen !== 'undefined' && titleOpen) XUI.closeTitle('naiwa');
    await wait(500);
    for (const lv of o.levels || ['low', 'mid', 'high']){
      XQ.set(lv); nw.x = at[0]; nw.z = at[1]; await wait(o.settle || 3000);
      const acc = {ms:0, calls:0, tris:0, ghostMs:0, ghostCalls:0, ghostTris:0}, H = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
      for (const h of H){
        nw.x = at[0]; nw.z = at[1]; nw.h = h; await wait(900);
        const n = o.frames || 10, a = XPerf.stats(n), R = this.roots();
        R.forEach(x => { x.visible = false; }); const b = XPerf.stats(n); R.forEach(x => { x.visible = true; });
        acc.ms += a.ms; acc.calls += a.calls; acc.tris += a.tris;
        acc.ghostMs += a.ms - b.ms; acc.ghostCalls += a.calls - b.calls; acc.ghostTris += a.tris - b.tris;
      }
      for (const k in acc) acc[k] = /ms/i.test(k) ? +(acc[k] / H.length).toFixed(1) : Math.round(acc[k] / H.length);
      out[lv] = Object.assign(acc, this.count(), {heard:XNet.peers().size});
    }
    return out;
  }
};
