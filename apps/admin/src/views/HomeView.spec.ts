import { flushPromises, shallowMount } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
import HomeView from './HomeView.vue'
import { api } from '../lib/api'
vi.mock('../lib/api', async (original) => ({
  ...(await original<typeof import('../lib/api')>()),
  api: vi.fn(),
}))
describe('account population labels', () => {
  it('distinguishes registered owners from created children and shared student counts', async () => {
    vi.mocked(api).mockResolvedValue({
      teachers: 1,
      subaccounts: 2,
      accounts: 3,
      students: 9,
      classrooms: 1,
      registrationsToday: 1,
      loginTeachersToday: 2,
      activeTeachersToday: 1,
    })
    const wrapper = shallowMount(HomeView, { global: { stubs: { RouterLink: true } } })
    await flushPromises()
    const metrics = wrapper.findAll('.metric')
    expect(metrics[0]!.text()).toContain('注册主账号1个')
    expect(metrics[1]!.text()).toContain('子账号（含历史）2个')
    expect(metrics[2]!.text()).toContain('账号总数（含历史）3个')
    expect(wrapper.text()).toContain('不重复计数')
    wrapper.unmount()
  })
})
