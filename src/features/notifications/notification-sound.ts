"use client"

const databaseName = "jota-notification-sounds"
const storeName = "sounds"
const databaseVersion = 1
const defaultVolume = 65
export const maxNotificationSoundBytes = 2 * 1024 * 1024
export const supportedNotificationSoundTypes = [
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/x-wav",
  "audio/ogg",
  "audio/mp4",
  "audio/aac",
  "audio/webm",
]

type StoredSound = { userId: string; name: string; blob: Blob }

function volumeStorageKey(userId: string) {
  return `jota-notification-volume:${userId}`
}

export function getNotificationVolume(userId: string) {
  try {
    const stored = window.localStorage.getItem(volumeStorageKey(userId))
    if (stored === null) return defaultVolume
    const value = Number(stored)
    return Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : defaultVolume
  } catch {
    return defaultVolume
  }
}

export function saveNotificationVolume(userId: string, volume: number) {
  const safeVolume = Math.min(100, Math.max(0, Math.round(volume)))
  try {
    window.localStorage.setItem(volumeStorageKey(userId), String(safeVolume))
  } catch {
    // Keep the current session usable when browser storage is unavailable.
  }
}

function openSoundDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (!("indexedDB" in window)) {
      reject(new Error("This browser cannot save a custom notification sound."))
      return
    }
    const request = indexedDB.open(databaseName, databaseVersion)
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(storeName)) {
        request.result.createObjectStore(storeName, { keyPath: "userId" })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error ?? new Error("Could not open notification sound storage."))
  })
}

export async function saveCustomNotificationSound(userId: string, file: File) {
  const database = await openSoundDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(storeName, "readwrite")
      transaction.objectStore(storeName).put({ userId, name: file.name, blob: file } satisfies StoredSound)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error("Could not save the custom sound."))
      transaction.onabort = () => reject(transaction.error ?? new Error("Saving the custom sound was cancelled."))
    })
  } finally {
    database.close()
  }
}

export async function getCustomNotificationSound(userId: string) {
  const database = await openSoundDatabase()
  try {
    return await new Promise<StoredSound | null>((resolve, reject) => {
      const request = database.transaction(storeName, "readonly").objectStore(storeName).get(userId)
      request.onsuccess = () => resolve((request.result as StoredSound | undefined) ?? null)
      request.onerror = () => reject(request.error ?? new Error("Could not load the custom sound."))
    })
  } finally {
    database.close()
  }
}

export async function removeCustomNotificationSound(userId: string) {
  const database = await openSoundDatabase()
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(storeName, "readwrite")
      transaction.objectStore(storeName).delete(userId)
      transaction.oncomplete = () => resolve()
      transaction.onerror = () => reject(transaction.error ?? new Error("Could not remove the custom sound."))
      transaction.onabort = () => reject(transaction.error ?? new Error("Removing the custom sound was cancelled."))
    })
  } finally {
    database.close()
  }
}

async function playDefaultChime(volume: number): Promise<boolean> {
  const AudioContextConstructor = window.AudioContext
  if (!AudioContextConstructor) return false

  const context = new AudioContextConstructor()
  try {
    await context.resume()
    const now = context.currentTime
    const level = volume / 100
    const partials = [
      { frequency: 1046.5, volume: 0.09, decay: 1.1 },
      { frequency: 2093, volume: 0.035, decay: 0.7 },
      { frequency: 2920, volume: 0.018, decay: 0.4 },
    ]
    partials.forEach(({ frequency, volume: partialVolume, decay }, index) => {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = "sine"
      oscillator.frequency.setValueAtTime(frequency, now)
      gain.gain.setValueAtTime(0.0001, now)
      gain.gain.exponentialRampToValueAtTime(partialVolume * level, now + 0.008)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + decay)
      oscillator.connect(gain)
      gain.connect(context.destination)
      oscillator.onended = () => {
        oscillator.disconnect()
        gain.disconnect()
        if (index === 0) void context.close().catch(() => {})
      }
      oscillator.start(now)
      oscillator.stop(now + decay + 0.02)
    })
    return true
  } catch {
    void context.close()
    return false
  }
}

export async function playNotificationChime(userId: string): Promise<boolean> {
  if (typeof window === "undefined") return false
  const volume = getNotificationVolume(userId)
  if (volume === 0) return true

  try {
    const customSound = await getCustomNotificationSound(userId)
    if (customSound) {
      const sourceUrl = URL.createObjectURL(customSound.blob)
      const audio = new Audio(sourceUrl)
      audio.volume = volume / 100
      audio.preload = "auto"
      const releaseUrl = () => URL.revokeObjectURL(sourceUrl)
      audio.addEventListener("ended", releaseUrl, { once: true })
      audio.addEventListener("error", releaseUrl, { once: true })
      try {
        await audio.play()
        return true
      } catch {
        releaseUrl()
        return false
      }
    }
  } catch {
    // The built-in chime remains available if IndexedDB is blocked or unavailable.
  }

  try {
    return await playDefaultChime(volume)
  } catch {
    return false
  }
}
