import { Routes } from '@angular/router';
import { LoginComponent } from './components/login/login.component';
import { DashboardComponent } from './components/dashboard/dashboard.component';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  { path: '', redirectTo: 'login', pathMatch: 'full' },
  { path: 'login', component: LoginComponent },
  // canActivate aplica el guard: si no hay token válido, redirige a /login
  { path: 'dashboard', component: DashboardComponent, canActivate: [authGuard] }
];
