import { flushPromises, shallowMount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TeacherView from './TeacherView.vue'
import { api } from '../lib/api'

const mockPush = vi.fn()
vi.mock('vue-router', () => ({
  useRoute: () => ({ params: { id: 'teacher-1' } }),
  useRouter: () => ({ push: mockPush }),
}))
vi.mock('../lib/api', async (original) => ({
  ...(await original<typeof import('../lib/api')>()),
  api: vi.fn(),
}))
vi.mock('../lib/charts', () => ({ trendChart: vi.fn(), rankingChart: vi.fn() }))
beforeEach(() => {
  mockPush.mockReset()
  vi.mocked(api).mockReset()
  vi.mocked(api).mockImplementation(async (path) =>
    path.startsWith('teachers/')
      ? ({
          id: 'teacher-1',
          name: '测试教师',
          username: 'teacher',
          status: 'active',
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
  it('toggles password security explanation when clicking view password', async () => {
    const wrapper = shallowMount(TeacherView, { global: { stubs: { RouterLink: true } } })
    await flushPromises()
    const viewButton = wrapper.findAll('button').find((button) => button.text() === '查看密码')!
    expect(wrapper.find('.security-tip').exists()).toBe(false)
    await viewButton.trigger('click')
    expect(wrapper.find('.security-tip').exists()).toBe(true)
    expect(wrapper.text()).toContain('PBKDF2-SHA512')
    expect(viewButton.text()).toBe('收起密码说明')
    await viewButton.trigger('click')
    expect(wrapper.find('.security-tip').exists()).toBe(false)
    wrapper.unmount()
  })
  it('toggles input visibility in reset form', async () => {
    const wrapper = await openForm()
    const toggleButtons = wrapper.findAll('.toggle-eye')
    const inputs = wrapper.findAll('input')
    expect(inputs[0]!.attributes('type')).toBe('password')
    await toggleButtons[0]!.trigger('click')
    expect(inputs[0]!.attributes('type')).toBe('text')
    await toggleButtons[0]!.trigger('click')
    expect(inputs[0]!.attributes('type')).toBe('password')
    wrapper.unmount()
  })
})

describe('Teacher account lock and delete', () => {
  it('displays active status badge by default', async () => {
    const wrapper = shallowMount(TeacherView, { global: { stubs: { RouterLink: true } } })
    await flushPromises()
    expect(wrapper.find('.status-badge').text()).toBe('正常')
    expect(wrapper.find('.status-active').exists()).toBe(true)
    wrapper.unmount()
  })

  it('opens lock modal and toggles lock status to locked', async () => {
    const wrapper = shallowMount(TeacherView, { global: { stubs: { RouterLink: true } } })
    await flushPromises()

    const lockBtn = wrapper.findAll('button').find((b) => b.text() === '锁定账号')!
    expect(lockBtn.exists()).toBe(true)
    await lockBtn.trigger('click')

    expect(wrapper.find('.confirm-dialog').exists()).toBe(true)
    expect(wrapper.text()).toContain('锁定教师账号')

    vi.mocked(api).mockResolvedValueOnce({
      id: 'teacher-1',
      locked: true,
      status: 'locked',
    } as never)

    const confirmBtn = wrapper
      .find('.confirm-dialog')
      .findAll('button')
      .find((b) => b.text() === '确认锁定')!
    await confirmBtn.trigger('click')
    await flushPromises()

    expect(api).toHaveBeenLastCalledWith('teachers/teacher-1/toggle-lock', {}, { locked: true })
    expect(wrapper.find('.status-badge').text()).toBe('已锁定')
    expect(wrapper.find('.status-locked').exists()).toBe(true)
    expect(wrapper.find('.confirm-dialog').exists()).toBe(false)
    expect(wrapper.text()).toContain('教师账号已成功锁定')
    wrapper.unmount()
  })

  it('opens unlock modal and toggles lock status to active', async () => {
    vi.mocked(api).mockImplementation(async (path) =>
      path.startsWith('teachers/')
        ? ({
            id: 'teacher-1',
            name: '测试教师',
            username: 'teacher',
            status: 'locked',
            lockedAt: '2026-11-03T00:00:00.000Z',
            logins: { series: [] },
            features: { items: [] },
          } as never)
        : ({ items: [], total: 0 } as never),
    )

    const wrapper = shallowMount(TeacherView, { global: { stubs: { RouterLink: true } } })
    await flushPromises()

    expect(wrapper.find('.status-badge').text()).toBe('已锁定')
    const unlockBtn = wrapper.findAll('button').find((b) => b.text() === '解锁账号')!
    await unlockBtn.trigger('click')

    expect(wrapper.find('.confirm-dialog').exists()).toBe(true)
    expect(wrapper.text()).toContain('解除教师账号锁定')

    vi.mocked(api).mockResolvedValueOnce({
      id: 'teacher-1',
      locked: false,
      status: 'active',
    } as never)

    const confirmBtn = wrapper
      .find('.confirm-dialog')
      .findAll('button')
      .find((b) => b.text() === '确认解锁')!
    await confirmBtn.trigger('click')
    await flushPromises()

    expect(api).toHaveBeenLastCalledWith('teachers/teacher-1/toggle-lock', {}, { locked: false })
    expect(wrapper.find('.status-badge').text()).toBe('正常')
    wrapper.unmount()
  })

  it('opens delete modal and confirms deletion with router redirect', async () => {
    const wrapper = shallowMount(TeacherView, { global: { stubs: { RouterLink: true } } })
    await flushPromises()

    const deleteBtn = wrapper.findAll('button').find((b) => b.text() === '删除账号')!
    await deleteBtn.trigger('click')

    expect(wrapper.find('.confirm-dialog.danger').exists()).toBe(true)
    expect(wrapper.text()).toContain('删除教师账号')
    expect(wrapper.text()).toContain('此操作不可撤销')

    vi.mocked(api).mockResolvedValueOnce({ deleted: true } as never)

    const confirmDeleteBtn = wrapper
      .find('.confirm-dialog.danger')
      .findAll('button')
      .find((b) => b.text() === '确认彻底删除')!
    await confirmDeleteBtn.trigger('click')
    await flushPromises()

    expect(api).toHaveBeenLastCalledWith('teachers/teacher-1/delete', {}, {})
    expect(mockPush).toHaveBeenCalledWith('/teachers')
    expect(wrapper.find('.confirm-dialog').exists()).toBe(false)
    wrapper.unmount()
  })

  it('closes modal when cancel button is clicked', async () => {
    const wrapper = shallowMount(TeacherView, { global: { stubs: { RouterLink: true } } })
    await flushPromises()

    const deleteBtn = wrapper.findAll('button').find((b) => b.text() === '删除账号')!
    await deleteBtn.trigger('click')
    expect(wrapper.find('.confirm-dialog').exists()).toBe(true)

    const cancelBtn = wrapper
      .find('.confirm-dialog')
      .findAll('button')
      .find((b) => b.text() === '取消')!
    await cancelBtn.trigger('click')
    expect(wrapper.find('.confirm-dialog').exists()).toBe(false)
    wrapper.unmount()
  })
})

describe('Teacher AI report permission toggle', () => {
  it('displays unauthorized badge and allows granting permission', async () => {
    vi.mocked(api).mockImplementation(async (path) =>
      path.startsWith('teachers/')
        ? ({
            id: 'teacher-1',
            name: '测试教师',
            username: 'teacher',
            status: 'active',
            hasAiReportPermission: false,
            logins: { series: [] },
            features: { items: [] },
          } as never)
        : ({ items: [], total: 0 } as never),
    )

    const wrapper = shallowMount(TeacherView, { global: { stubs: { RouterLink: true } } })
    await flushPromises()

    const badges = wrapper.findAll('.status-badge')
    expect(badges.some((b) => b.text() === '未授权')).toBe(true)

    const grantBtn = wrapper.findAll('button').find((b) => b.text() === '开启授权')!
    expect(grantBtn.exists()).toBe(true)

    vi.mocked(api).mockResolvedValueOnce({
      id: 'teacher-1',
      hasAiReportPermission: true,
    } as never)

    await grantBtn.trigger('click')
    await flushPromises()

    expect(api).toHaveBeenLastCalledWith(
      'teachers/teacher-1/toggle-ai-permission',
      {},
      { enabled: true },
    )
    expect(wrapper.text()).toContain('已成功为该教师开启 AI 汇总报告使用权限')
    const updatedBadges = wrapper.findAll('.status-badge')
    expect(updatedBadges.some((b) => b.text() === '已授权')).toBe(true)
    wrapper.unmount()
  })

  it('displays authorized badge and allows revoking permission', async () => {
    vi.mocked(api).mockImplementation(async (path) =>
      path.startsWith('teachers/')
        ? ({
            id: 'teacher-1',
            name: '测试教师',
            username: 'teacher',
            status: 'active',
            hasAiReportPermission: true,
            logins: { series: [] },
            features: { items: [] },
          } as never)
        : ({ items: [], total: 0 } as never),
    )

    const wrapper = shallowMount(TeacherView, { global: { stubs: { RouterLink: true } } })
    await flushPromises()

    const badges = wrapper.findAll('.status-badge')
    expect(badges.some((b) => b.text() === '已授权')).toBe(true)

    const revokeBtn = wrapper.findAll('button').find((b) => b.text() === '撤销授权')!
    expect(revokeBtn.exists()).toBe(true)

    vi.mocked(api).mockResolvedValueOnce({
      id: 'teacher-1',
      hasAiReportPermission: false,
    } as never)

    await revokeBtn.trigger('click')
    await flushPromises()

    expect(api).toHaveBeenLastCalledWith(
      'teachers/teacher-1/toggle-ai-permission',
      {},
      { enabled: false },
    )
    expect(wrapper.text()).toContain('已成功撤销该教师的 AI 汇总报告使用权限')
    const updatedBadges = wrapper.findAll('.status-badge')
    expect(updatedBadges.some((b) => b.text() === '未授权')).toBe(true)
    wrapper.unmount()
  })
})
