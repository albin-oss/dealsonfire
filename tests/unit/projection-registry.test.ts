import { describe, it, expect } from 'vitest'
import { ProjectionRegistry, type ProjectionDefinition } from '@platform/projection-registry'

const def = (name: string): ProjectionDefinition => ({
  name,
  version: 1,
  sourceEventTypes: ['x.y.z'],
  schemaSql: (t) => `CREATE TABLE ${t} (id uuid PRIMARY KEY)`,
  build: async () => {},
})

describe('ProjectionRegistry (ADR-004 C5, rule 16)', () => {
  it('enforces the rm_ prefix', () => {
    const registry = new ProjectionRegistry()
    expect(() => registry.register(def('store_public'))).toThrow(/rm_ prefix/)
    expect(() => registry.register(def('rm_store_public'))).not.toThrow()
  })

  it('rejects duplicate registration and invalid identifiers', () => {
    const registry = new ProjectionRegistry()
    registry.register(def('rm_a'))
    expect(() => registry.register(def('rm_a'))).toThrow(/already registered/)
    expect(() => registry.register(def('rm_bad-name'))).toThrow(/invalid SQL identifier/)
  })

  it('lists registered projections for the CI drill to enumerate', () => {
    const registry = new ProjectionRegistry()
    registry.register(def('rm_a'))
    registry.register(def('rm_b'))
    expect(registry.list().map((d) => d.name)).toEqual(['rm_a', 'rm_b'])
    expect(registry.get('rm_a')?.sourceEventTypes).toEqual(['x.y.z'])
  })

  it('rebuild of an unknown projection fails loudly', async () => {
    const registry = new ProjectionRegistry()
    await expect(registry.rebuild(null as never, 'rm_ghost')).rejects.toThrow(/unknown projection/)
  })
})
