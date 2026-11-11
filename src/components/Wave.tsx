const waves = {
  a: [
    'M0 64C150 64 230 22 390 30C570 39 650 82 840 58C990 40 1090 18 1200 46',
    'M0 80C190 36 340 96 540 70C760 42 880 98 1060 74C1130 64 1165 90 1200 82',
    'M0 42C210 72 370 14 570 38C790 64 910 12 1200 34',
  ],
  b: [
    'M0 26C170 92 350 10 560 58C790 112 940 16 1200 66',
    'M0 50C230 16 410 98 660 42C900 2 1040 88 1200 40',
  ],
  c: [
    'M0 72C100 18 250 98 440 48C650 2 830 94 1020 46C1110 26 1165 74 1200 52',
    'M0 88C160 58 310 110 510 70C730 28 910 102 1200 66',
    'M0 34C180 58 360 8 620 28C880 48 1040 14 1200 36',
  ],
  d: [
    'M0 38C270 34 430 46 630 36C840 26 950 80 1090 56C1150 46 1180 72 1200 50',
    'M0 60C190 76 370 24 570 66C780 108 990 26 1200 74',
    'M0 22C310 50 540 6 820 28C1020 44 1110 16 1200 26',
  ],
} as const;

const fills = {
  a: 'M0 36C200 70 360 12 560 36C780 62 900 10 1200 32L1200 100L0 100Z',
  b: 'M0 18C180 96 360 8 560 54C780 108 950 12 1200 48L1200 100L0 100Z',
  c: 'M0 28C120 8 240 96 440 40C660 0 840 90 1040 36C1120 18 1160 70 1200 40L1200 100L0 100Z',
  d: 'M0 18C280 8 520 4 800 24C1000 40 1100 12 1200 22L1200 100L0 100Z',
} as const;

type WaveName = keyof typeof waves;

export function Wave({ name }: { name: WaveName }) {
  return (
    <div className="wave" aria-hidden="true">
      <svg viewBox="0 0 1200 100" preserveAspectRatio="none">
        <path className="wave-fill" d={fills[name]} />
        {waves[name].map((d, index) => (
          <path
            key={d}
            d={d}
            fill="none"
            stroke="#8aa0c4"
            strokeWidth={index === 0 ? 1.7 : 1.15}
            strokeOpacity={index === 0 ? 0.7 : 0.38}
            vectorEffect="non-scaling-stroke"
          />
        ))}
      </svg>
    </div>
  );
}
