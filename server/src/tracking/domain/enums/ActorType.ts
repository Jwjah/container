/**
 * ActorType — who triggered a lifecycle transition.
 *
 * RFC-007 §9 — Timeline Event
 */
export enum ActorType {
  STUDENT = 'student',
  SHOP    = 'shop',
  AGENT   = 'agent',
  SYSTEM  = 'system',
}
