import { createRoot } from 'react-dom/client';
import './styles/globals.css';                 // Tailwind + Untitled UI theme first, so the dashboard's own CSS wins conflicts
import './ui/tokens.css'; import './ui/app.css';
import { AppRoot } from './app/AppRoot';

createRoot(document.getElementById('root')!).render(<AppRoot />);
