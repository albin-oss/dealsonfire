/**
 * Message access for design-system components. English ships as the default;
 * an app provides a translated catalog via `provideDsMessages` (same shape,
 * type-checked). Components never concatenate — full sentences only (§11).
 */
import { inject, provide, type InjectionKey } from 'vue'
import { DS_MESSAGES, type DsMessages } from './en'

const KEY: InjectionKey<DsMessages> = Symbol('dof-ds-messages')

export function provideDsMessages(messages: DsMessages): void {
  provide(KEY, messages)
}

export function useDsMessages(): DsMessages {
  return inject(KEY, DS_MESSAGES)
}

export { DS_MESSAGES }
export type { DsMessages }
