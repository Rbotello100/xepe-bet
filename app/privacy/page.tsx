import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Politica de Privacidad | Mundial Betting',
  description: 'Como manejamos tus datos en Mundial Betting',
}

export default function PrivacyPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-10">
      <div className="mb-6">
        <Link
          href="/"
          className="text-sm text-[var(--text-muted)] hover:text-[var(--foreground)] transition-colors"
        >
          ← Volver al inicio
        </Link>
      </div>

      <h1 className="text-3xl font-bold mb-2">Politica de Privacidad</h1>
      <p className="text-sm text-[var(--text-muted)] mb-8">
        Ultima actualizacion: 15 de abril de 2026
      </p>

      <div className="space-y-6 text-sm leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold mb-2">1. Datos que recolectamos</h2>
          <p className="mb-2">Cuando te registras via Google OAuth, recolectamos:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Tu correo electronico (email)</li>
            <li>Tu nombre publico</li>
            <li>Tu foto de perfil (avatar)</li>
            <li>Un identificador unico generado por Supabase</li>
          </ul>
          <p className="mt-2">
            Adicionalmente, generamos y guardamos datos derivados de tu actividad dentro de la
            app: saldo de creditos, predicciones hechas, apuestas realizadas, resultados de
            minijuegos en el casino, y posicion en el ranking.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">2. Para que usamos tus datos</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Autenticarte y mantener tu sesion activa</li>
            <li>Mostrar tu nombre y avatar en el ranking publico</li>
            <li>Registrar tus apuestas y calcular resultados</li>
            <li>Notificarte eventos relevantes dentro de la plataforma</li>
            <li>Prevenir fraude y abuso</li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">3. Con quien compartimos tus datos</h2>
          <p>
            <strong>No vendemos ni compartimos tus datos con terceros con fines
            comerciales.</strong> Solo usamos los siguientes servicios para operar la
            plataforma:
          </p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>
              <strong>Supabase</strong> (EE.UU.): autenticacion, base de datos y storage.
            </li>
            <li>
              <strong>Google OAuth</strong>: verifica tu identidad al iniciar sesion.
            </li>
            <li>
              <strong>Google Cloud Run</strong> (EE.UU.): hosting de la aplicacion.
            </li>
            <li>
              <strong>The Odds API / API-Football</strong>: proveen cuotas y resultados
              deportivos. No les enviamos ninguno de tus datos personales.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">4. Cookies y sesion</h2>
          <p>
            Usamos cookies tecnicas necesarias para mantener tu sesion iniciada. No usamos
            cookies de tracking ni de publicidad de terceros.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">5. Tus derechos</h2>
          <p>
            Puedes solicitar en cualquier momento:
          </p>
          <ul className="list-disc pl-5 space-y-1 mt-2">
            <li>Acceso a una copia de todos tus datos</li>
            <li>Correccion de datos incorrectos</li>
            <li>Eliminacion completa de tu cuenta y datos asociados</li>
            <li>Portabilidad de tus datos a otro servicio</li>
          </ul>
          <p className="mt-2">
            Para ejercer cualquiera de estos derechos, contactanos a traves del canal interno
            de Xepelin.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">6. Retencion de datos</h2>
          <p>
            Mantenemos tus datos mientras tu cuenta este activa. Si eliminas tu cuenta, todos
            tus datos personales se borran dentro de 30 dias. Los datos agregados y anonimos
            (estadisticas del ranking, promedios de apuestas) pueden conservarse
            indefinidamente.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">7. Seguridad</h2>
          <p>
            Tus datos se guardan en Supabase con Row-Level Security activo: solo tu puedes
            leer y modificar tus propios registros. Las conexiones entre tu navegador y la app
            usan HTTPS.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">8. Menores de edad</h2>
          <p>
            Esta plataforma esta destinada exclusivamente a personas mayores de 18 anos. No
            recolectamos datos de menores de manera consciente. Si descubrimos que hemos
            recolectado datos de un menor, los eliminaremos de inmediato.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">9. Cambios a esta politica</h2>
          <p>
            Si modificamos esta politica de forma sustancial, te avisaremos al iniciar sesion
            y te pediremos que aceptes los cambios antes de continuar usando la app.
          </p>
        </section>
      </div>
    </div>
  )
}
