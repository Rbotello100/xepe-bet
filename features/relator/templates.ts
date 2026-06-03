'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import {
  getCrackDelDia,
  getQuemadoDelDia,
  getRachaGanadora,
  getRachaPerdedora,
  getParlayArriesgado,
  getCashOutEpico,
  getPartidoCaliente,
  getApostadorMasActivo24h,
  getCasinoRachaMala,
} from './stats'

// ==========================================================
// Templates determinísticos para el feed del Relator.
// Devuelve ~100 mensajes que combinan stats reales (DB) + templates fijos.
// CERO costo de IA — corren via cron de templates cada 15 min.
//
// Filosofía:
// - Si el stat NO existe (null), saltamos su bloque entero (no inventamos)
// - Cada bloque tiene varias variantes para que el feed no se sienta robot
// - Mezclamos al final → cualquier orden de aparición es válido
// ==========================================================

type Post = { kind: 'summary' | 'flash' | 'analysis' | 'trivia'; content: string }

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function pickN<T>(arr: T[], n: number): T[] {
  return shuffle(arr).slice(0, n)
}

function fmt(n: number): string {
  return n.toLocaleString('es-CL')
}

// ----------------------------------------------------------
// Trivias del Mundial (hardcoded, siempre disponibles)
// ----------------------------------------------------------
const TRIVIAS: string[] = [
  'En 1930 el primer Mundial en Uruguay tuvo solo 13 equipos. Hoy son 48.',
  'Brasil es el único país que jugó TODOS los Mundiales. 22 de 22.',
  'Marruecos fue el primer país africano en cuartos. Mundial 2022.',
  'El gol más rápido en un Mundial: Hakan Şükür, 11 segundos. Turquía 2002.',
  'Lothar Matthäus jugó 25 partidos de Mundial. Récord histórico.',
  'Solo 8 países ganaron alguna Copa del Mundo desde 1930.',
  'El Maracaná tiene el récord de público en una final. Brasil 1950.',
  'Pelé es el único jugador con 3 títulos mundiales en su vitrina.',
  'México 1986 fue el primer Mundial con la regla de tarjeta amarilla obligatoria.',
  'Qatar 2022: Argentina ganó la final más vista de la historia de TV.',
  'Italia y Brasil empatan en participación: 22 cada uno hasta 2022.',
  'El Mundial 2026 es el primero con 48 selecciones. Tres sedes: USA, México, Canadá.',
  'Just Fontaine marcó 13 goles en un solo Mundial. Suecia 1958. Imbatible.',
  'Alemania ganó 4 mundiales jugando con el mismo logo desde 1954.',
  'Antoine Griezmann es el único francés con MVP y Bota de Bronce a la vez.',
  'Messi pasó por 5 mundiales antes de levantar la Copa. Paciencia premiada.',
  'El Mundial 1950 fue el único sin final: se ganó por puntos. Uruguay campeón.',
  'Inglaterra ganó su único Mundial en casa: 1966 vs Alemania, 4-2.',
  'Ronaldo Nazário es el goleador histórico de los Mundiales: 15 goles.',
  'Diego Maradona fue expulsado por dopaje en USA 1994. Mundial bisagra.',
  'Suiza eliminó a Francia en Qatar 2022 en penales: hubo lágrimas.',
  'Croacia llegó a 2 finales con menos de 5 millones de habitantes.',
  'El Mundial de Brasil 1950 vio el Maracanazo: Uruguay derrumbó al local.',
  'En el Mundial 2026 cada grupo es de 4 equipos. 12 grupos, 48 selecciones.',
  'Argentina jugó 6 finales: ganó 3, perdió 3. Récord empatado con Alemania.',
  'Sudáfrica 2010 vio a Iniesta convertir el gol más recordado de España.',
  'Cuauhtémoc Blanco jugó 3 mundiales consecutivos para México: 98, 02, 10.',
  'Francia ganó 1998 con un gol de cabeza de Zidane en la final.',
  'Italia ganó 4 mundiales: 1934, 1938, 1982, 2006. Última: contra Francia.',
  'En 2022 Marruecos venció a Bélgica, España y Portugal. Hizo historia.',
  'El primer Mundial televisado fue Suiza 1954. Húngara perdió la final.',
  'Hungría 1954 fue el último equipo invicto que perdió la final.',
  'El Mundial 2010 introdujo el balón Jabulani, criticado por todos los arqueros.',
  'Maradona marcó 5 goles en México 1986, incluido "la Mano de Dios".',
  'En Rusia 2018, Croacia llegó a su primera final. Modric ganó el Balón de Oro.',
  'La final más goleada: Suecia 1958, 5-2 Brasil sobre Suecia.',
  'Pelé debutó en Mundial a los 17 años. Marcó en la final de 1958.',
  'Solo 4 países jugaron una final en cada continente: Brasil, Alemania, Italia, Argentina.',
  'La Bota de Oro de un Mundial puede ir a un jugador eliminado en fase de grupos.',
  'En 2026 habrá 104 partidos en total. Más que cualquier Mundial anterior.',
]

// ----------------------------------------------------------
// Mensajes de ambiente / motivacionales
// ----------------------------------------------------------
const AMBIENTE: string[] = [
  'El que apuesta sin data juega con suerte. Acá hay info.',
  'Cuotas no son verdades, son probabilidades. Léelas con cuidado.',
  'Hoy nadie tiene la razón. Mañana sabremos quién la tenía.',
  'Pendiente es oportunidad. Mirá las pickbars antes de que cierren.',
  'Si tu pick está en minoría, hay valor. Si está en mayoría, hay calma.',
  'El Mundial se gana en los detalles. El prode también.',
  'Hay valor en lo que el otro no ve.',
  'La cuenta atrás corre. Las apuestas no esperan.',
  'Apostar es elegir. No te toca por azar — es lectura.',
  'El que mira la pickbar dos veces, gana una.',
  'Cuotas altas, riesgo alto. Cuotas bajas, paciencia.',
  'Cash out a tiempo gana. Cash out tarde pierde.',
  'No todo parlay debe armarse. Pero algunos sí.',
  'La trivia diaria suma más que una buena cuota.',
  'Hoy se juega. Mañana se cuenta.',
  'Mejor un pick chico bien pensado que uno grande mal armado.',
  'Las rachas existen. Hasta que no.',
  'No persigás pérdidas. Persiguelas mañana con cabeza fría.',
  'La paciencia paga más cuotas que la urgencia.',
  'El que sabe esperar la cuota correcta, gana dos veces.',
  'Apostá lo que estás dispuesto a perder. Ni un peso más.',
  'El partido grande no siempre es el de mejor cuota.',
  'Los favoritos pierden. Los underdogs ganan. Por eso hay juego.',
  'Una buena lectura vale más que diez intuiciones.',
  'Si dudás del pick, dudás de la cuota. Pasá.',
  'Cuota injusta = oportunidad. Cuota justa = mercado eficiente.',
  'Lo más caro de una apuesta es no entender por qué la hiciste.',
  'Si lo ganas todo, estás apostando muy poco.',
  'El casino paga las ilusiones. La data paga los resultados.',
  'Hoy ganás, mañana perdés. El año se mide entero.',
  'No hay cuota mágica. Solo lecturas mejores y peores.',
  'El silencio del cracks dice más que el grito del novato.',
  'Quien sale con plata, sale con dignidad.',
  'Cuando dudás entre dos picks, mirá las cuotas. Mandan.',
  'La cancha siempre da revancha. La estadística también.',
]

// ----------------------------------------------------------
// Meta-info de la plataforma
// ----------------------------------------------------------
const META: string[] = [
  'Top ranking se actualiza en tiempo real. Mirá dónde estás.',
  'Cash out disponible hasta que arranque el partido.',
  'Parlays: combinaciones que multiplican cuotas, y también el riesgo.',
  'Casino: 5 juegos, cero garantías, mucha emoción.',
  'Trivia: 1 gratis por día. Plata fácil si sabés fútbol.',
  'Apuesta mínima $10, máxima $500. Ni más ni menos.',
  'Parlay mínimo 2 patas, máximo 6. Más de eso es deseo.',
  'Si te quedan créditos bajos, jugá trivia: es gratis 1 vez/día.',
  'Las cuotas se mueven con el mercado. Ojo con los cambios.',
  'Penales en el casino paga hasta x200 si clavás 6 seguidos.',
  'Slots tiene 6 símbolos. El más raro paga 8.000.',
  'Mines: cuanto más celdas reveles, más alta la cuota. Y el riesgo.',
  'Rasca y gana: 25% de chance de premio. Vale los 15 créditos.',
  'Felipe se esconde en alguna sala. Saber dónde es la mitad del juego.',
  'Ranking se cierra al final del torneo. Hay tiempo de subir.',
  'Aciertos exactos en predicciones suman 3x. Conviene afinar el ojo.',
  'Solo se computa una apuesta por partido por usuario. No dupliquen.',
  'Los créditos no se compran. Se ganan o se queman jugando.',
  'Cada acción suma puntos. El ranking premia constancia.',
  'Logros desbloquean créditos extra. Mirá tu perfil.',
]

// ==========================================================
// Builder principal
// ==========================================================
export async function buildTemplateFeed(): Promise<Post[]> {
  const admin = createAdminClient()

  // Disparar todo en paralelo
  const [
    crack,
    quemado,
    rachaG,
    rachaP,
    parlay,
    cashout,
    caliente,
    activo,
    casinoMala,
    rankingRes,
    upcomingRes,
    totalsRes,
  ] = await Promise.all([
    getCrackDelDia(),
    getQuemadoDelDia(),
    getRachaGanadora(),
    getRachaPerdedora(),
    getParlayArriesgado(),
    getCashOutEpico(),
    getPartidoCaliente(),
    getApostadorMasActivo24h(),
    getCasinoRachaMala(),
    admin.from('profiles').select('display_name, total_points, credits').order('total_points', { ascending: false }).limit(5),
    admin
      .from('matches')
      .select('starts_at, group_name, home:home_team_id(name), away:away_team_id(name)')
      .gt('starts_at', new Date().toISOString())
      .eq('status', 'scheduled')
      .order('starts_at', { ascending: true })
      .limit(3),
    Promise.all([
      admin.from('profiles').select('id', { count: 'exact', head: true }),
      admin.from('bets').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
      admin.from('predictions').select('id', { count: 'exact', head: true }),
    ]),
  ])

  const ranking = (rankingRes.data ?? []) as { display_name: string; total_points: number; credits: number }[]
  const upcoming = (upcomingRes.data ?? []) as Array<{
    starts_at: string
    group_name: string | null
    home: { name: string } | { name: string }[] | null
    away: { name: string } | { name: string }[] | null
  }>
  const [usersCount, betsCount, predsCount] = totalsRes.map(r => r.count ?? 0)

  const posts: Post[] = []

  // -------- Crack del día (8 variantes)
  if (crack && crack.delta > 0) {
    const v = [
      `${crack.display_name} ya lleva +$${fmt(crack.delta)} hoy. Crack del día.`,
      `Pongan los ojos en ${crack.display_name}: +$${fmt(crack.delta)} en ${crack.bets} apuestas hoy.`,
      `${crack.display_name} sigue armando: +$${fmt(crack.delta)} esta jornada.`,
      `Si hubiera ranking de hoy, ${crack.display_name} lo ganaría. +$${fmt(crack.delta)}.`,
      `${crack.display_name} no está jugando, está estudiando. +$${fmt(crack.delta)} hoy.`,
      `Crack del día: ${crack.display_name}. ${crack.bets} apuestas, +$${fmt(crack.delta)} neto.`,
      `Reconozcan: ${crack.display_name} hoy tiene rumbo. +$${fmt(crack.delta)} y mirando para arriba.`,
      `${crack.display_name} convierte data en plata. +$${fmt(crack.delta)} en el día.`,
    ]
    posts.push(...pickN(v, 3).map((content): Post => ({ kind: 'analysis', content })))
  }

  // -------- Quemado del día (8 variantes)
  if (quemado && quemado.delta < 0) {
    const perdida = Math.abs(quemado.delta)
    const v = [
      `${quemado.display_name} se quemó $${fmt(perdida)} en ${quemado.bets} apuestas. Sigue firme.`,
      `Día complicado para ${quemado.display_name}: -$${fmt(perdida)}. Mañana es otra.`,
      `Crónica de un día gris: ${quemado.display_name} dejó $${fmt(perdida)} en la mesa.`,
      `${quemado.display_name} viene con el viento en contra. -$${fmt(perdida)} hoy.`,
      `Bancando los pasos: ${quemado.display_name} -$${fmt(perdida)}. Vuelve.`,
      `${quemado.display_name} pagó cara la noche: -$${fmt(perdida)} pero firme.`,
      `Quemado del día: ${quemado.display_name}. -$${fmt(perdida)} en ${quemado.bets} apuestas.`,
      `Lecciones caras: ${quemado.display_name} hoy dejó $${fmt(perdida)}.`,
    ]
    posts.push(...pickN(v, 3).map((content): Post => ({ kind: 'analysis', content })))
  }

  // -------- Racha ganadora (8 variantes)
  if (rachaG) {
    const v = [
      `${rachaG.display_name} lleva ${rachaG.streak} wins seguidos esta semana. No se baja.`,
      `Banca a ${rachaG.display_name}: ${rachaG.streak} victorias al hilo.`,
      `${rachaG.display_name} parece imparable. ${rachaG.streak} aciertos consecutivos.`,
      `Si te toca ${rachaG.display_name} en la contra, andá despacio. ${rachaG.streak} wins seguidos.`,
      `Confianza pura: ${rachaG.display_name} lleva ${rachaG.streak} en racha.`,
      `${rachaG.streak} wins seguidos para ${rachaG.display_name}. ¿Cierre o continuidad?`,
      `Crónica de un crack: ${rachaG.display_name}, ${rachaG.streak} aciertos sin caer.`,
      `El número del día: ${rachaG.streak}. Es la racha de ${rachaG.display_name}.`,
    ]
    posts.push(...pickN(v, 3).map((content): Post => ({ kind: 'analysis', content })))
  }

  // -------- Racha perdedora (8 variantes)
  if (rachaP) {
    const v = [
      `${rachaP.display_name} viene de ${rachaP.streak} derrotas al hilo. Acá no se afloja.`,
      `Mala racha para ${rachaP.display_name}: ${rachaP.streak} pérdidas. Falta lo bueno.`,
      `${rachaP.streak} caídas seguidas y ${rachaP.display_name} sigue. Eso es carácter.`,
      `${rachaP.display_name} con ${rachaP.streak} en contra. Día de mate y rearmarse.`,
      `El que persevera: ${rachaP.display_name}, ${rachaP.streak} derrotas y al pie.`,
      `Cuesta arriba: ${rachaP.display_name} suma ${rachaP.streak} sin acertar.`,
      `Cuando todo sale mal: ${rachaP.display_name}, ${rachaP.streak} pérdidas. ¿Mañana?`,
      `Resistencia pura: ${rachaP.streak} derrotas y ${rachaP.display_name} no se rinde.`,
    ]
    posts.push(...pickN(v, 2).map((content): Post => ({ kind: 'analysis', content })))
  }

  // -------- Parlay arriesgado (6 variantes)
  if (parlay) {
    const v = [
      `${parlay.display_name} armó un parlay x${parlay.total_odds}. Si pega cobra $${fmt(parlay.potential_payout)}.`,
      `Para los temerarios: ${parlay.display_name} con cuota total x${parlay.total_odds}. Pago $${fmt(parlay.potential_payout)}.`,
      `${parlay.legs} patas, x${parlay.total_odds}, $${fmt(parlay.potential_payout)} en juego. ${parlay.display_name} apuesta fuerte.`,
      `${parlay.display_name} se la juega: parlay de ${parlay.legs}, x${parlay.total_odds}. Si pega es plata gorda.`,
      `Atención: ${parlay.display_name} tiene $${fmt(parlay.potential_payout)} colgando de ${parlay.legs} resultados.`,
      `Ambición pura: ${parlay.display_name} arma x${parlay.total_odds} con ${parlay.legs} patas.`,
    ]
    posts.push(...pickN(v, 2).map((content): Post => ({ kind: 'analysis', content })))
  }

  // -------- Cash out épico (6 variantes)
  if (cashout) {
    const partido = cashout.partido ? ` en ${cashout.partido}` : ''
    const v = [
      `${cashout.display_name} se bajó a tiempo con $${fmt(cashout.cash_out)}${partido}. Ganancia neta $${fmt(cashout.ganancia)}.`,
      `Astuto: ${cashout.display_name} retiró $${fmt(cashout.cash_out)} antes del cierre${partido}.`,
      `Cuando lees el partido bien: ${cashout.display_name} cash out de $${fmt(cashout.cash_out)}.`,
      `${cashout.display_name} convirtió $${fmt(cashout.stake)} en $${fmt(cashout.cash_out)} y se fue feliz.`,
      `${cashout.display_name} no esperó el desenlace: $${fmt(cashout.cash_out)} en el bolsillo.`,
      `Salida elegante: ${cashout.display_name}${partido}, $${fmt(cashout.cash_out)} retirados.`,
    ]
    posts.push(...pickN(v, 2).map((content): Post => ({ kind: 'analysis', content })))
  }

  // -------- Partido caliente (5 variantes)
  if (caliente) {
    const v = [
      `El más jugado: ${caliente.partido}. ${caliente.total_apuestas} apuestas en juego.`,
      `${caliente.partido} concentra ${caliente.total_apuestas} bets. El partido del día.`,
      `Pulso de la jornada: ${caliente.partido} con ${caliente.total_apuestas} apuestas pending.`,
      `Si hay un partido para no perderse: ${caliente.partido}. ${caliente.total_apuestas} esperando.`,
      `${caliente.partido}: ${caliente.total_apuestas} bets pending. La masa eligió.`,
    ]
    posts.push(...pickN(v, 2).map((content): Post => ({ kind: 'flash', content })))
  }

  // -------- Apostador activo (5 variantes)
  if (activo) {
    const v = [
      `${activo.display_name} ya metió ${activo.bets} apuestas hoy. Activo total.`,
      `Quien mucho aprieta: ${activo.display_name} con ${activo.bets} jugadas en el día.`,
      `${activo.display_name} no para: ${activo.bets} bets en 24h por $${fmt(activo.total_apostado)} apostado.`,
      `Manos calientes: ${activo.display_name}, ${activo.bets} apuestas activas.`,
      `La intensidad de hoy se llama ${activo.display_name}: ${activo.bets} jugadas.`,
    ]
    posts.push(...pickN(v, 2).map((content): Post => ({ kind: 'analysis', content })))
  }

  // -------- Casino racha mala (5 variantes)
  if (casinoMala) {
    const v = [
      `${casinoMala.display_name} viene de ${casinoMala.streak} derrotas seguidas en casino. ¿Le dura?`,
      `Mala mano: ${casinoMala.display_name}, ${casinoMala.streak} sesiones perdedoras al hilo.`,
      `Casino no perdona: ${casinoMala.display_name} -$${fmt(casinoMala.total_perdido)} en ${casinoMala.streak} jugadas.`,
      `${casinoMala.display_name} probando paciencia: ${casinoMala.streak} pérdidas seguidas.`,
      `El RNG no quiere a ${casinoMala.display_name}: ${casinoMala.streak} fallidas, $${fmt(casinoMala.total_perdido)} dejados.`,
    ]
    posts.push(...pickN(v, 2).map((content): Post => ({ kind: 'analysis', content })))
  }

  // -------- Stats de plataforma (siempre)
  if (usersCount > 0) {
    posts.push({ kind: 'flash', content: `${usersCount} jugadores activos. La cancha está llena.` })
  }
  if (betsCount > 0) {
    posts.push({ kind: 'flash', content: `${betsCount} apuestas pending. Calor.` })
    posts.push({ kind: 'analysis', content: `${betsCount} bets en juego. La plata circula.` })
  }
  if (predsCount > 0) {
    posts.push({ kind: 'analysis', content: `${predsCount} pronósticos cargados. ¿Acertarán?` })
  }
  if (ranking[0]) {
    posts.push({
      kind: 'analysis',
      content: `Lidera ${ranking[0].display_name} con ${ranking[0].total_points} pts. Difícil moverlo.`,
    })
  }
  if (ranking[0] && ranking[1]) {
    const gap = Math.abs(ranking[0].total_points - ranking[1].total_points)
    posts.push({
      kind: 'analysis',
      content: `Distancia 1°-2° en el ranking: ${gap} pts. ${gap < 50 ? 'Pelea apretada.' : 'Hay diferencia.'}`,
    })
  }
  if (ranking[4]) {
    posts.push({
      kind: 'analysis',
      content: `Top 5 del ranking: ${ranking.slice(0, 5).map(r => r.display_name).join(', ')}.`,
    })
  }

  // -------- Próximos partidos (3 por partido)
  for (const m of upcoming) {
    const home = Array.isArray(m.home) ? m.home[0]?.name : m.home?.name
    const away = Array.isArray(m.away) ? m.away[0]?.name : m.away?.name
    if (!home || !away) continue
    const fecha = new Date(m.starts_at).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit' })
    const grupo = m.group_name ? `Grupo ${m.group_name}` : 'Próximo'
    const v = [
      `${home} vs ${away} el ${fecha}. ¿Quién se la juega?`,
      `${grupo}: se viene ${home} vs ${away} el ${fecha}.`,
      `Apostá temprano: ${home} - ${away} sale el ${fecha}.`,
    ]
    posts.push(...pickN(v, 2).map((content): Post => ({ kind: 'summary', content })))
  }

  // -------- Trivia (25 random de 40)
  posts.push(...pickN(TRIVIAS, 25).map((content): Post => ({ kind: 'trivia', content })))

  // -------- Ambiente (25 random de 35)
  posts.push(...pickN(AMBIENTE, 25).map((content): Post => ({ kind: 'flash', content })))

  // -------- Meta (12 random de 20)
  posts.push(...pickN(META, 12).map((content): Post => ({ kind: 'analysis', content })))

  // Mezclar para que el orden de aparición sea variado
  return shuffle(posts)
}

// ==========================================================
// Refresh template feed: limpia los templates viejos + inserta nuevos.
// NO toca los mensajes con source='ai' (los del cron Anthropic).
// ==========================================================
export async function refreshTemplateFeed(): Promise<{ generated: number; error?: string }> {
  try {
    const db = createAdminClient()

    const posts = await buildTemplateFeed()
    if (posts.length === 0) {
      return { generated: 0, error: 'No hay data suficiente para armar templates' }
    }

    // Cerrar los template viejos. NO tocar los AI ni otros.
    await db
      .from('ai_feed')
      .update({ is_active: false })
      .eq('is_active', true)
      .filter('metadata->>source', 'eq', 'template')

    // Cleanup de zombis sin metadata (de versiones anteriores al split source).
    // Mantiene activos solo lo que se generó con source explicito.
    await db
      .from('ai_feed')
      .update({ is_active: false })
      .eq('is_active', true)
      .is('metadata', null)

    const { error } = await db.from('ai_feed').insert(
      posts.map(p => ({
        kind: p.kind,
        content: p.content,
        is_active: true,
        metadata: { source: 'template' },
      })),
    )
    if (error) return { generated: 0, error: `Insert fallo: ${error.message}` }

    return { generated: posts.length }
  } catch (err) {
    return { generated: 0, error: err instanceof Error ? err.message : String(err) }
  }
}
