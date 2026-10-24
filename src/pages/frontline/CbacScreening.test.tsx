import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { CbacScreening } from './CbacScreening';
vi.mock('../../auth/AuthContext', () => ({ useAuth: () => ({ user: { role: 'super_admin', unit: 'a' } }) }));
vi.mock('../../i18n', () => ({ useLang: () => ({ lang: 'en', t: (key: string) => key }) }));
vi.mock('../../settings', () => ({ useSettings: () => ({ workerName: 'Test worker' }) }));
vi.mock('../../voice/useSpeak', () => ({ useSpeak: () => ({ speak: vi.fn(async () => {}), stop: vi.fn(), speaking: false }) }));
describe('CBAC interview UI', () => {
  it('keeps single-question answers and removes the all-questions section', () => {
    const html = renderToStaticMarkup(<MemoryRouter><CbacScreening /></MemoryRouter>);
    expect(html).toContain('Start Voice Interview');
    expect(html).toContain('Save answer &amp; next');
    expect(html).not.toContain('All Questions at Once');
    expect(html).not.toContain('Auto Fill All');
    expect(html).not.toContain('Continuous Mic Dictate');
  });
});
