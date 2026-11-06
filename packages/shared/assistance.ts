/** Future server-side adapters may suggest copy. The caller must explicitly supply authorized text.
 * This capability has no access to identities, publishing jobs, approval transitions or credentials. */
export interface CaptionAssistant {
  suggest(
    input: { caption: string; platform: "linkedin" | "instagram" | "facebook" },
    signal: AbortSignal,
  ): Promise<{ suggestion: string }>;
}
