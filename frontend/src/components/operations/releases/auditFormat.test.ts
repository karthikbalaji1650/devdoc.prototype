import { describe, it, expect } from 'vitest';
import { formatAuditDetails } from './auditFormat';

describe('formatAuditDetails', () => {
  it('turns details into readable label / value pairs, without JSON quotes or brackets', () => {
    expect(formatAuditDetails({
      build: 'v2.4.0-RC100',
      testRunIds: ['run-01', 'run-02'],
      signers: ['Vaishnavi Aasaithambi', 'Manivannan Thangavel'],
      sha256: '3a7bd3e2360a3d29eea436fcfb7e44c735d117c42d1c1835420b6b9942dd4f1b',
    })).toEqual([
      { label: 'Build', value: 'v2.4.0-RC100' },
      { label: 'Test run ids', value: 'run-01, run-02' },
      { label: 'Signers', value: 'Vaishnavi Aasaithambi, Manivannan Thangavel' },
      { label: 'SHA-256', value: '3a7bd3e2360a3d29eea436fcfb7e44c735d117c42d1c1835420b6b9942dd4f1b' },
    ]);
  });

  it('shows empty lists, nulls and booleans plainly, and nested objects as key: value', () => {
    expect(formatAuditDetails({ testRunIds: [], comment: null, requireNoOpenBlockers: true, from: { status: 'Planned' } })).toEqual([
      { label: 'Test run ids', value: 'none' },
      { label: 'Comment', value: '-' },
      { label: 'Require no open blockers', value: 'yes' },
      { label: 'From', value: 'status: Planned' },
    ]);
  });
});
