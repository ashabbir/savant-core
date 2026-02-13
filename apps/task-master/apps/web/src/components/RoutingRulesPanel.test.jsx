import { render, screen, waitFor } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import RoutingRulesPanel from './RoutingRulesPanel';

vi.mock('../api', () => ({
  apiGet: vi.fn(),
  apiPost: vi.fn(),
  apiPatch: vi.fn(),
  apiDelete: vi.fn()
}));

import { apiGet } from '../api';

test('shows admin-only message when not admin', () => {
  render(<RoutingRulesPanel projectId="p1" agents={[]} isAdmin={false} />);
  expect(screen.getByText('Routing Rules')).toBeInTheDocument();
  expect(screen.getByText(/Admin access required/i)).toBeInTheDocument();
});

test('loads routing rules for admin user', async () => {
  apiGet.mockResolvedValueOnce({ data: [] });
  render(
    <RoutingRulesPanel
      projectId="p1"
      agents={[{ id: 'a1', name: 'Agent One' }]}
      isAdmin={true}
    />
  );
  await waitFor(() => expect(apiGet).toHaveBeenCalledWith('/api/projects/p1/routing-rules'));
  expect(screen.getByText(/No routing rules yet/i)).toBeInTheDocument();
});
