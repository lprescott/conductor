import { describe, it, expect } from 'vitest'
import { ConductorClient } from './client'

// The MCP HTTP wire format is owned by @modelcontextprotocol/sdk now; we test
// only the bits ConductorClient adds on top: local-state caching, lifecycle,
// and that it survives an unreachable daemon at construction.

describe('ConductorClient', () => {
  it('updateState patches state without overwriting other fields', () => {
    const c = new ConductorClient('http://127.0.0.1:1')
    c.updateState({ playing: true })
    expect(c.getState().playing).toBe(true)
    expect(c.getState().error).toBeNull()
    c.dispose()
  })

  it('isConnected starts false when daemon is not reachable', () => {
    const c = new ConductorClient('http://127.0.0.1:1')
    expect(c.isConnected()).toBe(false)
    c.dispose()
  })

  it('constructs and disposes cleanly with no daemon', () => {
    const c = new ConductorClient('http://127.0.0.1:1')
    expect(() => c.dispose()).not.toThrow()
  })
})
