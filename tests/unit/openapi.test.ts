/** OpenAPI contract well-formedness (IMP-COM-001B verification gate). */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { parse } from 'yaml'

const load = (path: string) => parse(readFileSync(path, 'utf8')) as Record<string, any>

describe('OpenAPI contracts parse and cover the implemented surface', () => {
  it('commerce.v1.yaml is valid YAML with all 13 product paths and 16 operations', () => {
    const spec = load('contracts/openapi/commerce.v1.yaml')
    expect(spec.openapi).toBe('3.1.0')
    const paths = Object.keys(spec.paths)
    expect(paths).toEqual(expect.arrayContaining([
      '/products', '/products/{productId}', '/products/{productId}/archive',
      '/products/{productId}/restore', '/products/{productId}/variants',
      '/products/{productId}/variants/{variantId}', '/products/{productId}/media',
      '/products/{productId}/media/{productMediaId}', '/products/{productId}/media/order',
      '/products/{productId}/options', '/products/{productId}/options/{optionName}',
      '/products/{productId}/options/{optionName}/values',
      '/products/{productId}/options/{optionName}/values/{value}',
    ]))
    const operations = paths.flatMap((p) => Object.keys(spec.paths[p]).filter((k) => ['get', 'post', 'patch', 'put', 'delete'].includes(k)))
    expect(operations).toHaveLength(16)
    // every operation has an operationId and at least one response
    for (const p of paths) {
      for (const method of Object.keys(spec.paths[p])) {
        if (!['get', 'post', 'patch', 'put', 'delete'].includes(method)) continue
        expect(spec.paths[p][method].operationId, `${method} ${p}`).toBeTruthy()
        expect(Object.keys(spec.paths[p][method].responses).length, `${method} ${p}`).toBeGreaterThan(0)
      }
    }
    // Money schema forbids floats (rule 8 in the contract itself)
    expect(spec.components.schemas.Money.properties.amount.type).toBe('integer')
  })

  it('merchant.v1.yaml still parses (regression)', () => {
    const spec = load('contracts/openapi/merchant.v1.yaml')
    expect(spec.openapi).toBe('3.1.0')
    expect(Object.keys(spec.paths).length).toBeGreaterThanOrEqual(5)
  })
})
