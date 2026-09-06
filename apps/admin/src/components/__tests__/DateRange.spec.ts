import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import DateRange from '../DateRange.vue'
describe('report date controls', () => {
  it('emits a seven-day inclusive range for the quick filter', async () => {
    const wrapper = mount(DateRange)
    await wrapper.findAll('button')[0]!.trigger('click')
    const value = wrapper.emitted('change')![0]![0] as { start: string; end: string }
    expect((Date.parse(value.end) - Date.parse(value.start)) / 86400000).toBe(6)
  })
  it('does not submit reversed custom dates', async () => {
    const wrapper = mount(DateRange)
    await wrapper.findAll('input')[0]!.setValue('2025-02-02')
    await wrapper.findAll('input')[1]!.setValue('2025-02-01')
    await wrapper.find('form').trigger('submit')
    expect(wrapper.emitted('change')).toBeUndefined()
    expect(wrapper.find('[role="alert"]').exists()).toBe(true)
  })
})
