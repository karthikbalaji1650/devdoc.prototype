import { describe, it, expect } from 'vitest';
import { makeDoc, makeSection } from '../test/fixtures';
import { generateGoogleDocsHtml } from './googleDocsExporter';

describe('Google Docs HTML export', () => {
  it('escapes HTML in the title so document text cannot inject markup', () => {
    const html = generateGoogleDocsHtml(makeDoc('x', { title: '<script>alert(1)</script>' }));
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('escapes HTML inside section content', () => {
    const doc = makeDoc('x', {}, [{ ...makeSection('s1', 'Purpose'), content: 'a <img src=x onerror=alert(1)> b' }]);
    const html = generateGoogleDocsHtml(doc);
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img');
  });

  it('turns **bold** and *italic* markdown into tags', () => {
    const doc = makeDoc('x', {}, [{ ...makeSection('s1', 'Purpose'), content: 'this is **bold** and *slanted*' }]);
    const html = generateGoogleDocsHtml(doc);
    expect(html).toContain('<strong>bold</strong>');
    expect(html).toContain('<em>slanted</em>');
  });

  it('renders bullet lists as list items', () => {
    const doc = makeDoc('x', {}, [{ ...makeSection('s1', 'Steps'), content: '- one\n- two' }]);
    const html = generateGoogleDocsHtml(doc);
    expect(html.match(/<li /g)).toHaveLength(2);
  });

  it('includes every section title and the document number', () => {
    const html = generateGoogleDocsHtml(makeDoc('abc'));
    expect(html).toContain('Purpose');
    expect(html).toContain('Scope');
    expect(html).toContain('ABC');
  });
});
