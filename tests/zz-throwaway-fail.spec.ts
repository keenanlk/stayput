import { test, expect } from '@playwright/test';
test('throwaway deliberate failure', () => { expect(1).toBe(2); });
