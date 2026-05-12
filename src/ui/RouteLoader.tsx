export function RouteLoader() {
  return (
    <div
      role="status"
      aria-label="Cargando"
      className="flex h-[60dvh] items-center justify-center"
    >
      <span className="inline-block size-6 animate-spin rounded-full border-2 border-muted border-r-transparent" />
    </div>
  );
}
