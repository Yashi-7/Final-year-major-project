import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import LoadingSpinner from './components/common/LoadingSpinner.jsx';
import ProtectedRoute from './components/common/ProtectedRoute.jsx';
import DashboardLayout from './components/layout/DashboardLayout.jsx';
import Login from './pages/Login.jsx';
import Register from './pages/Register.jsx';
import FarmerDashboard from './pages/farmer/FarmerDashboard.jsx';
import CropRecommendation from './pages/farmer/CropRecommendation.jsx';
import YieldPrediction from './pages/farmer/YieldPrediction.jsx';
import FraMonitoring from './pages/farmer/FraMonitoring.jsx';
import FarmerProfile from './pages/farmer/FarmerProfile.jsx';
import GovernmentDashboard from './pages/government/GovernmentDashboard.jsx';
import FraClaimManagement from './pages/government/FraClaimManagement.jsx';
import GovernmentGisMap from './pages/government/GovernmentGisMap.jsx';
import GovernmentProfile from './pages/government/GovernmentProfile.jsx';
import Unauthorized from './pages/Unauthorized.jsx';
import NotFound from './pages/NotFound.jsx';

// Sends an already-authenticated user to the dashboard matching their role.
const RoleRedirect = () => {
  const { user, loading } = useAuth();

  if (loading) return <LoadingSpinner />;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role === 'FARMER') return <Navigate to="/farmer/dashboard" replace />;
  if (user.role === 'GOVERNMENT_OFFICIAL') return <Navigate to="/government/dashboard" replace />;
  return <Navigate to="/login" replace />;
};

const App = () => (
  <Routes>
    <Route path="/" element={<RoleRedirect />} />
    <Route path="/login" element={<Login />} />
    <Route path="/register" element={<Register />} />
    <Route path="/unauthorized" element={<Unauthorized />} />

    <Route element={<ProtectedRoute allowedRoles={['FARMER']} />}>
      <Route element={<DashboardLayout />}>
        <Route path="/farmer/dashboard" element={<FarmerDashboard />} />
        <Route path="/farmer/crop-recommendation" element={<CropRecommendation />} />
        <Route path="/farmer/yield-prediction" element={<YieldPrediction />} />
        <Route path="/farmer/fra-monitoring" element={<FraMonitoring />} />
        <Route path="/farmer/profile" element={<FarmerProfile />} />
      </Route>
    </Route>

    <Route element={<ProtectedRoute allowedRoles={['GOVERNMENT_OFFICIAL']} />}>
      <Route element={<DashboardLayout />}>
        <Route path="/government/dashboard" element={<GovernmentDashboard />} />
        <Route path="/government/fra-claim-management" element={<FraClaimManagement />} />
        <Route path="/government/gis-map" element={<GovernmentGisMap />} />
        <Route path="/government/profile" element={<GovernmentProfile />} />
      </Route>
    </Route>

    <Route path="*" element={<NotFound />} />
  </Routes>
);

export default App;
