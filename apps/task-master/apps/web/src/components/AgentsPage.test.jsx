import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import AgentsPage from './AgentsPage';

const agents = [
  { id: 'a1', name: 'Jarvis', role: 'Lead', model: 'openrouter/auto', status: 'active', isMain: true, talonAgentId: 'jarvis' },
  { id: 'a2', name: 'Coder', role: 'Engineer', model: 'openrouter/auto', status: 'idle', talonAgentId: 'coder' }
];

test('renders agents table', () => {
  const queryClient = new QueryClient();
  render(
    <QueryClientProvider client={queryClient}>
      <AgentsPage agents={agents} onRefresh={() => {}} collapsed={false} />
    </QueryClientProvider>
  );
  expect(screen.getAllByText('Subagents').length).toBeGreaterThan(0);
  expect(screen.getByText('Jarvis')).toBeInTheDocument();
  expect(screen.getByText('Coder')).toBeInTheDocument();
  expect(screen.getByText('All roles')).toBeInTheDocument();
  expect(screen.getByText('Model')).toBeInTheDocument();
  expect(screen.getByText('All status')).toBeInTheDocument();
});
