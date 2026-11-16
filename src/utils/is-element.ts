// Whether something is a DOM element, of whichever window made it: `instanceof Element` holds only
// for elements of the window whose `Element` it names.

/** Whether a value, such as an event's target, is an element. */
export const isElement = (value: unknown): value is Element =>
  typeof value === 'object' && value !== null && (value as Node).nodeType === 1;
