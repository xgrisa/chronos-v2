import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

// CanActivateFn es la forma moderna de definir guards en Angular 15+,
// sin necesidad de crear una clase con @Injectable
export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isLoggedIn()) {
    return true; // tiene token → puede acceder
  }

  // no tiene token → redirigimos a login
  return router.createUrlTree(['/login']);
};
