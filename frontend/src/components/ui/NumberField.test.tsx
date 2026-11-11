import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it } from 'vitest';
import { NumberField } from './NumberField';

function Harness({ initial }: { initial: number | null }) {
  const [value, setValue] = useState<number | null>(initial);
  return (
    <>
      <label htmlFor="n">Count</label>
      <NumberField id="n" value={value} onChange={setValue} min={1} max={99} />
      <output aria-label="value">{value === null ? 'null' : value}</output>
    </>
  );
}

describe('NumberField', () => {
  it('+ from empty goes to the minimum, then steps up and down within the range', async () => {
    const user = userEvent.setup();
    render(<Harness initial={null} />);
    await user.click(screen.getByRole('button', { name: 'Increase' }));
    expect(screen.getByLabelText('value')).toHaveTextContent('1');
    await user.click(screen.getByRole('button', { name: 'Increase' }));
    expect(screen.getByLabelText('value')).toHaveTextContent('2');
    await user.click(screen.getByRole('button', { name: 'Decrease' }));
    await user.click(screen.getByRole('button', { name: 'Decrease' }));
    expect(screen.getByLabelText('value')).toHaveTextContent('1');
    expect(screen.getByRole('button', { name: 'Decrease' })).toBeDisabled();
  });

  it('clamps a typed value on blur', async () => {
    const user = userEvent.setup();
    render(<Harness initial={3} />);
    const input = screen.getByLabelText('Count');
    await user.clear(input);
    await user.type(input, '150');
    await user.tab();
    expect(screen.getByLabelText('value')).toHaveTextContent('99');
    expect(input).toHaveValue('99');
  });

  it('empty means null', async () => {
    const user = userEvent.setup();
    render(<Harness initial={5} />);
    await user.clear(screen.getByLabelText('Count'));
    expect(screen.getByLabelText('value')).toHaveTextContent('null');
  });

  it('ignores non-digits', async () => {
    const user = userEvent.setup();
    render(<Harness initial={null} />);
    await user.type(screen.getByLabelText('Count'), 'a1b2');
    expect(screen.getByLabelText('Count')).toHaveValue('12');
  });
});
