import { ALargeSmall, ChevronLeft, ChevronRight, List } from "lucide-react";
import { IconButton, IconLink } from "../../components/ui/IconButton";
import "./ReaderBottomBar.css";

interface Props {
  slug: string;
  prev: number | null;
  next: number | null;
  /** 0..1 position in the chapter. */
  progress: number;
  onSeek: (p: number) => void;
  onToc: () => void;
  onSettings: () => void;
  hidden: boolean;
  /** 1-based place of this chapter among the novel's chapters; null while the novel is not loaded. */
  position: { index: number; total: number } | null;
}

/** The thumb-zone bar of the mobile reader: previous, contents, position slider, display settings, next. */
export function ReaderBottomBar({ slug, prev, next, progress, onSeek, onToc, onSettings, hidden, position }: Props) {
  const step = (no: number | null, label: string, Icon: typeof ChevronLeft) =>
    no !== null ? (
      <IconLink label={label} icon={Icon} to={`/novels/${slug}/${no}`} />
    ) : (
      <IconButton label={label} icon={Icon} disabled />
    );

  return (
    <div className="reader-bottom" data-hidden={hidden ? "" : undefined}>
      <div className="reader-bottom__row">
        {step(prev, "Chương trước", ChevronLeft)}
        <IconButton label="Mục lục" icon={List} onClick={onToc} />
        <div className="reader-bottom__seek">
          <input
            type="range"
            min={0}
            max={1000}
            step={1}
            value={Math.round(progress * 1000)}
            onChange={(e) => onSeek(Number(e.target.value) / 1000)}
            aria-label="Vị trí trong chương"
          />
          {position && (
            <span className="reader-bottom__pos">
              {position.index}/{position.total}
            </span>
          )}
        </div>
        <IconButton label="Hiển thị" icon={ALargeSmall} onClick={onSettings} />
        {step(next, "Chương sau", ChevronRight)}
      </div>
    </div>
  );
}
