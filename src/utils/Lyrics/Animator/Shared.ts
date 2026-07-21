const IdleLyricsScale = 0.95;
const IdleEmphasisLyricsScale = 0.95;
const timeOffset = 0;
const DurationTimeOffset = 0;
const BlurMultiplier = 1.25;

// Adjust blur levels in low-quality mode for better performance
const WordBlurs = {
  Emphasis: {
    min: 4,
    max: 14,
    LowQualityMode: {
      min: 1, // Lowered from 2 for better performance
      max: 3, // Lowered from 6
    },
  },
  min: 3,
  max: 9,
  LowQualityMode: {
    min: 2, // Lowered from 4
    max: 6, // Lowered from 8
  },
};

export {
  IdleLyricsScale,
  IdleEmphasisLyricsScale,
  timeOffset,
  DurationTimeOffset,
  BlurMultiplier,
  WordBlurs,
};
