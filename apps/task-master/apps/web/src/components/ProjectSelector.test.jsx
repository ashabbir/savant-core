import { render, screen } from '@testing-library/react';
import { expect, test, vi } from 'vitest';
import ProjectSelector from './ProjectSelector';
import FilterSection from './FilterSection'; // Import FilterSection

// Mock FilterSection to control its initial state
vi.mock('./FilterSection', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    default: (props) => <actual.default {...props} initialOpen={true} />,
  };
});

const mockProjects = [
  { id: '1', name: 'Project Alpha', code: 'PA', active: true },
  { id: '2', name: 'Project Beta', code: 'PB', active: true },
];

test('renders ProjectSelector component', () => {
  render(<ProjectSelector projects={mockProjects} />);
  
  // Check for some key elements
  expect(screen.getByText('Projects')).toBeInTheDocument();
  expect(screen.getByPlaceholderText('Search projects...')).toBeInTheDocument();
  expect(screen.getByText('Project Alpha')).toBeInTheDocument();
});

test('renders ProjectSelector with "New Project" button', () => {
    const handleNewProject = vi.fn();
    render(<ProjectSelector projects={mockProjects} onNewProject={handleNewProject} />);
    expect(screen.getByText('+ New Project')).toBeInTheDocument();
});

test('renders ProjectSelector in table view initially', () => {
    render(<ProjectSelector projects={mockProjects} />);
    expect(screen.getByText('Project Alpha')).toBeInTheDocument();
    expect(screen.getByText('PA')).toBeInTheDocument();
});
