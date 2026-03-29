import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { routes } from './app.routes';
import { authInterceptor } from './interceptors/auth.interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    // withInterceptors registra el interceptor en el pipeline HTTP.
    // Todas las peticiones pasarán por authInterceptor antes de salir.
    provideHttpClient(withInterceptors([authInterceptor]))
  ]
};
