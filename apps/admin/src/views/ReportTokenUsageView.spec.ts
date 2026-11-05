import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ReportTokenUsageView from './ReportTokenUsageView.vue'
import { api } from '../lib/api'

vi.mock('../lib/api', async (original) => ({
  ...(await original<typeof import('../lib/api')>()),
  api: vi.fn(),
}))

const mockReportData = {
  total: 2,
  page: 1,
  pageSize: 20,
  range: { start: '2026-10-06', end: '2026-11-04' },
  summary: {
    totalReports: 2,
    totalCalls: 3,
    promptTokens: 450,
    completionTokens: 200,
    totalTokens: 650,
    unknownCalls: 1,
  },
  items: [
    {
      reportId: 'rep-1',
      teacherId: 'teacher-101',
      teacherName: '王老师',
      teacherUsername: 'wanglaoshi',
      studentId: 'teacher-101:class-201:2026020',
      studentNo: '2026020',
      studentName: '张三',
      className: '三年级一班',
      reportKind: 'week',
      periodType: 'week',
      periodStart: '2026-11-02T00:00:00.000Z',
      periodEnd: '2026-11-08T23:59:59.000Z',
      latestCalledAt: '2026-11-04T08:00:00.000Z',
      callsCount: 2,
      promptTokens: 450,
      completionTokens: 200,
      totalTokens: 650,
      unknownCallsCount: 1,
      trackingStatus: 'tracked' as const,
    },
    {
      reportId: 'rep-2',
      teacherId: 'teacher-102',
      teacherName: '李老师',
      teacherUsername: 'lilaoshi',
      studentId: 'stu-2',
      studentNo: 'stu-2',
      studentName: '李四',
      className: '三年级二班',
      reportKind: 'stage',
      periodType: 'month',
      periodStart: '2026-10-01T00:00:00.000Z',
      periodEnd: '2026-10-31T23:59:59.000Z',
      latestCalledAt: null,
      callsCount: 0,
      promptTokens: null,
      completionTokens: null,
      totalTokens: null,
      unknownCallsCount: 0,
      trackingStatus: 'template_no_model' as const,
    },
  ],
}

const mockCallsData = {
  reportId: 'rep-1',
  studentName: '张三',
  total: 1,
  page: 1,
  pageSize: 10,
  range: { start: '2026-10-06', end: '2026-11-04' },
  items: [
    {
      id: 'call-1',
      calledAt: '2026-11-04T08:00:00.000Z',
      respondedAt: '2026-11-04T08:00:02.500Z',
      durationMs: 2500,
      provider: 'kimi',
      model: 'moonshot-v1-8k',
      status: 'responded' as const,
      promptTokens: 450,
      completionTokens: 200,
      totalTokens: 650,
      responseId: 'chatcmpl-test-abc',
    },
  ],
}

describe('ReportTokenUsageView', () => {
  beforeEach(() => {
    vi.mocked(api).mockReset()
    vi.mocked(api).mockImplementation(async (path) => {
      if (path === 'report-token-usage') return mockReportData as never
      if (path.includes('calls')) return mockCallsData as never
      return null as never
    })
  })

  it('renders heading, summary metrics and report rows properly', async () => {
    const wrapper = mount(ReportTokenUsageView)
    await flushPromises()

    expect(wrapper.text()).toContain('AI 报告 Token 追踪')
    expect(wrapper.text()).toContain('650') // totalTokens
    expect(wrapper.text()).toContain('张三')
    expect(wrapper.text()).toContain('李四')
    expect(wrapper.text()).toContain('已追踪')
    expect(wrapper.text()).toContain('未调用模型')

    wrapper.unmount()
  })

  it('expands report details to display call items on clicking expand button', async () => {
    const wrapper = mount(ReportTokenUsageView)
    await flushPromises()

    const expandBtn = wrapper.find('.expand-btn')
    expect(expandBtn.exists()).toBe(true)
    await expandBtn.trigger('click')
    await flushPromises()

    expect(api).toHaveBeenCalledWith('report-token-usage/rep-1/calls', expect.anything())
    expect(wrapper.text()).toContain('chatcmpl-test-abc')
    expect(wrapper.text()).toContain('2.5 s')
    expect(wrapper.text()).toContain('moonshot-v1-8k')
    expect(wrapper.text()).toContain('收到响应')

    // 再次点击收起
    await expandBtn.trigger('click')
    await flushPromises()
    expect(wrapper.text()).not.toContain('chatcmpl-test-abc')

    wrapper.unmount()
  })

  it('displays empty state when no report usage records match', async () => {
    vi.mocked(api).mockResolvedValueOnce({
      total: 0,
      page: 1,
      pageSize: 20,
      range: { start: '2026-10-06', end: '2026-11-04' },
      summary: {
        totalReports: 0,
        totalCalls: 0,
        promptTokens: 0,
        completionTokens: 0,
        totalTokens: 0,
        unknownCalls: 0,
      },
      items: [],
    } as never)

    const wrapper = mount(ReportTokenUsageView)
    await flushPromises()

    expect(wrapper.text()).toContain('暂无符合条件的报告 Token 追踪记录')
    wrapper.unmount()
  })

  it('displays error message and allows retry when API fails', async () => {
    vi.mocked(api).mockRejectedValueOnce(new Error('网络异常，获取数据失败'))

    const wrapper = mount(ReportTokenUsageView)
    await flushPromises()

    expect(wrapper.text()).toContain('网络异常，获取数据失败')
    const retryBtn = wrapper.find('button.text-button')
    expect(retryBtn.exists()).toBe(true)

    vi.mocked(api).mockResolvedValueOnce(mockReportData as never)
    await retryBtn.trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('张三')
    wrapper.unmount()
  })

  it('triggers search query with selected filters and presets', async () => {
    const wrapper = mount(ReportTokenUsageView)
    await flushPromises()

    const searchInput = wrapper.find("input[type='search']")
    await searchInput.setValue('张三')

    const form = wrapper.find('form.filter-bar')
    await form.trigger('submit')
    await flushPromises()

    expect(api).toHaveBeenCalledWith(
      'report-token-usage',
      expect.objectContaining({
        student: '张三',
      }),
    )

    wrapper.unmount()
  })

  it('formats teacher-***:class-*** composite IDs as human-readable names and student numbers', async () => {
    const wrapper = mount(ReportTokenUsageView)
    await flushPromises()

    // 列表中不显示原始的内部复合 ID，而是显示格式化后的教师、班级和学号
    expect(wrapper.text()).toContain('教师：王老师 · 班级：三年级一班 · 学号：2026020')
    expect(wrapper.text()).toContain('教师：李老师 · 班级：三年级二班 · 学号：stu-2')
    expect(wrapper.text()).not.toContain('teacher-101:class-201')

    wrapper.unmount()
  })
})
