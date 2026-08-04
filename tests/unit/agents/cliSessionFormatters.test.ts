import { describe, expect, it } from 'vitest';
import {
  formatSessionTimestamp,
  formatStructuredValue,
} from '../../../packages/desktop/src/renderer/pages/agentSessions/formatters';

describe('agent session formatters', () => {
  it('formats structured tool data as readable JSON', () => {
    expect(formatStructuredValue({ command: 'pwd', args: ['--help'] })).toBe(
      '{\n  "command": "pwd",\n  "args": [\n    "--help"\n  ]\n}'
    );
  });

  it('preserves timestamps that cannot be parsed', () => {
    expect(formatSessionTimestamp('not-a-date')).toBe('not-a-date');
  });
});
