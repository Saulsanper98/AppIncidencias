/** Contenedor de ruta login — sin page-enter (el stagger propio lo cubre). */
export default function LoginTemplate({ children }: { children: React.ReactNode }) {
  return <div className="min-h-0 flex-1">{children}</div>;
}
