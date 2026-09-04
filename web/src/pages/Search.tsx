import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api.ts';
import { useApp } from '../lib/app.tsx';
import { Card, Chip, Banner, Empty, Loading } from '../components/ui.tsx';

type Hit = {
  documentId: string; caseId: string; caseNumber: string; caseTitle: string; title: string;
  snippet: string; lexicalRank: number | null; semanticRank: number | null; score: number;
  matchedVia: string[]; docType: string; language: string; sensitiveMode: boolean;
};
type Result = { query: string; hits: Hit[]; totalMatched: number; withheldByPolicy: number; model: string; note: string };

const SUGGESTIONS = [
  'witness saw a maroon vehicle near the school',
  'medical examination of the victim',
  'गवाह का बयान',
  'मैरून गाड़ी विद्यालय के पास',
  'forensic examination sealed exhibits',
];

export default function Search() {
  const { purpose } = useApp();
  const [query, setQuery] = useState('');
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [links, setLinks] = useState<{ type: string; value: string; caseCount: number;
    cases: { id: string; caseNumber: string; title: string; district: string }[] }[] | null>(null);

  const run = async (term: string) => {
    setQuery(term);
    if (!term.trim()) { setResult(null); return; }
    setBusy(true);
    try {
      setResult(await api.get<Result>(`/search?q=${encodeURIComponent(term)}&purpose=${purpose}`));
    } finally { setBusy(false); }
  };

  return (
    <div className="stack">
      <div>
        <h1>Search</h1>
        <div className="muted small">
          Keyword and semantic retrieval, fused. Query in English and reach documents written in Hindi.
        </div>
      </div>

      <Card>
        <form onSubmit={(e) => { e.preventDefault(); run(query); }}>
          <div className="row" style={{ flexWrap: 'nowrap' }}>
            <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)}
                   placeholder="Describe what you are looking for, in English or Hindi…" />
            <button className="primary" type="submit" disabled={busy}>{busy ? 'Searching…' : 'Search'}</button>
          </div>
        </form>
        <div className="row" style={{ gap: 6, marginTop: 11 }}>
          <span className="tiny muted">Try:</span>
          {SUGGESTIONS.map((suggestion) => (
            <button key={suggestion} className="sm ghost" style={{ border: '1px solid var(--line)' }}
                    onClick={() => run(suggestion)}>{suggestion}</button>
          ))}
        </div>
      </Card>

      {busy && <Loading what="Searching" />}

      {result && !busy && (
        <>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div className="small muted">
              {result.hits.length} result{result.hits.length === 1 ? '' : 's'}
              {result.withheldByPolicy > 0 && ` · ${result.withheldByPolicy} withheld by access policy`}
            </div>
            <div className="tiny mono muted">{result.model}</div>
          </div>

          {result.withheldByPolicy > 0 && (
            <Banner tone="info" title={`${result.withheldByPolicy} matching documents are not shown to you`}>
              The index respects the policy engine. A document you may not see does not appear - and does
              not appear as a "restricted result" either, because the existence of a sealed document can
              itself be sensitive. This query has been written to the audit trail.
            </Banner>
          )}

          {result.hits.length === 0 ? <Empty>Nothing matched, or nothing you are permitted to see.</Empty> : (
            <div className="stack" style={{ gap: 10 }}>
              {result.hits.map((hit) => (
                <div className="card" key={hit.documentId}>
                  <div className="body">
                    <div className="spread" style={{ alignItems: 'flex-start' }}>
                      <div style={{ minWidth: 0 }}>
                        <Link to={`/documents/${hit.documentId}`} style={{ fontWeight: 650 }}>{hit.title}</Link>
                        <div className="tiny muted">
                          <Link to={`/cases/${hit.caseId}`}>{hit.caseNumber}</Link>
                          {' · '}{hit.docType.replace(/_/g, ' ')}
                        </div>
                      </div>
                      <div className="row" style={{ gap: 5 }}>
                        <Chip tone={hit.language === 'hi' ? 'warn' : 'n'}>
                          {hit.language === 'hi' ? 'हिन्दी' : hit.language}
                        </Chip>
                        {hit.matchedVia.includes('keyword') && <Chip tone="a">keyword</Chip>}
                        {hit.matchedVia.includes('semantic') && <Chip tone="ok">semantic</Chip>}
                      </div>
                    </div>
                    <div className="small" style={{ marginTop: 9, lineHeight: 1.65 }}
                         dangerouslySetInnerHTML={{ __html: hit.snippet }} />
                    <div className="tiny muted" style={{ marginTop: 7 }}>
                      fused score {hit.score.toFixed(4)}
                      {hit.lexicalRank && ` · BM25 #${hit.lexicalRank}`}
                      {hit.semanticRank && ` · vector #${hit.semanticRank}`}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <Card
        title="Cross-case link analysis"
        sub="The same identifier surfacing in otherwise unconnected cases - NCRB's national pattern-detection mandate"
        actions={<button className="sm" onClick={() => api.get<{ links: NonNullable<typeof links> }>('/cases/links/cross-case').then((r) => setLinks(r.links))}>
          Run analysis
        </button>}
      >
        {!links ? <div className="small muted">Resolves phone numbers, vehicles, accounts and email addresses across every case you can see.</div>
          : links.length === 0 ? <Empty>No identifier appears in more than one case.</Empty> : (
            <div className="stack" style={{ gap: 12 }}>
              {links.map((link) => (
                <div key={`${link.type}-${link.value}`}>
                  <div className="row" style={{ gap: 7 }}>
                    <Chip tone="warn">{link.type}</Chip>
                    <span className="mono" style={{ fontWeight: 650 }}>{link.value}</span>
                    <span className="tiny muted">appears in {link.caseCount} cases</span>
                  </div>
                  <div className="row" style={{ gap: 6, marginTop: 6 }}>
                    {link.cases.map((linked) => (
                      <Link key={linked.id} className="btn sm" to={`/cases/${linked.id}`}>
                        {linked.caseNumber} <span className="muted">· {linked.district}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
      </Card>
    </div>
  );
}
