import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TelemetryNotice, TELEMETRY_NOTICE_DISMISS_KEY } from './TelemetryNotice';

describe('TelemetryNotice', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('renders when showFreshInstallNotice is true', () => {
    render(
      <TelemetryNotice
        visible
        mode="minimal"
        publicDocUrl="https://example.com/telemetry"
      />,
    );

    expect(screen.getByText('This fresh install is using minimal telemetry.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /read the public telemetry docs/i })).toHaveAttribute('href', 'https://example.com/telemetry');
  });

  it('dismissal only hides the notice locally and leaves telemetryVisible alone', () => {
    localStorage.setItem('oc-telemetry-visible', 'true');

    render(
      <TelemetryNotice
        visible
        mode="minimal"
        publicDocUrl="https://example.com/telemetry"
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /dismiss telemetry notice/i }));

    expect(screen.queryByText('This fresh install is using minimal telemetry.')).not.toBeInTheDocument();
    expect(localStorage.getItem(TELEMETRY_NOTICE_DISMISS_KEY)).toBe('true');
    expect(localStorage.getItem('oc-telemetry-visible')).toBe('true');
  });
});
