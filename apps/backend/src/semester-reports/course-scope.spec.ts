import {
  detectCourseUnits,
  chooseCourseUnitCandidates,
  selectCoursePages,
  extractLearningContents,
} from './course-scope';

const document = {
  id: 'course',
  fileName: 'Health.pdf',
  confirmedUnits: [],
  sourcePages: [
    {
      page: 4,
      text: '| 单元 | 课时 | 教学内容 |\n| --- | --- | --- |\n| Unit1 | 1 1.Clap your hands. | 健康习惯 |',
    },
    {
      page: 5,
      text: '| Unit1 | 2 | Big steps. |\n| Unit1 | 3 | Small steps. |',
    },
    {
      page: 6,
      text: '| | | 续上页 Small steps. |\n| Unit2 | 1 | Touch your toes. |',
    },
    {
      page: 10,
      text: '| Unit10 | 1 | Other lessons |\n| Drama | 1 | 复习 Unit1 故事 |',
    },
  ],
};

describe('course scope selection', () => {
  it('indexes cloud HTML tables alongside Markdown, including merged cells and entities', () => {
    const course = {
      ...document,
      sourcePages: [
        {
          page: 8,
          text: '# 课程目标\n|课时|课程|目标及内容|\n|12|复习|复习已学字母|',
        },
        {
          page: 9,
          text: '<table><tr><td>13</td><td>拼读</td><td>1.辨认 n &amp; l。<br>2.练习拼读。</td></tr><tr><td>14</td><td colspan="2">阶段测评</td></tr></table>',
        },
      ],
    };
    expect(
      detectCourseUnits(course.sourcePages.map((p) => p.text).join('\n')),
    ).toEqual(['第12课时 · 复习', '第13课时 · 拼读', '第14课时 · 阶段测评']);
    expect(
      selectCoursePages([course], '第13课时', 'week')[0].pages.map(
        (p) => p.page,
      ),
    ).toEqual([9]);
    const items = extractLearningContents([course], '第13课时', 'week');
    expect(items.map((item) => item.text)).toEqual([
      '辨认 n & l。',
      '练习拼读。',
    ]);
    expect(
      items.every((item) => item.sourceRefs.join() === 'course:course:p9'),
    ).toBe(true);
    expect(
      extractLearningContents([course], '第14课时', 'week').map(
        (item) => item.text,
      ),
    ).toEqual(['阶段测评']);
  });

  it('keeps HTML rowspan unit labels and a merged Unit/lesson cell aligned with goals', () => {
    const course = {
      ...document,
      sourcePages: [
        {
          page: 6,
          text: '<table><tr><th>单元</th><th>课时</th><th>教学内容</th><th>教学目标</th><th>策略</th><th>家庭活动</th></tr><tr><td rowspan="2">Unit2</td><td>3</td><td>内容甲</td><td>目标甲</td><td></td><td></td></tr><tr><td>4</td><td>内容乙</td><td>目标乙</td><td></td><td></td></tr></table>\n|Unit2 5|内容丙|目标丙|策略|活动|',
        },
      ],
    };
    expect(detectCourseUnits(course.sourcePages[0].text)).toEqual([
      'Unit2',
      'Unit2 第3课',
      'Unit2 第4课',
      'Unit2 第5课',
    ]);
    expect(
      extractLearningContents([course], 'Unit2 4', 'week').map(
        (item) => item.text,
      ),
    ).toEqual(['目标乙']);
    expect(
      extractLearningContents([course], 'Unit2 5', 'week').map(
        (item) => item.text,
      ),
    ).toEqual(['目标丙']);
    expect(selectCoursePages([course], 'Unit2 2', 'week')[0].pages).toEqual([]);
  });

  it('preserves volume boundaries and continued goals across cloud HTML and Markdown pages', () => {
    const course = {
      ...document,
      sourcePages: [
        {
          page: 3,
          text: '<table><tr><td colspan="3">阅读教材1册</td></tr><tr><td>课时</td><td>课程</td><td>目标及内容</td></tr><tr><td>11</td><td>第一册课题</td><td>学习第一册</td></tr></table>',
        },
        {
          page: 11,
          text: '<table><tr><td colspan="3">阅读教材2册</td></tr><tr><td>11</td><td>第二册课题</td><td>1.认识新字。</td></tr></table>',
        },
        { page: 13, text: '| | | 2.汉字迁移。 |' },
      ],
    };
    expect(
      selectCoursePages([course], '第2册 第11课时', 'week')[0].pages.map(
        (p) => p.page,
      ),
    ).toEqual([11, 13]);
    const contents = extractLearningContents(
      [course],
      '第2册 第11课时',
      'week',
    );
    expect(contents.map((item) => item.text)).toEqual([
      '认识新字。',
      '2.汉字迁移。',
    ]);
    expect(
      contents.every(
        (item) =>
          item.sourceRefs.join() === 'course:course:p11,course:course:p13',
      ),
    ).toBe(true);
  });

  it('does not guess lessons from cloud rows with displaced unit labels', () => {
    const course = {
      ...document,
      sourcePages: [
        {
          page: 6,
          text: '|Unit1 6|复习内容|复习目标|策略|活动|\n|内容甲|目标甲|策略|活动|Unit2 1|内容乙 Unit2 2|',
        },
      ],
    };
    expect(selectCoursePages([course], 'Unit2 1-2', 'week')[0].pages).toEqual(
      [],
    );
    expect(
      extractLearningContents([course], 'Unit1 6', 'week').map(
        (item) => item.text,
      ),
    ).toEqual(['复习目标']);
    // A teacher can inspect the original page instead of trusting guessed rows.
    expect(
      selectCoursePages([course], '第6页', 'week')[0].pages.map((p) => p.page),
    ).toEqual([6]);
  });

  it.each([
    'Unit1 1',
    'Unit 1 Lesson 1',
    '第 1 单元第 1 课',
    '第一单元 第一课',
    'Ｕｎｉｔ１ １',
  ])('selects only the actual lesson page for %s', (scope) => {
    const [selected] = selectCoursePages([document], scope, 'week');
    expect(selected.pages.map((page) => page.page)).toEqual([4]);
    expect(selected.units).toEqual(['Unit1', 'Unit1 第1课']);
  });

  it('keeps a lesson continuation on the following PDF page', () => {
    expect(
      selectCoursePages([document], 'Unit1 3', 'month')[0].pages.map(
        (page) => page.page,
      ),
    ).toEqual([5, 6]);
  });

  it('selects lesson ranges and multiple units explicitly', () => {
    expect(
      selectCoursePages([document], 'Unit1 1-2、Unit2 1', 'month')[0].pages.map(
        (page) => page.page,
      ),
    ).toEqual([4, 5, 6]);
  });

  it('matches the whole unit without selecting Unit10 or Drama revision pages', () => {
    expect(
      selectCoursePages([document], 'Unit1', 'month')[0].pages.map(
        (page) => page.page,
      ),
    ).toEqual([4, 5, 6]);
  });

  it('accepts two-character Chinese topics', () => {
    expect(
      selectCoursePages([document], '健康', 'week')[0].pages.map(
        (page) => page.page,
      ),
    ).toEqual([4]);
  });

  it('does not fall back to the entire PDF for an unmatched lesson or topic', () => {
    for (const scope of ['Unit1 99', '未知主题', 'Unit11']) {
      expect(selectCoursePages([document], scope, 'week')[0].pages).toEqual([]);
    }
  });

  it('includes every page for a term report', () => {
    expect(selectCoursePages([document], '', 'term')[0].pages).toEqual(
      document.sourcePages,
    );
  });

  it('detects course units and lessons stored in Markdown table cells', () => {
    expect(detectCourseUnits(document.sourcePages[0].text)).toEqual([
      'Unit1',
      'Unit1 第1课',
    ]);
  });

  it('recognizes traditional headings and lesson numbers in prose', () => {
    const course = {
      ...document,
      sourcePages: [
        { page: 1, text: '# Unit 1 Body\n## Lesson 1\nClap your hands.' },
        { page: 2, text: '## Lesson 2\nTouch your toes.' },
      ],
    };
    expect(
      selectCoursePages([course], 'Unit1 2', 'week')[0].pages.map(
        (page) => page.page,
      ),
    ).toEqual([2]);
    expect(
      selectCoursePages([course], 'Unit1 1', 'week')[0].pages.map(
        (page) => page.page,
      ),
    ).toEqual([1]);
  });
});

describe('learning content extraction', () => {
  const course = {
    ...document,
    sourcePages: [
      {
        page: 4,
        text: "| 单元 | 课时 | 教学内容 | 教学目标 | 策略 | 家庭活动 |\n| Unit1 | 1 1.Let's listen：Clap your hands. 2.Let's talk：hand, foot | 1.听懂会说 Clap your hands. 2.会说单词 hand, foot | 演示动作 | 家庭练习 |\n| Unit1 | 2 | Learn a story | 1.理解故事 Twins 2.模仿跟读故事 | 情景教学 | 家庭活动 |",
      },
      {
        page: 5,
        text: '| | | 第二课故事续页 | | | |\n| Unit2 | 1 | Other lesson | Other goal | Other strategies | Home |',
      },
    ],
  };

  it('lists individual goals from a merged lesson cell without leaking other lessons on the same page', () => {
    const items = extractLearningContents([course], 'Unit1 1', 'week');
    expect(items.map((item) => item.text)).toEqual([
      '听懂会说 Clap your hands.',
      '会说单词 hand, foot',
    ]);
    expect(items.every((item) => item.section === 'Unit1 第1课')).toBe(true);
    expect(items[0]?.sourceRefs).toEqual(['course:course:p4']);
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
  });
  it('keeps continued content and all contributing PDF page references', () => {
    const items = extractLearningContents([course], 'Unit1 2', 'month');
    expect(items.some((item) => item.text.includes('第二课故事续页'))).toBe(
      true,
    );
    expect(
      items.every(
        (item) =>
          item.sourceRefs.join(',') === 'course:course:p4,course:course:p5',
      ),
    ).toBe(true);
    expect(items.every((item) => !item.text.includes('Other'))).toBe(true);
  });
  it('includes all lessons in a selected unit and supports selecting multiple lessons', () => {
    const items = extractLearningContents([course], 'Unit1', 'week');
    expect([...new Set(items.map((item) => item.section))]).toEqual([
      'Unit1 第1课',
      'Unit1 第2课',
    ]);
    expect(
      extractLearningContents([course], 'Unit1 1、Unit2 1', 'week').some(
        (item) => item.section === 'Unit2 第1课',
      ),
    ).toBe(true);
  });
  it('returns no content for an unmatched lesson and retains whole-term content', () => {
    expect(extractLearningContents([course], 'Unit1 99', 'week')).toEqual([]);
    expect(
      extractLearningContents([course], '', 'term').some(
        (item) => item.section === 'Unit2 第1课',
      ),
    ).toBe(true);
  });
  it('supports plain headings and Chinese unit and lesson headings', () => {
    const plain = {
      ...document,
      sourcePages: [
        {
          page: 1,
          text: '# 第一单元\n## 第一课\n听懂词汇：run / walk\n## 第二课\n会说短句：I can run.',
        },
      ],
    };
    expect(
      extractLearningContents([plain], 'Unit1 1', 'week').map(
        (item) => item.text,
      ),
    ).toEqual(['听懂词汇：run / walk']);
  });
  it('makes heading-free PDF content reviewable and preserves long text in bounded chunks', () => {
    const plain = {
      ...document,
      sourcePages: [{ page: 1, text: '健康主题\n' + '课程活动'.repeat(600) }],
    };
    const items = extractLearningContents([plain], '健康', 'month');
    expect(items.every((item) => item.text.length <= 1200)).toBe(true);
    expect(items.map((item) => item.text).join('')).toBe(
      plain.sourcePages[0]!.text,
    );
  });
});

describe('numbered Chinese courseware without Unit headings', () => {
  const chineseCourse = {
    id: 'reading',
    fileName: '阅读课程.pdf',
    confirmedUnits: [],
    sourcePages: [
      {
        page: 3,
        text: "| 课时 | 课程 | 目标及内容 | 重难点 |\n| --- | --- | --- | --- |\n| 01 | 《日月一起更'明'亮》 | 1.学会指读儿歌。 2.认读日月相关汉字。 | 掌握新字 |\n| 02 | 《数字类》 | 1.认读数字类汉字。 | 数字理解 |",
      },
      {
        page: 4,
        text: '| | | 第二课后续练习 | |\n| 03 | 《水果类》 | 1.认识水果汉字。 | 看图识字 |',
      },
    ],
  };

  it('lists the real lesson titles from Docling numbered table rows', () => {
    const labels = detectCourseUnits(
      chineseCourse.sourcePages.map((page) => page.text).join('\n'),
    );
    expect(labels).toEqual([
      "第1课时 · 《日月一起更'明'亮》",
      '第2课时 · 《数字类》',
      '第3课时 · 《水果类》',
    ]);
  });

  it('recognizes short final lesson rows without a goals cell and ignores assessment prose', () => {
    const finalLessons = {
      ...chineseCourse,
      sourcePages: [
        {
          page: 21,
          text: '第 37 周进行阶段重点内容评估；\n| 课时 | 课程 | 目标及内容 |\n| --- | --- | --- |\n| 79 | 拼音复习 | 回顾声母。 |\n| 80 | 大复习 |\n| 81 | 阶段测评四 |',
        },
      ],
    };
    expect(detectCourseUnits(finalLessons.sourcePages[0].text)).toEqual([
      '第79课时 · 拼音复习',
      '第80课时 · 大复习',
      '第81课时 · 阶段测评四',
    ]);
    expect(
      extractLearningContents([finalLessons], '第81课时', 'week').map(
        (item) => item.text,
      ),
    ).toEqual(['阶段测评四']);
  });

  it('keeps table lessons when a parser returns only one misleading heading', () => {
    const text =
      '【PDF第21页】\n第 37 周进行阶段重点内容评估；\n| 课时 | 课程 | 目标及内容 |\n| 80 | 大复习 |\n| 81 | 阶段测评四 |';
    expect(
      chooseCourseUnitCandidates(text, ['第 37 周进行阶段重点内容评估；']),
    ).toEqual(['第80课时 · 大复习', '第81课时 · 阶段测评四']);
    expect(
      chooseCourseUnitCandidates('【PDF第1页】\n观察线条', ['线条练习']),
    ).toEqual(['线条练习']);
  });

  it('selects only the chosen numbered lesson and its continuation', () => {
    expect(
      selectCoursePages(
        [chineseCourse],
        '第2课时 · 《数字类》',
        'week',
      )[0].pages.map((page) => page.page),
    ).toEqual([3, 4]);
    const contents = extractLearningContents(
      [chineseCourse],
      '第2课时 · 《数字类》',
      'week',
    );
    expect(contents.map((item) => item.text)).toEqual([
      '认读数字类汉字。',
      '第二课后续练习',
    ]);
    expect(
      contents.every((item) => item.section === '第2课时 · 《数字类》'),
    ).toBe(true);
    expect(contents.every((item) => !item.text.includes('日月'))).toBe(true);
  });

  it('supports selecting multiple lesson numbers but not an unmatched lesson', () => {
    expect(
      selectCoursePages(
        [chineseCourse],
        '第1课时、第3课时',
        'month',
      )[0].pages.map((page) => page.page),
    ).toEqual([3, 4]);
    expect(
      selectCoursePages([chineseCourse], '第99课时', 'week')[0].pages,
    ).toEqual([]);
  });

  it('keeps repeated lesson numbers in different textbook volumes separate', () => {
    const twoVolumes = {
      ...chineseCourse,
      sourcePages: [
        {
          page: 3,
          text: '| 阅读星球 1 册 - 课时 | 阅读星球 1 册 - 课程 | 目标及内容 |\n| 01 | 《日月》 | 1.认识日和月。 |',
        },
        {
          page: 11,
          text: '| 阅读星球 2 册 | 阅读星球 2 册 | 阅读星球 2 册 |\n| 01 | 《高字》 | 1.认识高字。 |',
        },
      ],
    };
    expect(
      detectCourseUnits(
        twoVolumes.sourcePages.map((page) => page.text).join('\n'),
      ),
    ).toEqual(['第1册 第1课时 · 《日月》', '第2册 第1课时 · 《高字》']);
    expect(
      selectCoursePages(
        [twoVolumes],
        '第1册 第1课时 · 《日月》',
        'week',
      )[0].pages.map((page) => page.page),
    ).toEqual([3]);
    expect(
      extractLearningContents(
        [twoVolumes],
        '第2册 第1课时 · 《高字》',
        'week',
      ).map((item) => item.text),
    ).toEqual(['认识高字。']);
  });

  it('recognizes a Docling row whose first cell merges the number and title', () => {
    const merged = {
      ...chineseCourse,
      sourcePages: [
        { page: 13, text: '| 课时 | 课程 | 目标及内容 |' },
        {
          page: 14,
          text: '| 15 复习课 | 1 复习上节词语。 2 跟读课文。 | 掌握字词 |\n| 16 《吃了药病就好》 | 1 学会指读儿歌。 | 掌握新字 |',
        },
      ],
    };
    expect(
      detectCourseUnits(merged.sourcePages.map((page) => page.text).join('\n')),
    ).toEqual(['第15课时 · 复习课', '第16课时 · 《吃了药病就好》']);
    expect(
      extractLearningContents([merged], '第16课时', 'week').map(
        (item) => item.text,
      ),
    ).toEqual(['学会指读儿歌。']);
  });

  it('uses a later title cell when Docling puts review goals in the title column', () => {
    const shifted = {
      ...chineseCourse,
      sourcePages: [
        { page: 12, text: '| 课时 | 课程 | 目标及内容 | 备注 |' },
        {
          page: 13,
          text: '| 10 | 1 复习儿歌。 2 复习生字。 | | 复习课 指读两首儿歌 |',
        },
      ],
    };
    expect(
      detectCourseUnits(
        shifted.sourcePages.map((page) => page.text).join('\n'),
      ),
    ).toEqual(['第10课时 · 复习课']);
    expect(
      extractLearningContents([shifted], '第10课时', 'week').map(
        (item) => item.text,
      ),
    ).toEqual(['复习儿歌。', '复习生字。']);
  });

  it('recognizes a shifted lesson title after a separate teaching-strategy cell', () => {
    const shifted = {
      ...chineseCourse,
      sourcePages: [
        {
          page: 13,
          text: '| 课时 | 课程 | 重难点 | 教材任务 |\n| 11 | 1 能够正确指读儿歌。 2 认读汉字。 | 重点是读音。 | 《等一等》 任务 1：指读儿歌 |',
        },
      ],
    };
    expect(detectCourseUnits(shifted.sourcePages[0].text)).toEqual([
      '第11课时 · 《等一等》',
    ]);
    expect(
      extractLearningContents([shifted], '第11课时', 'week').map(
        (item) => item.text,
      ),
    ).toEqual(['能够正确指读儿歌。', '认读汉字。']);
  });
});

describe('different PDF layouts', () => {
  it('accepts equivalent lesson headers, spacing, and full-width table separators', () => {
    const variation = {
      id: 'handwriting-variation',
      fileName: '硬笔书法新大纲.pdf',
      confirmedUnits: [],
      sourcePages: [
        {
          page: 2,
          text: '｜ 周 / 课次 ｜ 教学主题 ｜ 学习目标 ｜\n｜ 01 ｜ 第 1 课《横线》 ｜ 掌握横线。 ｜\n｜ 02 ｜ 复习课 ｜ 回顾横竖线。 ｜',
        },
      ],
    };
    expect(detectCourseUnits(variation.sourcePages[0].text)).toEqual([
      '第1课时 · 《横线》',
      '第2课时 · 复习课',
    ]);
    expect(
      extractLearningContents([variation], '第2课时', 'week').map(
        (item) => item.text,
      ),
    ).toEqual(['回顾横竖线。']);
  });

  it('finds the lesson and title columns when a week column is inserted', () => {
    const variation = {
      id: 'pinyin-variation',
      fileName: '拼音新大纲.pdf',
      confirmedUnits: [],
      sourcePages: [
        {
          page: 6,
          text: '| 周次 | 课时编号 | 课题名称 | 教学目标 |\n| 第1周 | 01 | 声母入门 | 认识声母。 |\n| 第2周 | 02 | 阶段测评 | 检查认读。 |',
        },
      ],
    };
    expect(detectCourseUnits(variation.sourcePages[0].text)).toEqual([
      '第1课时 · 声母入门',
      '第2课时 · 阶段测评',
    ]);
    expect(
      selectCoursePages([variation], '第2课时', 'week')[0].pages.map(
        (page) => page.page,
      ),
    ).toEqual([6]);
    expect(
      extractLearningContents([variation], '第2课时', 'week').map(
        (item) => item.text,
      ),
    ).toEqual(['检查认读。']);
  });

  it('recognizes an explicitly numbered title even when the PDF omits its table header', () => {
    const variation = {
      id: 'headerless-lesson',
      fileName: '线条补充.pdf',
      confirmedUnits: [],
      sourcePages: [{ page: 3, text: '| 03 | 第3课《弧线》 | 练习弧线。 |' }],
    };
    expect(detectCourseUnits(variation.sourcePages[0].text)).toEqual([
      '第3课时 · 《弧线》',
    ]);
    expect(
      extractLearningContents([variation], '第3课时', 'week').map(
        (item) => item.text,
      ),
    ).toEqual(['练习弧线。']);
  });

  it('does not treat an unrelated numbered file list as course lessons', () => {
    const unrelated =
      '| 序号 | 文件名称 | 说明 |\n| 01 | 教案.pdf | 下载 |\n| 02 | 活动照片.jpg | 查看 |';
    expect(detectCourseUnits(`【PDF第1页】\n${unrelated}`)).toEqual(['第1页']);
  });

  it('stops a course table before a later unrelated numbered list', () => {
    const text =
      '| 课时 | 课程 | 教学目标 |\n| 01 | 声母入门 | 认识声母。 |\n| 序号 | 文件名称 | 说明 |\n| 02 | 教案.pdf | 下载 |';
    expect(detectCourseUnits(text)).toEqual(['第1课时 · 声母入门']);
  });

  it('recognizes an ordinal lesson header only when it has course evidence', () => {
    const course =
      '| 序号 | 课程名称 | 学习目标 |\n| 01 | 横线 | 练习横向控笔。 |';
    expect(detectCourseUnits(course)).toEqual(['第1课时 · 横线']);
    expect(
      detectCourseUnits(
        '| 序号 | 文件名称 | 说明 |\n| 01 | 课程简介.pdf | 下载 |',
      ),
    ).toEqual([]);
  });

  it('uses a title shifted beyond the fourth cell while keeping goals from its own row', () => {
    const variation = {
      id: 'reading-variation',
      fileName: '阅读新大纲.pdf',
      confirmedUnits: [],
      sourcePages: [
        {
          page: 8,
          text: '| 课时 | 课程 | 重难点 | 教学策略 | 学习任务 |\n| 11 | 1 能够指读儿歌。 2 认识新字。 | 发音 | 跟读 | 《等一等》 任务一：指读 |',
        },
      ],
    };
    expect(detectCourseUnits(variation.sourcePages[0].text)).toEqual([
      '第11课时 · 《等一等》',
    ]);
    expect(
      extractLearningContents([variation], '第11课时', 'week').map(
        (item) => item.text,
      ),
    ).toEqual(['能够指读儿歌。', '认识新字。']);
  });

  it('lists handwriting lessons and review sessions from a 周/课次 table', () => {
    const handwriting = {
      id: 'handwriting',
      fileName: '硬笔书法.pdf',
      confirmedUnits: [],
      sourcePages: [
        {
          page: 1,
          text: '| 周/课次 | 单元名称 | 目标 | 内容 |\n| 01 | 第1课 《横线》 | 1.正确的执笔 2.练习横线 | 控笔练习 |\n| 02 | 第 2 课 《竖线》 | 练习竖线 | 竖向控笔 |',
        },
        { page: 2, text: '| 09 | 复习课一 | 巩固复习线条 | 综合运用 |' },
        { page: 4, text: '| 18 | 复习课二 | 巩固复习线条 | 综合运用 |' },
      ],
    };
    expect(
      detectCourseUnits(
        handwriting.sourcePages.map((page) => page.text).join('\n'),
      ),
    ).toEqual([
      '第1课时 · 《横线》',
      '第2课时 · 《竖线》',
      '第9课时 · 复习课一',
      '第18课时 · 复习课二',
    ]);
    expect(
      selectCoursePages([handwriting], '第9课时', 'week')[0].pages.map(
        (page) => page.page,
      ),
    ).toEqual([2]);
    expect(
      extractLearningContents([handwriting], '第9课时', 'week').map(
        (item) => item.text,
      ),
    ).toEqual(['巩固复习线条']);
  });

  it('indexes ordinary Markdown headings and keeps content under each heading', () => {
    const course = {
      id: 'science',
      fileName: 'science.pdf',
      confirmedUnits: [],
      sourcePages: [
        { page: 1, text: '# 植物生长\n观察种子发芽。' },
        { page: 2, text: '记录根与叶的变化。' },
        { page: 3, text: '# 天气变化\n认识晴雨天气。' },
      ],
    };
    expect(
      detectCourseUnits(course.sourcePages.map((p) => p.text).join('\n')),
    ).toEqual(['植物生长', '天气变化']);
    expect(
      selectCoursePages([course], '植物生长', 'week')[0].pages.map(
        (p) => p.page,
      ),
    ).toEqual([1, 2]);
    expect(
      extractLearningContents([course], '植物生长', 'week')
        .map((x) => x.text)
        .join('\n'),
    ).toContain('记录根与叶的变化');
  });

  it('offers page choices for OCR text with no recognizable headings', () => {
    const course = {
      id: 'art',
      fileName: 'art.pdf',
      confirmedUnits: [],
      sourcePages: [
        { page: 1, text: '观察红色与黄色。' },
        { page: 2, text: '用颜料画出天空。' },
      ],
    };
    expect(
      detectCourseUnits(
        '【PDF第1页】\n观察红色与黄色。\n【PDF第2页】\n用颜料画出天空。',
      ),
    ).toEqual(['第1页', '第2页']);
    expect(
      selectCoursePages([course], '第2页', 'week')[0].pages.map((p) => p.page),
    ).toEqual([2]);
    expect(
      extractLearningContents([course], '第2页', 'week').map((x) => x.text),
    ).toEqual(['用颜料画出天空。']);
    expect(
      selectCoursePages([course], '第1-2页', 'month')[0].pages.map(
        (p) => p.page,
      ),
    ).toEqual([1, 2]);
    expect(selectCoursePages([course], '第3页', 'week')[0].pages).toEqual([]);
  });

  it('allows explicit page selection even when the PDF has structured units', () => {
    expect(
      selectCoursePages([document], '第5页', 'week')[0].pages.map(
        (p) => p.page,
      ),
    ).toEqual([5]);
    expect(
      extractLearningContents([document], '第5页', 'week')
        .map((x) => x.text)
        .join('\n'),
    ).toContain('Big steps');
  });

  it('does not turn a later timetable heading into a course lesson', () => {
    const mixed = {
      ...document,
      sourcePages: [
        {
          page: 1,
          text: '| 课时 | 课程 | 目标及内容 |\n| 01 | 《动物》 | 认识动物 |',
        },
        {
          page: 2,
          text: '四、课时安排\n| 40 周班-学期课时安排 | 课时数量 | 安排说明 |',
        },
      ],
    };
    expect(
      detectCourseUnits(mixed.sourcePages.map((p) => p.text).join('\n')),
    ).toEqual(['第1课时 · 《动物》']);
  });
});
