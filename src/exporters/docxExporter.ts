import {
  Document,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  HeadingLevel,
  BorderStyle,
  WidthType,
  AlignmentType,
  ShadingType,
  Header,
  Footer,
  PageNumber,
  Packer,
  ImageRun,
  convertInchesToTwip
} from 'docx';
import { saveAs } from 'file-saver';
import type { DocumentModel, DocSection } from '../types/document';

export async function generateDocxBlob(docModel: DocumentModel): Promise<Blob> {
  const { metadata, sections } = docModel;

  const children: (Paragraph | Table)[] = [];

  // Parse Logo Image for Word Top Header if present
  let headerLogoImageRun: ImageRun | null = null;
  if (metadata.logoUrl && metadata.logoUrl.startsWith('data:image/')) {
    try {
      const mimeType = metadata.logoUrl.split(';')[0].split(':')[1];
      const imageType: 'png' | 'jpg' | 'svg' = mimeType.includes('svg') ? 'svg' : mimeType.includes('jpeg') || mimeType.includes('jpg') ? 'jpg' : 'png';
      const base64Data = metadata.logoUrl.split(',')[1];
      
      if (base64Data) {
        const binaryString = atob(base64Data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        if (imageType === 'svg') {
          headerLogoImageRun = new ImageRun({
            data: bytes,
            type: 'svg',
            transformation: {
              width: 110,
              height: 35
            },
            fallback: {
              data: bytes,
              type: 'png'
            }
          });
        } else {
          headerLogoImageRun = new ImageRun({
            data: bytes,
            type: imageType,
            transformation: {
              width: 110,
              height: 35
            }
          });
        }
      }
    } catch (e) {
      console.warn('Could not parse logo for DOCX header:', e);
    }
  }

  // 1. Document Title Block (Main editable body starts here)
  children.push(
    new Paragraph({
      heading: HeadingLevel.TITLE,
      spacing: { before: 0, after: 120 },
      children: [
        new TextRun({
          text: metadata.title,
          bold: true,
          size: 32, // 16pt
          color: '1E3A8A', // Deep blue
          font: 'Calibri'
        })
      ]
    })
  );

  if (metadata.subtitle) {
    children.push(
      new Paragraph({
        spacing: { before: 0, after: 240 },
        children: [
          new TextRun({
            text: metadata.subtitle,
            italics: true,
            size: 24, // 12pt
            color: '475569',
            font: 'Calibri'
          })
        ]
      })
    );
  }

  // 2. Metadata Table
  const metaRows: TableRow[] = [
    new TableRow({
      children: [
        createMetaCell('Document ID / Key', true),
        createMetaCell(metadata.docNumber || 'N/A', false),
        createMetaCell('Classification', true),
        createMetaCell(metadata.classification || 'INTERNAL ONLY', false)
      ]
    }),
    new TableRow({
      children: [
        createMetaCell('Author / Team', true),
        createMetaCell(metadata.author || 'Engineering Team', false),
        createMetaCell('Date', true),
        createMetaCell(metadata.date || new Date().toISOString().split('T')[0], false)
      ]
    }),
    new TableRow({
      children: [
        createMetaCell('Version', true),
        createMetaCell(metadata.version || '1.0', false),
        createMetaCell('Status', true),
        createMetaCell(metadata.status || 'DRAFT', false)
      ]
    })
  ];

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: metaRows,
      borders: {
        top: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
        left: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
        right: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
        insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' },
        insideVertical: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' }
      }
    })
  );

  // Spacing after metadata
  children.push(new Paragraph({ spacing: { before: 200, after: 200 }, children: [] }));

  // 3. Render Sections
  for (const section of sections) {
    renderSectionToDocx(section, children);
  }

  // Build Top Running Page Header: Left = Doc ID, Center = Logo, Right = Classification
  const headerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.NONE },
      left: { style: BorderStyle.NONE },
      right: { style: BorderStyle.NONE },
      bottom: { style: BorderStyle.SINGLE, size: 6, color: 'CBD5E1' },
      insideHorizontal: { style: BorderStyle.NONE },
      insideVertical: { style: BorderStyle.NONE }
    },
    rows: [
      new TableRow({
        children: [
          // Left: Doc Number
          new TableCell({
            width: { size: 30, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                alignment: AlignmentType.LEFT,
                children: [
                  new TextRun({
                    text: metadata.docNumber || 'DOC-01',
                    bold: true,
                    size: 16,
                    color: '1E293B',
                    font: 'Calibri'
                  })
                ]
              })
            ],
            margins: { top: 60, bottom: 80, left: 0, right: 80 }
          }),

          // Center: Centered Logo
          new TableCell({
            width: { size: 40, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: headerLogoImageRun ? [headerLogoImageRun] : []
              })
            ],
            margins: { top: 40, bottom: 60, left: 40, right: 40 }
          }),

          // Right: Classification
          new TableCell({
            width: { size: 30, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                alignment: AlignmentType.RIGHT,
                children: [
                  new TextRun({
                    text: metadata.classification || 'INTERNAL ONLY',
                    size: 15,
                    color: '64748B',
                    font: 'Calibri'
                  })
                ]
              })
            ],
            margins: { top: 60, bottom: 80, left: 80, right: 0 }
          })
        ]
      })
    ]
  });

  // Build Document
  const doc = new Document({
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: convertInchesToTwip(1),
              right: convertInchesToTwip(1),
              bottom: convertInchesToTwip(1),
              left: convertInchesToTwip(1)
            }
          }
        },
        headers: {
          default: new Header({
            children: [headerTable]
          })
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                alignment: AlignmentType.BOTH,
                children: [
                  new TextRun({
                    text: metadata.title ? metadata.title.slice(0, 45) + '...' : 'DocCraft Studio Document',
                    size: 16,
                    color: '94A3B8',
                    font: 'Calibri'
                  }),
                  new TextRun({
                    text: '\tPage '
                  }),
                  new TextRun({
                    children: [PageNumber.CURRENT]
                  }),
                  new TextRun({
                    text: ' of '
                  }),
                  new TextRun({
                    children: [PageNumber.TOTAL_PAGES]
                  })
                ]
              })
            ]
          })
        },
        children
      }
    ]
  });

  return await Packer.toBlob(doc);
}

export async function exportToDocx(docModel: DocumentModel): Promise<void> {
  const blob = await generateDocxBlob(docModel);
  const cleanTitle = (docModel.metadata.title || 'document')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 50);
  const filename = `${docModel.metadata.docNumber ? docModel.metadata.docNumber + '_' : ''}${cleanTitle}.docx`;
  saveAs(blob, filename);
}

function createMetaCell(text: string, isHeader: boolean): TableCell {
  return new TableCell({
    shading: isHeader ? { fill: 'F1F5F9', type: ShadingType.CLEAR, color: 'auto' } : undefined,
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text,
            bold: isHeader,
            size: 18, // 9pt
            color: isHeader ? '1E293B' : '334155',
            font: 'Calibri'
          })
        ]
      })
    ],
    margins: {
      top: 100,
      bottom: 100,
      left: 140,
      right: 140
    }
  });
}

function renderSectionToDocx(section: DocSection, children: (Paragraph | Table)[]): void {
  // Heading
  const headingLevel = 
    section.level === 1 ? HeadingLevel.HEADING_1 :
    section.level === 2 ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_3;
  
  const headingColor = 
    section.level === 1 ? '1E3A8A' :
    section.level === 2 ? '0284C7' : '334155';

  const headingSize = 
    section.level === 1 ? 28 : // 14pt
    section.level === 2 ? 24 : 20; // 12pt or 10pt

  children.push(
    new Paragraph({
      heading: headingLevel,
      spacing: { before: section.level === 1 ? 280 : 200, after: 120 },
      children: [
        new TextRun({
          text: section.title,
          bold: true,
          size: headingSize,
          color: headingColor,
          font: 'Calibri'
        })
      ]
    })
  );

  // Content rendering based on section type
  if (section.type === 'richText' && section.content) {
    const lines = section.content.split('\n');
    for (const line of lines) {
      if (!line.trim()) {
        children.push(new Paragraph({ spacing: { before: 60, after: 60 }, children: [] }));
        continue;
      }

      // Check if bullet point
      const isBullet = line.trim().startsWith('- ') || line.trim().startsWith('* ');
      const rawText = isBullet ? line.trim().replace(/^[-*]\s+/, '') : line;

      children.push(
        new Paragraph({
          bullet: isBullet ? { level: 0 } : undefined,
          spacing: { before: 40, after: 40 },
          children: parseMarkdownRuns(rawText)
        })
      );
    }
  } else if (section.type === 'table' && section.tableData) {
    const { headers, rows } = section.tableData;
    const tableRows: TableRow[] = [];

    // Header Row
    if (headers && headers.length > 0) {
      tableRows.push(
        new TableRow({
          tableHeader: true,
          children: headers.map(h => 
            new TableCell({
              shading: { fill: 'F1F5F9', type: ShadingType.CLEAR, color: 'auto' },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({
                      text: h,
                      bold: true,
                      size: 18,
                      color: '0F172A',
                      font: 'Calibri'
                    })
                  ]
                })
              ],
              margins: { top: 120, bottom: 120, left: 140, right: 140 }
            })
          )
        })
      );
    }

    // Data Rows
    if (rows && rows.length > 0) {
      rows.forEach((row, rowIdx) => {
        tableRows.push(
          new TableRow({
            children: row.map(cell => 
              new TableCell({
                shading: rowIdx % 2 === 1 ? { fill: 'F8FAFC', type: ShadingType.CLEAR, color: 'auto' } : undefined,
                children: [
                  new Paragraph({
                    children: [
                      new TextRun({
                        text: cell,
                        size: 18,
                        color: '334155',
                        font: 'Calibri'
                      })
                    ]
                  })
                ],
                margins: { top: 100, bottom: 100, left: 140, right: 140 }
              })
            )
          })
        );
      });
    }

    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: tableRows,
        borders: {
          top: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
          bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
          left: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
          right: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
          insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' },
          insideVertical: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' }
        }
      })
    );
    children.push(new Paragraph({ spacing: { before: 100, after: 100 }, children: [] }));
  } else if (section.type === 'codeDiff' && section.codeSnippet) {
    const { filename, description, code, isDiff, oldCode, newCode } = section.codeSnippet;
    
    if (filename || description) {
      children.push(
        new Paragraph({
          spacing: { before: 60, after: 40 },
          children: [
            new TextRun({
              text: filename ? `File: ${filename}` : '',
              bold: true,
              size: 18,
              color: '1E3A8A',
              font: 'Calibri'
            }),
            new TextRun({
              text: description ? ` (${description})` : '',
              italics: true,
              size: 16,
              color: '64748B',
              font: 'Calibri'
            })
          ]
        })
      );
    }

    if (isDiff && (oldCode || newCode)) {
      if (oldCode) {
        children.push(
          new Paragraph({
            spacing: { before: 40, after: 20 },
            children: [
              new TextRun({ text: '[-] Original / Pre-Fix Code:', bold: true, color: 'DC2626', size: 18, font: 'Calibri' })
            ]
          })
        );
        renderCodeBlockToDocx(oldCode, children);
      }
      if (newCode) {
        children.push(
          new Paragraph({
            spacing: { before: 40, after: 20 },
            children: [
              new TextRun({ text: '[+] Proposed / Fixed Code:', bold: true, color: '16A34A', size: 18, font: 'Calibri' })
            ]
          })
        );
        renderCodeBlockToDocx(newCode, children);
      }
    } else if (code) {
      renderCodeBlockToDocx(code, children);
    }
  } else if (section.type === 'verificationMatrix' && section.verificationMatrix) {
    const tableRows: TableRow[] = [
      new TableRow({
        tableHeader: true,
        children: [
          createTableHeadCell('#'),
          createTableHeadCell('Root Cause Identified'),
          createTableHeadCell('Specific Fix Location'),
          createTableHeadCell('Verification & Resolution')
        ]
      })
    ];

    section.verificationMatrix.forEach((item, idx) => {
      tableRows.push(
        new TableRow({
          children: [
            createTableCell(item.id || `${idx + 1}`),
            createTableCell(item.rootCause),
            createTableCell(item.fixLocation, true),
            createTableCell(item.resolution)
          ]
        })
      );
    });

    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: tableRows,
        borders: {
          top: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
          bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
          left: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
          right: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
          insideHorizontal: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' },
          insideVertical: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' }
        }
      })
    );
    children.push(new Paragraph({ spacing: { before: 100, after: 100 }, children: [] }));
  } else if (section.type === 'testCases' && section.testCases) {
    for (const tc of section.testCases) {
      children.push(
        new Paragraph({
          spacing: { before: 140, after: 40 },
          children: [
            new TextRun({
              text: `${tc.id}: ${tc.title}`,
              bold: true,
              size: 22,
              color: '1E3A8A',
              font: 'Calibri'
            }),
            new TextRun({
              text: `  [Status: ${tc.status}]`,
              bold: true,
              color: tc.status === 'PASSED' ? '16A34A' : tc.status === 'FAILED' ? 'DC2626' : 'D97706',
              size: 18,
              font: 'Calibri'
            })
          ]
        })
      );

      if (tc.objective) {
        children.push(
          new Paragraph({
            spacing: { before: 20, after: 20 },
            children: [
              new TextRun({ text: 'Objective: ', bold: true, size: 18, font: 'Calibri' }),
              new TextRun({ text: tc.objective, size: 18, font: 'Calibri' })
            ]
          })
        );
      }

      if (tc.steps && tc.steps.length > 0) {
        children.push(
          new Paragraph({
            spacing: { before: 20, after: 20 },
            children: [new TextRun({ text: 'Steps:', bold: true, size: 18, font: 'Calibri' })]
          })
        );
        tc.steps.forEach((step) => {
          children.push(
            new Paragraph({
              bullet: { level: 0 },
              spacing: { before: 20, after: 20 },
              children: [new TextRun({ text: step, size: 18, font: 'Calibri' })]
            })
          );
        });
      }

      if (tc.expectedResult) {
        children.push(
          new Paragraph({
            spacing: { before: 20, after: 20 },
            children: [
              new TextRun({ text: 'Expected Result: ', bold: true, size: 18, font: 'Calibri' }),
              new TextRun({ text: tc.expectedResult, size: 18, font: 'Calibri' })
            ]
          })
        );
      }

      if (tc.actualResult) {
        children.push(
          new Paragraph({
            spacing: { before: 20, after: 20 },
            children: [
              new TextRun({ text: 'Actual Result: ', bold: true, size: 18, font: 'Calibri' }),
              new TextRun({ text: tc.actualResult, size: 18, font: 'Calibri' })
            ]
          })
        );
      }

      children.push(new Paragraph({ spacing: { before: 60, after: 60 }, children: [] }));
    }
  } else if (section.type === 'callout' && section.callout) {
    const { type, title, text } = section.callout;
    const borderColor = type === 'warning' ? 'F59E0B' : type === 'success' ? '10B981' : '3B82F6';
    const fillBg = type === 'warning' ? 'FFFBEB' : type === 'success' ? 'F0FDF4' : 'EFF6FF';

    children.push(
      new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [
          new TableRow({
            children: [
              new TableCell({
                shading: { fill: fillBg, type: ShadingType.CLEAR, color: 'auto' },
                children: [
                  ...(title ? [new Paragraph({
                    children: [new TextRun({ text: title, bold: true, size: 18, color: '0F172A', font: 'Calibri' })]
                  })] : []),
                  new Paragraph({
                    children: [new TextRun({ text, size: 18, color: '334155', font: 'Calibri' })]
                  })
                ],
                margins: { top: 120, bottom: 120, left: 160, right: 160 }
              })
            ]
          })
        ],
        borders: {
          left: { style: BorderStyle.SINGLE, size: 24, color: borderColor },
          top: { style: BorderStyle.NONE },
          bottom: { style: BorderStyle.NONE },
          right: { style: BorderStyle.NONE }
        }
      })
    );
    children.push(new Paragraph({ spacing: { before: 80, after: 80 }, children: [] }));
  }
}

function renderCodeBlockToDocx(codeText: string, children: (Paragraph | Table)[]): void {
  const codeParagraphs = codeText.split('\n').map(line => 
    new Paragraph({
      spacing: { before: 0, after: 0 },
      children: [
        new TextRun({
          text: line || ' ',
          size: 16, // 8pt
          font: 'Consolas',
          color: '0F172A'
        })
      ]
    })
  );

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              shading: { fill: 'F8FAFC', type: ShadingType.CLEAR, color: 'auto' },
              children: codeParagraphs,
              margins: { top: 120, bottom: 120, left: 140, right: 140 }
            })
          ]
        })
      ],
      borders: {
        top: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' },
        bottom: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' },
        left: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' },
        right: { style: BorderStyle.SINGLE, size: 4, color: 'E2E8F0' }
      }
    })
  );
  children.push(new Paragraph({ spacing: { before: 60, after: 60 }, children: [] }));
}

function createTableHeadCell(text: string): TableCell {
  return new TableCell({
    shading: { fill: 'F1F5F9', type: ShadingType.CLEAR, color: 'auto' },
    children: [
      new Paragraph({
        children: [new TextRun({ text, bold: true, size: 18, color: '0F172A', font: 'Calibri' })]
      })
    ],
    margins: { top: 120, bottom: 120, left: 140, right: 140 }
  });
}

function createTableCell(text: string, isMono: boolean = false): TableCell {
  return new TableCell({
    children: [
      new Paragraph({
        children: [
          new TextRun({
            text: text || '',
            size: 18,
            color: '334155',
            font: isMono ? 'Consolas' : 'Calibri'
          })
        ]
      })
    ],
    margins: { top: 100, bottom: 100, left: 140, right: 140 }
  });
}

function parseMarkdownRuns(text: string): TextRun[] {
  const runs: TextRun[] = [];
  const regex = /(\*\*.*?\*\*|`.*?`|\*.*?\*)/g;
  const parts = text.split(regex);

  for (const part of parts) {
    if (!part) continue;

    if (part.startsWith('**') && part.endsWith('**')) {
      runs.push(
        new TextRun({
          text: part.slice(2, -2),
          bold: true,
          size: 18,
          color: '1E293B',
          font: 'Calibri'
        })
      );
    } else if (part.startsWith('`') && part.endsWith('`')) {
      runs.push(
        new TextRun({
          text: part.slice(1, -1),
          font: 'Consolas',
          size: 17,
          color: '0F172A'
        })
      );
    } else if (part.startsWith('*') && part.endsWith('*')) {
      runs.push(
        new TextRun({
          text: part.slice(1, -1),
          italics: true,
          size: 18,
          color: '334155',
          font: 'Calibri'
        })
      );
    } else {
      runs.push(
        new TextRun({
          text: part,
          size: 18,
          color: '334155',
          font: 'Calibri'
        })
      );
    }
  }

  return runs;
}
