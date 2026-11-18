import { beforeEach, describe, expect, it } from 'vitest';
import { defaultSettings } from '../src/domain/settings';
import { useStore } from '../src/state/store';

const cats = () => useStore.getState().settings.cats;

describe('adding categories under income or spending', () => {
  beforeEach(() => useStore.setState({ settings: defaultSettings(), months: {} }));

  it('adds a spending category, before Uncategorised', () => {
    const id = useStore.getState().addCategory('School fees', 'exp')!;
    const list = cats().filter(c => c.type === 'exp');
    expect(list.find(c => c.id === id)).toMatchObject({ name: 'School fees', type: 'exp' });
    expect(list[list.length - 1].id).toBe('other');
    expect(list[list.length - 2].id).toBe(id);
  });

  it('adds an income category at the end of the income group', () => {
    const id = useStore.getState().addCategory('  Side   hustle ', 'inc')!;
    const types = cats().map(c => c.type);
    const i = cats().findIndex(c => c.id === id);
    expect(cats()[i]).toMatchObject({ name: 'Side hustle', type: 'inc' });
    expect(types.lastIndexOf('inc')).toBe(i);
  });

  it('reuses an existing category with the same name and type', () => {
    const a = useStore.getState().addCategory('Side hustle', 'inc');
    const n = cats().length;
    expect(useStore.getState().addCategory('side HUSTLE', 'inc')).toBe(a);
    expect(cats().length).toBe(n);
  });

  it('allows the same name under the other type', () => {
    const a = useStore.getState().addCategory('Tutoring', 'inc');
    const b = useStore.getState().addCategory('Tutoring', 'exp');
    expect(a).not.toBe(b);
  });

  it('ignores an empty name', () => expect(useStore.getState().addCategory('   ', 'exp')).toBeNull());
});
