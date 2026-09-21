-- Records whether a transcript's speaker separation actually happened
-- (stereo channel split) or silently fell back to treating the whole file
-- as one speaker (any non-WAV upload, or a WAV header src/wav.ts couldn't
-- parse). Without this, "only one speaker showed up" is indistinguishable
-- from "the recording genuinely only had one speaker" - see pipeline.ts's
-- isStereoWav() call site for where this gets set.
ALTER TABLE transcript ADD COLUMN diarization_method TEXT;
