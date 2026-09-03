import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.ts';
import { Card, Chip, Loading, Empty, Banner } from '../components/ui.tsx';
import { when, sensitivity } from '../lib/format.ts';

type CaseRow = {
  id: string; caseNumber: string; title: string; station: string; district: string;
  sections: string[]; offenceCategory: string; sensitivity: number; sensitiveMode: boolean;
  status: string; registeredAt: string; victimPseudonym: string | null;
};

export default function Cases() {
  const [data, setData] = useState<{ cases: CaseRow[]; total: number; visible: number } | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => { api.get<typeof data>('/cases').then(setData).catch(() => undefined); }, []);
  if (!data) return <Loading what="Loading cases" />;

  const hidden = data.total - data.visible;
  const rows = data.cases.filter((row) =>
    !query || `${row.caseNumber} ${row.title} ${row.sections.join(' ')}`.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="stack">
      <div className="spread">
        <div>
          <h1>Cases</h1>
          <div className="muted small">{data.visible} visible to you of {data.total} registered</div>
        </div>
        <input placeholder="Filter by number, title or section…" value={query}
               onChange={(e) => setQuery(e.target.value)} style={{ maxWidth: 320 }} />
      </div>

      {hidden > 0 && (
        <Banner tone="info" title={`${hidden} case${hidden > 1 ? 's are' : ' is'} not listed for you`}>
          The case list is filtered through the same policy engine as a direct read. A case you may not see
          does not appear — and does not appear as a "restricted" row either, because the existence of a
          sealed matter can itself be sensitive.
        </Banner>
      )}

      <Card tight>
        {rows.length === 0 ? <Empty>No cases match.</Empty> : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Case</th><th>Sections</th><th>Station</th><th>Classification</th>
                  <th>Complainant</th><th>Registered</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const level = sensitivity(row.sensitivity);
                  return (
                    <tr key={row.id}>
                      <td>
                        <Link to={`/cases/${row.id}`} style={{ fontWeight: 600 }}>{row.caseNumber}</Link>
                        <div className="small muted">{row.title}</div>
                      </td>
                      <td className="small">{row.sections.join(', ')}</td>
                      <td className="small">{row.station}<div className="tiny muted">{row.district}</div></td>
                      <td>
                        <div className="row" style={{ gap: 5 }}>
                          <Chip tone={level.chip}>L{row.sensitivity} {level.label}</Chip>
                          {row.sensitiveMode && <Chip tone="warn">Women Safety</Chip>}
                        </div>
                      </td>
                      <td>
                        {row.victimPseudonym
                          ? <span className="mono small" title="Identity held in the vault; never in a working document">{row.victimPseudonym}</span>
                          : <span className="muted small">—</span>}
                      </td>
                      <td className="small">{when(row.registeredAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
