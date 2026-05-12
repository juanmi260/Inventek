import { useRouteError, isRouteErrorResponse, Link } from 'react-router-dom';

export function ErrorPage() {
  const error = useRouteError();
  let message = 'Error inesperado';
  if (isRouteErrorResponse(error)) {
    message = `${error.status} ${error.statusText}`;
  } else if (error instanceof Error) {
    message = error.message;
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-xl font-semibold">Algo ha ido mal</h1>
      <p className="text-sm text-muted">{message}</p>
      <Link to="/" className="mt-2 rounded bg-primary px-4 py-2 text-primary-fg">
        Volver al inicio
      </Link>
    </div>
  );
}
