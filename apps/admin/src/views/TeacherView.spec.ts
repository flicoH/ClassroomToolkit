import { flushPromises, shallowMount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TeacherView from './TeacherView.vue'
import { api } from '../lib/api'
vi.mock('vue-router', () => ({ useRoute: () => ({ params: { id: 'teacher-1' } }) }))
vi.mock('../lib/api', async (original) => ({
  ...(await original<typeof import('../lib/api')>()),
  api: vi.fn(),
}))
vi.mock('../lib/charts', () => ({ trendChart: vi.fn(), rankingChart: vi.fn() }))
beforeEach(() => {
  vi.mocked(api).mockReset()
  vi.mocked(api).mockImplementation(async (path) =>
    path.startsWith('teachers/')
      ? ({
          id: 'teacher-1',
          name: '测试教师',
          username: 'teacher',
          logins: { series: [] },
          features: { items: [] },
        } as never)
      : ({ items: [], total: 0 } as never),
  )
})
/** 通过教师详情中的真实入口打开表单，统计组件保持桩化。 */
async function openForm() {
  const wrapper = shallowMount(TeacherView, { global: { stubs: { RouterLink: true } } })
  await flushPromises()
  await wrapper
    .findAll('button')
    .find((button) => button.text() === '重置密码')!
    .trigger('click')
  return wrapper
}
describe('Teacher password reset', () => {
  it('prevents mismatched passwords from being submitted', async () => {
    const wrapper = await openForm()
    const inputs = wrapper.findAll('input')
    await inputs[0]!.setValue('password123')
    await inputs[1]!.setValue('different123')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.text()).toContain('两次输入的密码不一致')
    expect(api).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })
  it('submits the target teacher and clears the password form after success', async () => {
    const wrapper = await openForm()
    for (const input of wrapper.findAll('input')) await input.setValue('password123')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(api).toHaveBeenLastCalledWith(
      'teachers/teacher-1/reset-password',
      {},
      { password: 'password123' },
    )
    expect(wrapper.text()).toContain('密码已重置')
    expect(wrapper.find('form').exists()).toBe(false)
    wrapper.unmount()
  })
  it('shows API failure and allows retry', async () => {
    const wrapper = await openForm()
    vi.mocked(api).mockRejectedValueOnce(new Error('教师不存在'))
    for (const input of wrapper.findAll('input')) await input.setValue('password123')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('教师不存在')
    expect(wrapper.find('button.primary').attributes('disabled')).toBeUndefined()
    wrapper.unmount()
  })
})
