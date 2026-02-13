import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import EpicCard from './EpicCard';

const epic = {
  id: 'e1',
  title: 'Epic Alpha',
  ticketNumber: 10,
  epicColor: '#f97316'
};

const stats = {
  percentDone: 50,
  byStatus: { Todo: 1, Done: 1 },
  byType: { story: 2 }
};

test('renders EpicCard expanded', () => {
  render(<EpicCard epic={epic} stats={stats} collapsed={false} />);
  expect(screen.getByText('Epic Alpha')).toBeInTheDocument();
  expect(screen.getByText('Done 50%')).toBeInTheDocument();
});

test('renders EpicCard collapsed', () => {
  render(<EpicCard epic={epic} stats={stats} collapsed={true} />);
  expect(screen.getByText('Epic Alpha')).toBeInTheDocument();
  expect(screen.getByText('Done 50%')).toBeInTheDocument();
});
