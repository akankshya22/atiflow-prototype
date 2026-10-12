import { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { useAuth } from '@/features/auth/authStore';
import { LoginPage } from '@/features/auth/LoginPage';
import { LiveFloorPage } from '@/features/live-floor/LiveFloorPage';
import { DeviceDetailPage } from '@/features/devices/DeviceDetailPage';
import { DeviceListPage } from '@/features/devices/DeviceListPage';
import { MapsPage } from '@/features/maps/MapsPage';
import { FleetPage } from '@/features/fleets/FleetPage';
import { KINDS } from '@/features/devices/model/kinds';
import { MasterDataPage } from '@/features/master-data/MasterDataPage';
import { WorkflowBuilderPage } from '@/features/workflow-builder/WorkflowBuilderPage';
import { wfStore } from '@/features/workflow-builder/model/store';
import { AppToaster } from '@/ui/toast';
import { RequireRole } from './guards';
import { homeFor } from './roles';

function LoginRoute() {
  const user = useAuth((s) => s.user); const navigate = useNavigate();
  if (user) return <Navigate to={homeFor(user.role)} replace />;       // already signed in
  return <LoginPage onAuthenticated={(u) => navigate(homeFor(u.role), { replace: true })} />;
}
/** "Workflows" in the sidebar: opens a new workflow (fleet not chosen yet) and shows it at its own URL. */
function NewWorkflow() {
  const navigate = useNavigate();
  useEffect(() => { navigate(`/configurator/workflows/${wfStore.getState().startWorkflow()}`, { replace: true }); }, [navigate]);
  return null;
}
function RootRedirect() { const user = useAuth((s) => s.user); return <Navigate to={user ? homeFor(user.role) : '/login'} replace />; }

/** Route table: one public route (/login) and one page per role. Add a role = add a route + entry in roles.ts. */
export function AppRoot() {
  return (
    <BrowserRouter>
      <AppToaster />
      <Routes>
        <Route path="/login" element={<LoginRoute />} />
        <Route path="/live" element={<RequireRole role="supervisor"><LiveFloorPage /></RequireRole>} />
        <Route path="/configurator" element={<RequireRole role="configurator"><NewWorkflow /></RequireRole>} />
        <Route path="/configurator/workflows/:id" element={<RequireRole role="configurator"><WorkflowBuilderPage /></RequireRole>} />
        {(['robot', 'hardware'] as const).map((k) => (
          <Route key={k} path={`/configurator/${KINDS[k].route}`}>
            <Route index element={<RequireRole role="configurator"><DeviceListPage kind={KINDS[k]} /></RequireRole>} />
            <Route path=":name" element={<RequireRole role="configurator"><DeviceDetailPage kind={KINDS[k]} /></RequireRole>} />
          </Route>
        ))}
        <Route path="/configurator/master-data/:tab?" element={<RequireRole role="configurator"><MasterDataPage /></RequireRole>} />
        <Route path="/configurator/fleets/:name/:tab?" element={<RequireRole role="configurator"><FleetPage /></RequireRole>} />
        <Route path="/configurator/maps" element={<RequireRole role="configurator"><MapsPage /></RequireRole>} />
        <Route path="*" element={<RootRedirect />} />
      </Routes>
    </BrowserRouter>
  );
}
