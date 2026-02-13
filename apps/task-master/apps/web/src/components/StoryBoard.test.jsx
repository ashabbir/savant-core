import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import StoryBoard from './StoryBoard';

test('renders StoryBoard with a task', () => {
  const merged = {
    visibleColNames: ['Todo'],
    tasksByColName: {
      Todo: [
        {
          id: 't1',
          title: 'Ship it',
          projectCode: 'SYS',
          ticketNumber: 1,
          projectId: 'p1'
        }
      ]
    }
  };
  render(
    <StoryBoard
      merged={merged}
      grouped={{}}
      groupBy="none"
      epics={[]}
      selectedProjectId="p1"
      selectedTaskId={null}
      setSelectedTaskId={() => {}}
      dragTaskId={null}
      setDragTaskId={() => {}}
      collapsedById={{}}
      setCollapsedById={() => {}}
      collapsedGroups={{}}
      setCollapsedGroups={() => {}}
      onMoveTask={() => {}}
      onReorderColumn={() => {}}
    />
  );

  expect(screen.getByText('Ship it')).toBeInTheDocument();
});
