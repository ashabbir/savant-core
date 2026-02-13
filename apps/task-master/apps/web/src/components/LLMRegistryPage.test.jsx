import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { expect, test, vi, beforeEach } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import LLMRegistryPage from './LLMRegistryPage';
import * as api from '../api';

// Mock API
vi.mock('../api', () => ({
    apiGet: vi.fn(),
    apiPost: vi.fn(),
    apiPatch: vi.fn(),
    apiDelete: vi.fn(),
}));

const queryClient = new QueryClient({
    defaultOptions: {
        queries: { retry: false },
    },
});

const renderWithClient = (ui) => {
    return render(
        <QueryClientProvider client={queryClient}>
            {ui}
        </QueryClientProvider>
    );
};

describe('LLMRegistryPage', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        queryClient.clear();
    });

    test('renders page header', () => {
        api.apiGet.mockResolvedValue({ data: [] }); // mock providers
        renderWithClient(<LLMRegistryPage />);
        expect(screen.getByText('LLM Registry')).toBeInTheDocument();
        expect(screen.getByText('+ Add Provider')).toBeInTheDocument();
    });

    test('displays empty state when no providers', async () => {
        api.apiGet.mockResolvedValue({ data: [] });
        renderWithClient(<LLMRegistryPage />);
        
        await waitFor(() => {
            expect(screen.getByText('No LLM providers configured yet.')).toBeInTheDocument();
        });
    });

    test('displays providers list', async () => {
        const mockProviders = [
            { id: '1', name: 'Test Provider', providerType: 'openai', status: 'valid', modelCount: 5 }
        ];
        
        // Mock providers query
        api.apiGet.mockImplementation((url) => {
            if (url === '/api/llm/providers') return Promise.resolve({ data: mockProviders });
            if (url === '/api/llm/models') return Promise.resolve({ data: [] });
            return Promise.resolve({ data: [] });
        });

        renderWithClient(<LLMRegistryPage />);

        await waitFor(() => {
            expect(screen.getByText('Test Provider')).toBeInTheDocument();
            expect(screen.getByText('openai')).toBeInTheDocument();
            expect(screen.getByText('5 MODELS')).toBeInTheDocument();
        });
    });

    test('opens add provider modal', async () => {
        api.apiGet.mockResolvedValue({ data: [] });
        renderWithClient(<LLMRegistryPage />);

        const addBtn = screen.getByText('+ Add Provider');
        fireEvent.click(addBtn);

        await waitFor(() => {
            expect(screen.getByText('Connect a new AI model provider')).toBeInTheDocument();
        });
    });
});
