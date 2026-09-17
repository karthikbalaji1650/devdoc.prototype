import mammoth from 'mammoth';
import type { DocumentModel, DocSection } from '../types/document';

export async function parseDocxFile(file: File): Promise<DocumentModel> {
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer });
  const html = result.value;

  const parser = new DOMParser();
  const doc = parser.parseFromString(html, 'text/html');

  const title = file.name.replace(/\.docx$/i, '');
  const sections: DocSection[] = [];

  let currentSection: DocSection | null = null;
  let sectionIndex = 1;

  const elements = Array.from(doc.body.children);

  for (const el of elements) {
    const tagName = el.tagName.toLowerCase();

    if (tagName === 'h1' || tagName === 'h2' || tagName === 'h3') {
      if (currentSection) {
        sections.push(currentSection);
      }

      const level = tagName === 'h1' ? 1 : tagName === 'h2' ? 2 : 3;
      currentSection = {
        id: `imported-sec-${sectionIndex++}`,
        title: el.textContent?.trim() || `Section ${sectionIndex}`,
        level,
        type: 'richText',
        content: ''
      };
    } else if (tagName === 'table') {
      const rows = Array.from(el.querySelectorAll('tr'));
      if (rows.length > 0) {
        const firstRowCells = Array.from(rows[0].querySelectorAll('th, td')).map(c => c.textContent?.trim() || '');
        const dataRows = rows.slice(1).map(r => 
          Array.from(r.querySelectorAll('td')).map(c => c.textContent?.trim() || '')
        );

        if (currentSection) {
          sections.push(currentSection);
          currentSection = null;
        }

        sections.push({
          id: `imported-sec-${sectionIndex++}`,
          title: `Table ${sections.length + 1}`,
          level: 2,
          type: 'table',
          tableData: {
            headers: firstRowCells,
            rows: dataRows
          }
        });
      }
    } else {
      const text = el.textContent?.trim();
      if (text) {
        if (!currentSection) {
          currentSection = {
            id: `imported-sec-${sectionIndex++}`,
            title: 'Overview',
            level: 1,
            type: 'richText',
            content: text
          };
        } else {
          currentSection.content = currentSection.content 
            ? `${currentSection.content}\n\n${text}`
            : text;
        }
      }
    }
  }

  if (currentSection) {
    sections.push(currentSection);
  }

  return {
    metadata: {
      id: `imported-${Date.now()}`,
      title,
      docNumber: title.split(' ')[0] || 'DOC-01',
      author: 'Imported Author',
      date: new Date().toISOString().split('T')[0],
      version: '1.0',
      classification: 'INTERNAL ONLY',
      status: 'DRAFT',
      templateType: 'custom',
      tags: ['Imported', 'DOCX']
    },
    sections: sections.length > 0 ? sections : [
      {
        id: 'sec-1',
        title: 'Document Content',
        level: 1,
        type: 'richText',
        content: doc.body.textContent || ''
      }
    ]
  };
}
