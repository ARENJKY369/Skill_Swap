import { useNavigate, useSearchParams } from 'react-router-dom';
import TitleBar from '../components/TitleBar';
import LegalModal from '../components/LegalModal';

/** Standalone /legal route — renders the same modal content outside the app shell. */
export default function LegalPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const tab = (params.get('tab') as 'privacy' | 'terms' | 'cookies' | null) ?? 'privacy';
  return (
    <div className="h-full flex flex-col bg-canvas">
      <TitleBar context="Legal" />
      <div className="flex-1 flex items-start justify-center pt-6">
        <LegalModal tab={tab} onClose={() => navigate('/login')} />
      </div>
    </div>
  );
}
