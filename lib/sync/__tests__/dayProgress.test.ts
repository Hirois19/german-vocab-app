import AsyncStorage from '@react-native-async-storage/async-storage';

import { loadDayProgress, recordRated, recordTriage } from '../dayProgress';

// The native AsyncStorage module is not linked under Jest; use the package's
// official in-memory mock (see async-storage docs > Jest integration).
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const DECK = 'deck-1';
const DAY = 8;

beforeEach(async () => {
  await AsyncStorage.clear();
});

describe('dayProgress', () => {
  it('returns empty progress when nothing has been recorded', async () => {
    const p = await loadDayProgress(DECK, DAY);
    expect(p.rated).toEqual([]);
    expect(p.triaged).toEqual({});
  });

  it('records rated cards and reads them back, without duplicates', async () => {
    await recordRated(DECK, DAY, 'uc-a');
    await recordRated(DECK, DAY, 'uc-b');
    await recordRated(DECK, DAY, 'uc-a'); // repeat must not duplicate

    const p = await loadDayProgress(DECK, DAY);
    expect(p.rated.sort()).toEqual(['uc-a', 'uc-b']);
  });

  it('records triage decisions keyed by user_card_id', async () => {
    await recordTriage(DECK, DAY, 'uc-a', 'known');
    await recordTriage(DECK, DAY, 'uc-b', 'unknown');
    await recordTriage(DECK, DAY, 'uc-a', 'known_fully'); // latest wins

    const p = await loadDayProgress(DECK, DAY);
    expect(p.triaged).toEqual({ 'uc-a': 'known_fully', 'uc-b': 'unknown' });
  });

  it('keeps rated and triaged state independent per (deck, day)', async () => {
    await recordRated(DECK, DAY, 'uc-a');
    await recordRated(DECK, DAY + 1, 'uc-z');
    await recordRated('deck-2', DAY, 'uc-other');

    expect((await loadDayProgress(DECK, DAY)).rated).toEqual(['uc-a']);
    expect((await loadDayProgress(DECK, DAY + 1)).rated).toEqual(['uc-z']);
    expect((await loadDayProgress('deck-2', DAY)).rated).toEqual(['uc-other']);
  });

  it('preserves rated and triaged together in the same blob', async () => {
    await recordRated(DECK, DAY, 'uc-a');
    await recordTriage(DECK, DAY, 'uc-b', 'known');

    const p = await loadDayProgress(DECK, DAY);
    expect(p.rated).toEqual(['uc-a']);
    expect(p.triaged).toEqual({ 'uc-b': 'known' });
  });

  it('tolerates a corrupt stored blob by returning empty progress', async () => {
    await AsyncStorage.setItem(`german-vocab-app:day-progress:v1:${DECK}:${DAY}`, '{not json');
    const p = await loadDayProgress(DECK, DAY);
    expect(p).toEqual({ rated: [], triaged: {} });
  });
});
