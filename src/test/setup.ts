import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Component tests (jsdom) leave rendered trees behind: unmount them after each test.
afterEach(() => {
  cleanup();
});
