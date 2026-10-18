import type { Page } from '@playwright/test';

/**
 * For specs that test the smaller-size retry: the browser reports no software H.264 encoder, so a run goes straight to the
 * next rung of the recovery ladder instead of the software retry that comes first where one is offered.
 */
export async function withoutSoftwareEncoder(page: Page) {
  await page.addInitScript(() => {
    const original = VideoEncoder.isConfigSupported.bind(VideoEncoder);
    VideoEncoder.isConfigSupported = async (config: VideoEncoderConfig) => {
      if (config.hardwareAcceleration === 'prefer-software') return { supported: false, config };
      return original(config);
    };
  });
}
