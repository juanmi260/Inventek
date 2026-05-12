import { registerSW as register } from 'virtual:pwa-register';
import { showToast } from '@/ui/Toast';

export function registerSW() {
  if (typeof window === 'undefined') return;

  const updateSW = register({
    onNeedRefresh() {
      showToast({
        title: 'Nueva versión disponible',
        description: 'Reinicia para aplicar la actualización.',
        actionLabel: 'Actualizar',
        onAction: () => updateSW(true),
        durationMs: 0,
      });
    },
    onOfflineReady() {
      showToast({
        title: 'Listo para offline',
        description: 'La app ya funciona sin conexión.',
        durationMs: 3000,
      });
    },
  });
}
