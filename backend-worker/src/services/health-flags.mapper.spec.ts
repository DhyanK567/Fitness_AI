import {
  mapHealthFlags,
  HEALTH_FLAG_COACHING_NOTES,
} from './health-flags.mapper';

describe('Health Flags Mapper (Task F5)', () => {
  it('should map first_time_member flag with standard coaching note', () => {
    const profile = {
      fullName: 'Priya Sharma',
      first_time_member: true,
    };

    const notes = mapHealthFlags(profile);

    expect(notes).toHaveLength(1);
    expect(notes[0]).toEqual({
      memberName: 'Priya Sharma',
      kind: 'FIRST_TIMER',
      text: HEALTH_FLAG_COACHING_NOTES.FIRST_TIMER,
    });
  });

  it('should map knee_injury flag with standard coaching note', () => {
    const profile = {
      fullName: 'Vikram Rao',
      knee_injury: true,
    };

    const notes = mapHealthFlags(profile);

    expect(notes).toHaveLength(1);
    expect(notes[0]).toEqual({
      memberName: 'Vikram Rao',
      kind: 'KNEE_INJURY',
      text: HEALTH_FLAG_COACHING_NOTES.KNEE_INJURY,
    });
  });

  it('should map lower_back_pain flag with standard coaching note', () => {
    const profile = {
      fullName: 'Rahul Mehta',
      lower_back_pain: true,
    };

    const notes = mapHealthFlags(profile);

    expect(notes).toHaveLength(1);
    expect(notes[0]).toEqual({
      memberName: 'Rahul Mehta',
      kind: 'LOWER_BACK',
      text: HEALTH_FLAG_COACHING_NOTES.LOWER_BACK,
    });
  });

  it('should map post_surgery flag with standard coaching note', () => {
    const profile = {
      fullName: 'Ananya Sen',
      post_surgery: true,
    };

    const notes = mapHealthFlags(profile);

    expect(notes).toHaveLength(1);
    expect(notes[0]).toEqual({
      memberName: 'Ananya Sen',
      kind: 'POST_SURGERY',
      text: HEALTH_FLAG_COACHING_NOTES.POST_SURGERY,
    });
  });

  it('should map camelCase Prisma model fields (firstTimeMember, kneeInjury, lowerBackPain, postSurgery)', () => {
    const profile = {
      fullName: 'Kiran Patel',
      firstTimeMember: true,
      kneeInjury: false,
      lowerBackPain: true,
      postSurgery: false,
    };

    const notes = mapHealthFlags(profile);

    expect(notes).toHaveLength(2);
    expect(notes[0].kind).toBe('FIRST_TIMER');
    expect(notes[1].kind).toBe('LOWER_BACK');
  });

  it('should support multiple health flags on a single member', () => {
    const profile = {
      fullName: 'Deepa Patel',
      first_time_member: true,
      knee_injury: true,
      lower_back_pain: true,
      post_surgery: true,
    };

    const notes = mapHealthFlags(profile);

    expect(notes).toHaveLength(4);
    expect(notes.map((n) => n.kind)).toEqual([
      'FIRST_TIMER',
      'KNEE_INJURY',
      'LOWER_BACK',
      'POST_SURGERY',
    ]);
    expect(notes.every((n) => n.memberName === 'Deepa Patel')).toBe(true);
  });

  it('should preserve tri-state semantics and skip false, null, and undefined flags', () => {
    const profile = {
      fullName: 'Arjun Kapoor',
      first_time_member: false,
      knee_injury: null,
      lower_back_pain: undefined,
      post_surgery: false,
    };

    const notes = mapHealthFlags(profile);

    expect(notes).toHaveLength(0);
  });

  it('should safely handle null, undefined, or empty object profile inputs', () => {
    expect(mapHealthFlags(null)).toEqual([]);
    expect(mapHealthFlags(undefined)).toEqual([]);
    expect(mapHealthFlags({})).toEqual([]);
  });

  it('should fall back to default member name "Member" when name is missing', () => {
    const profile = {
      knee_injury: true,
    };

    const notes = mapHealthFlags(profile);

    expect(notes).toHaveLength(1);
    expect(notes[0].memberName).toBe('Member');
  });
});
