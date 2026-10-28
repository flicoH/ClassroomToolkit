import {
  positiveScoreItems,
  scoreDetailsForSnapshot,
} from './report-generation';

describe('positive report item counts', () => {
  it('counts positive evaluation events per label, not points, and excludes zero/negative events', () => {
    expect(
      positiveScoreItems([
        { label: '认真听讲', delta: 10 },
        { label: '乐于助人', delta: 5 },
        { label: '认真听讲', delta: 1 },
        { label: '认真听讲', delta: -2 },
        { label: '乐于助人', delta: 0 },
        { label: ' 乐于助人 ', delta: 3 },
        { label: '', delta: 1 },
        { label: '无效', delta: NaN },
      ]),
    ).toEqual([
      { label: '乐于助人', count: 2 },
      { label: '认真听讲', count: 2 },
      { label: '课堂评价', count: 1 },
    ]);
  });

  it('preserves the complete frozen counts even when details were truncated', () => {
    expect(
      scoreDetailsForSnapshot({
        scoreSummary: {
          count: 100,
          records: [],
          positiveItems: [{ label: '认真听讲', count: 100 }],
        },
      })?.positiveItems,
    ).toEqual([{ label: '认真听讲', count: 100 }]);
  });

  it('derives legacy counts only from complete and authorized snapshot records', () => {
    const scoreSummary = {
      count: 2,
      records: [
        { id: 'one', label: '认真听讲', delta: 5 },
        { id: 'two', label: '提醒', delta: -1 },
      ],
    };
    expect(
      scoreDetailsForSnapshot({
        scoreSummary,
        allowedReferences: ['score:one', 'score:two'],
      })?.positiveItems,
    ).toEqual([{ label: '认真听讲', count: 1 }]);
    expect(
      scoreDetailsForSnapshot({
        scoreSummary,
        allowedReferences: ['score:one'],
      })?.positiveItems,
    ).toBeUndefined();
    expect(
      scoreDetailsForSnapshot({
        scoreSummary: { ...scoreSummary, count: 100 },
        allowedReferences: ['score:one', 'score:two'],
      })?.positiveItems,
    ).toBeUndefined();
    expect(
      scoreDetailsForSnapshot({ scoreSummary: { count: 0, records: [] } })
        ?.positiveItems,
    ).toEqual([]);
  });
});
