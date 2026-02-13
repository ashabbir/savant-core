import { render, screen, fireEvent } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import TaskModal from './TaskModal';

// Mock react-select to avoid complex setup
vi.mock('react-select', () => ({
  __esModule: true,
  default: vi.fn(({ options, value, onChange, isMulti, placeholder }) => {
    const handleChange = (e) => {
      const selectedValue = e.target.value;
      if (isMulti) {
        onChange(options.filter(opt => Array.isArray(value) ? value.includes(opt.value) : false));
      } else {
        onChange(options.find(opt => opt.value === selectedValue));
      }
    };

    return (
      <select multiple={isMulti} onChange={handleChange} value={value?.value || value || ''}>
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(option => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }),
}));

const mockProjects = [
  { id: 'p1', name: 'Project One', columns: [{ name: 'Backlog', enabled: true }] },
  { id: 'p2', name: 'Project Two', columns: [{ name: 'Todo', enabled: true }] },
];
const mockUsers = [{ username: 'user1' }, { username: 'user2' }];
const mockEpics = [{ id: 'e1', title: 'Epic One', ticketNumber: 1 }];

test('renders TaskModal component', () => {
  render(
    <TaskModal
      onClose={() => {}}
      onSave={() => {}}
      projects={mockProjects}
      users={mockUsers}
      epics={mockEpics}
    />
  );

  expect(screen.getByText('Create New Task')).toBeInTheDocument();
  expect(screen.getByLabelText('Task Title')).toBeInTheDocument();
  expect(screen.getByLabelText('Description')).toBeInTheDocument();
  expect(screen.getByLabelText('Project')).toBeInTheDocument();
  expect(screen.getByLabelText('Status')).toBeInTheDocument();
  expect(screen.getByLabelText('Priority')).toBeInTheDocument();
  expect(screen.getByLabelText('Type')).toBeInTheDocument();
  expect(screen.getByLabelText('Assignee')).toBeInTheDocument();
  expect(screen.getByText('Cancel')).toBeInTheDocument();
  expect(screen.getByText('Create Task')).toBeInTheDocument();
});

test('submits task with correct data when "Create Task" is clicked', () => {
  const handleSave = vi.fn();
  render(
    <TaskModal
      onClose={() => {}}
      onSave={handleSave}
      projects={mockProjects}
      users={mockUsers}
      epics={mockEpics}
    />
  );

  fireEvent.change(screen.getByLabelText('Task Title'), { target: { value: 'New Test Task' } });
  fireEvent.click(screen.getByText('Create Task'));

  expect(handleSave).toHaveBeenCalledWith(
    expect.objectContaining({
      title: 'New Test Task',
      projectId: 'p1', // Default selected project
      columnName: 'Backlog',
    })
  );
});

test('displays Epic color field when type is epic', () => {
  render(
    <TaskModal
      onClose={() => {}}
      onSave={() => {}}
      projects={mockProjects}
      users={mockUsers}
      epics={mockEpics}
    />
  );

  fireEvent.change(screen.getByLabelText('Type'), { target: { value: 'epic' } });
  expect(screen.getByLabelText('Epic color')).toBeInTheDocument();
  expect(screen.queryByLabelText('Epic')).not.toBeInTheDocument(); // Epic select should not be there
});
