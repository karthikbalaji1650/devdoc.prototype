import type { DocumentModel } from '../types/document';

export const sampleADRDoc: DocumentModel = {
  metadata: {
    id: 'adr-0042',
    title: 'ADR 0042: Migration from REST Polling to WebSocket State Streaming',
    subtitle: 'Architecture Decision Record for Real-time Sensor & Firmware Status Updates',
    docNumber: 'ADR-2026-042',
    author: 'Manivannan Thangavel',
    department: 'Platform Systems Engineering',
    date: '2026-08-13',
    version: '1.0',
    classification: 'INTERNAL ONLY',
    status: 'APPROVED',
    templateType: 'adr',
    tags: ['Architecture', 'ADR', 'WebSocket', 'Performance']
  },
  sections: [
    {
      id: 'sec-status',
      title: 'Status & Context',
      level: 1,
      type: 'richText',
      content: '**Status**: Accepted\n\n**Context**: The WebUI currently polls REST endpoints every 1.5 seconds for sensor readings, flash progress, and hardware alerts. On 100+ concurrent client connections, this induces unnecessary CPU load and network packet overhead on the AST2600 BMC microcontroller.'
    },
    {
      id: 'sec-decision-drivers',
      title: 'Decision Drivers',
      level: 1,
      type: 'richText',
      content: '- Reduce BMC CPU utilization from 28% to < 5% during active UI monitoring.\n- Sub-100ms latency for critical thermal & power alarm notifications.\n- Backward compatibility with legacy IPMI/REST CLI scripts.'
    },
    {
      id: 'sec-options-comp',
      title: 'Considered Architecture Options',
      level: 1,
      type: 'table',
      tableData: {
        headers: ['Option', 'CPU Overhead', 'Latency', 'Complexity', 'Verdict'],
        rows: [
          ['1. HTTP Long Polling', 'Medium (~14%)', '200-500ms', 'Low', 'Rejected (Connection churn)'],
          ['2. Server-Sent Events (SSE)', 'Low (~4%)', '< 80ms', 'Medium', 'Viable for one-way feeds'],
          ['3. WebSocket Full-Duplex', 'Very Low (~3%)', '< 30ms', 'Medium', 'Selected (Bi-directional control)']
        ]
      }
    },
    {
      id: 'sec-decision',
      title: 'Decision Outcome',
      level: 1,
      type: 'callout',
      callout: {
        type: 'success',
        title: 'Decision: WebSocket Protocol Adoption',
        text: 'Adopt WebSocket for live state and flash progression, retaining REST endpoints strictly for CRUD configuration commands.'
      }
    },
    {
      id: 'sec-consequences',
      title: 'Consequences & Trade-offs',
      level: 1,
      type: 'richText',
      content: '- **Positive**: Dramatically lowers network bandwidth and BMC load; instantaneous alerts.\n- **Negative**: Requires connection keep-alive heartbeat and reconnection retry logic in WebUI.'
    }
  ]
};
