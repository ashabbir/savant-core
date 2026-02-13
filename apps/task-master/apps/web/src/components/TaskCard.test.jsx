import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import TaskCard from './TaskCard';

const baseTask = {
  id: 't1',
  title: 'Fix login',
  projectCode: 'SYS',
  ticketNumber: 2,
  assignee: 'amy',
  type: 'bug',
  priority: 'high',
  dueAt: null
};

test('renders expanded task card', () => {
  render(
    <TaskCard
      task={baseTask}
      colName="Todo"
      selected={false}
      collapsed={false}
    />
  );
  expect(screen.getByText('Fix login')).toBeInTheDocument();
  expect(screen.getByText('SYS-2')).toBeInTheDocument();
});

test('renders collapsed task card', () => {
  render(
    <TaskCard
      task={baseTask}
      colName="Done"
      selected={false}
      collapsed={true}
    />
  );
  expect(screen.getByText('Fix login')).toBeInTheDocument();
  expect(screen.getByText('SYS-2')).toBeInTheDocument();
});
