import { useEffect, useState } from 'react';
import { useApp } from '../lib/app.tsx';
import { api } from '../lib/api.ts';
import { initials } from '../lib/format.ts';
import { Banner } from '../components/ui.tsx';

type Persona = {
  username: string; fullName: string; designation: string; role: string;
  district: string; station: string | null; rankLevel: number;
  isWomanOfficer: boolean; clearanceLevel: number;
};

export default function Login() {
  const { signIn, toast } = useApp();
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('pramana');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.get<{ personas: Persona[] }>('/auth/personas')
      .then((r) => { setPersonas(r.personas); setUsername(r.personas[0]?.username ?? ''); })
      .catch(() => setError('The API is not reachable. Start it with `npm run dev:api`.'));
  }, []);

  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    setBusy(true); setError(null);
    try {
      await signIn(username, password);
      toast('ok', 'Signed in', 'Session token issued. Production authenticates with a Class 3 DSC token.');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="public">
      <div className="shell" style={{ maxWidth: 920 }}>
        <div className="mast">
          <div className="name">PRAMANA</div>
          <div className="sub">
            प्रमाण — <em>proof, the valid means of knowledge</em><br />
            Secure evidence and document platform for the criminal justice system
          </div>
        </div>

        <div className="grid split">
          <div className="card">
            <header><h3>Choose a role</h3><div className="spacer" />
              <span className="small muted">{personas.length} personas</span>
            </header>
            <div className="body stack" style={{ gap: 7, maxHeight: 430, overflowY: 'auto' }}>
              {personas.map((persona) => (
                <button
                  key={persona.username}
                  className={`persona${persona.username === username ? ' on' : ''}`}
                  onClick={() => setUsername(persona.username)}
                >
                  <span className="av">{initials(persona.fullName)}</span>
                  <span style={{ minWidth: 0, flex: 1 }}>
                    <span className="n">{persona.fullName}</span>
                    <span className="d" style={{ display: 'block' }}>
                      {persona.designation} · {persona.station ?? persona.district}
                    </span>
                  </span>
                  <span className="row" style={{ gap: 4 }}>
                    {persona.isWomanOfficer && <span className="chip a" title="Woman police officer — required for certain statement classes">W</span>}
                    <span className="chip n" title="Maximum sensitivity level readable">L{persona.clearanceLevel}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="stack">
            <form className="card" onSubmit={submit}>
              <header><h3>Sign in</h3></header>
              <div className="body">
                <div className="field">
                  <label htmlFor="u">Username</label>
                  <input id="u" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
                </div>
                <div className="field">
                  <label htmlFor="p">Password</label>
                  <input id="p" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
                </div>
                {error && <div style={{ marginBottom: 12 }}><Banner tone="danger" title="Sign-in failed">{error}</Banner></div>}
                <button className="primary" type="submit" disabled={busy || !username} style={{ width: '100%', justifyContent: 'center' }}>
                  {busy ? 'Signing in…' : 'Sign in'}
                </button>
                <div className="tiny muted" style={{ marginTop: 10, lineHeight: 1.55 }}>
                  Every demonstration account uses the password <code>pramana</code>.
                  Production authenticates with the Class&nbsp;3 DSC token officers already carry,
                  Aadhaar eSign, or a FIDO2 key — never a shared password.
                </div>
              </div>
            </form>

            <Banner tone="info" title="Why the role you pick matters">
              Access is computed from attributes — rank, jurisdiction, explicit case assignment,
              document sensitivity and stated purpose — not from a role name. Sign in as an
              unassigned Superintendent and a Women Safety case stays shut.
            </Banner>

            <div className="row" style={{ gap: 8 }}>
              <a className="btn" href="/verify" target="_blank" rel="noreferrer">Public verifier →</a>
              <a className="btn" href="/citizen" target="_blank" rel="noreferrer">Citizen portal →</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
