import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyCliFailure, cliFailure } from '../bridge-failures.mjs';

test('quota clock, unknown reset, midnight rollover, network and authentication classification', () => {
    const now = new Date(2026, 9, 24, 6, 30).getTime();
    const quota = classifyCliFailure("ERROR: You've hit your usage limit. try again at 6:44 AM.", now);
    assert.equal(quota.code, 'usage_limit'); assert.equal(quota.status, 429);
    assert.equal(quota.retryAt, new Date(2026, 9, 24, 6, 45).getTime());
    const late = new Date(2026, 9, 24, 23, 59).getTime();
    assert.equal(classifyCliFailure('usage limit reached try again at 12:05 AM.', late).retryAt, new Date(2026, 9, 25, 0, 6).getTime());
    assert.equal(classifyCliFailure('usage limit exceeded', now).retryAt, now + 15 * 60000);
    assert.equal(classifyCliFailure('invalid_api_key', now).code, 'authentication');
    assert.equal(classifyCliFailure('error sending request: connection reset', now).code, 'temporary_connection');
    assert.equal(classifyCliFailure('429 Too Many requests', now).code, 'rate_limit');
    assert.equal(classifyCliFailure('unexpected syntax error', now), null);
    assert.equal(cliFailure('internal unrelated failure', 1).message, 'Codex退出码1，请检查本机错误日志');
    assert.equal(cliFailure("You've hit your usage limit", 1, now).retryAt, now + 15 * 60000);
});
