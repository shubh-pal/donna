/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

// The real module initializes the Firebase SDK as an import-time side
// effect, which pulls in ESM files Jest can't parse without extra
// transform config. Unit tests shouldn't hit real Firebase anyway, so
// the auth state stream is stubbed here instead.
jest.mock('../src/config/authService', () => ({
  subscribeToAuthChanges: (callback: (user: null) => void) => {
    callback(null);
    return () => {};
  },
}));

test('renders correctly', async () => {
  await ReactTestRenderer.act(() => {
    ReactTestRenderer.create(<App />);
  });
});
