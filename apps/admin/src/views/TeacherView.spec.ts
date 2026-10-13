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

describe('subaccount detail and usage', () => {
  it('shows parent relationship, locked state and individual usage habits', async () => {
    vi.mocked(api).mockImplementation(async (path) =>
      path.startsWith('teachers/')
        ? ({
            id: 'child',
            name: '子账号老师',
            username: 'child-login',
            accountType: 'sub',
            parentAccountId: 'owner',
            ownerAccountId: 'owner',
            status: 'locked',
            logins: { series: [] },
            features: { items: [] },
            usage: {
              totals: { logins: 3, activeDays: 2, uses: 5 },
              features: [{ name: '学期报告', reportVersion: 'v2', uses: 4, opens: 2 }],
              hours: [{ hour: 9, uses: 4 }],
              days: [],
            },
          } as never)
        : ({ items: [], total: 0 } as never),
    )
    const wrapper = shallowMount(TeacherView, {
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('子账号')
    expect(wrapper.text()).toContain('已锁定')
    expect(wrapper.text()).toContain('所属主账号')
    expect(wrapper.text()).toContain('主动登录 3 次')
    expect(wrapper.text()).toContain('9时：4次')
    expect(wrapper.text()).toContain('v2')
    wrapper.unmount()
  })
  it('shows retained subaccount history for main accounts and hides reset for deleted accounts', async () => {
    vi.mocked(api).mockImplementation(async (path) =>
      path.startsWith('teachers/')
        ? ({
            id: 'owner',
            name: '主账号',
            accountType: 'main',
            status: 'deleted',
            subaccounts: [{ id: 'child', name: '历史子账号', username: 'old', status: 'deleted' }],
            logins: { series: [] },
            features: { items: [] },
          } as never)
        : ({ items: [], total: 0 } as never),
    )
    const wrapper = shallowMount(TeacherView, {
      global: { stubs: { RouterLink: { template: '<a><slot /></a>' } } },
    })
    await flushPromises()
    expect(wrapper.text()).toContain('历史子账号')
    expect(wrapper.text()).toContain('已删除')
    expect(wrapper.findAll('button').some((button) => button.text() === '重置密码')).toBe(false)
    wrapper.unmount()
  })
})
