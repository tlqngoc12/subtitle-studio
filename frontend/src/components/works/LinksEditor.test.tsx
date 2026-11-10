import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useRef, useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FieldError } from '../../api/client';
import { LinksEditor, type LinkRow } from './LinksEditor';

function Harness({ initial = [], errors = [], onRows }: { initial?: LinkRow[]; errors?: FieldError[]; onRows?: (r: LinkRow[]) => void }) {
  const [rows, setRows] = useState<LinkRow[]>(initial);
  const key = useRef(100);
  onRows?.(rows);
  return <LinksEditor value={rows} onChange={setRows} errors={errors} newKey={() => key.current++} />;
}

const ROW = (key: number, label: string, url = ''): LinkRow => ({ key, kind: 'OTHER', label, url, icon: '' });

describe('LinksEditor', () => {
  it('quick-add buttons add a link and disable once that kind exists', async () => {
    render(<Harness />);
    const pilot = screen.getByRole('button', { name: 'Pilot' });
    expect(pilot).toBeEnabled();

    await userEvent.click(pilot);

    expect(screen.getByLabelText('Label 1')).toHaveValue('Pilot');
    expect(screen.getByRole('button', { name: 'Pilot' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Trailer' })).toBeEnabled();
  });

  it('+ Link can be used any number of times', async () => {
    render(<Harness />);

    await userEvent.click(screen.getByRole('button', { name: 'Link' }));
    await userEvent.click(screen.getByRole('button', { name: 'Link' }));

    expect(screen.getAllByLabelText(/^Label \d$/)).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Link' })).toBeEnabled();
  });

  it('shows the detected icon next to the URL and removes a row', async () => {
    const { container } = render(<Harness initial={[ROW(1, 'Trailer', 'https://youtu.be/dQw4w9WgXcQ'), ROW(2, 'Other')]} />);

    expect(container.querySelector('svg[data-platform="youtube"]')).not.toBeNull();
    await userEvent.click(screen.getByRole('button', { name: 'Remove link 1' }));

    expect(screen.getAllByLabelText(/^Label \d$/)).toHaveLength(1);
    expect(screen.getByLabelText('Label 1')).toHaveValue('Other');
  });

  it('shows a server error under the matching row', () => {
    render(
      <Harness
        initial={[ROW(1, 'A', 'https://a.example'), ROW(2, 'B', 'javascript:x')]}
        errors={[{ field: 'links[1].url', message: 'Links must start with http:// or https://' }]}
      />,
    );

    expect(screen.getByLabelText('URL 2')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('URL 1')).not.toHaveAttribute('aria-invalid');
    expect(screen.getByText('Links must start with http:// or https://')).toBeInTheDocument();
  });

  describe('drag and drop', () => {
    let spy: ReturnType<typeof vi.spyOn>;
    beforeEach(() => {
      spy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
        const li = this.closest('li');
        const index = li?.parentElement ? Array.from(li.parentElement.children).indexOf(li) : 0;
        const top = index * 120;
        return { x: 0, y: top, top, left: 0, right: 600, bottom: top + 100, width: 600, height: 100, toJSON() {} } as DOMRect;
      });
    });
    afterEach(() => spy.mockRestore());

    it('reorders with the keyboard (Space, ArrowDown, Space)', async () => {
      let latest: LinkRow[] = [];
      render(<Harness initial={[ROW(1, 'First'), ROW(2, 'Second')]} onRows={(r) => (latest = r)} />);
      const handle = screen.getByRole('button', { name: 'Drag to reorder: link 1' });

      const tick = () => act(() => new Promise((r) => setTimeout(r, 0)));
      handle.focus();
      fireEvent.keyDown(handle, { key: ' ', code: 'Space' });
      await tick();
      fireEvent.keyDown(document.activeElement ?? handle, { key: 'ArrowDown', code: 'ArrowDown' });
      await tick();
      fireEvent.keyDown(document.activeElement ?? handle, { key: ' ', code: 'Space' });

      await waitFor(() => expect(latest.map((r) => r.label)).toEqual(['Second', 'First']));
    });
  });
});
