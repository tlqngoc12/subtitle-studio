/** Small stroke icons (24x24, currentColor). Decorative: the button around them carries the label. */
function Icon({ d }: { d: string }) {
  return (
    <svg className="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path d={d} />
    </svg>
  );
}

export const PlayIcon = () => <Icon d="M8 5.5v13l10.5-6.5z" />;
export const DownloadIcon = () => <Icon d="M12 4v11m0 0-4.5-4.5M12 15l4.5-4.5M5 19.5h14" />;
export const RefreshIcon = () => <Icon d="M20 11a8 8 0 1 0-2.3 5.7M20 4.5V11h-6.5" />;
export const TrashIcon = () => <Icon d="M4.5 7h15M10 11v6m4-6v6M6.5 7l1 12.5h9l1-12.5M9.5 7V4.5h5V7" />;
