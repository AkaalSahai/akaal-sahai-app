// Videos on the projector from a folder on the projector laptop (agreed
// 07-11-2026). Nothing is uploaded: someone on the laptop picks a folder once
// (Chrome/Edge File System Access API); the folder handle is remembered in this
// browser's IndexedDB, so after a restart Chrome only asks for one "Allow".

const DB = 'projector-videos', STORE = 'folder', KEY = 'current'
const VIDEO_EXT = /\.(mp4|m4v|webm|mov)$/i

export const videosSupported = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore(STORE)
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function withStore(mode, fn) {
  const db = await openDb()
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, mode)
      const req = fn(tx.objectStore(STORE))
      tx.oncomplete = () => resolve(req?.result)
      tx.onerror = () => reject(tx.error)
    })
  } finally { db.close() }
}

export const savedFolder = () => withStore('readonly', s => s.get(KEY)).catch(() => null)
export const forgetFolder = () => withStore('readwrite', s => s.delete(KEY)).catch(() => {})

// Must be called from a click
export async function chooseFolder() {
  const handle = await window.showDirectoryPicker({ id: 'projector-videos', mode: 'read' })
  await withStore('readwrite', s => s.put(handle, KEY))
  return handle
}

// 'granted' | 'prompt' | 'denied'
export async function folderPermission(handle, ask = false) {
  try {
    const opts = { mode: 'read' }
    const now = await handle.queryPermission(opts)
    if (now === 'granted' || !ask) return now
    return await handle.requestPermission(opts)   // ask=true only from a click
  } catch { return 'denied' }
}

// Video files in the folder (not sub-folders), in filename order - "01 ...",
// "02 ..." sort as numbers, so "2" comes before "10"
export async function listVideos(handle) {
  const out = []
  for await (const entry of handle.values()) {
    if (entry.kind === 'file' && VIDEO_EXT.test(entry.name)) out.push({ name: entry.name, handle: entry })
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
}
