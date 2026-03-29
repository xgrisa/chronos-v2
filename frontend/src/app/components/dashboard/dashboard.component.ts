import { Component, OnInit, OnDestroy, inject, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../services/auth.service';
import { TimerService, Timer } from '../../services/timer.service';

// Extiende la interfaz Timer con el campo visual que se muestra en el display
interface TimerWithVisuals extends Timer {
  formattedTime: string;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss'
})
export class DashboardComponent implements OnInit, OnDestroy {
  private authService = inject(AuthService);
  private timerService = inject(TimerService);
  private cd = inject(ChangeDetectorRef);

  timers: TimerWithVisuals[] = [];
  newTimerLabel = '';
  viewArchived = false;

  // Diferencia en ms entre el reloj del servidor y el del cliente.
  // Se calcula al cargar los timers y se usa para que el cronómetro sea preciso aunque el reloj local esté desajustado.
  private serverOffset = 0;
  private intervalId: ReturnType<typeof setInterval> | null = null;

  ngOnInit() {
    this.loadTimers();
    // Actualizamos el display cada 50ms para una animación fluida
    this.intervalId = setInterval(() => this.updateLoop(), 50);
  }

  ngOnDestroy() {
    // Limpiamos el intervalo al destruir el componente para evitar memory leaks
    if (this.intervalId) clearInterval(this.intervalId);
  }

  logout() {
    this.authService.logout();
  }

  toggleArchivedView() {
    this.viewArchived = !this.viewArchived;
    this.loadTimers();
  }

  loadTimers() {
    this.timerService.getTimers(this.viewArchived).subscribe({
      next: (response) => {
        // Calculamos el offset en el momento exacto en que llega la respuesta
        this.serverOffset = response.server_now - Date.now();

        this.timers = response.timers.map(t => {
          const timer = { ...t, formattedTime: '00:00.0' };
          this.calculateTime(timer);
          return timer;
        });

        this.cd.markForCheck();
      },
      error: (err) => console.error('Error cargando cronómetros:', err)
    });
  }

  createTimer() {
    if (!this.newTimerLabel.trim()) return;
    this.timerService.createTimer(this.newTimerLabel).subscribe(timer => {
      this.timers.push({ ...timer, formattedTime: '00:00.0' });
      this.newTimerLabel = '';
      this.cd.markForCheck();
    });
  }

  deleteTimer(id: number) {
    if (!confirm('¿Archivar este cronómetro?')) return;
    this.timerService.deleteTimer(id).subscribe(() => {
      this.timers = this.timers.filter(t => t.id !== id);
      this.cd.markForCheck();
    });
  }

  restoreTimer(id: number) {
    if (!confirm('¿Restaurar a la lista principal?')) return;
    this.timerService.controlTimer(id, 'restore').subscribe(() => {
      this.timers = this.timers.filter(t => t.id !== id);
      this.cd.markForCheck();
    });
  }

  control(id: number, action: 'start' | 'pause' | 'reset') {
    const timer = this.timers.find(t => t.id === id);

    // Optimistic update en pause: actualizamos la UI antes de recibir la respuesta
    // para que el display se congele inmediatamente y no salte al llegar el dato del servidor
    if (action === 'pause' && timer) {
      timer.is_running = 0;
      this.calculateTime(timer);
    }

    this.timerService.controlTimer(id, action).subscribe(updated => {
      if (timer) {
        timer.is_running = updated.is_running;
        timer.started_at = updated.started_at;
        timer.accumulated_ms = updated.accumulated_ms;
        this.calculateTime(timer);
        this.cd.markForCheck();
      }
    });
  }

  // Se ejecuta cada 50ms: actualiza solo los cronómetros en marcha
  private updateLoop() {
    const now = Date.now() + this.serverOffset;
    let hasRunning = false;

    this.timers.forEach(timer => {
      if (Number(timer.is_running) === 1) {
        this.calculateTime(timer, now);
        hasRunning = true;
      }
    });

    if (hasRunning) this.cd.markForCheck();
  }

  // Calcula el tiempo total y actualiza formattedTime
  private calculateTime(timer: TimerWithVisuals, now = Date.now() + this.serverOffset) {
    const accumulated = Number(timer.accumulated_ms) || 0;
    const start = Number(timer.started_at) || 0;
    const isRunning = Number(timer.is_running) === 1;

    // Si está corriendo: acumulado + tiempo de esta sesión
    // Si está parado: solo el acumulado
    let totalMs = isRunning && start > 0
      ? accumulated + (now - start)
      : accumulated;

    if (totalMs < 0) totalMs = 0;
    timer.formattedTime = this.formatTime(totalMs);
  }

  // Convierte ms a H:MM:SS.T (las horas solo aparecen si hay)
  private formatTime(ms: number): string {
    const hours = Math.floor(ms / 3600000);
    const minutes = Math.floor((ms % 3600000) / 60000).toString().padStart(2, '0');
    const seconds = Math.floor((ms % 60000) / 1000).toString().padStart(2, '0');
    const tenths = Math.floor((ms % 1000) / 100).toString();
    return `${hours > 0 ? hours + ':' : ''}${minutes}:${seconds}.${tenths}`;
  }
}
