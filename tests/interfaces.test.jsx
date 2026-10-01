// @vitest-environment jsdom
import React from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import App from '../src/App.jsx';
afterEach(cleanup);
test('parcours fictif des interfaces du socle', () => {
  render(<App/>);
  expect(screen.getByText('Maison Élite — Brazzaville', { selector: 'h1' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'membres' }));
  expect(screen.getByText('L’équipe de l’établissement')).toBeTruthy();
  expect(screen.getByText('Malia K.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'editeur' }));
  expect(screen.getByText('Clients et établissements')).toBeTruthy();
  expect(screen.getByText('Groupe Horizon')).toBeTruthy();
  fireEvent.change(screen.getByLabelText('Établissement'), { target: { value: 'demo-pointe-noire' } });
  expect(screen.queryByRole('button', { name: 'membres' })).toBeNull();
});
