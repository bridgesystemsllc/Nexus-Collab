import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { DepartmentOverviewTab } from './DepartmentOverviewTab'

const inventory = Array.from({ length: 4 }, (_, index) => ({
  id: `inventory-${index}`,
  moduleId: 'warehouse-module',
  data: { name: `Product ${index}`, status: 'healthy', brand: 'Brand' },
}))

vi.mock('@/hooks/useData', () => ({
  useDepartmentOverview: () => ({
    data: {
      pendingTasks: [], assignedTasks: [], openProjects: [],
      openModuleItems: { inventory },
    },
    isLoading: false, isError: false,
  }),
}))

vi.mock('@/components/shared/AddToCowork', () => ({
  AddToCowork: () => <button type="button">Add to cowork</button>,
}))

describe('Overview inventory interactions', () => {
  it('passes the selected record to the inventory detail opener', () => {
    const onSelect = vi.fn()
    render(<DepartmentOverviewTab departmentId="ops" onSelectInventoryItem={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: 'View inventory details for Product 0' }))
    expect(onSelect).toHaveBeenCalledWith(inventory[0])
  })

  it('keeps the cowork action separate from opening details', () => {
    const onSelect = vi.fn()
    render(<DepartmentOverviewTab departmentId="ops" onSelectInventoryItem={onSelect} />)
    fireEvent.click(screen.getAllByRole('button', { name: 'Add to cowork' })[0])
    expect(onSelect).not.toHaveBeenCalled()
  })

  it('opens the inventory tab to see remaining items', () => {
    const onNavigate = vi.fn()
    render(<DepartmentOverviewTab departmentId="ops" onNavigateToTab={onNavigate} />)
    fireEvent.click(screen.getByRole('button', { name: '+1 more' }))
    expect(onNavigate).toHaveBeenCalledWith('inventory')
  })
})