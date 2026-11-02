import type { CueDto } from '../api/client';
import { formatTimecode } from '../lib/format';

export function CueTable({ cues }: { cues: CueDto[] }) {
  return (
    <div className="cues" tabIndex={0} aria-label="Xem trước phụ đề">
      <table>
        <thead>
          <tr>
            <th scope="col">Thời gian</th>
            <th scope="col">Câu</th>
          </tr>
        </thead>
        <tbody>
          {cues.map((cue) => (
            <tr key={cue.idx}>
              <td className="cues__time">
                <span>{formatTimecode(cue.startMs)}</span>
                <span className="cues__end">{formatTimecode(cue.endMs)}</span>
              </td>
              <td className="cues__text">{cue.text}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
