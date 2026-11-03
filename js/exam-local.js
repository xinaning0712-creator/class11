// 同事版考試頁（exam.html?solo）：不連資料庫，設定存在這台電腦的瀏覽器、音檔存在 IndexedDB。
// 寫法和 Supabase 一樣，後台的考試設定程式不用改就能共用。
const KEY = 'solo-exam-settings';
const DB_NAME = 'solo-exam-audio';
const STORE = 'files';

export const SOLO_PREFIX = 'local:';

function readAll() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function run(mode, action) {
  const db = await openDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const req = action(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally { db.close(); }
}

export const localDb = {
  from: () => ({
    select: () => ({
      in: async (_column, keys) => {
        const all = readAll();
        return { data: keys.filter((k) => k in all).map((key) => ({ key, value: all[key] })), error: null };
      },
    }),
    upsert: async (rows) => {
      const all = readAll();
      for (const r of rows) all[r.key] = r.value;
      try {
        localStorage.setItem(KEY, JSON.stringify(all));
        return { error: null };
      } catch { return { error: { message: '這台電腦的瀏覽器存不了資料（可能是無痕視窗）' } }; }
    },
  }),
  storage: {
    from: () => ({
      upload: async (path, file) => {
        try {
          await run('readwrite', (s) => s.put(file, path));
          return { error: null };
        } catch { return { error: { message: '音檔存不進這台電腦（可能是無痕視窗或空間不足）' } }; }
      },
      getPublicUrl: (path) => ({ data: { publicUrl: SOLO_PREFIX + path } }),
      remove: async (paths) => {
        try {
          await Promise.all(paths.map((p) => run('readwrite', (s) => s.delete(p))));
          return { error: null };
        } catch (error) { return { error }; }
      },
    }),
  },
};

// local:檔名 → 可以播放的網址
export async function localAudioUrl(url) {
  const file = await run('readonly', (s) => s.get(url.slice(SOLO_PREFIX.length)));
  return file ? URL.createObjectURL(file) : '';
}
