import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import AppHeader from './AppHeader';

test('renders AppHeader with toggles', () => {
  render(
    <AppHeader
      leftCollapsed={true}
      setLeftCollapsed={() => {}}
      rightCollapsed={true}
      setRightCollapsed={() => {}}
      selectedProjectId="p1"
    />
  );

  expect(screen.getByText('Task Master')).toBeInTheDocument();
  expect(screen.getByLabelText('Toggle filters')).toBeInTheDocument();
  expect(screen.getByTitle('Show right panel')).toBeInTheDocument();
});
