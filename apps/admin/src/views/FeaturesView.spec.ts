import { flushPromises, shallowMount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import FeaturesView from './FeaturesView.vue'
import { api, type Ranking } from '../lib/api'

vi.mock('../lib/api', async (original) => ({
  ...(await original<typeof import('../lib/api')>()),
  api: vi.fn(),
}))
const reports = {
  key: 'semester-reports',
  name: '学期报告',
  teachers: 2,
  openTeachers: 3,
  uses: 5,
  usageRate: 0.5,
  change: '新增使用',
}
let ranking: Ranking
beforeEach(() => {
  ranking = {
    items: [reports],
    activeTeachers: 4,
    startedAt: '2026-09-01T00:00:00Z',
    updatedAt: '2026-10-09T02:00:00Z',
    timezone: 'Asia/Shanghai',
    hasCoverage: true,
  }
  vi.mocked(api).mockReset()
  vi.mocked(api).mockImplementation(
    async (path) =>
      (path.endsWith('/ranking')
        ? ranking
        : { series: [{ date: '2026-10-09', teachers: 2, uses: 5 }] }) as never,
  )
})
describe('semester reports in Admin feature analytics', () => {
  it('shows report metrics in the ranking and selects its daily trend', async () => {
    const wrapper = shallowMount(FeaturesView)
    await flushPromises()
    const row = wrapper.find('tbody tr')
    expect(row.findAll('td').map((cell) => cell.text())).toEqual([
      '学期报告',
      '3',
      '2',
      '5',
      '50.0%',
      '新增使用',
    ])
    const charts = wrapper.findAllComponents({ name: 'BaseChart' })
    expect(charts[0]!.props('option').yAxis.data).toContain('学期报告')
    await wrapper.findAll('select')[1]!.setValue('semester-reports')
    await flushPromises()
    expect(api).toHaveBeenCalledWith('analytics/features/semester-reports/trend', expect.anything())
    expect(charts[1]!.props('option').series[1].data).toEqual([5])
    expect(wrapper.text()).toContain('批量生成一次只计一次')
    wrapper.unmount()
  })
  it('keeps the report option visible when no report events have been collected', async () => {
    ranking.items = [
      { ...reports, teachers: 0, openTeachers: 0, uses: 0, usageRate: 0, change: '—' },
    ]
    ranking.activeTeachers = 0
    const wrapper = shallowMount(FeaturesView)
    await flushPromises()
    expect(
      wrapper
        .find('tbody tr')
        .findAll('td')
        .map((cell) => cell.text()),
    ).toEqual(['学期报告', '0', '0', '0', '0.0%', '—'])
    expect(wrapper.find('option[value="semester-reports"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('当前范围尚无有效功能使用记录')
    wrapper.unmount()
  })
  it('shows a permission failure, clears old metrics and allows retry', async () => {
    const wrapper = shallowMount(FeaturesView)
    await flushPromises()
    vi.mocked(api).mockRejectedValueOnce(new Error('没有管理员权限'))
    await wrapper.find('tbody button').trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').text()).toContain('没有管理员权限')
    expect(wrapper.find('tbody').exists()).toBe(false)
    await wrapper.find('[role="alert"] button').trigger('click')
    await flushPromises()
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
    expect(wrapper.find('tbody').text()).toContain('学期报告')
    wrapper.unmount()
  })
})
