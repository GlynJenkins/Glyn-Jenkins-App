/** Price-grid column that is gated until firesock evidence is complete. */
export function isRoofCompletionStage(name: string): boolean {
  const n = name.toLowerCase().trim()
  return /roof\s*completion/.test(n)
}
