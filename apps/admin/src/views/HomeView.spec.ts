import { flushPromises, mount, RouterLinkStub } from '@vue/test-utils'
import { expect, it, vi } from 'vitest'
import BaseChart from '../components/BaseChart.vue'
import HomeView from './HomeView.vue'
import { api } from '../lib/api'

vi.mock('../lib/api', async (original) => ({
  ...(await original<typeof import('../lib/api')>()),
  api: vi.fn(),
}))

it('keeps the six overview metrics and analysis links available after retrying a failed load', async () => {
  const overview = vi.fn().mockRejectedValueOnce(new Error('请求失败')).mockResolvedValue({
    teachers: 12,
    students: 32,
    classrooms: 3,
    registrationsToday: 0,
    loginTeachersToday: 5,
    activeTeachersToday: 4,
  })
  vi.mocked(api).mockImplementation((path) =>
    path === 'dashboard/overview'
      ? overview()
      : (Promise.resolve({
          hasCoverage: true,
          series: [
            { date: '2026-11-18', teachers: 2, activeTeachers: 1 },
            { date: '2026-11-19', teachers: null, activeTeachers: null },
          ],
        }) as never),
  )
  const wrapper = mount(HomeView, {
    global: { stubs: { BaseChart: true, RouterLink: RouterLinkStub } },
  })
  await flushPromises()
  expect(wrapper.get('[role="alert"]').text()).toBe('请求失败')
  expect(wrapper.getComponent(BaseChart).props('option')).toMatchObject({
    series: [
      { data: [2, null], smooth: true, smoothMonotone: 'x', connectNulls: false },
      { data: [1, null] },
    ],
  })
  expect(wrapper.get('.metric strong').text()).toBe('—位')
  await wrapper.get('button').trigger('click')
  await flushPromises()
  expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  expect(wrapper.findAll('.metric').map((card) => card.text())).toEqual([
    '教师总数12位',
    '学生档案32份',
    '班级总数3个',
    '今日注册教师0位',
    '今日登录教师5位',
    '今日活跃教师4位',
  ])
  expect(wrapper.findAllComponents(RouterLinkStub).map((link) => link.props('to'))).toEqual([
    '/registrations',
    '/logins',
    '/features',
  ])
})

it('keeps overview metrics when the trend endpoint fails and retries only the trend', async () => {
  vi.mocked(api)
    .mockReset()
    .mockResolvedValueOnce({ teachers: 22 })
    .mockRejectedValueOnce(new Error('趋势读取失败'))
    .mockResolvedValueOnce({ hasCoverage: false, series: [] })
  const wrapper = mount(HomeView, {
    global: { stubs: { BaseChart: true, RouterLink: RouterLinkStub } },
  })
  await flushPromises()
  expect(wrapper.get('.metric strong').text()).toBe('22位')
  await wrapper.get('[role="alert"] button').trigger('click')
  await flushPromises()
  expect(wrapper.text()).toContain('该时段暂无采集数据')
  expect(vi.mocked(api).mock.calls.map(([path]) => path)).toEqual([
    'dashboard/overview',
    'analytics/logins',
    'analytics/logins',
  ])
})
