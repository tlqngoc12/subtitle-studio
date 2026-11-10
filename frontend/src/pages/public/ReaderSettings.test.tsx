import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { ReaderSettingsPanel, ReaderSettingsSheet } from './ReaderSettings';
import type { ReaderSize, ReaderTheme } from './readerPrefs';

function Harness({ onTheme = vi.fn(), onSize = vi.fn() }) {
  const [theme, setTheme] = useState<ReaderTheme>('sepia');
  const [size, setSize] = useState<ReaderSize>(1);
  return (
    <ReaderSettingsPanel
      theme={theme}
      onTheme={(t) => {
        setTheme(t);
        onTheme(t);
      }}
      size={size}
      onSize={(s) => {
        setSize(s);
        onSize(s);
      }}
    />
  );
}

describe('ReaderSettingsPanel', () => {
  it('has the two radio groups with their labels', () => {
    render(<Harness />);
    const colors = screen.getByRole('radiogroup', { name: 'Màu nền' });
    expect(colors.querySelectorAll('input[type=radio]')).toHaveLength(4);
    for (const n of ['Sáng', 'Giấy', 'Tối', 'Đen OLED']) {
      expect(screen.getByRole('radio', { name: n })).toBeInTheDocument();
    }
    expect(screen.getByRole('radio', { name: 'Giấy' })).toBeChecked();
    expect(screen.getByRole('radiogroup', { name: 'Cỡ chữ' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Chữ vừa' })).toBeChecked();
  });

  it('picking Tối calls onTheme(dark) and marks it checked', async () => {
    const onTheme = vi.fn();
    render(<Harness onTheme={onTheme} />);
    await userEvent.setup().click(screen.getByRole('radio', { name: 'Tối' }));
    expect(onTheme).toHaveBeenCalledWith('dark');
    expect(screen.getByRole('radio', { name: 'Tối' })).toBeChecked();
  });

  it('arrow keys move between swatches', async () => {
    const onTheme = vi.fn();
    const user = userEvent.setup();
    render(<Harness onTheme={onTheme} />);
    screen.getByRole('radio', { name: 'Giấy' }).focus();
    await user.keyboard('{ArrowRight}');
    expect(onTheme).toHaveBeenLastCalledWith('dark');
    expect(screen.getByRole('radio', { name: 'Tối' })).toHaveFocus();
    await user.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(onTheme).toHaveBeenLastCalledWith('light');
  });

  it('Chữ lớn calls onSize(2)', async () => {
    const onSize = vi.fn();
    render(<Harness onSize={onSize} />);
    await userEvent.setup().click(screen.getByRole('radio', { name: 'Chữ lớn' }));
    expect(onSize).toHaveBeenCalledWith(2);
  });
});

describe('ReaderSettingsSheet', () => {
  it('is a titled dialog with the panel inside', () => {
    render(
      <ReaderSettingsSheet open onOpenChange={() => {}} theme="dark" onTheme={() => {}} size={0} onSize={() => {}} />,
    );
    const dialog = screen.getByRole('dialog', { name: 'Hiển thị' });
    expect(dialog).toHaveClass('sheet');
    expect(dialog).toHaveAttribute('data-own-keys');
    expect(screen.getByRole('radio', { name: 'Tối' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Chữ nhỏ' })).toBeChecked();
  });
});
