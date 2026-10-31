import { shallowMount, flushPromises } from '@vue/test-utils'
import { it, expect, vi } from 'vitest'
import AnalyticsView from './AnalyticsView.vue'
import IpRestrictions from '../components/IpRestrictions.vue'
import { api } from '../lib/api'
vi.mock('vue-router', () => ({ useRoute: () => ({ path: '/logins' }) }))
vi.mock('../lib/api', async (original) => ({
  ...(await original<typeof import('../lib/api')>()),
  api: vi.fn(),
}))
it('shows login IP fields and allows blocking and unblocking', async () => {
  vi.mocked(api).mockImplementation(async (path) => {
    if (path === 'login-ip-blocks') return [{ ip: '192.0.2.1' }] as never
    if (path === 'analytics/login-records')
      return {
        items: [{ id: '1', username: 'teacher', loginIp: '192.0.2.1', ipLocation: '示例地区' }],
        total: 1,
      } as never
    return { series: [] } as never
  })
  const wrapper = shallowMount(AnalyticsView, { global: { stubs: { RouterLink: true } } })
  await flushPromises()
  expect(wrapper.findAll('th').map((x) => x.text())).toEqual([
    '教师',
    '账号',
    '登录 IP',
    'IP 所在地',
    '登录时间',
    '结果',
  ])
  expect(wrapper.text()).toContain('示例地区')
  const manager = shallowMount(IpRestrictions)
  await flushPromises()
  await manager.find('input').setValue('192.0.2.2')
  await manager.find('form').trigger('submit')
  await flushPromises()
  expect(api).toHaveBeenCalledWith('login-ip-blocks', {}, { ip: '192.0.2.2' })
  await manager.find('li button').trigger('click')
  await flushPromises()
  expect(api).toHaveBeenCalledWith('login-ip-blocks/remove', {}, { ip: '192.0.2.1' })
  manager.unmount()
  wrapper.unmount()
})
