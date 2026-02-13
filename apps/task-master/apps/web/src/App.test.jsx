import { render, screen } from '@testing-library/react';
import { expect, test } from 'vitest';
import App from './App';

// Smoke test: ensure App renders without crashing (catches syntax/runtime render errors)
// eslint-disable-next-line no-undef
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query) => ({
    matches: false,
    media: query,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false
  })
});

const storageStub = () => {
  let store = {};
  return {
    getItem: (key) => (key in store ? store[key] : null),
    setItem: (key, value) => { store[key] = String(value); },
    removeItem: (key) => { delete store[key]; },
    clear: () => { store = {}; }
  };
};

Object.defineProperty(window, 'localStorage', {
  writable: true,
  value: storageStub()
});

test('renders App shell', () => {
  render(<App />);
  expect(screen.getByText('Sign in')).toBeInTheDocument();
});
