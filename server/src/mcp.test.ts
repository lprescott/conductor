import { describe, it, expect } from 'vitest'
import path from 'node:path'
import { patternPath, PATTERNS_DIR } from './mcp.js'

describe('patternPath', () => {
  it('returns path inside PATTERNS_DIR with .js extension', () => {
    expect(patternPath('my-groove')).toBe(path.join(PATTERNS_DIR, 'my-groove.js'))
  })

  it('strips characters outside word chars, hyphens, and spaces', () => {
    expect(patternPath('foo/bar../../etc')).toBe(path.join(PATTERNS_DIR, 'foobaretc.js'))
  })

  it('collapses internal whitespace to a single hyphen', () => {
    expect(patternPath('jazz  groove')).toBe(path.join(PATTERNS_DIR, 'jazz-groove.js'))
  })

  it('trims leading and trailing whitespace', () => {
    expect(patternPath('  groove  ')).toBe(path.join(PATTERNS_DIR, 'groove.js'))
  })

  it('throws on a name that sanitizes to empty', () => {
    expect(() => patternPath('...')).toThrow('Invalid pattern name')
    expect(() => patternPath('   ')).toThrow('Invalid pattern name')
    expect(() => patternPath('')).toThrow('Invalid pattern name')
  })

  it('preserves hyphens', () => {
    expect(patternPath('c-minor-groove')).toBe(path.join(PATTERNS_DIR, 'c-minor-groove.js'))
  })
})
