import { Navigate, Route, Routes } from 'react-router-dom';
import { useApp } from './lib/app.tsx';
import { Loading } from './components/ui.tsx';
import Shell from './components/Shell.tsx';
import Login from './pages/Login.tsx';
import Dashboard from './pages/Dashboard.tsx';
import Cases from './pages/Cases.tsx';
import CaseWorkspace from './pages/CaseWorkspace.tsx';
import DocumentView from './pages/DocumentView.tsx';
import Search from './pages/Search.tsx';
import Audit from './pages/Audit.tsx';
import Ledger from './pages/Ledger.tsx';
import WomenSafety from './pages/WomenSafety.tsx';
import Compliance from './pages/Compliance.tsx';
import PolicyConsole from './pages/PolicyConsole.tsx';
import Verifier from './pages/Verifier.tsx';
import CitizenPortal from './pages/CitizenPortal.tsx';
import Accessibility from './pages/Accessibility.tsx';

export default function App() {
  const { user, loading } = useApp();

  return (
    <Routes>
      {/* Unauthenticated surfaces: they prove things are true without revealing what they say. */}
      <Route path="/verify" element={<Verifier />} />
      <Route path="/citizen" element={<CitizenPortal />} />
      {/* Statutory pages a GoI site must publish, reachable without a session. */}
      <Route path="/accessibility" element={<Accessibility />} />
      <Route
        path="*"
        element={
          loading ? <Loading what="Restoring session" />
          : !user ? <Login />
          : (
            <Shell>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/cases" element={<Cases />} />
                <Route path="/cases/:caseId" element={<CaseWorkspace />} />
                <Route path="/documents/:documentId" element={<DocumentView />} />
                <Route path="/search" element={<Search />} />
                <Route path="/audit" element={<Audit />} />
                <Route path="/ledger" element={<Ledger />} />
                <Route path="/women-safety" element={<WomenSafety />} />
                <Route path="/compliance" element={<Compliance />} />
                <Route path="/policy" element={<PolicyConsole />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </Shell>
          )
        }
      />
    </Routes>
  );
}
