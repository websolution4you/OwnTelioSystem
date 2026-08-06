export interface WordErrorRateResult {
  referenceWords: number;
  substitutions: number;
  insertions: number;
  deletions: number;
  errors: number;
  rate: number;
}

export function normalizeTranscript(text: string): string[] {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('sk')
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
}

export function wordErrorRate(reference: string, hypothesis: string): WordErrorRateResult {
  const expected = normalizeTranscript(reference);
  const actual = normalizeTranscript(hypothesis);
  const matrix: Array<Array<{ cost: number; substitutions: number; insertions: number; deletions: number }>> =
    Array.from({ length: expected.length + 1 }, () => []);

  matrix[0]![0] = { cost: 0, substitutions: 0, insertions: 0, deletions: 0 };
  for (let index = 1; index <= expected.length; index += 1) {
    matrix[index]![0] = { cost: index, substitutions: 0, insertions: 0, deletions: index };
  }
  for (let index = 1; index <= actual.length; index += 1) {
    matrix[0]![index] = { cost: index, substitutions: 0, insertions: index, deletions: 0 };
  }

  for (let row = 1; row <= expected.length; row += 1) {
    for (let column = 1; column <= actual.length; column += 1) {
      if (expected[row - 1] === actual[column - 1]) {
        matrix[row]![column] = { ...matrix[row - 1]![column - 1]! };
        continue;
      }
      const candidates = [
        { previous: matrix[row - 1]![column - 1]!, type: 'substitution' },
        { previous: matrix[row]![column - 1]!, type: 'insertion' },
        { previous: matrix[row - 1]![column]!, type: 'deletion' },
      ] as const;
      const selected = candidates.reduce((best, candidate) =>
        candidate.previous.cost < best.previous.cost ? candidate : best,
      );
      matrix[row]![column] = {
        cost: selected.previous.cost + 1,
        substitutions: selected.previous.substitutions + (selected.type === 'substitution' ? 1 : 0),
        insertions: selected.previous.insertions + (selected.type === 'insertion' ? 1 : 0),
        deletions: selected.previous.deletions + (selected.type === 'deletion' ? 1 : 0),
      };
    }
  }

  const result = matrix[expected.length]![actual.length]!;
  return {
    referenceWords: expected.length,
    substitutions: result.substitutions,
    insertions: result.insertions,
    deletions: result.deletions,
    errors: result.cost,
    rate: expected.length === 0 ? (actual.length === 0 ? 0 : 1) : result.cost / expected.length,
  };
}
