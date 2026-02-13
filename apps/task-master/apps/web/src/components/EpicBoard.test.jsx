import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import EpicBoard from './EpicBoard';

test('renders EpicBoard with epic cards', () => {
  const epics = [{ id: 'e1', title: 'Epic One', projectId: 'p1', epicColor: '#f97316' }];
  const epicsFiltered = [{ id: 'e1', title: 'Epic One', projectId: 'p1', epicColor: '#f97316', _statusName: 'Todo' }];
  const epicStatsFor = () => ({ percentDone: 0, byStatus: {}, byType: {} });

  render(
    <EpicBoard
      epics={epics}
      epicsFiltered={epicsFiltered}
      epicBoardStatusNames={['Todo']}
      epicStatsFor={epicStatsFor}
      dragTaskId={null}
      setDragTaskId={() => {}}
      collapsedById={{}}
      setCollapsedById={() => {}}
      onMoveEpic={() => {}}
      onSelectEpic={() => {}}
      isLoading={false}
    />
  );

  expect(screen.getByText('Epic One')).toBeInTheDocument();
});
