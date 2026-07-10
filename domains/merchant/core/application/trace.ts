/**
 * Trace helpers — moved to platform/ in IMP-COM-001B (D-20 is platform law, not merchant's).
 * This shim keeps merchant import paths stable; both names are the same bytes.
 */
export { traceFromRequest, traceFromEvent } from '../../../../platform/trace'
