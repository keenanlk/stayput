import { NamedError } from './input-error';

/**
 * How long a song the vocal remover takes on a phone. The model and its engine already hold about 1 GB when a run
 * starts (measured in Playwright WebKit, STAA-651); on top of that the song is held in memory several times over, each
 * copy 4 bytes x 2 channels x 44.1 kHz = about 21 MB a minute. Before this change that was about 6 copies (126 MB a
 * minute, so 10 minutes took 1.26 GB on top of the model); now the page keeps one and the worker three (63 MB a
 * minute). 6 minutes (380 MB) keeps the total near 1.4 GB, the tab budget used for the caption tools (phone-limit.ts);
 * a phone that says it has 2 GB of memory or less gets half. Not yet confirmed on a real iPhone.
 */
export const PHONE_SONG_SECONDS = 6 * 60;

/**
 * Safari never reports navigator.deviceMemory, so the half budget for a small phone could not apply to an iPhone, and a
 * 3 GB iPhone got the same 6 minutes as a 8 GB one (STAA-720). iPhones get 4 minutes: about 1.25 GB with the model, leaving
 * room for the encoders that run after the separation.
 */
export const IOS_SONG_SECONDS = 4 * 60;

export const phoneSongBudget = (deviceMemoryGb?: number, ios = false): number => {
  const base = ios ? IOS_SONG_SECONDS : PHONE_SONG_SECONDS;
  return deviceMemoryGb && deviceMemoryGb <= 2 ? base / 2 : base;
};

/** The refusal for a song over the budget, raised before anything is decoded. */
export const tooLongForPhone = (name: string, seconds: number, budget: number) =>
  new NamedError(
    'TooLongForPhone',
    `${name} is about ${Math.round(seconds / 60)} minutes. A phone can run out of memory separating a song longer than about ${Math.floor(budget / 60)} minutes. Cut it into shorter parts with the Audio splitter, or use a computer.`,
  );

/** Failures worth one more try with a fresh worker: the worker died or failed with no name of its own. */
export const RETRYABLE = new Set(['WorkerCrashError', 'WorkerFailed', 'SeparationFailed', 'SessionCreateFailed', 'SeparationRunFailed']);

/** The error shown after the retry also failed: it says what happened and what to do. */
export const separationFailedError = (cause: Error) =>
  new NamedError(
    // The cause keeps its own name (a crash, the engine not starting, the run breaking), so the counts tell them apart.
    RETRYABLE.has(cause.name) && cause.name !== 'WorkerFailed' ? cause.name : 'SeparationFailed',
    `The separation worker failed twice${cause.message ? ` (${cause.message.slice(0, 160)})` : ''}. Reload the page and try again, close other tabs, or try a shorter song or another browser.`,
  );
