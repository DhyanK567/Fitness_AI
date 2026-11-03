export type B2CCategory = 'Yoga' | 'Pilates' | 'Meditation' | 'Dance' | 'Fitness' | 'Breathwork';

export type B2CClass = {
  id: string;
  title: string;
  category: B2CCategory;
  duration: string;
  intensity: string;
  time: string;
  location: string;
  instructor: string;
  instructorAvatar: string;
  price: number;
  spotsLeft: number;
  imageUrl: string;
  description: string;
};

export type B2CWorkshop = {
  id: string;
  title: string;
  category: B2CCategory;
  date: string;
  time: string;
  location: string;
  instructor: string;
  price: number;
  spotsLeft: number;
  imageUrl: string;
  description: string;
};

const image = (id: string, width = 800) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=${width}&q=80`;

export const B2C_CLASSES: B2CClass[] = [
  {
    id: 'c1', title: 'Dynamic Vinyasa Flow', category: 'Yoga', duration: '60 min', intensity: 'Moderate',
    time: '07:30 AM', location: 'Indiranagar Sanctuary', instructor: 'Ananya Sharma',
    instructorAvatar: image('photo-1534528741775-53994a69daeb', 200), price: 850, spotsLeft: 4,
    imageUrl: image('photo-1506126613408-eca07ce68773'),
    description: 'Synchronized movement with conscious Ujjayi breath to build physical vitality and mental stillness.',
  },
  {
    id: 'c2', title: 'Reformer Pilates Sculpt', category: 'Pilates', duration: '50 min', intensity: 'High Energy',
    time: '09:00 AM', location: 'Indiranagar Sanctuary', instructor: 'Rohan Mehta',
    instructorAvatar: image('photo-1507003211169-0a1dd7228f2d', 200), price: 1200, spotsLeft: 2,
    imageUrl: image('photo-1518611012118-696072aa579a'),
    description: 'Precision spring resistance targeting deep core stabilization, spinal articulation, and posture.',
  },
  {
    id: 'c3', title: 'Tibetan Sound Bath & Meditation', category: 'Meditation', duration: '45 min', intensity: 'Gentle',
    time: '06:30 PM', location: 'Bandra Sanctuary', instructor: 'Dr. Meera Rao',
    instructorAvatar: image('photo-1573496359142-b8d87734a5a2', 200), price: 950, spotsLeft: 3,
    imageUrl: image('photo-1512290900672-1f4961817730'),
    description: 'Acoustic healing using handmade bronze Himalayan bowls, therapeutic gongs, and somatic breathing.',
  },
  {
    id: 'c4', title: 'High-Energy Zumba & Barre', category: 'Dance', duration: '55 min', intensity: 'High Energy',
    time: '05:30 PM', location: 'Indiranagar Sanctuary', instructor: 'Priya Kapoor',
    instructorAvatar: image('photo-1544005313-94ddf0286df2', 200), price: 750, spotsLeft: 4,
    imageUrl: image('photo-1518310383802-640c2de311b2'),
    description: 'Exhilarating blend of ballet barre isometric conditioning and energetic Latin dance rhythms.',
  },
  {
    id: 'c5', title: 'Ashtanga Primary Immersion', category: 'Yoga', duration: '75 min', intensity: 'Advanced',
    time: '06:30 AM', location: 'Bandra Sanctuary', instructor: 'Vikram Das',
    instructorAvatar: image('photo-1500648767791-00dcc994a43e', 200), price: 900, spotsLeft: 2,
    imageUrl: image('photo-1575052814086-f385e2e2ad1b'),
    description: 'Traditional Mysore-style practice exploring bandhas, dhyana, and sustained breath discipline.',
  },
  {
    id: 'c6', title: 'Restorative Yin & Nidra', category: 'Meditation', duration: '60 min', intensity: 'Gentle',
    time: '07:30 PM', location: 'Indiranagar Sanctuary', instructor: 'Kavita Patel',
    instructorAvatar: image('photo-1580489944761-15a19d654956', 200), price: 800, spotsLeft: 1,
    imageUrl: image('photo-1508215885820-4523e431397b'),
    description: 'Passive postures supported with bolsters for deep fascial relaxation, ending with yogic sleep.',
  },
  {
    id: 'c7', title: 'Functional Fitness Circuit', category: 'Fitness', duration: '45 min', intensity: 'High Energy',
    time: '06:00 PM', location: 'Indiranagar Sanctuary', instructor: 'Arjun Nair',
    instructorAvatar: image('photo-1560250097-0b93528c311a', 200), price: 700, spotsLeft: 6,
    imageUrl: image('photo-1534438327276-14e5300c3a48'),
    description: 'Coach-led strength, mobility, and conditioning intervals designed for practical everyday fitness.',
  },
];

export const B2C_WORKSHOPS: B2CWorkshop[] = [
  {
    id: 'w1', title: 'Weekend Pranayama & Breathwork Immersion', category: 'Breathwork', date: 'Oct 12, 2026',
    time: '09:00 AM - 01:00 PM', location: 'Indiranagar Sanctuary', instructor: 'Ananya Sharma', price: 1999, spotsLeft: 8,
    imageUrl: image('photo-1545389336-cf090694435e'), description: 'Somatic breathwork, vagus nerve stimulation, and guided restorative integration.',
  },
  {
    id: 'w2', title: 'Full Moon Tibetan Gong Bath', category: 'Meditation', date: 'Oct 18, 2026',
    time: '07:00 PM - 09:00 PM', location: 'Bandra Sanctuary', instructor: 'Dr. Meera Rao', price: 1499, spotsLeft: 6,
    imageUrl: image('photo-1512290900672-1f4961817730'), description: 'Symphonic gongs and quartz crystal singing bowls for a restorative evening practice.',
  },
  {
    id: 'w3', title: 'Inversions & Arm Balances Masterclass', category: 'Yoga', date: 'Oct 27, 2026',
    time: '10:00 AM - 01:00 PM', location: 'Indiranagar Sanctuary', instructor: 'Vikram Das', price: 2499, spotsLeft: 5,
    imageUrl: image('photo-1538805060514-97d9cc17730c'), description: 'Anatomical drills, shoulder mobility, and safe progressions for Pincha and handstands.',
  },
  {
    id: 'w4', title: 'Rhythm & Movement Dance Workshop', category: 'Dance', date: 'Nov 2, 2026',
    time: '04:00 PM - 06:30 PM', location: 'Indiranagar Sanctuary', instructor: 'Priya Kapoor', price: 1799, spotsLeft: 10,
    imageUrl: image('photo-1518611012118-696072aa579a'), description: 'A joyful workshop blending Latin rhythm, expressive movement, and accessible choreography.',
  },
  {
    id: 'w5', title: 'Guided Meditation & Yoga Nidra', category: 'Meditation', date: 'Nov 9, 2026',
    time: '06:00 PM - 08:00 PM', location: 'Bandra Sanctuary', instructor: 'Kavita Patel', price: 1299, spotsLeft: 12,
    imageUrl: image('photo-1506126613408-eca07ce68773'), description: 'Breath-led meditation, body scanning, and Yoga Nidra for deep nervous-system rest.',
  },
];

export const B2C_CATEGORIES = ['All', 'Yoga', 'Pilates', 'Meditation', 'Dance', 'Fitness', 'Breathwork'] as const;
