import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import BoardHeader from './BoardHeader';

test('renders BoardHeader with title and actions', () => {
  render(
    <BoardHeader
      title="Story Board"
      onBack={() => {}}
      backLabel="Projects"
      rightActions={<button>Action</button>}
    />
  );
  expect(screen.getByText('Story Board')).toBeInTheDocument();
  expect(screen.getByText('Action')).toBeInTheDocument();
  expect(screen.getByText('← Projects')).toBeInTheDocument();
});
