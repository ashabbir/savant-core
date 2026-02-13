import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import AppFooter from './AppFooter';

test('renders AppFooter links', () => {
  render(<AppFooter />);
  expect(screen.getByText('Project X')).toBeInTheDocument();
  expect(screen.getByText('Activity')).toBeInTheDocument();
});
