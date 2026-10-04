import { describe, expect, it } from 'vitest';
import { BUNDLED_PROMPT_KEYS, clipUrl, dictationClipUrl } from './prompts';

describe('prompts', () => {
  it('defines bundled prompt keys for actions and states', () => {
    expect(BUNDLED_PROMPT_KEYS.length).toBeGreaterThan(25);
    expect(BUNDLED_PROMPT_KEYS).toContain('action.send_referral');
    expect(BUNDLED_PROMPT_KEYS).toContain('careState.scheduled');
    expect(BUNDLED_PROMPT_KEYS).toContain('reason.youDecide');
  });

  it('generates correct clip urls for en and hi', () => {
    expect(clipUrl('en', 'action.send_referral')).toContain('audio/en/action_send_referral.m4a');
    expect(clipUrl('hi', 'careState.scheduled')).toContain('audio/hi/careState_scheduled.m4a');
  });

  it('generates correct dictation clip urls for offline voice input', () => {
    expect(dictationClipUrl('en')).toContain('audio/dictation/en.m4a');
    expect(dictationClipUrl('hinglish')).toContain('audio/dictation/hinglish.m4a');
    expect(dictationClipUrl('hindi')).toContain('audio/dictation/hindi.m4a');
  });
});
