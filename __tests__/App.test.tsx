/**
 * @format
 */

import React from 'react';
import ReactTestRenderer from 'react-test-renderer';
import App from '../App';

test('renders correctly', async () => {
  let tree: ReactTestRenderer.ReactTestRenderer;
  await ReactTestRenderer.act(() => {
    tree = ReactTestRenderer.create(<App />);
  });
  // Flush pending async effects (e.g. preview loading) inside act, then unmount
  // so App's setup-effect cleanup runs — removing the AppState/Linking listeners
  // and store subscriptions that otherwise leak past the test.
  await ReactTestRenderer.act(async () => {});
  await ReactTestRenderer.act(() => {
    tree.unmount();
  });
});
