import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useId, type RefObject } from "react";
import { IconButton } from "../../components/ui/IconButton";
import { OWN_KEYS } from "./readerKeys";
import { READER_THEMES, type ReaderSize, type ReaderTheme } from "./readerPrefs";
import "./ReaderSettings.css";

interface PanelProps {
  theme: ReaderTheme;
  onTheme: (theme: ReaderTheme) => void;
  size: ReaderSize;
  onSize: (size: ReaderSize) => void;
}

/** Paper colour, ink colour and label of each reader theme (the swatch shows "Aa" in the ink on the paper). */
const SWATCHES: Record<ReaderTheme, { paper: string; ink: string; label: string }> = {
  light: { paper: "#FAF8F5", ink: "#1E1E1D", label: "Sáng" },
  sepia: { paper: "#F4ECD8", ink: "#25231F", label: "Giấy" },
  dark: { paper: "#16121B", ink: "#E3E3E4", label: "Tối" },
  oled: { paper: "#000000", ink: "#B8B8B8", label: "Đen OLED" },
};

const SIZES: { value: ReaderSize; label: string }[] = [
  { value: 0, label: "Chữ nhỏ" },
  { value: 1, label: "Chữ vừa" },
  { value: 2, label: "Chữ lớn" },
];

/**
 * The reader display settings: paper theme and text size. Both groups are native radio inputs hidden inside
 * labels, so the keyboard (arrows) and the accessibility tree come for free.
 */
export function ReaderSettingsPanel({ theme, onTheme, size, onSize }: PanelProps) {
  const id = useId();
  return (
    <div className="reader-settings-panel">
      <div role="radiogroup" aria-label="Màu nền" className="rs-group">
        <span className="rs-group__label" aria-hidden="true">Màu nền</span>
        <div className="rs-row">
          {READER_THEMES.map((t) => (
            <label key={t} className="rs-swatch">
              <input
                type="radio"
                name={`${id}-theme`}
                className="rs-input"
                checked={theme === t}
                aria-label={SWATCHES[t].label}
                onChange={() => onTheme(t)}
              />
              <span
                className="rs-swatch__disc"
                aria-hidden="true"
                style={{ background: SWATCHES[t].paper, color: SWATCHES[t].ink }}
              >
                Aa
              </span>
              <span className="rs-swatch__name" aria-hidden="true">{SWATCHES[t].label}</span>
            </label>
          ))}
        </div>
      </div>
      <div role="radiogroup" aria-label="Cỡ chữ" className="rs-group">
        <span className="rs-group__label" aria-hidden="true">Cỡ chữ</span>
        <div className="rs-row rs-row--sizes">
          {SIZES.map((s) => (
            <label key={s.value} className="rs-size">
              <input
                type="radio"
                name={`${id}-size`}
                className="rs-input"
                checked={size === s.value}
                aria-label={s.label}
                onChange={() => onSize(s.value)}
              />
              <span className={`rs-size__box rs-size__box--${s.value}`} aria-hidden="true">A</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

/** The same panel as a bottom sheet (Radix Dialog) for narrow screens. */
export function ReaderSettingsSheet({
  open,
  onOpenChange,
  restoreFocus,
  ...panel
}: PanelProps & {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The element that opened the sheet; focus goes back to it on close. */
  restoreFocus?: RefObject<HTMLElement | null>;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="sheet__overlay" />
        <Dialog.Content className="sheet" {...{ [OWN_KEYS]: "" }} 
          aria-describedby={undefined}
          onCloseAutoFocus={(e) => {
            if (!restoreFocus?.current) return;
            e.preventDefault();
            restoreFocus.current.focus();
          }}
        >
          <div className="sheet__head">
            <Dialog.Title className="sheet__title">Hiển thị</Dialog.Title>
            <Dialog.Close asChild>
              <IconButton label="Đóng" icon={X} />
            </Dialog.Close>
          </div>
          <ReaderSettingsPanel {...panel} />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
