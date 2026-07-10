/**
 * UUID v7 — canonical implementation moved to platform/ (Batch 1, K1). This shim keeps
 * every existing merchant import path stable; both names are the same bytes.
 */
export { uuidv7, isUuid, UUID_RE } from '../../../platform/uuid'
