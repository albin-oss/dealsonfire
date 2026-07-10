/**
 * Consumer registry (IMP-PLT-001 event infrastructure): formalizes what was an ad-hoc
 * array — named registration with duplicate detection and an event-type index, so the
 * composition root can answer "who consumes X?" and the replay tool can target consumers.
 */
import type { OutboxConsumer } from './outbox-dispatcher'

export class ConsumerRegistry {
  private readonly consumers = new Map<string, OutboxConsumer>()

  register(consumer: OutboxConsumer): void {
    if (this.consumers.has(consumer.consumer)) {
      throw new Error(`consumer already registered: ${consumer.consumer}`)
    }
    if (consumer.eventTypes.length === 0) {
      throw new Error(`consumer ${consumer.consumer} subscribes to no event types`)
    }
    this.consumers.set(consumer.consumer, consumer)
  }

  all(): OutboxConsumer[] {
    return [...this.consumers.values()]
  }

  get(name: string): OutboxConsumer | undefined {
    return this.consumers.get(name)
  }

  forEventType(eventType: string): OutboxConsumer[] {
    return this.all().filter((c) => c.eventTypes.includes(eventType))
  }

  /** All subscribed event types — the documentation surface for "what does this domain react to?" */
  subscribedEventTypes(): string[] {
    return [...new Set(this.all().flatMap((c) => c.eventTypes))].sort()
  }
}
