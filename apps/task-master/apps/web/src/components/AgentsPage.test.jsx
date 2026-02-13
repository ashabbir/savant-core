import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import AgentsPage from './AgentsPage';

const agents = [
  { id: 'a1', name: 'Jarvis', role: 'Lead', model: 'openrouter/auto', status: 'active' }
];

test('renders agents table', () => {
  render(<AgentsPage agents={agents} onRefresh={() => {}} collapsed={false} />);
  expect(screen.getByText('Agents')).toBeInTheDocument();
  expect(screen.getByText('Jarvis')).toBeInTheDocument();
  expect(screen.getByText('Delete')).toBeInTheDocument();
  expect(screen.getByText('All roles')).toBeInTheDocument();
  expect(screen.getByText('All models')).toBeInTheDocument();
  expect(screen.getByText('All status')).toBeInTheDocument();
});
