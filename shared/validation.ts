/**
 * Framework-free validation port. Defined in shared/ so both domains/ (the dispatcher
 * that runs validators) and contracts/ (the zod schemas that implement them) can depend
 * on it without depending on each other (BLUEPRINT §1 dependency direction).
 */
export type PayloadValidator = (payload: unknown) => { ok: true } | { ok: false; message: string }
