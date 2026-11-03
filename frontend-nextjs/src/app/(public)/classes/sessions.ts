export const publicSessions = [
  {
    id: 'c1', name: 'Dynamic Vinyasa Flow', discipline: 'Yoga', duration: '60 minutes', intensity: 'Moderate', studio: 'Indiranagar · Bengaluru', instructor: 'Ananya Sharma',
    description: 'Synchronize fluid movement with conscious breath in a practice focused on mobility, balance and steady attention.',
    image: 'https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=1400&q=85', alt: 'A quiet yoga practice in a sunlit studio',
  },
  {
    id: 'c2', name: 'Reformer Pilates Sculpt', discipline: 'Pilates', duration: '50 minutes', intensity: 'High energy', studio: 'Indiranagar · Bengaluru', instructor: 'Rohan Mehta',
    description: 'A considered reformer practice built around controlled resistance, core stability and precise movement.',
    image: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=1400&q=85', alt: 'A focused Pilates practice',
  },
  {
    id: 'c3', name: 'Tibetan Sound Bath & Meditation', discipline: 'Meditation', duration: '45 minutes', intensity: 'Gentle', studio: 'Bandra · Mumbai', instructor: 'Dr. Meera Rao',
    description: 'Settle into a restorative sound-led practice with bronze bowls, resonant tones and space for stillness.',
    image: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?auto=format&fit=crop&w=1400&q=85', alt: 'A calm space prepared for meditation',
  },
  {
    id: 'c4', name: 'High-Energy Zumba & Barre', discipline: 'Dance', duration: '55 minutes', intensity: 'High energy', studio: 'Indiranagar · Bengaluru', instructor: 'Priya Kapoor',
    description: 'A lively blend of barre-inspired movement and Latin rhythms, set to a welcoming group-class energy.',
    image: 'https://images.unsplash.com/photo-1518834107812-67b0b7c58434?auto=format&fit=crop&w=1400&q=85', alt: 'Dancers moving together in a studio',
  },
  {
    id: 'c5', name: 'Ashtanga Primary Immersion', discipline: 'Yoga', duration: '75 minutes', intensity: 'Advanced', studio: 'Bandra · Mumbai', instructor: 'Vikram Das',
    description: 'A traditional, breath-led sequence for experienced practitioners who enjoy a focused and sustained practice.',
    image: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?auto=format&fit=crop&w=1400&q=85', alt: 'A yoga practitioner holding a steady pose',
  },
  {
    id: 'c6', name: 'Restorative Yin & Nidra', discipline: 'Yoga', duration: '60 minutes', intensity: 'Gentle', studio: 'Indiranagar · Bengaluru', instructor: 'Kavita Patel',
    description: 'A slower practice with supported postures and a quiet closing relaxation to make room for rest.',
    image: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?auto=format&fit=crop&w=1400&q=85', alt: 'A peaceful restorative yoga practice',
  },
];

export type PublicSession = (typeof publicSessions)[number];
