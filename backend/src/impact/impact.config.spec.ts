import { impactJobsDisabledWarning, impactJobsEnabled } from './impact.config';

const env = (vars: Record<string, string>) => vars as unknown as NodeJS.ProcessEnv;

describe('impactJobsEnabled (IMPACT_JOBS_ENABLED)', () => {
    it.each([
        [{}, false],
        [{ NODE_ENV: 'development' }, false],
        [{ NODE_ENV: 'production' }, true],
        [{ NODE_ENV: 'production', IMPACT_JOBS_ENABLED: 'false' }, false],
        [{ NODE_ENV: 'production', IMPACT_JOBS_ENABLED: ' FALSE ' }, false],
        [{ IMPACT_JOBS_ENABLED: 'true' }, true],
        [{ NODE_ENV: 'test', IMPACT_JOBS_ENABLED: 'TRUE' }, true],
        // Anything that is not true or false falls back to NODE_ENV.
        [{ IMPACT_JOBS_ENABLED: '1' }, false],
        [{ NODE_ENV: 'production', IMPACT_JOBS_ENABLED: '' }, true],
    ])('%j -> %s', (vars, expected) => {
        expect(impactJobsEnabled(env(vars))).toBe(expected);
    });

    it('warns at startup only when the jobs are off, naming the flag and what stops working', () => {
        expect(impactJobsDisabledWarning(env({ NODE_ENV: 'production' }))).toBeNull();
        const warning = impactJobsDisabledWarning(env({}));
        expect(warning).toContain('IMPACT_JOBS_ENABLED=true');
        expect(warning).toContain('CONFIRMED');
    });
});
