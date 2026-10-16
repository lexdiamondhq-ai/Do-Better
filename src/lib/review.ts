/**
 * Asks for an App Store review at a good moment. Stub: workstream G builds the rules.
 * Contract: const ask = useReviewAsk(); ask('face') after a Queen or better, ask('showdown') when the Showdown closes,
 * ask('call') after a made call, ask('back') after a new card back. It decides itself whether to actually ask.
 */
export type ReviewTrigger = 'face' | 'showdown' | 'call' | 'back';

export function useReviewAsk(): (trigger: ReviewTrigger) => void {
  return () => {};
}
