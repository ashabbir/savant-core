import { render, screen, fireEvent } from '@testing-library/react';
import { expect, test } from 'vitest';
import FilterSection from './FilterSection';

test('renders FilterSection component with title', () => {
  render(<FilterSection title="Test Filter" />);
  expect(screen.getByText('Test Filter')).toBeInTheDocument();
});

test('toggles children visibility when header is clicked', () => {
  render(
    <FilterSection title="Toggle Section">
      <div>Test Content</div>
    </FilterSection>
  );

  const header = screen.getByText('Toggle Section');
  const toggleButton = screen.getByRole('button', { name: '+' });
  
  // Initially, content should not be in the document
  expect(screen.queryByText('Test Content')).not.toBeInTheDocument();
  expect(toggleButton).toBeInTheDocument(); // Plus button

  // Click to open
  fireEvent.click(header);
  expect(screen.getByText('Test Content')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: '−' })).toBeInTheDocument(); // Minus button

  // Click to close
  fireEvent.click(header);
  expect(screen.queryByText('Test Content')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: '+' })).toBeInTheDocument(); // Plus button
});
