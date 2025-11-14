"use client"

import { createContext, useContext, useState, useCallback, useRef, ReactNode } from 'react'

interface CacheEntry<T> {
  data: T
  timestamp: number
  expiresAt: number
}

interface CacheContextType {
  get: <T>(key: string) => T | null
  set: <T>(key: string, data: T, ttl?: number) => void
  clear: (key?: string) => void
  invalidatePattern: (pattern: string) => void
}

const DataCacheContext = createContext<CacheContextType | undefined>(undefined)

const DEFAULT_TTL = 60 * 1000 // 60 seconds
const CACHE_CLEANUP_INTERVAL = 5 * 60 * 1000 // 5 minutes

export function DataCacheProvider({ children }: { children: ReactNode }) {
  const cache = useRef<Map<string, CacheEntry<any>>>(new Map())
  const [, forceUpdate] = useState({})

  // Clean up expired entries periodically
  useRef(() => {
    const interval = setInterval(() => {
      const now = Date.now()
      const keysToDelete: string[] = []

      cache.current.forEach((entry, key) => {
        if (entry.expiresAt < now) {
          keysToDelete.push(key)
        }
      })

      keysToDelete.forEach(key => cache.current.delete(key))

      if (keysToDelete.length > 0) {
        console.log(`[Cache] Cleaned up ${keysToDelete.length} expired entries`)
      }
    }, CACHE_CLEANUP_INTERVAL)

    return () => clearInterval(interval)
  }).current

  const get = useCallback(<T,>(key: string): T | null => {
    const entry = cache.current.get(key)

    if (!entry) {
      return null
    }

    const now = Date.now()
    if (entry.expiresAt < now) {
      cache.current.delete(key)
      return null
    }

    console.log(`[Cache] HIT: ${key} (age: ${((now - entry.timestamp) / 1000).toFixed(1)}s)`)
    return entry.data as T
  }, [])

  const set = useCallback(<T,>(key: string, data: T, ttl: number = DEFAULT_TTL) => {
    const now = Date.now()
    cache.current.set(key, {
      data,
      timestamp: now,
      expiresAt: now + ttl
    })
    console.log(`[Cache] SET: ${key} (TTL: ${(ttl / 1000).toFixed(0)}s)`)
  }, [])

  const clear = useCallback((key?: string) => {
    if (key) {
      cache.current.delete(key)
      console.log(`[Cache] CLEARED: ${key}`)
    } else {
      cache.current.clear()
      console.log('[Cache] CLEARED ALL')
    }
    forceUpdate({})
  }, [])

  const invalidatePattern = useCallback((pattern: string) => {
    const regex = new RegExp(pattern)
    const keysToDelete: string[] = []

    cache.current.forEach((_, key) => {
      if (regex.test(key)) {
        keysToDelete.push(key)
      }
    })

    keysToDelete.forEach(key => cache.current.delete(key))
    console.log(`[Cache] INVALIDATED pattern "${pattern}": ${keysToDelete.length} entries`)

    if (keysToDelete.length > 0) {
      forceUpdate({})
    }
  }, [])

  return (
    <DataCacheContext.Provider value={{ get, set, clear, invalidatePattern }}>
      {children}
    </DataCacheContext.Provider>
  )
}

export function useDataCache() {
  const context = useContext(DataCacheContext)
  if (!context) {
    throw new Error('useDataCache must be used within DataCacheProvider')
  }
  return context
}
