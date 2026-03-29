import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private tokenKey = 'chronos_token';

  login(credentials: { username: string; password: string }) {
    return this.http
      .post<{ token: string }>(`${environment.apiUrl}/login`, credentials)
      .pipe(
        // tap ejecuta un efecto secundario sin modificar el valor del observable.
        // Guardamos el token en localStorage en cuanto llega la respuesta.
        tap(response => localStorage.setItem(this.tokenKey, response.token))
      );
  }

  logout() {
    localStorage.removeItem(this.tokenKey);
    this.router.navigate(['/login']);
  }

  getToken(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  isLoggedIn(): boolean {
    return !!this.getToken(); // !! convierte el string (o null) a booleano
  }
}
