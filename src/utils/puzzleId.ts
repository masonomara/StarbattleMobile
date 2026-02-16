export function parsePuzzleId(id: string): { packId: string; index: number } {
  const [packId, idx] = id.split(':');
  return { packId, index: Number(idx) };
}

export function makePuzzleId(packId: string, index: number): string {
  return `${packId}:${index}`;
}
