import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import ControlNav from './ControlNav';

test('renders ControlNav component', () => {
  render(<ControlNav currentView="board" onNavigate={() => {}} onToggleTheme={() => {}} theme="dark" isAdmin={false} />);
  
  // Check for a few key elements to ensure it rendered
  expect(screen.getByTitle('Board')).toBeInTheDocument();
  expect(screen.getByTitle('Epics')).toBeInTheDocument();
  expect(screen.getByTitle('Toggle Theme')).toBeInTheDocument();
  expect(screen.getByTitle('Profile')).toBeInTheDocument();
  expect(screen.getByTitle('Logout')).toBeInTheDocument();
});
