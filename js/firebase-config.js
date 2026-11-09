/* Firebase Web 配置：填了就能联机和上排行榜；改回 null 就是单机模式。
 * 详细步骤见 docs/FIREBASE.md。这些值本来就是公开的（会被下载到每个玩家的浏览器），
 * 数据安全靠 database.rules.json 里发布到 Firebase 的规则。
 */
window.XMUM_FIREBASE = {
  apiKey: "AIzaSyDVfuAJ_2KTjDZ0fFWdK6hdnZUMJ96xPdU",
  authDomain: "xmum-campus.firebaseapp.com",
  databaseURL: "https://xmum-campus-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "xmum-campus",
  storageBucket: "xmum-campus.firebasestorage.app",
  messagingSenderId: "136860471187",
  appId: "1:136860471187:web:4caa3b3b8d8bd19c28e266"
};
