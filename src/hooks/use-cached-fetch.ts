"use client"

import { useState, useCallback, useRef, useEffect } from 'react'
import { useDataCache } from '@/contexts/data-cache-context'

interface FetchOptions {
  ttl?: number // Time to live in milliseconds
  skipCache?: boolean // Force fresh fetch
  critical?: boolean // Priority fetch
}

interface FetchState<T> {
  data: T | null
  loading: boolean
  error: Error | null
}

// In-flight request tracking to prevent duplicate requests
const inflightRequests = new Map<string, Promise<any>>()

export function useCachedFetch<T = any>(
  url: string | null,
  options: FetchOptions = {}
): FetchState<T> & { refetch: () => void } {
  const cache = useDataCache()
  const [state, setState] = useState<FetchState<T>>({
    data: null,
    loading: false,
    error: null
  })

  const abortControllerRef = useRef<AbortController | null>(null)
  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
      abortControllerRef.current?.abort()
    }
  }, [])

  const fetchData = useCallback(async () => {
    if (!url) {
      setState({ data: null, loading: false, error: null })
      return
    }

    const cacheKey = url
    const { ttl = 60000, skipCache = false } = options

    // Check cache first
    if (!skipCache) {
      const cachedData = cache.get<T>(cacheKey)
      if (cachedData !== null) {
        setState({ data: cachedData, loading: false, error: null })
        return
      }
    }

    // Check if request is already in-flight
    if (inflightRequests.has(cacheKey)) {
      console.log(`[Fetch] DEDUPING: ${url}`)
      try {
        const data = await inflightRequests.get(cacheKey)!
        if (isMountedRef.current) {
          setState({ data, loading: false, error: null })
        }
      } catch (error) {
        if (isMountedRef.current) {
          setState({ data: null, loading: false, error: error as Error })
        }
      }
      return
    }

    // Start new request
    setState(prev => ({ ...prev, loading: true, error: null }))

    abortControllerRef.current?.abort()
    abortControllerRef.current = new AbortController()

    const fetchPromise = (async () => {
      try {
        console.log(`[Fetch] FETCHING: ${url}`)
        const response = await fetch(url, {
          signal: abortControllerRef.current!.signal
        })

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`)
        }

        const data = await response.json()

        // Cache the result
        cache.set(cacheKey, data, ttl)

        return data
      } finally {
        inflightRequests.delete(cacheKey)
      }
    })()

    inflightRequests.set(cacheKey, fetchPromise)

    try {
      const data = await fetchPromise

      if (isMountedRef.current) {
        setState({ data, loading: false, error: null })
      }
    } catch (error: any) {
      if (error.name !== 'AbortError' && isMountedRef.current) {
        setState({ data: null, loading: false, error: error as Error })
      }
    }
  }, [url, cache, options.ttl, options.skipCache])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const refetch = useCallback(() => {
    if (url) {
      cache.clear(url)
      fetchData()
    }
  }, [url, cache, fetchData])

  return { ...state, refetch }
}

// Hook for fetching multiple URLs in parallel with priority support
export function useCachedFetchMultiple(
  requests: Array<{ url: string; critical?: boolean; ttl?: number }>
) {
  const cache = useDataCache()
  const [criticalLoading, setCriticalLoading] = useState(true)
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<Record<string, any>>({})
  const [errors, setErrors] = useState<Record<string, Error>>({})

  const isMountedRef = useRef(true)

  useEffect(() => {
    isMountedRef.current = true
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const fetchAll = useCallback(async () => {
    setCriticalLoading(true)
    setLoading(true)

    // Split into critical and secondary requests
    const criticalRequests = requests.filter(r => r.critical)
    const secondaryRequests = requests.filter(r => !r.critical)

    // Fetch critical data first
    if (criticalRequests.length > 0) {
      const criticalPromises = criticalRequests.map(async ({ url, ttl = 60000 }) => {
        const cacheKey = url

        // Check cache
        const cachedData = cache.get(cacheKey)
        if (cachedData !== null) {
          return { url, data: cachedData, error: null }
        }

        // Check in-flight
        if (inflightRequests.has(cacheKey)) {
          try {
            const data = await inflightRequests.get(cacheKey)!
            return { url, data, error: null }
          } catch (error) {
            return { url, data: null, error: error as Error }
          }
        }

        // Fetch
        const fetchPromise = (async () => {
          try {
            const response = await fetch(url)
            if (!response.ok) throw new Error(`HTTP ${response.status}`)
            const data = await response.json()
            cache.set(cacheKey, data, ttl)
            return data
          } finally {
            inflightRequests.delete(cacheKey)
          }
        })()

        inflightRequests.set(cacheKey, fetchPromise)

        try {
          const data = await fetchPromise
          return { url, data, error: null }
        } catch (error) {
          return { url, data: null, error: error as Error }
        }
      })

      const criticalResults = await Promise.all(criticalPromises)

      if (isMountedRef.current) {
        const newData: Record<string, any> = {}
        const newErrors: Record<string, Error> = {}

        criticalResults.forEach(({ url, data, error }) => {
          if (error) {
            newErrors[url] = error
          } else {
            newData[url] = data
          }
        })

        setData(prev => ({ ...prev, ...newData }))
        setErrors(prev => ({ ...prev, ...newErrors }))
        setCriticalLoading(false)
      }
    } else {
      setCriticalLoading(false)
    }

    // Fetch secondary data in background
    if (secondaryRequests.length > 0) {
      const secondaryPromises = secondaryRequests.map(async ({ url, ttl = 60000 }) => {
        const cacheKey = url

        const cachedData = cache.get(cacheKey)
        if (cachedData !== null) {
          return { url, data: cachedData, error: null }
        }

        if (inflightRequests.has(cacheKey)) {
          try {
            const data = await inflightRequests.get(cacheKey)!
            return { url, data, error: null }
          } catch (error) {
            return { url, data: null, error: error as Error }
          }
        }

        const fetchPromise = (async () => {
          try {
            const response = await fetch(url)
            if (!response.ok) throw new Error(`HTTP ${response.status}`)
            const data = await response.json()
            cache.set(cacheKey, data, ttl)
            return data
          } finally {
            inflightRequests.delete(cacheKey)
          }
        })()

        inflightRequests.set(cacheKey, fetchPromise)

        try {
          const data = await fetchPromise
          return { url, data, error: null }
        } catch (error) {
          return { url, data: null, error: error as Error }
        }
      })

      const secondaryResults = await Promise.all(secondaryPromises)

      if (isMountedRef.current) {
        const newData: Record<string, any> = {}
        const newErrors: Record<string, Error> = {}

        secondaryResults.forEach(({ url, data, error }) => {
          if (error) {
            newErrors[url] = error
          } else {
            newData[url] = data
          }
        })

        setData(prev => ({ ...prev, ...newData }))
        setErrors(prev => ({ ...prev, ...newErrors }))
      }
    }

    if (isMountedRef.current) {
      setLoading(false)
    }
  }, [requests, cache])

  useEffect(() => {
    fetchAll()
  }, [fetchAll])

  return { data, errors, criticalLoading, loading, refetch: fetchAll }
}
