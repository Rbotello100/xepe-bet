import Link from 'next/link'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Terminos y Condiciones | Mundial Betting',
  description: 'Terminos y condiciones de uso de Mundial Betting',
}

export default function TermsPage() {
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

      <h1 className="text-3xl font-bold mb-2">Terminos y Condiciones</h1>
      <p className="text-sm text-[var(--text-muted)] mb-8">
        Ultima actualizacion: 15 de abril de 2026
      </p>

      <div className="space-y-6 text-sm leading-relaxed">
        <section>
          <h2 className="text-lg font-semibold mb-2">1. Naturaleza del servicio</h2>
          <p>
            Mundial Betting es una plataforma de entretenimiento construida para el Hackathon
            World Cup Xepelin 2026. Permite predecir resultados, apostar con creditos virtuales
            y competir en rankings. <strong>No se usa dinero real en ningun momento.</strong> Los
            creditos que recibes al registrarte y los que ganas en partidas/apuestas son
            exclusivamente puntos dentro de la plataforma, sin valor monetario, y no pueden
            canjearse por dinero, bienes o servicios externos.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">2. Edad minima</h2>
          <p>
            Debes tener al menos 18 anos para usar esta plataforma. Al crear tu cuenta declaras
            que cumples con este requisito.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">3. Cuentas y seguridad</h2>
          <p>
            Cada persona puede tener una sola cuenta. Esta prohibido crear multiples cuentas,
            compartir credenciales, usar bots o automatizar acciones. Nos reservamos el derecho
            de suspender o eliminar cualquier cuenta que incumpla estas reglas.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">4. Creditos virtuales</h2>
          <p>
            Al registrarte recibes 1.000 creditos virtuales gratuitos. Los creditos se usan para
            realizar predicciones, apuestas y jugar en el casino. Los creditos no tienen valor
            monetario, no son transferibles entre usuarios y no pueden ser recargados con dinero
            real.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">5. Apuestas y predicciones</h2>
          <ul className="list-disc pl-5 space-y-1">
            <li>Las predicciones se cierran 24 horas antes del inicio de cada partido.</li>
            <li>Las apuestas se cierran 1 hora antes del inicio de cada partido.</li>
            <li>No hay apuestas en vivo: todas las apuestas son pre-partido.</li>
            <li>
              Las cuotas (odds) se fijan 24 horas antes del partido y se mantienen hasta el
              cierre.
            </li>
            <li>
              Los resultados se importan automaticamente desde fuentes oficiales (FIFA / API-
              Football). Nos reservamos el derecho de corregir manualmente cualquier error.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">6. Casino (minijuegos)</h2>
          <p>
            Los minijuegos del casino (Slots, Penalty, Scratch, Cancha Minada) son juegos de
            azar con fines de entretenimiento. Cada juego tiene un RTP (return-to-player)
            matematico definido. Todas las apuestas y resultados se registran en la base de
            datos y son visibles en el historial de tu cuenta.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">7. Limitacion de responsabilidad</h2>
          <p>
            La plataforma se provee &quot;tal cual&quot;, sin garantias de disponibilidad,
            exactitud o rendimiento. No somos responsables por perdidas de creditos virtuales,
            fallas del servicio, demoras en sincronizacion de resultados o cualquier dano
            derivado del uso de la aplicacion.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">8. Propiedad intelectual</h2>
          <p>
            Todo el contenido de la plataforma (codigo, diseno, nombre) pertenece a Xepelin.
            Los nombres de selecciones, banderas y datos deportivos son propiedad de sus
            respectivos duenos y se usan con fines informativos.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">9. Modificaciones</h2>
          <p>
            Podemos modificar estos terminos en cualquier momento. Si hay cambios sustanciales,
            te notificaremos al iniciar sesion. El uso continuado del servicio implica
            aceptacion de los nuevos terminos.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold mb-2">10. Contacto</h2>
          <p>
            Para cualquier consulta sobre estos terminos o el uso de tus datos, puedes escribir
            al equipo del hackathon a traves del canal interno de Xepelin.
          </p>
        </section>
      </div>
    </div>
  )
}
