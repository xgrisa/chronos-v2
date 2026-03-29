import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment';

// Modela exactamente lo que devuelve la base de datos.
// Si cambia el schema, hay que actualizar esta interfaz.
export interface Timer {
  id: number;
  user_id: number;
  label: string;
  is_running: number;        // 0 = parado, 1 = corriendo
  started_at: number | null; // timestamp Unix en ms (null si está parado)
  accumulated_ms: number;    // tiempo acumulado al pausar
  archived: boolean;
}

@Injectable({ providedIn: 'root' })
export class TimerService {
  private http = inject(HttpClient);
  private apiUrl = `${environment.apiUrl}/timers`;

  getTimers(archived = false) {
    const url = archived ? `${this.apiUrl}?archived=true` : this.apiUrl;
    return this.http.get<{ timers: Timer[]; server_now: number }>(url);
  }

  createTimer(label: string) {
    return this.http.post<Timer>(this.apiUrl, { label });
  }

  controlTimer(id: number, action: 'start' | 'pause' | 'reset' | 'restore') {
    return this.http.patch<Timer>(`${this.apiUrl}/${id}`, { action });
  }

  deleteTimer(id: number) {
    return this.http.delete(`${this.apiUrl}/${id}`);
  }
}
