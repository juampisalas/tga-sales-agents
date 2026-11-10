/** Phase 1 module marker. Later phases must not be implied by this type. */
export type Phase1Module = {
  readonly id: string;
  readonly phaseImplemented: 1;
  readonly summary: string;
};
