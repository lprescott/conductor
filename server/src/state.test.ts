import { describe, it, expect, beforeEach } from 'vitest'
import {
  getState,
  setPattern,
  setPlaying,
  setError,
  clearError,
  subscribeToStateChanges,
  suppressNextWatcherBroadcast,
  shouldSuppressWatcherBroadcast,
} from './state.js'

describe('state module', () => {
  beforeEach(() => {
    setPattern("note('c3')")
    setPlaying(false)
    clearError()
  })

  it('getState returns current shape', () => {
    const s = getState()
    expect(s).toMatchObject({
      pattern: "note('c3')",
      playing: false,
      error: null,
    })
  })

  it('setPattern updates pattern', () => {
    setPattern("note('e3')")
    expect(getState().pattern).toBe("note('e3')")
  })

  it('setPlaying updates playing', () => {
    setPlaying(true)
    expect(getState().playing).toBe(true)
  })

  it('setError sets error string', () => {
    setError('SyntaxError: unexpected token')
    expect(getState().error).toBe('SyntaxError: unexpected token')
  })

  it('clearError nulls the error', () => {
    setError('boom')
    clearError()
    expect(getState().error).toBeNull()
  })

  it('subscribeToStateChanges fires on setPattern and unsubscribes', () => {
    const calls: string[] = []
    const unsub = subscribeToStateChanges((s) => calls.push(s.pattern))
    setPattern("note('g3')")
    unsub()
    setPattern("note('a3')")
    expect(calls).toEqual(["note('g3')"])
  })
})

describe('watcher suppression', () => {
  it('returns false before any suppression', () => {
    expect(shouldSuppressWatcherBroadcast()).toBe(false)
  })

  it('returns true immediately after suppressNextWatcherBroadcast', () => {
    suppressNextWatcherBroadcast()
    expect(shouldSuppressWatcherBroadcast()).toBe(true)
  })

  it('returns false after the 500ms window has elapsed', async () => {
    suppressNextWatcherBroadcast()
    await new Promise((r) => setTimeout(r, 510))
    expect(shouldSuppressWatcherBroadcast()).toBe(false)
  })
})
