/**
 * @vitest-environment jsdom
 */
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DepartmentArtworkTab } from './DepartmentArtworkTab'

const mocks = vi.hoisted(() => ({
  useDepartments: vi.fn(),
  artworkTab: vi.fn(
    ({ departmentId, departmentName }: { departmentId: string; departmentName: string }) => (
      <div data-testid="canonical-artwork">
        {departmentId}:{departmentName}
      </div>
    ),
  ),
}))

vi.mock('@/hooks/useData', () => ({
  useDepartments: mocks.useDepartments,
}))

vi.mock('@/components/marketing/artwork', () => ({
  MarketingArtworkTab: mocks.artworkTab,
}))

describe('DepartmentArtworkTab', () => {
  const refetch = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the canonical Marketing artwork with its department ID', () => {
    mocks.useDepartments.mockReturnValue({
      data: [
        { id: 'rd-id', name: 'R&D' },
        { id: 'marketing-id', name: 'mArKeTiNg' },
      ],
      isLoading: false,
      isError: false,
      refetch,
    })

    render(<DepartmentArtworkTab />)

    expect(screen.getByTestId('canonical-artwork')).toHaveTextContent('marketing-id:mArKeTiNg')
  })

  it('renders a loading state while departments load', () => {
    mocks.useDepartments.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch,
    })

    render(<DepartmentArtworkTab />)

    expect(screen.getByText('Loading artwork…')).toBeInTheDocument()
    expect(screen.queryByTestId('canonical-artwork')).not.toBeInTheDocument()
  })

  it('renders an error state that retries department loading', () => {
    mocks.useDepartments.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    })

    render(<DepartmentArtworkTab />)
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))

    expect(screen.getByText('Could not find the Marketing artwork workspace.')).toBeInTheDocument()
    expect(refetch).toHaveBeenCalledOnce()
  })

  it('renders a missing state when Marketing is absent', () => {
    mocks.useDepartments.mockReturnValue({
      data: [{ id: 'ops-id', name: 'Operations' }],
      isLoading: false,
      isError: false,
      refetch,
    })

    render(<DepartmentArtworkTab />)

    expect(screen.getByText('Marketing department not found.')).toBeInTheDocument()
    expect(screen.queryByTestId('canonical-artwork')).not.toBeInTheDocument()
  })
})